#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Changeset coverage: one classifier for pull requests and releases.
 *
 * Pull-request CI and the release coverage audit judge each change through the
 * same `evaluateChange`, so they cannot disagree about what needed a Changeset.
 *
 * 1. Coverage: a changed path that lands in a stable package's tarball (its
 *    `files`, root README, or consumer-facing package.json fields) needs a
 *    Changeset, added or edited by the same change, naming that package. Tests,
 *    stories, spec records, generated CHANGELOGs, unpacked files, private and
 *    canary-only packages, and everything outside a package need none. Translation
 *    updates/additions and translator-description-only edits are exempt; removed
 *    locale paths and English message/key changes still need coverage.
 * 2. Released CLI JSON ids: a response `type`, response field, golden field, or
 *    doctor check id from the latest stable release that is missing at head
 *    breaks scripts (spec:AST-017 FR3, FR13). The change that removes it, or
 *    whose Changeset names it, needs a `[breaking]` Changeset or a
 *    `Compatibility:` note naming its full identity. Catalog values (template
 *    slugs, docs routes) are data and are not compared (FR9, FR11, FR45).
 *
 * @input  git revisions: a pull request's base and head, or a release range
 * @output problems naming each package or id and the Changeset that resolves it
 * @position scripts/release — run by the lint workflow on every pull request
 *   and by the release coverage audit over the cut range
 */

import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {createRequire} from 'node:module';
import {isDeepStrictEqual, parseArgs} from 'node:util';
import {fileURLToPath} from 'node:url';
import {parseFrontmatter} from '../check-changesets.mjs';
import {parseWorkspaceGlobs} from '../lib/workspace-globs.mjs';
import {isStableReleasePackage} from './active-release.mjs';

const require = createRequire(import.meta.url);
const {parseEntry} = require('../changeset-entry-format.cjs');
const {
  isPackageReleasePath,
  parseNameStatus,
} = require('../../.github/scripts/change-scope.cjs');

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

export const CLI_PACKAGE = '@astryxdesign/cli';
const CHANGESET_FILE = /^\.changeset\/(?!README\.md$)[^/]+\.md$/;

/**
 * package.json fields a consumer's install, import, or tooling reads. A change
 * to `version` is release bookkeeping, and scripts or devDependencies never
 * leave the repository, so neither needs a Changeset.
 */
export const CONSUMER_MANIFEST_FIELDS = Object.freeze([
  ...['name', 'type', 'main', 'module', 'types', 'typings', 'exports'],
  ...['imports', 'bin', 'files', 'sideEffects', 'engines', 'os', 'cpu'],
  ...['browser', 'style', 'astryx', 'peerDependenciesMeta'],
  ...['dependencies', 'peerDependencies', 'optionalDependencies'],
  ...['bundleDependencies', 'bundledDependencies'],
]);

/** What each shipped surface is called in a failure. */
const SURFACES = Object.freeze({
  docs: 'shipped documentation',
  cli: 'CLI behavior or output',
  source: 'package source',
  manifest: 'consumer-facing package.json',
});

/**
 * @typedef {object} Tree
 * @property {string} label  revision or name, for messages
 * @property {(file: string) => string|null} read  file contents, or null when absent
 * @property {(dir: string) => string[]} list  every file under `dir`, repo-relative
 * @property {(files: string[]) => void} [prefetch]  read many files in one batch
 */

