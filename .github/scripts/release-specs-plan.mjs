#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file release-specs-plan.mjs
 * @description Which release specs a pull request runs in `release-specs
 *   (changed)`, and in which 4-core shard each runs (spec:AST-030 FR32).
 * @input `--listed <file>`: every file of the merge commit. `--changed
 *   <file>`: the changed files, or `--all` (with `--truncated` when GitHub
 *   truncated the list) when there is no list. `--root <dir>`: the merge
 *   commit's checkout. `--out <file>`: where the plan goes.
 * @output `{specs, reasons, shards}`, and `has_specs`, `specs` and `shards`
 *   (the shard matrix) for `$GITHUB_OUTPUT`.
 * @position The plan job before the release-spec shards. A release spec (a
 *   `*.release.*.spec.ts` file or a spec tagged `@pr-a11y release-only`) runs
 *   when the pull request adds or changes it, changes a module it imports, or
 *   changes the rendered source of a component it visits. A visit that
 *   cannot be resolved runs the spec; imports that cannot be followed, or a
 *   change with no file list, run every release spec. Each spec runs once, in
 *   the shard that a recorded-time split gives it.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  componentPathOf,
  isRenderedSource,
  proofImporters,
} from './a11y-pr-contracts.mjs';
import {releaseSpecs, specVisits, storyFiles} from './release-spec-visits.mjs';
import {fitLegsToBudget} from '../../scripts/lib/duration-split.mjs';

export {isReleaseFile} from './release-spec-visits.mjs';

/** The spec time a shard plans for, inside its 15-minute job limit. */
export const SHARD_SECONDS = 12 * 60;
/** The time of a spec with no recorded time. */
export const UNKNOWN_SECONDS = 60;

/**
 * The fewest shards a slowest-first split fits, each at most `SHARD_SECONDS`
 * of recorded time; a spec
 * longer than that runs in a shard of its own. Every spec is in exactly one
 * shard.
 * @param {string[]} specs
 * @param {Record<string, number>} seconds recorded seconds per spec file
 * @returns {{specs: string[], seconds: number}[]}
 */
export function shardSpecs(specs, seconds) {
  if (specs.length === 0) return [];
  const cost = spec =>
    Number.isFinite(seconds[spec]) ? seconds[spec] : UNKNOWN_SECONDS;
  return fitLegsToBudget(specs, cost, {budget: SHARD_SECONDS}).shares.map(
    leg => ({
      specs: leg,
      seconds: leg.reduce((sum, spec) => sum + cost(spec), 0),
    }),
  );
}

/**
 * The release specs a change runs.
 * @param {object} options
 * @param {string[]} options.listed every file of the merge commit
 * @param {string[]} options.changed the changed files
 * @param {(file: string) => string} options.read
 * @param {(specs: string[]) => Map<string, Set<string>>} options.importers
 *   each file the specs load, to the specs that load it; it throws when the
 *   imports cannot be followed
 * @param {{stories: Record<string, string[]>, pages: Record<string, string[]>}} options.map
 *   `.github/release-spec-visits.json`
 * @param {string} [options.everything] why every release spec runs, when
 *   the change has no file list
 * @returns {{specs: string[], reasons: Record<string, string>}}
 */
export function planReleaseSpecs({
  listed,
  changed,
  read,
  importers,
  map,
  everything,
}) {
  const all = releaseSpecs(listed, read);
  const reasons = {};
  const add = (spec, reason) => {
    reasons[spec] ??= reason;
  };
  if (everything) {
    for (const spec of all) add(spec, everything);
    return {specs: all, reasons};
  }
  const present = new Set(all);
  for (const file of changed)
    if (present.has(file)) add(file, 'the change adds or changes it');
  let loaded;
  try {
    loaded = importers(all);
  } catch (error) {
    for (const spec of all)
      add(
        spec,
        `the release specs' imports could not be followed (${error.message})`,
      );
    return {specs: all, reasons};
  }
  for (const file of changed)
    for (const spec of loaded.get(file) ?? []) add(spec, `it imports ${file}`);
  const rendered = changed.filter(isRenderedSource);
  const stories = storyFiles(listed, read);
  for (const spec of all) {
    const visit = specVisits(spec, {listed, read, stories, map});
    if (visit.unresolved.length > 0) {
      add(spec, `a visit cannot be resolved: ${visit.unresolved.join('; ')}`);
      continue;
    }
    const hit = rendered.find(file =>
      visit.folders.includes(componentPathOf(file)),
    );
    if (hit) add(spec, `it visits the component ${hit} belongs to`);
  }
  return {specs: Object.keys(reasons).sort(), reasons};
}

function option(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function main(args) {
  const lines = file =>
    fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const listed = lines(option(args, '--listed'));
  const root = option(args, '--root');
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const json = file => JSON.parse(read(file));
  const everything = args.includes('--all')
    ? args.includes('--truncated')
      ? 'GitHub truncated the changed-file list, so every release spec runs'
      : 'the scope step could not list the changed files, so every release spec runs'
    : undefined;
  const plan = planReleaseSpecs({
    listed,
    changed: everything ? [] : lines(option(args, '--changed')),
    everything,
    read,
    importers: specs => {
      const releases = new Set(specs);
      return proofImporters({
        root,
        listed,
        isProof: f => releases.has(f),
        read,
      });
    },
    map: json('.github/release-spec-visits.json'),
  });
  const shards = shardSpecs(
    plan.specs,
    json('.github/a11y-contract-durations.json').seconds,
  ).map((shard, index, every) => ({
    shard: index + 1,
    of: every.length,
    specs: shard.specs,
    seconds: Math.round(shard.seconds),
  }));
  fs.writeFileSync(
    option(args, '--out'),
    `${JSON.stringify({...plan, shards}, null, 2)}\n`,
  );
  console.log(
    plan.specs.length === 0
      ? 'No release spec, module a release spec imports, or component a release spec visits changed.'
      : `Release specs to run: ${plan.specs.length}, in ${shards.length} shard(s).`,
  );
  for (const spec of plan.specs)
    console.log(`  ${spec}: ${plan.reasons[spec]}`);
  for (const shard of shards)
    console.log(
      `Shard ${shard.shard}/${shard.of}: about ${shard.seconds} s, ${shard.specs.length} spec(s).`,
    );
  if (process.env.GITHUB_OUTPUT)
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `has_specs=${plan.specs.length > 0}\nspecs=${JSON.stringify(plan.specs)}\nshards=${JSON.stringify(shards.map(({shard, of, specs}) => ({shard, of, specs})))}\n`,
    );
}

// Real paths: a temporary folder can be a symbolic link, as on macOS.
if (
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) ===
    fs.realpathSync(fileURLToPath(import.meta.url))
) {
  main(process.argv.slice(2));
}
