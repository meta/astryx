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
import {
  parseTemplateSource,
  TEMPLATE_COMPONENTS_FILE,
  walk,
} from './template-source-tree.mjs';
import {readStore, storedKey} from '../doc-compiler/stored-docs.mjs';
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
 * A package name npm accepts, optionally scoped. Legacy names keep capitals
 * (`JSONStream`). A name has no `~`, so `~/lib` is a path alias, as are
 * `@/components` and `#internal`.
 */
const NPM_NAME = /^(?:@[\w.-]+\/[\w-][\w.-]*|[A-Za-z0-9][\w.-]*)$/;

/**
 * Extract bare (non-relative) package names from ES import statements.
 *
 * Only real module specifiers count: `import … from`, a side-effect
 * `import '…'`, `export … from`, a dynamic `import('…')` or `require('…')`
 * with a string, and a type `import('…')`.
 * Words in comments, strings and JSX text never count, and a specifier that
 * is not an npm package name (`@/components`, `~/lib`, `#internal`, a word
 * with spaces) is an alias or a typo, not a package to install.
 *
 * @param {string} source Template source code
 * @returns {Set<string>} Unique package names (scoped packages normalized to
 *   `@scope/name`, unscoped to the first path segment).
 */
export function extractImportedPackages(source) {
  /** @type {Set<string>} */
  const pkgs = new Set();
  for (const spec of moduleSpecifiers(source)) {
    // Skip Node builtins: `node:fs`, `fs`, `fs/promises`, etc.
    if (spec.startsWith('node:')) continue;
    if (spec.startsWith('.') || spec.startsWith('/')) continue;
    const name = spec.startsWith('@')
      ? spec.split('/').slice(0, 2).join('/')
      : spec.split('/')[0];
    if (NODE_BUILTINS.has(name) || !NPM_NAME.test(name)) continue;
    pkgs.add(name);
  }
  return pkgs;
}

/**
 * The module specifiers a source imports or re-exports, read from its syntax
 * tree. A source the parser cannot read is scanned line by line instead, with
 * comments removed, so only statements that start a line count.
 * @param {string} source
 * @returns {string[]}
 */
function moduleSpecifiers(source) {
  // A template Astryx ships answers from what parsing it returned at publish.
  const stored = readStore(TEMPLATE_COMPONENTS_FILE).get(
    `imports:${storedKey(source)}`,
  );
  if (Array.isArray(stored)) return [...stored];
  return parsedSpecifiers(source);
}

/**
 * moduleSpecifiers, read from the source's syntax tree.
 * @param {string} source
 * @returns {string[]}
 */
export function parsedSpecifiers(source) {
  let file;
  try {
    file = parseTemplateSource(source, {errorRecovery: true});
  } catch {
    return scannedSpecifiers(source);
  }
  /** @type {string[]} */
  const specs = [];
  /** @param {any} literal */
  const add = literal => {
    if (literal?.type === 'StringLiteral') specs.push(literal.value);
  };
  walk(file.program, (/** @type {any} */ node) => {
    if (
      node.type === 'ImportDeclaration' ||
      node.type === 'ExportNamedDeclaration' ||
      node.type === 'ExportAllDeclaration'
    ) {
      add(node.source);
    } else if (
      node.type === 'CallExpression' &&
      node.callee?.type === 'Import'
    ) {
      add(node.arguments?.[0]);
    } else if (
      node.type === 'CallExpression' &&
      node.callee?.type === 'Identifier' &&
      node.callee.name === 'require'
    ) {
      add(node.arguments?.[0]);
    } else if (node.type === 'ImportExpression') {
      add(node.source);
    } else if (node.type === 'TSImportType') {
      // `type O = import('chart-lib').Options`
      add(
        node.argument?.type === 'TSLiteralType'
          ? node.argument.literal
          : node.argument,
      );
    }
  });
  return specs;
}

/**
 * A source with its comments removed. Strings and template literals are kept
 * whole, so a `/*` or `//` inside one (`'images/*'`) does not start a comment.
 * @param {string} source
 * @returns {string}
 */
function withoutComments(source) {
  let out = '';
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      out += '\n';
    } else if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 1;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < source.length && source[j] !== ch) {
        if (source[j] === '\\') j += 1;
        else if (ch !== '`' && source[j] === '\n') break;
        j += 1;
      }
      out += source.slice(i, j + 1);
      i = j;
    } else {
      out += ch;
    }
  }
  return out;
}

/** @param {string} source @returns {string[]} */
function scannedSpecifiers(source) {
  const code = withoutComments(source);
  // A statement starts a line: `import '…'`, or `import`/`export` with a
  // clause, which may span lines, then `from '…'`.
  const re =
    /^\s*import\s*['"]([^'"\n]+)['"]|^\s*(?:import|export)\b[^'";]*?\bfrom\s*['"]([^'"\n]+)['"]|\bimport\(\s*['"]([^'"\n]+)['"]\s*\)/gm;
  /** @type {string[]} */
  const specs = [];
  let m;
  while ((m = re.exec(code)) !== null) specs.push(m[1] ?? m[2] ?? m[3]);
  return specs;
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
 * The command that installs `packages` in the project at `cwd`, in its package
 * manager and with the CLI workspace's version ranges. Null, with the reason,
 * when several lockfiles leave the package manager undetermined; null with no
 * reason when there is nothing to install.
 * @param {string[]} packages
 * @param {string} cwd
 * @returns {{installCommand: string | null, noCommandReason: string | null}}
 */
export function installCommandFor(packages, cwd) {
  if (packages.length === 0) {
    return {installCommand: null, noCommandReason: null};
  }
  const resolved = resolveInstallVerb(cwd);
  const ranges = cliPackageRanges();
  const specs = packages.map(p => (ranges[p] ? `${p}@"${ranges[p]}"` : p));
  if (resolved.verb !== null) {
    return {
      installCommand: `${resolved.verb} ${specs.join(' ')}`,
      noCommandReason: null,
    };
  }
  const where = path.relative(cwd, resolved.dir) || '.';
  return {
    installCommand: null,
    noCommandReason: `Install missing dependencies: ${specs.join(' ')}. No install command: ${where} has ${resolved.lockfiles.join(' and ')}, and nothing there says which package manager to use.`,
  };
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

  const {installCommand, noCommandReason} = installCommandFor(missing, cwd);

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
