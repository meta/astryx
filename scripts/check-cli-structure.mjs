#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Repo check: the CLI's structural conventions, from CONTRIBUTING >
 * "Working on the astryx CLI".
 *
 * These are invariants about which files exist *next to each other*, which is
 * precisely what typechecking and unit tests cannot see — every individual file
 * is valid, the set is incomplete.
 *
 * 1. Every doc-type ships a complete trio, re-exports its public type from the
 *    doc vocabulary, and re-exports its parser from the authoring barrel:
 *      type.ts          the authored shape
 *      parse.mjs        the sealed parser (the CLI's load boundary)
 *      <kind>.doc.mjs   the doc-type documenting itself
 *    The parser's `.d.mts` declaration is deliberately NOT checked here: it is
 *    generated from the `.mjs` JSDoc by scripts/sync-api-types.mjs, so it can
 *    neither go missing nor drift. (Both failure modes shipped once while those
 *    declarations were hand-written — a missing file surfaced as TS7016 at pack
 *    time, and a stale parseDoc union silently dropped three doc kinds.)
 *
 * 2. Every api/<name>/ leaf carries its colocated contract and proof:
 *      *.type.mjs   the Options + { type, data } response typedefs, or a
 *                   published index.ts for a barrel that re-exports them
 *      *.doc.mjs    the FunctionDoc
 *      *.test.mjs   coverage (may be nested, e.g. api/theme/build/build.test.mjs)
 *
 * 3. Every CLI command and CommandDoc sits where cli-surface INV6 puts it:
 *      clients/cli/commands/<name>.mjs   (or <name>/index.mjs for a group:
 *                                         a CommandDoc that lists subcommands)
 *      clients/cli/commands/<name>.doc.mjs
 *      clients/cli/commands/<parent>-<child>.doc.mjs   for each subcommand
 *    Top-level commands come from clients/cli/index.mjs (its `commands`
 *    registry and any literal `.command()` call there); subcommands come from
 *    each CommandDoc's `subcommands`. The docs drift harness holds those docs
 *    equal to the live CLI (args, options, subcommands); this check owns where
 *    the files are.
 *
 * Usage: node scripts/check-cli-structure.mjs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runtimeStarExports} from './lib/api-index-star-exports.mjs';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const CLI = path.join(REPO_ROOT, 'packages/cli');
const DOCTYPES = path.join(CLI, 'authoring/doctypes');
const API = path.join(CLI, 'api');

/** `base/` holds the shared leaf types (SlotDoc, ExampleDoc, ...) that other
 *  doc-types compose. It is not a doc kind: nothing parses a "base doc". */
const DOCTYPE_EXEMPT = new Set(['base']);

/** @param {string} dir @returns {string[]} */
const dirsIn = dir =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter(f => fs.statSync(path.join(dir, f)).isDirectory())
    : [];

/** Recursively collect file names under a directory. @param {string} dir @returns {string[]} */
function walk(dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name)));
    else out.push(entry.name);
  }
  return out;
}

/**
 * Every `*.doc.mjs` under `dir`, group folders included, as `/`-separated paths
 * relative to `dir`, sorted.
 * @param {string} dir
 * @returns {string[]}
 */
function docFilesUnder(dir) {
  /** @type {string[]} */
  const out = [];
  const entries = fs
    .readdirSync(dir, {withFileTypes: true})
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.isDirectory()) {
      for (const file of docFilesUnder(path.join(dir, entry.name))) {
        out.push(`${entry.name}/${file}`);
      }
    } else if (entry.name.endsWith('.doc.mjs')) {
      out.push(entry.name);
    }
  }
  return out;
}

/** @type {string[]} */
const errors = [];
let doctypeCount = 0;
let apiCount = 0;

// ── 1. doc-type quartets ────────────────────────────────────────────────
const authoringIndexTypes = fs.readFileSync(
  path.join(CLI, 'authoring/index.d.ts'),
  'utf8',
);
const docTypeExports = fs.readFileSync(path.join(DOCTYPES, 'types.ts'), 'utf8');
const authoringIndexImpl = fs.readFileSync(
  path.join(CLI, 'authoring/index.mjs'),
  'utf8',
);
/**
 * parseDoc's own `@returns {...}` union — the source the emitted declaration
 * derives from. Scoped to the JSDoc block immediately above `export function
 * parseDoc`: the file also carries a `@typedef` line per kind, so matching the
 * whole file would find every kind name and never fail.
 */