function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** The repository at `rev`, read through `git cat-file --batch` and cached. */
export function gitTree(root, rev) {
  const reads = new Map();
  const lists = new Map();
  return {
    label: rev,
    read(file) {
      if (!reads.has(file)) this.prefetch([file]);
      return reads.get(file);
    },
    prefetch(files) {
      const wanted = files.filter(file => !reads.has(file));
      if (wanted.length === 0) return;
      const out = execFileSync('git', ['cat-file', '--batch'], {
        cwd: root,
        input: wanted.map(file => `${rev}:${file}`).join('\n') + '\n',
        maxBuffer: 256 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let offset = 0;
      for (const file of wanted) {
        const newline = out.indexOf(10, offset);
        const header = out.toString('utf8', offset, newline);
        offset = newline + 1;
        const m = /^\S+ (\w+) (\d+)$/.exec(header);
        if (!m) {
          reads.set(file, null); // "<object> missing"
          continue;
        }
        const size = Number(m[2]);
        reads.set(
          file,
          m[1] === 'blob' ? out.toString('utf8', offset, offset + size) : null,
        );
        offset += size + 1;
      }
    },
    list(dir) {
      if (!lists.has(dir)) {
        const out = git(root, ['ls-tree', '-r', '--name-only', rev, '--', dir]);
        lists.set(dir, out.split('\n').filter(Boolean));
      }
      return lists.get(dir);
    },
  };
}

/** A tree held in memory, `{path: contents}`, for tests. */
export function memoryTree(files, label = 'memory') {
  return {
    label,
    read: file => (Object.hasOwn(files, file) ? files[file] : null),
    list: dir =>
      Object.keys(files)
        .filter(file => file.startsWith(`${dir.replace(/\/$/, '')}/`))
        .sort(),
  };
}

function readJson(tree, file) {
  const contents = tree.read(file);
  if (contents === null) return null;
  try {
    return JSON.parse(contents);
  } catch {
    return null;
  }
}

function globToRegExp(glob) {
  const escaped = glob
    .split('*')
    .map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/]*');
  return new RegExp(`^${escaped}$`);
}

/** Is repo-relative `dir` a workspace package directory under these globs? */
export function isWorkspaceDir(dir, globs) {
  let matched = false;
  for (const glob of globs) {
    if (glob.startsWith('!')) {
      if (globToRegExp(glob.slice(1)).test(dir)) return false;
    } else if (!glob.includes('**') && globToRegExp(glob).test(dir)) {
      matched = true;
    }
  }
  return matched;
}

/** The workspace package that owns `file`: its nearest workspace directory. */
function owningPackage(tree, file) {
  const source = tree.read('pnpm-workspace.yaml');
  if (source === null) return null;
  const globs = parseWorkspaceGlobs(source);
  let dir = path.posix.dirname(file);
  while (dir && dir !== '.') {
    if (isWorkspaceDir(dir, globs)) {
      const manifest = readJson(tree, `${dir}/package.json`);
      return manifest ? {dir, manifest} : null;
    }
    dir = path.posix.dirname(dir);
  }
  return null;
}

/**
 * Is this package released to consumers through the stable cut? Reuses the
 * release branch's own definition and adds the Changesets ignore list, the
 * same set `check:changesets` accepts in frontmatter.
 *
 * @param {object} manifest
 * @param {{ignore?: string[]}} config  .changeset/config.json
 * @returns {boolean}
 */
export function isCoveredPackage(manifest, config) {
  return (
    isStableReleasePackage(manifest) &&
    !(config?.ignore || []).includes(manifest.name)
  );
}

/**
 * Does `rel` (relative to its package directory) land in the npm tarball?
 * npm always packs the manifest and the root README; everything else must be
 * listed in `files`. A package without `files` ships its whole directory, and
 * a `files` glob this matcher cannot evaluate is treated as shipping
 * (fail closed).
 *
 * @param {object} manifest
 * @param {string} rel
 * @returns {boolean}
 */
export function isPackedFile(manifest, rel) {
  if (rel === 'package.json') return true;
  if (!rel.includes('/') && /^readme(?:\.|$)/i.test(rel)) return true;
  if (!Array.isArray(manifest.files)) return true;
  return manifest.files.some(raw => {
    const entry = String(raw).replace(/^\.\//, '').replace(/\/+$/, '');
    if (/[*?[\]{}!]/.test(entry)) return true;
    return rel === entry || rel.startsWith(`${entry}/`);
  });
}

/** The public API report `pnpm api:report` writes at a package's root. */
const API_REPORT_FILE = 'api-report.md';

/**
 * Does the package's `files` list pack its API report? Only a positive entry
 * naming it, or any positive glob (fail closed), does: the `!…` exclusions in
 * `files` never add a file, though `isPackedFile` treats every glob as
 * shipping.
 *
 * @param {object} manifest
 * @returns {boolean}
 */
function packsApiReport(manifest) {
  if (!Array.isArray(manifest.files)) return true;
  return manifest.files.some(raw => {
    const entry = String(raw).replace(/^\.\//, '');
    if (entry.startsWith('!')) return false;
    return entry === API_REPORT_FILE || /[*?[\]{}]/.test(entry);
  });
}

function surfaceOf(packageName, rel) {
  if (rel === 'package.json') return 'manifest';
  if (
    /(?:^|\/)readme(?:\.[^/]*)?$/i.test(rel) ||
    /\.mdx?$/.test(rel) ||
    /\.doc(?:\.[\w-]+)*\.mjs$/.test(rel) ||
    (packageName === CLI_PACKAGE && rel.startsWith('assets/docs/'))
  ) {
    return 'docs';
  }
  return packageName === CLI_PACKAGE ? 'cli' : 'source';
}

/**
 * Classify one changed path.
 *
 * @param {string} file  repo-relative path
 * @param {{tree: Tree, config: object}} at  the tree that holds the path's package
 * @returns {{ships: true, package: string, surface: string} | {ships: false, reason: string}}
 */
export function classifyPath(file, {tree, config}) {
  const owner = owningPackage(tree, file);
  if (!owner) return {ships: false, reason: 'outside every workspace package'};
  const {dir, manifest} = owner;
  if (!isCoveredPackage(manifest, config)) {
    return {
      ships: false,
      reason: `${manifest.name || dir} is private, canary-only, or not released`,
    };
  }
  const rel = file.slice(dir.length + 1);
  if (!isPackageReleasePath(file) || /\.spec\.[cm]?[jt]sx?$/.test(rel)) {
    return {ships: false, reason: 'test, fixture, snapshot, or spec record'};
  }
  if (
    /(?:^|\/)[^/]+\.stories\.[^/]+$/.test(rel) ||
    /(?:^|\/)stories\//.test(rel)
  ) {
    return {ships: false, reason: 'story'};
  }
  if (/^changelog\.md$/i.test(rel)) {
    return {ships: false, reason: 'CHANGELOG generated by the release'};
  }
  if (rel === API_REPORT_FILE && !packsApiReport(manifest)) {
    return {ships: false, reason: 'API report, outside the tarball'};
  }
  if (!isPackedFile(manifest, rel)) {
    return {ships: false, reason: `not in the ${manifest.name} tarball`};
  }
  return {
    ships: true,
    package: manifest.name,
    surface: surfaceOf(manifest.name, rel),
  };
}

/**
 * The consumer-facing package.json fields that differ between two manifests.
 *
 * @param {object|null} before
 * @param {object|null} after
 * @returns {string[]}
 */
export function consumerManifestDelta(before, after) {
  return CONSUMER_MANIFEST_FIELDS.filter(
    field =>
      JSON.stringify(lockstepNeutral(before, field)) !==
      JSON.stringify(lockstepNeutral(after, field)),
  );
}

const DEPENDENCY_FIELDS = new Set([
  'dependencies',
  'peerDependencies',
  'optionalDependencies',
]);

/**
 * A field's value with fixed-group co-bumps neutralized. The release moves a
 * fixed group together, rewriting each member's pin on its siblings to the
 * package's own new version; that version-only co-bump needs no Changeset
 * (spec:AST-017 FR7). Any other range edit still counts.
 */
function lockstepNeutral(manifest, field) {
  const value = manifest?.[field] ?? null;
  if (!DEPENDENCY_FIELDS.has(field) || !value || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([name, range]) => [
      name,
      range === manifest.version ? '<own version>' : range,
    ]),
  );
}

/** Packages a set of Changesets names with a real bump. */
function namedPackages(changesets) {
  const names = new Set();
  for (const {text} of changesets) {
    const fm = parseFrontmatter(text);
    if (!fm) continue;
    for (const [name, bump] of Object.entries(fm.releases)) {
      if (bump !== 'none') names.add(name);
    }
  }
  return names;
}

/** The Changesets a change adds or edits, read from its head. */
function changedChangesets(changes, head) {
  return changes
    .filter(
      change =>
        change.status?.[0] !== 'D' && CHANGESET_FILE.test(change.filename),
    )
    .map(change => ({
      file: change.filename,
      text: head.read(change.filename) ?? '',
    }));
}

/**
 * Translation updates and additions need no release note; removed paths do.
 * English message/key changes still need coverage; descriptions do not.
 * The catalog gate, not this dependency-free release check, validates ICU.
 */
function localeCoverageExemption(file, base, head) {
  const locale = /^packages\/core\/locales\/([^/]+)\.json$/.exec(file)?.[1];
  if (!locale || locale === 'pseudo') return null;
  if (locale !== 'en')
    return head.read(file) === null ? null : 'translated locale catalog';

  const messages = catalog => {
    if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog))
      return null;
    const entries = Object.entries(catalog);
    if (
      entries.length === 0 ||
      entries.some(
        ([, entry]) =>
          !entry ||
          typeof entry !== 'object' ||
          Array.isArray(entry) ||
          typeof entry.defaultMessage !== 'string' ||
          (Object.hasOwn(entry, 'description') &&
            typeof entry.description !== 'string') ||
          Object.keys(entry).some(
            key => key !== 'defaultMessage' && key !== 'description',
          ),
      )
    )
      return null;
    return Object.fromEntries(
      entries.map(([key, entry]) => [key, entry.defaultMessage]),
    );
  };

  const before = messages(readJson(base, file));
  const after = messages(readJson(head, file));
  // Both sides must exist and have the known rich-catalog shape.
  if (before === null || after === null) return null;
  return isDeepStrictEqual(before, after)
    ? 'translator descriptions or formatting only'
    : null;
}

