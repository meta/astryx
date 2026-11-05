// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Analyze what a scaffolded template needs that the target project lacks.
 *
 * Derives needs from the template's own source — its bare import specifiers —
 * rather than from a hand-maintained list. Every import that is not an Astryx
 * package, react/react-dom, or @stylexjs/stylex is external; the source is the
 * only authority on what a template uses.
 *
 * Shared between `api/template/copy` (the scaffold receipt) and
 * `api/build/kit` (the start recommendation).
 *
 * @position packages/cli/foundation/discovery — template discovery helpers;
 *   consumed by the template and build API leaves.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import module from 'node:module';
import {CLI_ROOT, findWorkspaceRoot} from '../fs/paths.mjs';
import {detectStylingSystem} from '../agent-docs/agent-docs.mjs';
import {
  decidePackageManagerIn,
  formatCliCommand,
} from '../env/package-manager.mjs';

// ── Known packages that a template may import without the user installing them.
// react and react-dom are the framework; @astryxdesign/* is the design system
// the CLI already told the user to install; @stylexjs/stylex is a peer of Core.
const FRAMEWORK_PREFIXES = ['react', 'react-dom'];
const DESIGN_SYSTEM_SCOPE = '@astryxdesign/';
const STYLEX_RUNTIME = '@stylexjs/stylex';

// Node builtins: anything with a `node:` prefix or in builtinModules.
const NODE_BUILTINS = new Set(module.builtinModules);

/**
 * Extract bare (non-relative) package names from ES import statements.
 *
 * @param {string} source Template source code
 * @returns {Set<string>} Unique package names (scoped packages normalized to
 *   `@scope/name`, unscoped to the first path segment).
 */
export function extractImportedPackages(source) {
  // Matches `import … from '<specifier>'`, `import '<specifier>'`, and
  // dynamic `import('<specifier>')`. Only bare specifiers (not starting with
  // `.` or `/`).
  const re = /(?:from\s+|import\s*\(?)['"]((?:@[^/'"]+\/)?[^./'"@][^'"]*)['"]/g;
  /** @type {Set<string>} */
  const pkgs = new Set();
  let m;
  while ((m = re.exec(source)) !== null) {
    const spec = m[1];
    // Skip Node builtins: `node:fs`, `fs`, `fs/promises`, etc.
    if (spec.startsWith('node:')) continue;
    const name = spec.startsWith('@')
      ? spec.split('/').slice(0, 2).join('/')
      : spec.split('/')[0];
    if (NODE_BUILTINS.has(name)) continue;
    pkgs.add(name);
  }
  return pkgs;
}

/** @type {Record<string, string>} */
const ADD_VERB = {
  pnpm: 'pnpm add',
  yarn: 'yarn add',
  bun: 'bun add',
  npm: 'npm install',
};

/**
 * The project's package manager for an install command (AST-048 FR17, FR19):
 * the nearest directory from the target up to the workspace root that has a
 * `packageManager` field or a lockfile decides, by the CLI's shared
 * per-directory rule; with none, npm. Ambiguous when that directory's
 * lockfiles disagree and nothing it commits picks one.
 * @param {string} target
 * @returns {{verb: string} | {verb: null, dir: string, lockfiles: string[]}}
 */
function resolveInstallVerb(target) {
  const root = findWorkspaceRoot(target);
  let dir = path.resolve(target);
  for (;;) {
    const decision = decidePackageManagerIn(dir);
    if (decision) {
      if (decision.ambiguous) {
        return {
          verb: null,
          dir,
          lockfiles: decision.lockfiles.map(lock => lock.file),
        };
      }
      return {verb: ADD_VERB[decision.pm] ?? ADD_VERB.npm};
    }
    const parent = path.dirname(dir);
    if (dir === root || parent === dir) break;
    dir = parent;
  }
  return {verb: ADD_VERB.npm};
}

/**
 * Read the CLI package's own devDependencies for authoritative version ranges
 * of external packages the templates use.
 * @returns {Record<string, string>}
 */
function cliPackageRanges() {
  try {
    const pkgPath = path.join(CLI_ROOT, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return {...pkg.devDependencies};
  } catch {
    return {};
  }
}

/**
 * Analyze what a template source needs that the target project lacks.
 *
 * Returns a `notes` array of human-readable setup notes, a structured
 * `missingPackages` list, and an `installCommand` string ready to print.
 * Each note is one actionable line.
 *
 * @param {string} source Template source code
 * @param {string} cwd    Target project directory
 * @returns {{
 *   notes: string[],
 *   missingPackages: string[],
 *   installCommand: string | null,
 * }}
 */
export function analyzeTemplateNeeds(source, cwd) {
  const imported = extractImportedPackages(source);

  // ── External packages (not framework / design system / stylex runtime) ──
  const external = [...imported].filter(
    name =>
      !FRAMEWORK_PREFIXES.includes(name) &&
      !name.startsWith(DESIGN_SYSTEM_SCOPE) &&
      name !== STYLEX_RUNTIME,
  );

  // Read the project's installed packages.
  /** @type {Record<string, string>} */
  let projectDeps = {};
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8'),
    );
    projectDeps = {...pkg.dependencies, ...pkg.devDependencies};
  } catch {
    // No package.json or unreadable — treat everything as missing.
  }

  const missing = external.filter(p => !(p in projectDeps));

  // Build the install command with version ranges from the CLI workspace.
  let installCommand = null;
  /** @type {string | null} */
  let noCommandReason = null;
  if (missing.length > 0) {
    const resolved = resolveInstallVerb(cwd);
    const ranges = cliPackageRanges();
    const specs = missing.map(p => (ranges[p] ? `${p}@"${ranges[p]}"` : p));
    if (resolved.verb !== null) {
      installCommand = `${resolved.verb} ${specs.join(' ')}`;
    } else {
      const where = path.relative(cwd, resolved.dir) || '.';
      noCommandReason = `Install missing dependencies: ${specs.join(' ')}. No install command: ${where} has ${resolved.lockfiles.join(' and ')}, and nothing there says which package manager to use.`;
    }
  }

  // ── StyleX compiler ────────────────────────────────────────────────────
  const usesStylex = imported.has(STYLEX_RUNTIME);
  const stylexCompilerNeeded =
    usesStylex && detectStylingSystem(cwd) !== 'stylex';

  // ── Notes ──────────────────────────────────────────────────────────────
  /** @type {string[]} */
  const notes = [];
  if (missing.length > 0) {
    notes.push(
      installCommand
        ? `Install missing dependencies: ${installCommand}`
        : (noCommandReason ?? ''),
    );
  }
  if (stylexCompilerNeeded) {
    notes.push(
      `This template uses StyleX. Your project needs a StyleX compiler plugin \u2014 see \`${formatCliCommand('docs styling-overview')}\` for setup steps.`,
    );
  }

  return {notes, missingPackages: missing, installCommand};
}