const parseSrc = fs.readFileSync(path.join(DOCTYPES, 'parse.mjs'), 'utf8');
const parseDocJsdoc = parseSrc.slice(
  0,
  parseSrc.indexOf('export function parseDoc'),
);
const returnsMatches = parseDocJsdoc.match(/@returns\s*\{[^}]*\}/g) ?? [];
const aggregateParserReturns = returnsMatches[returnsMatches.length - 1] ?? '';
if (!aggregateParserReturns) {
  errors.push(
    'could not find a @returns union on parseDoc in authoring/doctypes/parse.mjs',
  );
}

for (const kind of dirsIn(DOCTYPES)) {
  if (DOCTYPE_EXEMPT.has(kind)) continue;
  doctypeCount++;
  const dir = path.join(DOCTYPES, kind);

  for (const required of ['type.ts', 'parse.mjs', `${kind}.doc.mjs`]) {
    if (!fs.existsSync(path.join(dir, required))) {
      errors.push(
        `doc-type "${kind}" is missing authoring/doctypes/${kind}/${required}`,
      );
    }
  }

  const typeSpec = `./${kind}/type`;
  if (!docTypeExports.includes(typeSpec)) {
    errors.push(
      `doc-type "${kind}" type is not re-exported from authoring/doctypes/types.ts`,
    );
  }

  // A parser nobody re-exports is unreachable from @astryxdesign/cli/authoring.
  const spec = `./doctypes/${kind}/parse.mjs`;
  if (!authoringIndexTypes.includes(spec)) {
    errors.push(
      `doc-type "${kind}" parser is not re-exported from authoring/index.d.ts`,
    );
  }
  if (!authoringIndexImpl.includes(spec)) {
    errors.push(
      `doc-type "${kind}" parser is not re-exported from authoring/index.mjs`,
    );
  }

  // parseDoc's own `@returns` is what the generated declaration derives its
  // return union from, so a kind missing there is silently unnarrowable for
  // consumers (`type === 'schema'` reads as a no-overlap comparison). Checking
  // the JSDoc catches it at the source rather than in the emitted artifact.
  // A kebab kind names its type in PascalCase: `icon-set` is IconSetDoc.
  const docType = `${kind
    .split('-')
    .map(part => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join('')}Doc`;
  if (!aggregateParserReturns.includes(docType)) {
    errors.push(
      `doc-type "${kind}" is missing from the @returns union of authoring/doctypes/parse.mjs (expected ${docType})`,
    );
  }
}

// ── 2. api/<name>/ leaves ───────────────────────────────────────────────
for (const name of dirsIn(API)) {
  apiCount++;
  const dir = path.join(API, name);
  const files = walk(dir);
  const topLevel = fs.readdirSync(dir);

  if (!files.some(f => f.endsWith('.doc.mjs'))) {
    errors.push(`api/${name}/ is missing a FunctionDoc (*.doc.mjs)`);
  }
  // Types ship as colocated JSDoc typedefs, or — for a barrel that only
  // re-exports other leaves' types (api/json) — as the published index.ts that
  // package.json's "exports" points at.
  if (
    !files.some(f => f.endsWith('.type.mjs')) &&
    !topLevel.includes('index.ts')
  ) {
    errors.push(
      `api/${name}/ is missing response typedefs (*.type.mjs, or a published index.ts)`,
    );
  }
  if (!files.some(f => f.endsWith('.test.mjs'))) {
    errors.push(`api/${name}/ is missing a test (*.test.mjs)`);
  }
}

// If a directory is moved or renamed, the loops above simply iterate nothing and
// this would report a cheerful "0 checked". A check that passes when its subject
// disappears is worse than no check, so require having found something real.
if (doctypeCount === 0) {
  errors.push(
    `found no doc-type folders under ${path.relative(REPO_ROOT, DOCTYPES)} — has the directory moved? Update this check.`,
  );
}
if (apiCount === 0) {
  errors.push(
    `found no api/<name>/ folders under ${path.relative(REPO_ROOT, API)} — has the directory moved? Update this check.`,
  );
}

