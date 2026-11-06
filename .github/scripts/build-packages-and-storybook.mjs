#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The workspace build and the Storybook build, overlapped.
 * @input The root package.json `build` script (a `&&` chain), each built
 *   package's workspace dependencies, and the parallelism this machine offers.
 * @output Every step `pnpm build` runs, with the same commands, plus
 *   `apps/storybook/dist`; exits non-zero if any step fails or Storybook's
 *   index recorded a package that was not built yet.
 * @position CI's build-storybook job. A package build starts once the
 *   workspace packages it depends on are built; any other step (bundling,
 *   generated types) waits for every step before it, and every step after it
 *   waits for it, so the chain's order still holds wherever it matters.
 *   Storybook builds from package source (its config aliases workspace
 *   packages to `src/`), but its story index records a story's component as
 *   that package's built entry when the entry exists. For the packages whose
 *   stories import their component by package name, that entry must exist
 *   first, so Storybook waits for those packages and the check after it fails
 *   if the index still names any package by bare specifier.
 */

import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const STORYBOOK = 'pnpm -F @astryxdesign/storybook build';
/** Packages whose built entry Storybook's index records for their stories. */
const STORYBOOK_INDEXES_BUILT = [
  '@astryxdesign/build',
  '@astryxdesign/charts',
  '@astryxdesign/vega',
];
const PACKAGE_BUILD = /^pnpm -F (@astryxdesign\/[\w-]+) build$/;

/** Every workspace package's name → its directory. */
function workspacePackages() {
  const dirs = [];
  for (const group of ['packages', 'packages/themes']) {
    for (const entry of fs.readdirSync(path.join(ROOT, group), {
      withFileTypes: true,
    })) {
      if (entry.isDirectory()) dirs.push(path.join(group, entry.name));
    }
  }
  const byName = new Map();
  for (const dir of dirs) {
    const file = path.join(ROOT, dir, 'package.json');
    if (fs.existsSync(file))
      byName.set(JSON.parse(fs.readFileSync(file, 'utf8')).name, dir);
  }
  return byName;
}

/**
 * @param {string} script the root `build` script
 * @param {(name: string) => string[]} dependenciesOf a package's dependency names
 * @returns {{command: string, label: string, after: number[]}[]} steps; the last is Storybook
 */
export function planBuild(script, dependenciesOf) {
  const commands = script
    .split('&&')
    .map(step => step.trim())
    .filter(Boolean);
  /** @type {{command: string, label: string, after: number[], pkg?: string}[]} */
  const steps = [];
  let barrier = -1;
  for (const command of commands) {
    const index = steps.length;
    const pkg = PACKAGE_BUILD.exec(command)?.[1];
    let after;
    if (pkg) {
      const deps = new Set(dependenciesOf(pkg));
      after = steps.flatMap((step, i) =>
        i === barrier || deps.has(step.pkg) ? [i] : [],
      );
    } else {
      after = steps.map((_, i) => i);
      barrier = index;
    }
    steps.push({command, label: pkg ?? command, after, pkg});
  }
  const storybookAfter = STORYBOOK_INDEXES_BUILT.map(name => {
    const index = steps.findIndex(step => step.pkg === name);
    if (index === -1)
      throw new Error(
        `The root build no longer builds ${name}; Storybook waits for it.`,
      );
    return index;
  });
  steps.push({command: STORYBOOK, label: 'storybook', after: storybookAfter});
  return steps;
}

/** Story index entries that name a package instead of a file. */
export function bareComponentPaths(index) {
  return Object.values(index.entries ?? {})
    .filter(entry => /^@[^/]+\/[^/]+/.test(entry.componentPath ?? ''))
    .map(entry => `${entry.id}: ${entry.componentPath}`);
}

function run(command, label) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const child = spawn(command, {
      cwd: ROOT,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const prefix = chunk =>
      chunk
        .toString()
        .split('\n')
        .filter(Boolean)
        .map(line => `[${label}] ${line}\n`)
        .join('');
    child.stdout.on('data', chunk => process.stdout.write(prefix(chunk)));
    child.stderr.on('data', chunk => process.stderr.write(prefix(chunk)));
    child.on('error', reject);
    child.on('close', code => {
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      if (code === 0) {
        console.log(`[${label}] ok in ${seconds}s`);
        resolve();
      } else
        reject(
          new Error(`[${label}] exit ${code} after ${seconds}s: ${command}`),
        );
    });
  });
}

/** Runs steps as their dependencies finish, at most `limit` at once; stops starting new ones after a failure. */
async function runPlan(steps, limit) {
  const done = new Set();
  const started = new Set();
  const running = new Map();
  let failure = null;
  while (done.size < steps.length) {
    if (!failure) {
      for (const [index, step] of steps.entries()) {
        if (running.size >= limit) break;
        if (started.has(index) || !step.after.every(i => done.has(i))) continue;
        started.add(index);
        running.set(
          index,
          run(step.command, step.label).then(
            () => index,
            error => {
              failure ??= error;
              return index;
            },
          ),
        );
      }
    }
    if (running.size === 0) break;
    const finished = await Promise.race(running.values());
    running.delete(finished);
    if (!failure) done.add(finished);
  }
  if (failure) throw failure;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const packages = workspacePackages();
  const dependenciesOf = name => {
    const dir = packages.get(name);
    if (!dir) return [];
    const manifest = JSON.parse(
      fs.readFileSync(path.join(ROOT, dir, 'package.json'), 'utf8'),
    );
    return Object.keys({
      ...manifest.dependencies,
      ...manifest.peerDependencies,
      ...manifest.devDependencies,
    }).filter(dep => packages.has(dep));
  };
  const {scripts} = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
  );
  const steps = planBuild(scripts.build, dependenciesOf);
  try {
    await runPlan(steps, Math.max(2, os.availableParallelism()));
    const index = JSON.parse(
      fs.readFileSync(
        path.join(ROOT, 'apps/storybook/dist/index.json'),
        'utf8',
      ),
    );
    const bare = bareComponentPaths(index);
    if (bare.length > 0) {
      throw new Error(
        `Storybook indexed ${bare.length} stories before their package was built:\n${bare.slice(0, 10).join('\n')}`,
      );
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
