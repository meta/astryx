// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Find public API rows that ride along outside a pull request's scope.
 * @input  `--changes` api-changes.json, `--title`, `--body-file`, `--root`
 *         (component-packages.cjs names each package's components), `--files`,
 *         `--decided` (JSON list of `Name` or `Name.member` a current record
 *         decides), `--summary`
 * @output JSON: scope, rows by component, tag-along rows, decided rows, `big`;
 *         a Markdown table with `--summary`. Exit 0, or 2 for an unread input
 * @position CI evidence for architecture:knowledge-contracts INV33. A behavior
 *           handler is an event callback such as `onClick`; a handler change
 *           with no API row is not visible here, and review finds it
 */

import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const {
  COMPONENT_PACKAGES,
  documentedComponentsOutsideComponentDirectories,
  flatPackageComponentNames,
  nestedPackageComponentNames,
} = require('../../scripts/component-packages.cjs');

const MAX_COMPONENTS = 3;
const MAX_ROWS = 10;
const MAX_FILES = 100;
const PACKAGE_SCOPE = '@astryxdesign/';
/** A factory or hook prefix that a component's own export adds to its name. */
const OWN_EXPORT_PREFIX = /^(?:use|Use|create|with|is)(?=[A-Z])/;

const stripComments = text =>
  String(text ?? '').replace(/<!--[\s\S]*?-->/g, '');

/** The text under the body's `## Scope` heading, up to the next heading. */
function scopeSection(body) {
  const lines = stripComments(body).split(/\r?\n/);
  const start = lines.findIndex(l => /^##\s+Scope\s*$/.test(l));
  if (start < 0) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(l => /^#{1,2}\s/.test(l));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
}

/**
 * The pull request's named scope: the entries of the title's
 * conventional-commit scope, then the `Components:` line under `## Scope`.
 * `text` is the code spans under `## Scope`: only those name a row, so the
 * template's checklist prose never does.
 * @param {{title: string, body: string}} input
 */
export function parseScope({title, body}) {
  const titleScope = String(title ?? '').match(/^\w+\(([^)]*)\)!?:/);
  const fromTitle = (titleScope ? titleScope[1].split(',') : [])
    .map(s => s.trim())
    .filter(Boolean);
  const section = scopeSection(body);
  const line = section.match(/^\s*(?:[-*]\s+)?Components:(.*)$/m);
  const text = (section.match(/`[^`\n]+`/g) ?? []).join('\n');
  const fromBody = (line ? line[1].split(',') : [])
    .map(s => s.replace(/`/g, '').trim())
    .filter(Boolean);
  return {scope: [...new Set([...fromTitle, ...fromBody])], text};
}

/** Capitalized folder names under one source root, sorted. */
function componentFolders(src) {
  if (!fs.existsSync(src)) return [];
  return fs
    .readdirSync(src, {withFileTypes: true})
    .filter(entry => entry.isDirectory() && /^[A-Z]/.test(entry.name))
    .map(entry => entry.name)
    .sort();
}

/**
 * Each registered package's component names, by package name: every public
 * component the registry names (a component in another component's folder,
 * such as TableRow in Table, included), plus each capitalized folder.
 * @returns {Record<string, string[]>}
 */
export function componentsByPackage(root, packages = COMPONENT_PACKAGES) {
  const out = {};
  for (const pkg of packages) {
    if (!fs.existsSync(path.join(root, pkg.src))) continue;
    const names =
      pkg.layout === 'flat'
        ? flatPackageComponentNames(root, pkg)
        : [
            ...nestedPackageComponentNames(root, pkg),
            ...documentedComponentsOutsideComponentDirectories(root, pkg),
            ...componentFolders(path.join(root, pkg.src)),
          ];
    out[`${PACKAGE_SCOPE}${pkg.name}`] = [...new Set(names)].sort();
  }
  return out;
}

/** The row's top-level name: `interface ItemProps` gives `ItemProps`. */
function topName(item) {
  const words = String(item ?? '')
    .replace(/`/g, '')
    .split(' ');
  return words.length > 1 ? words[1] : words[0];
}

/** The component a theme-target row names: `target alert-dialog (AlertDialog)`. */
function targetOwner(item) {
  const match = String(item ?? '').match(/^target \S+ \(([^)]+)\)$/);
  return match ? match[1] : null;
}

/** Whether `name` starts with the word `prefix` (`Tab` starts `TabList`, not `Tabular`). */
const startsWithWord = (name, prefix, ignoreCase = false) =>
  (ignoreCase
    ? name.toLowerCase().startsWith(prefix.toLowerCase())
    : name.startsWith(prefix)) && !/^[a-z]/.test(name.slice(prefix.length));

/**
 * The component with the longest name that starts the row's name, or null.
 * `useCollapsible` belongs to Collapsible.
 */
function componentOf(name, components) {
  const candidates = [name, name.replace(OWN_EXPORT_PREFIX, '')];
  let best = null;
  for (const candidate of candidates)
    for (const c of components)
      if (startsWithWord(candidate, c) && (!best || c.length > best.length))
        best = c;
  return best;
}

const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mentions = (text, word) =>
  !!word &&
  new RegExp(`(?<![\\w$@/-])${escapeRegExp(word)}(?![\\w$.-])`).test(text);

const shortName = pkg => pkg.replace(/^@[^/]+\//, '');

/**
 * @param {{changes: unknown, title: string, body: string,
 *   components: Record<string, string[]>, files?: number,
 *   decided?: string[]}} input
 */
export function analyze({
  changes,
  title,
  body,
  components,
  files = 0,
  decided = [],
}) {
  const decidedRows = new Set(decided);
  const {scope, text} = parseScope({title, body});
  const inScopeSet = new Set(scope.map(s => s.toLowerCase()));
  const isInScope = name => inScopeSet.has(String(name).toLowerCase());
  const packages = Array.isArray(changes) ? changes : (changes?.packages ?? []);
  const rowsByComponent = {};
  const tagalongs = {};
  const decidedOutside = {};
  let rowCount = 0;
  for (const p of packages) {
    const pkg = String(p?.pkg ?? '');
    const own = components[pkg] ?? [];
    for (const r of Array.isArray(p?.rows) ? p.rows : []) {
      const name = topName(r.item);
      const owner = targetOwner(r.item);
      // A theme target belongs to the exact component it names, never a prefix.
      const component = owner
        ? own.includes(owner)
          ? owner
          : null
        : componentOf(name, own);
      const group = component ?? pkg;
      const out = {
        package: pkg,
        change: r.change,
        name,
        member: r.member ?? null,
        entry: r.entry,
        section: r.section,
        item: r.item,
        line: r.line,
        ...(r.before != null ? {before: r.before} : {}),
      };
      (rowsByComponent[group] ??= []).push(out);
      rowCount++;
      // A removed row takes API away; it never rides along.
      if (r.change === 'removed') continue;
      const inScope = component
        ? isInScope(component)
        : isInScope(pkg) || isInScope(shortName(pkg));
      const named =
        mentions(text, group) ||
        (!component && mentions(text, shortName(pkg))) ||
        mentions(text, name) ||
        (out.member != null && mentions(text, `${name}.${out.member}`)) ||
        // A row no component owns is named by a scope entry that starts it.
        (!component &&
          !owner &&
          scope.some(s => startsWithWord(name, s, true)));
      if (inScope || named) continue;
      // A row a current record decides stays visible but needs no owner.
      const isDecided =
        decidedRows.has(name) ||
        (out.member != null && decidedRows.has(`${name}.${out.member}`));
      ((isDecided ? decidedOutside : tagalongs)[group] ??= []).push(out);
    }
  }
  const big =
    Object.keys(rowsByComponent).length > MAX_COMPONENTS ||
    rowCount > MAX_ROWS ||
    Number(files) > MAX_FILES;
  return {
    version: 1,
    scope,
    rows_by_component: rowsByComponent,
    tagalongs,
    decided: decidedOutside,
    big,
  };
}

const cell = s => String(s).replace(/\|/g, '\\|');

/** The Markdown table: one line per component with rows. */
export function renderSummary(result) {
  const inScope = new Set(result.scope.map(s => s.toLowerCase()));
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const lines = ['| Component | Rows | In scope |', '| --- | --- | --- |'];
  for (const [group, rows] of Object.entries(result.rows_by_component)) {
    const extra = result.tagalongs[group]?.length ?? 0;
    const decided = result.decided?.[group]?.length ?? 0;
    const outside = [
      extra && `${plural(extra, 'tag-along row')}`,
      decided && `${plural(decided, 'row')} a current record decides`,
    ].filter(Boolean);
    const state =
      inScope.has(group.toLowerCase()) ||
      inScope.has(shortName(group).toLowerCase())
        ? 'yes'
        : outside.length
          ? `${extra ? 'no' : 'outside the scope'}: ${outside.join('; ')}`
          : rows.every(r => r.change === 'removed')
            ? 'removed only'
            : 'named under Scope';
    lines.push(`| ${cell(group)} | ${rows.length} | ${state} |`);
  }
  return lines.join('\n') + '\n';
}

function parseArgs(argv) {
  const args = {files: 0, title: '', root: process.cwd()};
  const keys = {
    '--changes': 'changes',
    '--title': 'title',
    '--body-file': 'bodyFile',
    '--root': 'root',
    '--files': 'files',
    '--summary': 'summary',
    '--decided': 'decided',
  };
  for (let i = 0; i < argv.length; i++) {
    const key = keys[argv[i]];
    if (!key || i + 1 >= argv.length)
      throw new Error(`Unknown or incomplete option: ${argv[i]}`);
    args[key] = argv[++i];
  }
  if (!args.changes)
    throw new Error('--changes <api-changes.json> is required');
  return args;
}

function main() {
  let input;
  try {
    const args = parseArgs(process.argv.slice(2));
    input = {
      changes: JSON.parse(fs.readFileSync(args.changes, 'utf8')),
      title: args.title,
      body: args.bodyFile ? fs.readFileSync(args.bodyFile, 'utf8') : '',
      components: componentsByPackage(args.root),
      files: Number(args.files) || 0,
      summary: args.summary,
      decided: args.decided
        ? JSON.parse(fs.readFileSync(args.decided, 'utf8'))
        : [],
    };
    const {changes} = input;
    if (!Array.isArray(changes) && !Array.isArray(changes?.packages))
      throw new Error('the changes file has no packages list');
    if (!Array.isArray(input.decided))
      throw new Error('the decided file is not a list');
  } catch (err) {
    // Callers fail closed on exit 2: an unread input is never a pass.
    console.error(`api-tagalong: ${err.message}`);
    process.exit(2);
  }
  const result = analyze(input);
  if (input.summary) fs.writeFileSync(input.summary, renderSummary(result));
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
