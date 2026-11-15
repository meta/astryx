// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scope.mjs
 * @input The change under test: git's diff against the base, or
 *   SWIZZLE_PROOF_CHANGED
 * @output Which targets the swizzle proof proves for it (spec:AST-110 FR7):
 *   none, the affected ones, or all
 * @position Read first by every slice (proof.mjs), by a Node project split,
 *   and, run directly, by CI's swizzle-proof-scope job before anything is
 *   installed, so it imports only Node
 * @effect Runs git to read the change
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

/** The workspace packages swizzle copies components from. */
export const COMPONENT_PACKAGES = ['core', 'lab', 'charts', 'richtext', 'vega'];

/**
 * A change to one of these paths can change every copy, so it proves every
 * target: the StyleX build, the proof itself, and a component package's
 * manifest (its exports route the copy's imports). The swizzle copy and the
 * CLI modules it reads count too ({@link swizzleModules}).
 */
const TOOLCHAIN = [
  /^packages\/build\/src\//,
  /^packages\/cli\/test\/swizzle-proof\//,
  /^packages\/(?:core|lab|charts|richtext|vega)\/package\.json$/,
];

/** A dependency whose change can change every copy's build. */
const TOOLCHAIN_DEPENDENCY =
  /(?:^|[\s'"/])(?:vite|@vitejs\/plugin-react|@stylexjs\/[\w-]+|typescript|react|react-dom|@babel\/[\w-]+|@types\/react(?:-dom)?)(?:@|['"]\s*:)/;

/**
 * The CLI modules `astryx swizzle` runs: the swizzle API and every module it
 * imports, by relative path, repository-relative.
 */
function swizzleModules() {
  const start = path.join(REPO, 'packages/cli/api/swizzle');
  const queue = fs
    .readdirSync(start, {recursive: true})
    .map(String)
    .filter(f => /\.mjs$/.test(f) && !/\.test\.mjs$/.test(f))
    .map(f => path.join(start, f));
  const seen = new Set();
  while (queue.length > 0) {
    const file = queue.shift();
    if (seen.has(file) || !fs.existsSync(file)) continue;
    seen.add(file);
    const code = fs.readFileSync(file, 'utf8');
    for (const [, spec] of code.matchAll(
      /(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g,
    )) {
      queue.push(path.resolve(path.dirname(file), spec));
    }
  }
  return new Set([...seen].map(f => path.relative(REPO, f)));
}

/**
 * The first changed path that can change every copy, or undefined. The
 * lockfile and the root manifest count only when a changed line names a
 * build dependency.
 * @param {string[]} changed
 * @param {string} base
 */
export function toolchainChange(changed, base) {
  const swizzle = swizzleModules();
  return changed.find(file => {
    if (swizzle.has(file) || TOOLCHAIN.some(re => re.test(file))) return true;
    if (file !== 'pnpm-lock.yaml' && file !== 'package.json') return false;
    try {
      const head = process.env.SWIZZLE_PROOF_HEAD;
      const diff = execFileSync(
        'git',
        ['diff', '-U0', base, ...(head ? [head] : []), '--', file],
        {cwd: REPO, encoding: 'utf8', maxBuffer: 256e6},
      );
      return diff
        .split('\n')
        .some(
          line => /^[-+][^-+]/.test(line) && TOOLCHAIN_DEPENDENCY.test(line),
        );
    } catch {
      // A diff git cannot read proves every target.
      return true;
    }
  });
}

export const NOT_SHIPPED =
  /\.(?:test|spec|stories|story|doc|bench)\.[cm]?[jt]sx?$|(?:^|\/)__(?:tests|fixtures|mocks)__\//;

/**
 * The paths a change touches, relative to the repository, or null when git
 * cannot tell. On a pull request's merge commit the base is its first
 * parent. A pull request run checks out that parent, so null there means
 * git failed, and the slice proves every target.
 * @param {string} [base]
 * @returns {string[]|null}
 */
export function changedPaths(
  base = process.env.SWIZZLE_PROOF_BASE ?? 'HEAD^1',
) {
  // A replayed change names its paths directly.
  if (process.env.SWIZZLE_PROOF_CHANGED) {
    return process.env.SWIZZLE_PROOF_CHANGED.split(',').filter(Boolean);
  }
  try {
    const head = process.env.SWIZZLE_PROOF_HEAD;
    const out = execFileSync(
      'git',
      ['diff', '--name-only', base, ...(head ? [head] : [])],
      {
        cwd: REPO,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );
    return out.split('\n').filter(Boolean);
  } catch {
    return null;
  }
}

/**
 * Which targets a run proves: none, the affected ones, or all. When git
 * cannot read the change, a checkout without a parent commit proves none
 * (there is no base to diff), and any other run proves every target (fail
 * closed).
 * @param {{changed: string[]|null, toolchain: string|undefined, relevant: string[], hasParent: boolean, all?: boolean}} change
 * @returns {{mode: 'none'|'affected'|'all', reason: string}}
 */
export function proofScope({
  changed,
  toolchain,
  relevant,
  hasParent,
  all = false,
}) {
  if (all) return {mode: 'all', reason: 'every target was asked for'};
  if (changed == null) {
    if (!hasParent) {
      return {
        mode: 'none',
        reason:
          'the checkout has no parent commit to diff against, so no target runs',
      };
    }
    return {
      mode: 'all',
      reason: 'the change could not be read, so every target runs',
    };
  }
  if (toolchain)
    return {mode: 'all', reason: `${toolchain} can change every copy`};
  if (relevant.length === 0) {
    return {
      mode: 'none',
      reason: 'no component source or toolchain path changed',
    };
  }
  return {mode: 'affected', reason: ''};
}

/** Whether the checkout holds the parent of its commit. */
function hasParentCommit() {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', 'HEAD^1'], {
      cwd: REPO,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * The change this run proves and the scope {@link proofScope} gives it: what
 * every slice reads first, what CI's swizzle-proof-scope job reads to start
 * the slices' legs, and what a split of the Node project reads to book idle
 * slices (scripts/vitest-shard-sequencer.mjs).
 * @param {{all?: boolean}} [options]
 */
export function runScope({all = false} = {}) {
  const base = process.env.SWIZZLE_PROOF_BASE ?? 'HEAD^1';
  const changed = all ? null : changedPaths(base);
  const toolchain = changed && toolchainChange(changed, base);
  const relevant = (changed ?? []).filter(
    file =>
      COMPONENT_PACKAGES.some(short =>
        file.startsWith(`packages/${short}/src/`),
      ) && !NOT_SHIPPED.test(file),
  );
  const scope = proofScope({
    changed,
    toolchain,
    relevant,
    hasParent: hasParentCommit(),
    all,
  });
  return {base, changed, toolchain, relevant, scope};
}

// Run directly (CI's swizzle-proof-scope job), it prints the scope and, under
// GitHub Actions, writes it as the step's `mode` output.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const {scope} = runScope({all: process.env.SWIZZLE_PROOF_ALL === '1'});
  console.log(
    `Swizzle proof scope: ${scope.mode}${scope.reason ? ` (${scope.reason})` : ''}`,
  );
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `mode=${scope.mode}\n`);
  }
}
