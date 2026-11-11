#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file release-specs-plan.mjs
 * @description Which release specs a pull request runs in `release-specs
 *   (changed)`, by FR32's release-file and import triggers (spec:AST-030
 *   FR32). Specs tagged `@pr-a11y release-only`, visited components and
 *   Lab-only pull requests are not triggers yet.
 * @input `--listed <file>`: every file of the merge commit. `--changed
 *   <file>`: the changed files. `--root <dir>`: the merge commit's checkout.
 *   `--out <file>`: where the plan goes.
 * @output `{specs, reason}`, and `has_specs=<true|false>` and `specs=<JSON>`
 *   for `$GITHUB_OUTPUT`.
 * @position The plan job before `release-specs (changed)`. A release spec runs
 *   when the pull request adds or changes it, or changes a module it imports.
 *   When the imports cannot be followed, every release spec runs.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {proofImporters} from './a11y-pr-contracts.mjs';

/** A release file: FR32's release spec by name. */
export const isReleaseSpec = file => /\.release\.[^/]*\.spec\.ts$/.test(file);

/**
 * The release specs a change runs.
 * @param {object} options
 * @param {string[]} options.listed every file of the merge commit
 * @param {string[]} options.changed the changed files
 * @param {() => Map<string, Set<string>>} options.importers each file a
 *   release spec loads, to the specs that load it; it throws when the imports
 *   cannot be followed
 * @returns {{specs: string[], reason: string}}
 */
export function planReleaseSpecs({listed, changed, importers}) {
  const all = listed.filter(isReleaseSpec).sort();
  const present = new Set(all);
  const specs = new Set(changed.filter(file => present.has(file)));
  let loaded;
  try {
    loaded = importers();
  } catch (error) {
    return {
      specs: all,
      reason: `the release specs' imports could not be followed (${error.message}), so every release spec runs`,
    };
  }
  for (const file of changed)
    for (const spec of loaded.get(file) ?? []) specs.add(spec);
  return {
    specs: [...specs].sort(),
    reason:
      specs.size === 0
        ? 'no release spec, and no module a release spec imports, changed'
        : 'each release spec the change adds, changes, or reaches through its imports',
  };
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
  const plan = planReleaseSpecs({
    listed,
    changed: lines(option(args, '--changed')),
    importers: () => proofImporters({root, listed, isProof: isReleaseSpec}),
  });
  fs.writeFileSync(option(args, '--out'), `${JSON.stringify(plan, null, 2)}\n`);
  console.log(`Release specs to run: ${plan.reason}.`);
  for (const spec of plan.specs) console.log(`  ${spec}`);
  if (process.env.GITHUB_OUTPUT)
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `has_specs=${plan.specs.length > 0}\nspecs=${JSON.stringify(plan.specs)}\n`,
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