/**
 * Rule 1 for one change (a pull request, or one commit of a release range).
 *
 * @param {object} input
 * @param {Array<{filename: string, previous_filename?: string|null, status?: string|null}>} input.changes
 * @param {Tree} input.base
 * @param {Tree} input.head
 * @param {Set<string>} [input.coveredElsewhere]  packages a later fix-up Changeset covers (release audit only)
 * @returns {{required: Map<string, Map<string, string[]>>, covered: Set<string>, exempt: Array<{file: string, reason: string}>, problems: string[]}}
 */
export function checkCoverage({
  changes,
  base,
  head,
  coveredElsewhere = new Set(),
}) {
  const baseConfig = readJson(base, '.changeset/config.json') || {};
  const headConfig = readJson(head, '.changeset/config.json') || {};
  /** @type {Map<string, Map<string, string[]>>} package -> surface -> files */
  const required = new Map();
  const exempt = [];

  const need = (pkg, surface, file) => {
    if (!required.has(pkg)) required.set(pkg, new Map());
    const bySurface = required.get(pkg);
    if (!bySurface.has(surface)) bySurface.set(surface, []);
    bySurface.get(surface).push(file);
  };

  const paths = new Set();
  for (const change of changes) {
    paths.add(change.filename);
    if (change.previous_filename) paths.add(change.previous_filename);
  }

  // One batched read per tree for everything classification touches: the
  // workspace layout, every candidate package manifest, and the paths.
  const wanted = new Set(['pnpm-workspace.yaml', '.changeset/config.json']);
  for (const file of paths) {
    wanted.add(file);
    for (
      let dir = path.posix.dirname(file);
      dir && dir !== '.';
      dir = path.posix.dirname(dir)
    ) {
      wanted.add(`${dir}/package.json`);
    }
  }
  base.prefetch?.([...wanted]);
  head.prefetch?.([...wanted]);

  for (const file of [...paths].sort()) {
    // A path ships when it ships on either side: a deleted file shipped at
    // base, and a package leaving the stable cut in this same change cannot
    // exempt its own shipped edits.
    const sides = [
      {tree: head, config: headConfig},
      {tree: base, config: baseConfig},
    ].filter(side => side.tree.read(file) !== null);
    const results = sides.map(side => classifyPath(file, side));
    const result = results.find(r => r.ships) ??
      results[0] ?? {ships: false, reason: 'absent on both sides'};
    if (!result.ships) {
      exempt.push({file, reason: result.reason});
      continue;
    }
    const localeExemption = localeCoverageExemption(file, base, head);
    if (localeExemption) {
      exempt.push({file, reason: localeExemption});
      continue;
    }
    if (result.surface === 'manifest') {
      const fields = consumerManifestDelta(
        readJson(base, file),
        readJson(head, file),
      );
      if (fields.length === 0) {
        exempt.push({
          file,
          reason: 'no consumer-facing package.json field changed',
        });
        continue;
      }
      need(result.package, 'manifest', `${file} (${fields.join(', ')})`);
      continue;
    }
    need(result.package, result.surface, file);
  }

  const covered = namedPackages(changedChangesets(changes, head));
  for (const pkg of coveredElsewhere) covered.add(pkg);
  const problems = [];
  for (const [pkg, bySurface] of [...required.entries()].sort()) {
    if (!covered.has(pkg)) problems.push(coverageProblem(pkg, bySurface));
  }
  return {required, covered, exempt, problems};
}