// ── 3. INV22 + INV21: environment imports ───────────────────────────
//
// Handlers (INV22) and non-adapter API modules (INV21) must not import
// filesystem, network, subprocess, Project, or discovery modules. Those
// belong in the API's _adapter.mjs and underscore-prefixed helpers imported
// only by that adapter.
//
// Each entry is an allowed set of ban categories for a file that predates
// these checks. An entry that becomes stale — the file no longer imports
// that category — MUST fail so the allowlist can only shrink.

/** Recursively collect .mjs files, excluding tests and docs.
 *  @param {string} dir @returns {string[]} full paths */
function walkScopedMjs(dir) {
  /** @type {string[]} */
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkScopedMjs(full));
    } else if (
      entry.name.endsWith('.mjs') &&
      !entry.name.endsWith('.test.mjs') &&
      !entry.name.endsWith('.doc.mjs')
    ) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Extract import/re-export module specifiers from a source file.
 * Catches both static (`import X from '…'`, `export {X} from '…'`) and
 * runtime dynamic (`await import('…')`) imports.  JSDoc type-only imports
 * (`{import('…')}`) are excluded so they do not produce false positives.
 * @param {string} filePath
 * @returns {string[]}
 */
function importSources(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  /** @type {string[]} */
  const out = [];
  // Static imports and re-exports
  for (const m of src.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
    out.push(m[1]);
  }
  // Runtime dynamic imports — but not JSDoc type-only `{import('…')}`
  for (const m of src.matchAll(/(?<!\{)\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    out.push(m[1]);
  }
  return out;
}

/**
 * Classify a module specifier into a ban category, or null if allowed.
 * @param {string} spec
 * @returns {'fs'|'child_process'|'net'|'project'|'discovery'|null}
 */
function banCategory(spec) {
  if (spec === 'node:fs' || spec === 'node:fs/promises') return 'fs';
  if (spec === 'node:child_process') return 'child_process';
  if (spec === 'node:net' || spec === 'node:http' || spec === 'node:https') return 'net';
  if (spec.includes('foundation/config/project')) return 'project';
  if (spec.includes('foundation/discovery/')) return 'discovery';
  return null;
}

/**
 * Scan files for banned environment imports and enforce the known-gap
 * allowlist.  A new violation in an allowlisted file fails, and a stale
 * entry (the file no longer imports that category) also fails.
 *
 * @param {string} label  invariant name for error messages
 * @param {string[]} files  full paths to scan
 * @param {string} baseDir  base for relative paths in the allowlist
 * @param {Map<string, Set<string>>} knownGaps  relative-path → allowed categories
 * @returns {number} files checked
 */
function checkEnvironmentImports(label, files, baseDir, knownGaps) {
  let checked = 0;
  for (const filePath of files) {
    checked++;
    const rel = path.relative(baseDir, filePath).split(path.sep).join('/');
    const sources = importSources(filePath);
    /** @type {Set<string>} */
    const found = new Set();
    for (const s of sources) {
      const cat = banCategory(s);
      if (cat) found.add(cat);
    }

    const allowed = knownGaps.get(rel);
    if (allowed) {
      for (const cat of found) {
        if (!allowed.has(cat)) {
          errors.push(
            `${label}: ${rel} has a new environment import (${cat}) not in the known-gap allowlist`,
          );
        }
      }
      for (const cat of allowed) {
        if (!found.has(cat)) {
          errors.push(
            `${label}: ${rel} no longer imports ${cat} — remove it from the ${label} allowlist so the list can only shrink`,
          );
        }
      }
    } else if (found.size > 0) {
      errors.push(
        `${label}: ${rel} imports ${[...found].join(', ')} — environment access belongs in the adapter (architecture:cli-surface)`,
      );
    }
  }
  return checked;
}

// --- INV22: command handlers ---
const HANDLER_DIR = path.join(CLI, 'clients/cli/commands');
/** @type {Map<string, Set<string>>} known gaps recorded in AST-042;
 *  remove an entry when the file is fixed; do not add entries */
const INV22_KNOWN_GAPS = new Map([
  ['theme.mjs', new Set(['fs', 'child_process', 'project'])],
  ['component.mjs', new Set(['project', 'discovery'])],
  ['discover.mjs', new Set(['project'])],
  ['ensure-core-built.mjs', new Set(['fs', 'child_process'])],
  ['hook.mjs', new Set(['discovery'])],
  // remove with the layout command
  ['layout.mjs', new Set(['fs'])],
  ['search.mjs', new Set(['project'])],
  ['template.mjs', new Set(['project'])],
]);
const handlerFiles = walkScopedMjs(HANDLER_DIR);
const inv22Count = checkEnvironmentImports(
  'INV22', handlerFiles, HANDLER_DIR, INV22_KNOWN_GAPS,
);

// --- INV21: API non-adapter modules ---
//
// INV21 says environment access happens in "the subject's adapter:
// `_adapter.mjs` and any underscore-prefixed helper that only it imports."
// The exemption is computed from the import graph: a `_*.mjs` file is exempt
// when every file that runtime-imports it is itself exempt (adapters, or
// helpers that only adapters import). A helper imported by a leaf is not
// exempt and must appear in the allowlist.

/** Collect all non-test, non-doc .mjs files under a directory.
 *  @param {string} dir @returns {string[]} */
function allMjsFiles(dir) {
  /** @type {string[]} */
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...allMjsFiles(full));
    else if (entry.name.endsWith('.mjs') && !entry.name.endsWith('.test.mjs') && !entry.name.endsWith('.doc.mjs')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Compute the set of underscore-prefixed API files that are exempt per INV21:
 * adapters plus helpers whose every runtime importer is itself exempt.
 * @returns {Set<string>} full paths of exempt files
 */
function computeAdapterExemptions() {
  const allApiFiles = allMjsFiles(API);

  // Identify all underscore-prefixed files under api/
  /** @type {Set<string>} */
  const underscoreFiles = new Set();
  for (const f of allApiFiles) {
    if (path.basename(f).startsWith('_')) underscoreFiles.add(f);
  }

  // Build reverse import graph: for each underscore file, who imports it?
  // Only consider runtime imports within packages/cli (non-test, non-doc).
  const allCliFiles = allMjsFiles(CLI);
  /** @type {Map<string, Set<string>>} target → set of importers */
  const importedBy = new Map();
  for (const uf of underscoreFiles) importedBy.set(uf, new Set());

  for (const srcFile of allCliFiles) {
    const sources = importSources(srcFile);
    const srcDir = path.dirname(srcFile);
    for (const spec of sources) {
      if (!spec.startsWith('.')) continue;
      const resolved = path.resolve(srcDir, spec);
      // The spec might omit the extension or resolve to a directory index;
      // since underscore files are always spelled with `.mjs`, a direct
      // resolve is enough.
      if (underscoreFiles.has(resolved) && resolved !== srcFile) {
        importedBy.get(resolved)?.add(srcFile);
      }
    }
  }

  // Seed: _adapter.mjs files are unconditionally exempt.
  /** @type {Set<string>} */
  const exempt = new Set();
  for (const uf of underscoreFiles) {
    if (path.basename(uf) === '_adapter.mjs') exempt.add(uf);
  }

  // Fixed-point: a helper is exempt if every importer is exempt.
  let changed = true;
  while (changed) {
    changed = false;
    for (const uf of underscoreFiles) {
      if (exempt.has(uf)) continue;
      const importers = importedBy.get(uf);
      if (!importers || importers.size === 0) continue;
      let allExempt = true;
      for (const imp of importers) {
        if (!exempt.has(imp)) { allExempt = false; break; }
      }
      if (allExempt) {
        exempt.add(uf);
        changed = true;
      }
    }
  }

  return exempt;
}

const adapterExemptions = computeAdapterExemptions();

/** @param {string} filePath @returns {boolean} */
function isApiExempt(filePath) {
  if (adapterExemptions.has(filePath)) return true;
  const bn = path.basename(filePath);
  if (bn.endsWith('.type.mjs')) return true;
  const rel = path.relative(API, filePath).split(path.sep).join('/');
  return rel === 'index.mjs' || rel === 'error.mjs' || rel === 'logger.mjs';
}

const apiScopedFiles = walkScopedMjs(API).filter(f => !isApiExempt(f));

/** @type {Map<string, Set<string>>} known gaps recorded in AST-042;
 *  remove an entry when the file is fixed; do not add entries */
const INV21_KNOWN_GAPS = new Map([
  ['component/detail/showcase/showcase.mjs', new Set(['fs'])],
  ['component/detail/source/source.mjs', new Set(['fs'])],
  ['component/list/list.mjs', new Set(['discovery'])],
  ['docs/detail/section/section.mjs', new Set(['discovery'])],
  ['doctor/doctor.mjs', new Set(['fs', 'project', 'discovery'])],
  ['gap-report/gap-report.mjs', new Set(['child_process', 'discovery', 'project'])],
  ['hook/list/list.mjs', new Set(['discovery'])],
  ['init/run/run.mjs', new Set(['fs'])],
  ['integration/add-contribution.mjs', new Set(['discovery', 'fs'])],
  ['integration/add-helpers.mjs', new Set(['fs'])],
  ['integration/add-theme.mjs', new Set(['fs', 'discovery'])],
  ['integration/authoring-checks.mjs', new Set(['discovery'])],
  ['integration/pack-check.mjs', new Set(['fs', 'child_process', 'discovery'])],
  ['integration/validate-integration.mjs', new Set(['fs', 'discovery'])],
  // remove with the layout command
  ['layout/expand/expand.mjs', new Set(['fs'])],
  // imported by a leaf (copy), not only by the adapter
  ['swizzle/_github.mjs', new Set(['child_process'])],
  ['swizzle/copy/copy.mjs', new Set(['fs', 'project', 'discovery'])],
  ['template/cdn/cdn.mjs', new Set(['fs'])],
  ['template/copy/copy.mjs', new Set(['fs', 'discovery'])],
  ['template/list/list.mjs', new Set(['discovery'])],
  ['template/show/show.mjs', new Set(['fs', 'discovery'])],
  ['template/skeleton/skeleton.mjs', new Set(['fs', 'discovery'])],
  ['template/template.mjs', new Set(['discovery'])],
  ['theme/build/build.mjs', new Set(['fs', 'discovery'])],
  ['theme/palette/generate/generate.mjs', new Set(['fs'])],
  ['theme/targets/targets.mjs', new Set(['discovery'])],
  ['theme/template/template.mjs', new Set(['fs'])],
  ['upgrade/registry/registry.mjs', new Set(['fs'])],
  ['upgrade/run/run.mjs', new Set(['fs'])],
]);
const inv21Count = checkEnvironmentImports(
  'INV21', apiScopedFiles, API, INV21_KNOWN_GAPS,
);

// --- INV22 recorded-theme client seam ---
//
// Component metadata keeps the released package-field reader in its client
// helper, but all generated-record discovery and loading belongs to the theme
// subject. Pin that narrow seam so another adapter or foundation import cannot
// bypass the API boundary unnoticed.
const RESOLVE_THEME_HELPER = path.join(
  CLI,
  'clients/cli/lib/resolve-theme.mjs',
);
const RESOLVE_THEME_ALLOWED_IMPORTS = new Set([
  'node:fs',
  'node:module',
  'node:path',
  '../../../api/theme/theme.mjs',
]);
let clientHelperBoundaryCount = 0;
if (!fs.existsSync(RESOLVE_THEME_HELPER)) {
  errors.push(
    'INV22 client helper: clients/cli/lib/resolve-theme.mjs is missing — update this boundary check if it moved',
  );
} else {
  clientHelperBoundaryCount++;
  const imports = importSources(RESOLVE_THEME_HELPER);
  for (const spec of imports) {
    if (!RESOLVE_THEME_ALLOWED_IMPORTS.has(spec)) {
      errors.push(
        `INV22 client helper: resolve-theme.mjs imports ${spec} — generated-record access must go through api/theme/theme.mjs`,
      );
    }
  }
  if (!imports.includes('../../../api/theme/theme.mjs')) {
    errors.push(
      'INV22 client helper: resolve-theme.mjs no longer imports api/theme/theme.mjs — keep generated-record access behind the theme subject entry',
    );
  }
}

// ── 3b. INV23: text-layout patterns ─────────────────────────────────
//
// Handlers must use the formatter kit (section, text, list, record,
// records, code) rather than .padEnd(), .padStart(), .repeat(), or
// new Block() to build text columns.

/** @type {{re: RegExp, kind: string}[]} */
const TEXT_LAYOUT_PATTERNS = [
  {re: /\.padEnd\s*\(/g, kind: 'padEnd'},
  {re: /\.padStart\s*\(/g, kind: 'padStart'},
  {re: /\.repeat\s*\(/g, kind: 'repeat'},
  {re: /new\s+Block\s*\(/g, kind: 'new Block'},
];

/** @type {Map<string, Set<string>>} known gaps recorded in AST-042;
 *  remove an entry when the file is fixed; do not add entries */
const INV23_KNOWN_GAPS = new Map([
  ['docs.mjs', new Set(['padEnd', 'repeat'])],
]);

let inv23Count = 0;
for (const filePath of handlerFiles) {
  inv23Count++;
  const rel = path.relative(HANDLER_DIR, filePath);
  const src = fs.readFileSync(filePath, 'utf8');
  /** @type {Set<string>} */
  const found = new Set();
  for (const {re, kind} of TEXT_LAYOUT_PATTERNS) {
    re.lastIndex = 0;
    if (re.test(src)) found.add(kind);
  }

  const allowed = INV23_KNOWN_GAPS.get(rel);
  if (allowed) {
    for (const kind of found) {
      if (!allowed.has(kind)) {
        errors.push(
          `INV23: ${rel} has a new text-layout call (${kind}) not in the known-gap allowlist`,
        );
      }
    }
    for (const kind of allowed) {
      if (!found.has(kind)) {
        errors.push(
          `INV23: ${rel} no longer uses ${kind} — remove it from the INV23 allowlist so the list can only shrink`,
        );
      }
    }
  } else if (found.size > 0) {
    errors.push(
      `INV23: ${rel} uses ${[...found].join(', ')} — use the formatter kit: section(), text(), list(), record(), records(), code()`,
    );
  }
}

// ── 4. FR1: CommandDoc fn → api/index.mjs export ────────────────────
//
// Every executable command's CommandDoc names in `fn` the API function it
// calls. That function must be exported from api/index.mjs, the public
// programmatic surface.

const apiIndexSrc = fs.readFileSync(path.join(API, 'index.mjs'), 'utf8');
if (/\bresolveRecordedTheme\b/u.test(apiIndexSrc)) {
  errors.push(
    'theme boundary: resolveRecordedTheme is internal and must not be exported from api/index.mjs',
  );
}
for (const specifier of runtimeStarExports(apiIndexSrc)) {
  errors.push(
    `api boundary: api/index.mjs star exports or namespace imports ${specifier} — export each runtime function by name so FR1 and FR2 check it and internal helpers such as resolveRecordedTheme stay out of the public API`,
  );
}

/** Extract named function exports from api/index.mjs (skip type re-exports). */
const apiExports = new Set();
for (const m of apiIndexSrc.matchAll(/export\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)) {
  if (m[2].endsWith('.type.mjs')) continue;
  for (const part of m[1].split(',')) {
    const trimmed = part.trim();
    // 'x as y' → exported name is y; 'x' → x
    const segments = trimmed.split(/\s+/);
    const name = segments[segments.length - 1];
    if (name && /^\w+$/.test(name)) apiExports.add(name);
  }
}

/** Functions exported from api/experimental.mjs, the experimental entry
 *  (spec:AST-017 FR21): a CommandDoc marked `stability: 'experimental'` may
 *  name one of these instead of a stable api/index.mjs export. */
const experimentalApiExports = new Set();
const experimentalEntry = path.join(API, 'experimental.mjs');
if (fs.existsSync(experimentalEntry)) {
  const src = fs.readFileSync(experimentalEntry, 'utf8');
  for (const m of src.matchAll(/export\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    if (m[2].endsWith('.type.mjs')) continue;
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+/).pop();
      if (name && /^\w+$/.test(name)) experimentalApiExports.add(name);
    }
  }
  for (const name of experimentalApiExports) {
    if (apiExports.has(name)) {
      errors.push(
        `api boundary: '${name}' is exported from both api/index.mjs and api/experimental.mjs — an experimental function stays off the stable entry`,
      );
    }
  }
}

/** @type {Set<string>} known FR1 gaps: fn values not yet exported.
 *  Remove an entry when the function is exported; do not add entries. */
const FR1_KNOWN_GAPS = new Set();

let fr1Count = 0;

/** Walk CommandDoc files and check fn values.
 *  @param {string} dir */
function checkCommandDocFn(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      checkCommandDocFn(full);
      continue;
    }
    if (!entry.name.endsWith('.doc.mjs')) continue;
    const src = fs.readFileSync(full, 'utf8');
    const fnMatch = src.match(/fn:\s*['"](\w+)['"]/);
    if (!fnMatch) continue; // group-only CommandDoc (no fn field)
    fr1Count++;
    const fn = fnMatch[1];
    const experimentalFn =
      experimentalApiExports.has(fn) && /stability:\s*['"]experimental['"]/.test(src);
    if (!apiExports.has(fn) && !experimentalFn && !FR1_KNOWN_GAPS.has(fn)) {
      errors.push(
        `FR1: CommandDoc ${path.relative(CLI, full)} names fn '${fn}' which is not exported from api/index.mjs`,
      );
    }
  }
}
checkCommandDocFn(path.join(CLI, 'clients/cli/commands'));

// Stale FR1 entries
for (const fn of FR1_KNOWN_GAPS) {
  if (apiExports.has(fn)) {
    errors.push(
      `FR1: '${fn}' is now exported from api/index.mjs — remove it from FR1_KNOWN_GAPS so the list can only shrink`,
    );
  }
}

// ── 5. FR2: api/index.mjs export → FunctionDoc ─────────────────────
//
// Every function exported from the public API must have a FunctionDoc
// under api/ whose `name` field matches.

const FR2_EXEMPT = new Set(['AstryxError', 'logger']);

/** Collect `name` values from all FunctionDoc files under api/. */
const docNames = new Set();
/** @param {string} dir */
function collectDocNames(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectDocNames(full);
      continue;
    }
    if (!entry.name.endsWith('.doc.mjs')) continue;
    const src = fs.readFileSync(full, 'utf8');
    const nameMatch = src.match(/name:\s*['"](\w+)['"]/);
    if (nameMatch) docNames.add(nameMatch[1]);
  }
}
collectDocNames(API);

let fr2Count = 0;
for (const name of apiExports) {
  if (FR2_EXEMPT.has(name)) continue;
  fr2Count++;
  if (!docNames.has(name)) {
    errors.push(
      `FR2: api/index.mjs exports '${name}' but no FunctionDoc under api/ has name: '${name}'`,
    );
  }
}

// ── 6. INV6: command files and CommandDocs ──────────────────────────
/**
 * Check INV6 (docs/architecture/cli-surface.md) for the CLI rooted at
 * `cliRoot`: every registered command's file and CommandDoc, every
 * subcommand's CommandDoc, and no CommandDoc anywhere else.
 *
 * @param {string} cliRoot the `packages/cli` directory
 * @returns {Promise<{errors: string[], commands: number}>}
 */
export async function checkCommandLayout(cliRoot) {
  const {default: ts} = await import('typescript');
  const {pathToFileURL} = await import('node:url');
  const COMMANDS = 'clients/cli/commands';
  const INDEX = 'clients/cli/index.mjs';
  /** @type {string[]} */
  const errors = [];

  const indexFile = path.join(cliRoot, INDEX);
  const source = ts.createSourceFile(
    indexFile,
    fs.readFileSync(indexFile, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  /** @type {{name: string, file: string | null}[]} */
  const registered = [];
  let registryFound = false;
  /** @param {import('typescript').Node} node */
  const visit = node => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'commands' &&
      node.initializer &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      registryFound = true;
      for (const entry of node.initializer.elements) {
        if (!ts.isObjectLiteralExpression(entry)) continue;
        /** @param {string} key */
        const field = key => {
          const prop = entry.properties.find(
            p => ts.isPropertyAssignment(p) && p.name.getText(source) === key,
          );
          return prop &&
            ts.isPropertyAssignment(prop) &&
            ts.isStringLiteralLike(prop.initializer)
            ? prop.initializer.text
            : null;
        };
        const name = field('name');
        const file = field('path');
        if (name && file) registered.push({name, file});
      }
    }
    // A command registered by hand, e.g. `program.command('manifest')`.
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'command' &&
      node.arguments.length > 0 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      registered.push({name: node.arguments[0].text.split(' ')[0], file: null});
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!registryFound) {
    errors.push(
      `found no \`commands\` registry in ${INDEX} — has it moved? Update this check.`,
    );
  }

  /** @type {Set<string>} */
  const expectedDocs = new Set();
  let commands = 0;
  /**
   * Check `name`'s CommandDoc and, through its `subcommands`, theirs.
   * @param {string} name
   * @returns {Promise<any>} the CommandDoc, or null when it is missing or
   *   documents another command
   */
  const checkDoc = async name => {
    const docPath = `${COMMANDS}/${name.replaceAll(' ', '-')}.doc.mjs`;
    expectedDocs.add(docPath);
    const docFile = path.join(cliRoot, docPath);
    if (!fs.existsSync(docFile)) {
      errors.push(`command "${name}" has no CommandDoc at ${docPath}`);
      return null;
    }
    const mod = await import(pathToFileURL(docFile).href);
    const doc = mod.doc ?? mod.docs ?? mod.default;
    if (doc?.name !== name) {
      errors.push(`${docPath} documents "${doc?.name}", not "${name}"`);
      return null;
    }
    commands++;
    for (const child of doc.subcommands ?? [])
      await checkDoc(`${name} ${child}`);
    return doc;
  };

  for (const {name, file} of registered) {
    const flat = `${COMMANDS}/${name}.mjs`;
    const group = `${COMMANDS}/${name}/index.mjs`;
    const doc = await checkDoc(name);
    // INV6 allows the folder form only for a group: a command whose
    // CommandDoc lists subcommands. With no readable doc, that error is
    // already reported, so the folder is not judged.
    const isGroup = doc == null || (doc.subcommands ?? []).length > 0;
    if (file === null) {
      errors.push(
        `command "${name}" is registered in ${INDEX}, not in its own ${flat}`,
      );
    } else {
      const actual = path.posix.join('clients/cli', file);
      if (actual === group && !isGroup) {
        errors.push(
          `command "${name}" is registered from ${actual}, but only a group (a CommandDoc that lists subcommands) uses a folder; move it to ${flat}`,
        );
      } else if (actual !== flat && actual !== group) {
        errors.push(
          isGroup
            ? `command "${name}" is registered from ${actual}, not ${flat} or ${group}`
            : `command "${name}" is registered from ${actual}, not ${flat}`,
        );
      } else if (!fs.existsSync(path.join(cliRoot, actual))) {
        errors.push(
          `command "${name}" is registered from ${actual}, which does not exist`,
        );
      }
    }
  }

  for (const file of docFilesUnder(path.join(cliRoot, COMMANDS))) {
    const docPath = `${COMMANDS}/${file}`;
    if (!expectedDocs.has(docPath)) {
      errors.push(`${docPath} is not the CommandDoc of any registered command`);
    }
  }

  return {errors, commands};
}

// Run as a script; stay importable for the tests.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const layout = await checkCommandLayout(CLI);
  errors.push(...layout.errors);
  if (layout.commands === 0) {
    errors.push(
      'found no CommandDocs under packages/cli/clients/cli/commands — has the directory moved? Update this check.',
    );
  }

  if (errors.length > 0) {
    console.error('❌ CLI structure violations:\n');
    for (const e of errors) console.error(`  ${e}`);
    console.error(
      `\n${errors.length} error(s). See CONTRIBUTING > "Working on the astryx CLI".`,
    );
    process.exit(1);
  }

  console.log(
    [
      `✅ CLI structure is intact:`,
      `   ${doctypeCount} doc-type(s), ${apiCount} api folder(s),`,
      `   ${inv22Count} handler(s) checked for INV22, ${clientHelperBoundaryCount} client helper boundary, ${inv21Count} api module(s) for INV21,`,
      `   ${inv23Count} handler(s) checked for INV23,`,
      `   ${fr1Count} CommandDoc fn(s) checked for FR1, ${fr2Count} api export(s) for FR2,`,
      `   ${layout.commands} command(s) checked for INV6.`,
    ].join('\n'),
  );
}