function coverageProblem(pkg, bySurface) {
  const lines = [...bySurface].map(([surface, files]) => {
    const more = files.length > 5 ? `, and ${files.length - 5} more` : '';
    return `      ${SURFACES[surface]}: ${files.slice(0, 5).join(', ')}${more}`;
  });
  const docsOnly = bySurface.size === 1 && bySurface.has('docs');
  return (
    `${pkg}: this change ships to consumers without a Changeset naming ${pkg}.\n` +
    `${lines.join('\n')}\n` +
    `      Add (or edit) a Changeset naming '${pkg}':\n` +
    `        pnpm changeset:new --packages ${pkg} --category ${docsOnly ? 'docs' : '<fix|feat>'}\n` +
    (docsOnly
      ? `      [docs] fits a change to shipped documentation alone.`
      : `      Use [fix] for a correction or [feat] for a new capability ` +
        `(or [docs], [perf], [component], [experimental] when that is what changed).`)
  );
}

const RESPONSE_TYPES_DOC =
  'packages/cli/foundation/response/response-types.doc.mjs';
const CLI_DIR = 'packages/cli';
const GOLDEN_DIR = 'packages/cli/test/__golden__';
const DOCTOR_DIR = 'packages/cli/api/doctor';

/**
 * Split a JSDoc `{type}` expression off the front of `text`.
 *
 * @returns {{type: string, rest: string}}  type without its outer braces
 */
function splitTypeExpression(text) {
  let i = 0;
  while (i < text.length && /\s/.test(text[i])) i++;
  if (text[i] !== '{') return {type: '', rest: text.slice(i)};
  const start = i;
  let depth = 0;
  for (; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) {
      i++;
      break;
    }
  }
  return {
    type: text.slice(start + 1, i - 1).trim(),
    rest: text.slice(i).trimStart(),
  };
}

/** Split `text` on `separator` where no bracket is open. */
function splitTopLevel(text, separator) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if ('{[(<'.includes(char)) depth++;
    else if ('}])>'.includes(char)) depth--;
    if (char === separator && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/**
 * What a typedef's own type expression contributes: the typedefs it extends
 * (`Base & {extra: T}`, or a plain alias) and the keys of inline object parts.
 */
function typedefComposition(type) {
  const bases = [];
  const keys = [];
  for (const part of splitTopLevel(type, '&')) {
    if (
      /^[A-Za-z_$][\w$]*$/.test(part) &&
      part !== 'object' &&
      part !== 'Object'
    ) {
      bases.push(part);
    } else if (part.startsWith('{') && part.endsWith('}')) {
      for (const member of splitTopLevel(part.slice(1, -1), ',')) {
        const key = /^['"]?([A-Za-z_$][\w$]*)['"]?\??\s*:/.exec(member)?.[1];
        if (key) keys.push(key);
      }
    }
  }
  return {bases, keys};
}

/**
 * Every typedef in a `.type.mjs` source: its own `@property` names and what
 * its type expression composes.
 *
 * @param {string} source
 * @returns {Array<{name: string, fields: string[], bases: string[]}>}
 */
export function parseTypedefs(source) {
  const typedefs = [];
  for (const [, comment] of source.matchAll(/\/\*\*([\s\S]*?)\*\//g)) {
    const body = comment.replace(/^[ \t]*\*[ \t]?/gm, '');
    let current = null;
    for (const tag of body.split(/\n(?=\s*@)/)) {
      const m = /^\s*@(typedef|property|prop)\b([\s\S]*)$/.exec(tag);
      if (!m) continue;
      const {type, rest} = splitTypeExpression(m[2]);
      const name =
        /^\[?\s*([A-Za-z_$][\w$]*(?:(?:\[\])?\.[A-Za-z_$][\w$]*)*)/.exec(
          rest,
        )?.[1];
      if (!name) continue;
      if (m[1] === 'typedef') {
        const {bases, keys} = typedefComposition(type);
        current = {name, fields: [...keys], bases};
        typedefs.push(current);
      } else if (current) {
        current.fields.push(name);
      }
    }
  }
  return typedefs;
}

/**
 * Every field of every typedef, as `Typedef.field`, with fields a typedef
 * gains by composing another typedef (`A & {extra: T}`) resolved, so moving a
 * field into a shared base is not a removal.
 *
 * @param {string[]} sources  every `.type.mjs` source
 * @returns {string[]}
 */
export function typedefFields(...sources) {
  const byName = new Map();
  for (const source of sources) {
    for (const typedef of parseTypedefs(source))
      byName.set(typedef.name, typedef);
  }
  const resolved = new Map();
  const resolve = (name, seen = new Set()) => {
    if (resolved.has(name)) return resolved.get(name);
    const typedef = byName.get(name);
    if (!typedef || seen.has(name)) return [];
    seen.add(name);
    const fields = new Set(typedef.fields);
    for (const base of typedef.bases) {
      for (const field of resolve(base, seen)) fields.add(field);
    }
    const list = [...fields];
    resolved.set(name, list);
    return list;
  };
  const out = [];
  for (const name of byName.keys()) {
    for (const field of resolve(name)) out.push(`${name}.${field}`);
  }
  return out;
}

/** Every object key path in a golden JSON response, like `data[].topic`. */
export function jsonKeyPaths(value) {
  const paths = new Set();
  (function walk(node, at) {
    if (Array.isArray(node)) {
      for (const item of node) walk(item, `${at}[]`);
    } else if (node && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) {
        const next = at ? `${at}.${key}` : key;
        paths.add(next);
        walk(child, next);
      }
    }
  })(value, '');
  return [...paths];
}

/**
 * The machine-readable ids of the CLI's JSON contract in `tree`.
 * Keyed by a stable string; each carries the full identity a Changeset names
 * it by (`DoctorCheck.fix`, `docs.list.data[].topic`, `themes`), never a bare
 * field name that unrelated fields share.
 *
 * @param {Tree} tree
 * @returns {Map<string, {label: string, token: string}>}
 */
export function cliJsonIds(tree) {
  /** @type {Map<string, {label: string, token: string}>} */
  const ids = new Map();

  const typeFiles = tree
    .list(CLI_DIR)
    .filter(file => file.endsWith('.type.mjs'));
  const goldenFiles = tree
    .list(GOLDEN_DIR)
    .filter(file => file.endsWith('.json'));
  const doctorFiles = tree
    .list(DOCTOR_DIR)
    .filter(file => file.endsWith('.mjs'));
  tree.prefetch?.([
    RESPONSE_TYPES_DOC,
    ...typeFiles,
    ...goldenFiles,
    ...doctorFiles,
  ]);

  const responseTypes = tree.read(RESPONSE_TYPES_DOC);
  if (responseTypes !== null) {
    for (const [, value] of responseTypes.matchAll(/\bvalue:\s*'([^']+)'/g)) {
      ids.set(`response-type:${value}`, {
        label: `response type \`${value}\``,
        token: value,
      });
    }
  }

  const sourceFile = file =>
    !file.includes('/node_modules/') &&
    !/\.(?:test|spec)\.[^/]+$/.test(file) &&
    isPackageReleasePath(file);

  const typeSources = typeFiles
    .filter(sourceFile)
    .map(file => tree.read(file) ?? '');
  for (const field of typedefFields(...typeSources)) {
    ids.set(`field:${field}`, {
      label: `response field \`${field}\``,
      token: field,
    });
  }

  for (const file of goldenFiles) {
    let golden;
    try {
      golden = JSON.parse(tree.read(file) ?? '');
    } catch {
      continue;
    }
    const name = path.posix.basename(file);
    const type = typeof golden?.type === 'string' ? golden.type : name;
    for (const keyPath of jsonKeyPaths(golden)) {
      ids.set(`golden:${name}:${keyPath}`, {
        label: `field \`${keyPath}\` of the ${name} golden response`,
        token: `${type}.${keyPath}`,
      });
    }
  }

  for (const file of doctorFiles) {
    if (/\.(?:doc|type)\.mjs$/.test(file) || !sourceFile(file)) {
      continue;
    }
    for (const [, , id] of (tree.read(file) ?? '').matchAll(
      /\bid:\s*(['"])([a-z0-9][a-z0-9-]*)\1/g,
    )) {
      ids.set(`doctor-check:${id}`, {
        label: `doctor check id \`${id}\``,
        token: id,
      });
    }
  }

  return ids;
}

const names = (text, token) => text.includes(`\`${token}\``);

/**
 * Does this Changeset text carry a compatibility note naming `token`? A note
 * is a paragraph that begins `Compatibility:`.
 */
function compatibilityNoteNames(text, token) {
  return text
    .split(/\n\s*\n/)
    .some(
      paragraph =>
        /^\s*Compatibility:/i.test(paragraph) && names(paragraph, token),
    );
}

/** Pending Changesets in `tree`: file, text, category, and releases. */
export function pendingChangesets(tree) {
  const files = tree
    .list('.changeset')
    .filter(file => CHANGESET_FILE.test(file));
  tree.prefetch?.(files);
  return files.map(file => {
    const text = tree.read(file) ?? '';
    const fm = parseFrontmatter(text);
    return {
      file,
      text,
      category: fm ? parseEntry(fm.summary).category : null,
      releases: fm ? fm.releases : {},
    };
  });
}

/**
 * Rule 2. `released` is the latest stable release's ids, `head` the change's
 * ids. With `base` (a pull request), only ids this change removes, or that a
 * Changeset it adds or edits describes, are its to classify; without `base`
 * (a release), every released id missing at head must be classified.
 *
 * @param {object} input
 * @param {Map<string, {label: string, token: string}>} input.released
 * @param {string} input.releasedLabel
 * @param {Map<string, {label: string, token: string}>|null} input.base
 * @param {Map<string, {label: string, token: string}>} input.head
 * @param {Array<{file: string, text: string}>} input.describedBy  Changesets this change adds or edits
 * @param {ReturnType<typeof pendingChangesets>} input.pending  every Changeset at head
 * @returns {{missing: string[], attributed: string[], problems: string[]}}
 */
export function checkReleasedIds({
  released,
  releasedLabel,
  base,
  head,
  describedBy,
  pending,
}) {
  const missing = [...released.keys()].filter(key => !head.has(key)).sort();
  const attributed = missing.filter(key => {
    if (!base) return true;
    const {token} = released.get(key);
    return base.has(key) || describedBy.some(({text}) => names(text, token));
  });

  const cliChangesets = pending.filter(
    entry =>
      entry.releases[CLI_PACKAGE] && entry.releases[CLI_PACKAGE] !== 'none',
  );
  const problems = [];
  for (const key of attributed) {
    const {label, token} = released.get(key);
    const classified = cliChangesets.some(
      entry =>
        (entry.category === 'breaking' && names(entry.text, token)) ||
        compatibilityNoteNames(entry.text, token),
    );
    if (classified) continue;
    problems.push(
      `${CLI_PACKAGE}: ${label} is in the released ${releasedLabel} JSON contract and is missing at this head.\n` +
        `      Scripts read released JSON ids, so removing or renaming one is incompatible\n` +
        `      (spec:AST-017 FR3, FR13). Restore \`${token}\`, or classify the removal in a\n` +
        `      Changeset naming '${CLI_PACKAGE}':\n` +
        `        - a [breaking] Changeset whose text names \`${token}\` (it ships only in a minor\n` +
        `          release, so main must declare the next minor before the cut), or\n` +
        `        - a paragraph beginning "Compatibility:" that names \`${token}\` and says why a\n` +
        `          consumer of ${releasedLabel} keeps working.`,
    );
  }
  return {missing, attributed, problems};
}

/**
 * @param {object} input
 * @param {ReturnType<typeof parseNameStatus>} input.changes
 * @param {Tree} input.base
 * @param {Tree} input.head
 * @param {Tree|null} input.released  latest stable release, or null to skip rule 2
 * @param {boolean} [input.attributeToChange]  false at release time: every missing id counts
 * @param {Set<string>} [input.coveredElsewhere]  see checkCoverage
 */
export function evaluateChange({
  changes,
  base,
  head,
  released,
  attributeToChange = true,
  coveredElsewhere,
}) {
  const coverage = checkCoverage({changes, base, head, coveredElsewhere});
  let ids = {missing: [], attributed: [], problems: []};
  if (released) {
    ids = checkReleasedIds({
      released: cliJsonIds(released),
      releasedLabel: released.label,
      base: attributeToChange ? cliJsonIds(base) : null,
      head: cliJsonIds(head),
      describedBy: changedChangesets(changes, head),
      pending: pendingChangesets(head),
    });
  }
  return {coverage, ids, problems: [...coverage.problems, ...ids.problems]};
}

/**
 * Packages that pending Changesets cover for an already-merged pull request:
 * a fix-up Changeset that names the package and cites the pull request
 * (`#1234`), as the release process asks for a change that merged without
 * one.
 *
 * @param {ReturnType<typeof pendingChangesets>} pending
 * @param {string|null} prNumber
 * @returns {Set<string>}
 */
export function fixupCoverage(pending, prNumber) {
  const covered = new Set();
  if (!prNumber) return covered;
  const cites = new RegExp(`#${prNumber}(?!\\d)`);
  for (const entry of pending) {
    if (!cites.test(entry.text)) continue;
    for (const [name, bump] of Object.entries(entry.releases)) {
      if (bump !== 'none') covered.add(name);
    }
  }
  return covered;
}

/** The newest stable `vX.Y.Z` tag: the release the check compares against. */
export function newestStableTag(root) {
  return (
    git(root, ['tag', '--list', 'v*', '--sort=-v:refname'])
      .split('\n')
      .find(tag => /^v\d+\.\d+\.\d+$/.test(tag)) ?? null
  );
}

function diffChanges(root, from, to) {
  return parseNameStatus(git(root, ['diff', '--name-status', '-M', from, to]));
}

/** Print each problem (and with --explain, every classification); 1 on problems. */
function report(entries, explain) {
  for (const {label, result} of explain ? entries : []) {
    console.log(`\n${label}`);
    for (const [pkg, bySurface] of result.coverage.required) {
      for (const [surface, files] of bySurface) {
        for (const file of files)
          console.log(`  ships  ${pkg} (${surface}): ${file}`);
      }
    }
    for (const {file, reason} of result.coverage.exempt) {
      console.log(`  exempt ${file} — ${reason}`);
    }
  }
  const failing = entries.filter(entry => entry.result.problems.length);
  if (failing.length === 0) return 0;
  console.error('\n✗ Changeset coverage found problems:\n');
  for (const {label, result} of failing) {
    for (const problem of result.problems)
      console.error(`  - ${label}\n    ${problem}`);
  }
  console.error('\nSee "When CI requires one" in CONTRIBUTING.md.\n');
  return 1;
}

function main(argv) {
  const {positionals, values} = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      root: {type: 'string', default: ROOT},
      released: {type: 'string'},
      base: {type: 'string'},
      head: {type: 'string', default: 'HEAD'},
      since: {type: 'string'},
      until: {type: 'string', default: 'origin/main'},
      explain: {type: 'boolean', default: false},
    },
  });
  const [mode] = positionals;
  const root = path.resolve(values.root);
  const releasedRef = values.released ?? newestStableTag(root);
  const released = releasedRef ? gitTree(root, releasedRef) : null;
  if (!released || released.read('package.json') === null) {
    console.error(
      'No vX.Y.Z release is available to compare CLI JSON ids against. Fetch ' +
        "release tags (git fetch origin 'refs/tags/v*:refs/tags/v*') or pass --released <ref>.",
    );
    return 2;
  }

  if (mode === 'pr' && values.base) {
    const mergeBase = git(root, [
      'merge-base',
      values.base,
      values.head,
    ]).trim();
    const result = evaluateChange({
      changes: diffChanges(root, mergeBase, values.head),
      base: gitTree(root, mergeBase),
      head: gitTree(root, values.head),
      released,
    });
    const code = report(
      [{label: `${mergeBase.slice(0, 12)}..${values.head}`, result}],
      values.explain,
    );
    if (code === 0) {
      const pkgs = [...result.coverage.required.keys()];
      console.log(
        `✓ Changeset coverage — ${pkgs.length ? `ships to ${pkgs.join(', ')}, each named` : 'nothing here ships to consumers'}; ` +
          `released CLI JSON ids checked against ${releasedRef}`,
      );
    }
    return code;
  }

  if (mode === 'release') {
    // Every commit in the range, judged exactly as its pull request was, plus
    // the fix-up Changesets the release process adds for a commit that merged
    // without one. Released ids are judged once, at the end of the range.
    const since = values.since ?? releasedRef;
    const until = values.until;
    const pending = pendingChangesets(gitTree(root, until));
    const commits = git(root, [
      'rev-list',
      '--reverse',
      '--no-merges',
      `${since}..${until}`,
    ])
      .split('\n')
      .filter(Boolean);
    const entries = commits.map(sha => {
      const subject = git(root, ['log', '-1', '--format=%s', sha]).trim();
      const pr = /\(#(\d+)\)\s*$/.exec(subject)?.[1] ?? null;
      const result = evaluateChange({
        changes: diffChanges(root, `${sha}^`, sha),
        base: gitTree(root, `${sha}^`),
        head: gitTree(root, sha),
        released: null,
        coveredElsewhere: fixupCoverage(pending, pr),
      });
      return {label: `${sha.slice(0, 10)} ${subject}`, result};
    });
    const end = gitTree(root, until);
    entries.push({
      label: `${until}: released CLI JSON ids`,
      result: evaluateChange({
        changes: [],
        base: end,
        head: end,
        released,
        attributeToChange: false,
      }),
    });
    console.log(
      `range: ${since}..${until} (${commits.length} commits); CLI JSON ids against ${releasedRef}`,
    );
    const code = report(entries, values.explain);
    if (code === 0)
      console.log('✓ every shipped change in the range names its package');
    return code;
  }

  console.error(
    'usage: changeset-coverage.mjs pr --base <ref> [--head <ref>] [--released <ref>] [--explain]\n' +
      '       changeset-coverage.mjs release [--since <tag>] [--until <ref>] [--released <ref>] [--explain]',
  );
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
