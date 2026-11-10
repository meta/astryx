#!/usr/bin/env node
// Generates cases/<command>.json from the JS CLI's own manifest and entity lists.
//
// Generated cases carry "gen": true. Hand-written cases (no "gen") in the same
// file are kept as they are when this script runs again.
//
// Usage: node gen-cases.mjs

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {CASES_DIR, caseEnv, ensureDirs} from './lib.mjs';
import {FIXTURES, JS_CLI, setup} from './setup.mjs';

await setup();
ensureDirs();

/** Run the JS CLI directly (outside the sandbox) to read lists; JSON only. */
function js(args, fixture = 'large') {
  const r = spawnSync(process.execPath, [JS_CLI, ...args, '--json'], {
    cwd: path.join(FIXTURES, fixture),
    env: {...caseEnv({}), HOME: '/tmp/astryx-conformance/gen-home', TMPDIR: '/tmp'},
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  });
  try {
    return JSON.parse(r.stdout).data;
  } catch {
    throw new Error(`gen: astryx ${args.join(' ')} gave no JSON: ${r.stderr}`);
  }
}

/** Minimal shell-word split for manifest examples (single and double quotes). */
function shellSplit(s) {
  const out = [];
  let cur = '';
  let q = null;
  let has = false;
  for (const ch of s) {
    if (q) {
      if (ch === q) q = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      q = ch;
      has = true;
    } else if (/\s/.test(ch)) {
      if (has || cur) out.push(cur);
      cur = '';
      has = false;
    } else cur += ch;
  }
  if (has || cur) out.push(cur);
  return out;
}

const manifest = js(['manifest'], 'app');
const byCommand = new Map();
const seenArgs = new Map();

function slug(s) {
  return s.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 60) || 'x';
}

/**
 * Add a case. Duplicate (args, fixture, tty, stdin) pairs are dropped.
 * @param {string} command top-level command (the cases file)
 * @param {string[]} args argv after `astryx`
 * @param {object} [opts] fixture, tty, stdin, env, tag
 */
function add(command, args, opts = {}) {
  const fixture = opts.fixture ?? 'app';
  const key = JSON.stringify([args, fixture, opts.tty ?? false, opts.stdin ?? null, opts.env ?? null, opts.pre ?? null]);
  const list = byCommand.get(command) ?? [];
  byCommand.set(command, list);
  const seen = seenArgs.get(command) ?? new Set();
  seenArgs.set(command, seen);
  if (seen.has(key)) return;
  seen.add(key);
  let base = [opts.tag, opts.pre ? `after-${opts.pre.map(a => a.map(slug).join('-')).join('+')}`.slice(0, 50) : null, ...args.map(slug), fixture !== 'app' ? `@${fixture}` : null, opts.tty ? 'tty' : null]
    .filter(Boolean)
    .join('_')
    .slice(0, 120) || 'bare';
  let id = base;
  for (let n = 2; list.some(c => c.id === id); n++) id = `${base}~${n}`;
  const c = {id, args, fixture, gen: true};
  if (opts.tty) c.tty = true;
  if (opts.stdin != null) c.stdin = opts.stdin;
  if (opts.env) c.env = opts.env;
  if (opts.pre) c.pre = opts.pre;
  list.push(c);
}

// ---- manifest-driven cases, for every command and subcommand ----

const SAMPLE = {
  '<n>': ['3', '0', '-1', 'abc', '1.5'],
  '<levels>': ['1', '2', '0', 'abc'],
  '<version>': ['0.6.0', '0.1.0', 'not-a-version'],
  '<path>': ['out', 'src/theme.ts'],
  '<dir>': ['out-dir'],
  '<file>': ['out.png'],
  '<name>': ['Button', 'nope'],
  '<package>': ['@astryxdesign/core', '@acme/kit', 'nope-pkg'],
  '<pkg>': ['@astryxdesign/core', '@acme/kit', 'nope-pkg'],
  '<category>': ['Layout', 'Inputs', 'nope'],
  '<domain>': ['component', 'hook', 'doc', 'template', 'theme', 'bogus'],
  '<type>': ['page', 'block', 'bogus'],
  '<kind>': ['component', 'template', 'bogus'],
  '<text>': ['hello world'],
  '<list>': ['a,b'],
  '<module>': ['@acme/glyphs'],
  '<id>': ['dice-5'],
  '<key>': ['brand'],
  '<locale>': ['en', 'zh', 'dense', 'fr'],
  '<level>': ['full', 'compact', 'brief', 'bogus'],
  '<reason>': ['Need a compact size'],
  '<tool>': ['claude', 'cursor', 'bogus'],
  '<topic>': ['principles', 'nope'],
  '<namespace>': ['acme'],
  '<theme>': ['neutral'],
  '<specifier>': ['@acme/icons'],
  '<variant>': ['outline'],
  '<names>': ['Foo,Bar'],
  '<path...>': ['docs/agents'],
  '<name...>': ['rename-props'],
  '[path]': ['cdn-out'],
};

function walkCommands(cmd, prefix, top) {
  // Manifest names of subcommands are full paths ("theme palette generate").
  const p = cmd.name.split(' ');
  const topName = top ?? cmd.name;
  const fixtures = topName === 'integration' || p.join(' ').startsWith('doctor integration') ? ['author', 'integration'] : ['app'];
  for (const f of fixtures) {
    add(topName, [...p, '--help'], {fixture: f});
    add(topName, p, {fixture: f});
    add(topName, [...p, '--json'], {fixture: f});
  }
  add(topName, [...p, '-h']);
  add(topName, ['help', ...p]);
  add(topName, [...p, '--bogus-flag']);
  add(topName, [...p, '--bogus-flag', '--json']);
  add(topName, [...p, 'extra1', 'extra2', 'extra3']);
  add(topName, [...p, 'extra1', 'extra2', 'extra3', '--json']);
  for (const f of ['empty', 'nocore', 'brokencore', 'plain', 'large', 'integration']) {
    add(topName, p, {fixture: f});
    add(topName, [...p, '--json'], {fixture: f});
  }
  for (const ex of cmd.examples ?? []) {
    const words = shellSplit(ex);
    if (words[0] !== 'astryx') continue;
    for (const f of [...fixtures, 'empty', 'integration', 'large']) add(topName, words.slice(1), {fixture: f, tag: 'ex'});
    if (!words.includes('--json')) add(topName, [...words.slice(1), '--json'], {tag: 'ex'});
  }
  const req = (cmd.arguments ?? []).filter(a => a.required);
  const firstArg = (cmd.arguments ?? [])[0];
  for (const o of cmd.options ?? []) {
    const longFlag = o.flag.split(/[ ,]+/).find(s => s.startsWith('--'));
    const shortFlag = o.flag.split(/[ ,]+/).find(s => /^-[A-Za-z]$/.test(s));
    const valueSpec = (o.flag.match(/[<[][^>\]]+[>\]]/) ?? [])[0];
    const pos = req.map(a => sampleArg(a.name));
    const values = o.choices ? [...o.choices, 'bogus-choice'] : valueSpec ? SAMPLE[valueSpec] ?? ['sample'] : [null];
    for (const v of values) {
      const flagArgs = v == null ? [longFlag] : [longFlag, v];
      add(topName, [...p, ...pos, ...flagArgs]);
      add(topName, [...p, ...pos, ...flagArgs, '--json']);
      if (v != null) add(topName, [...p, ...pos, `${longFlag}=${v}`]);
    }
    if (valueSpec && valueSpec.startsWith('<')) {
      // Missing option value.
      add(topName, [...p, ...pos, longFlag]);
      add(topName, [...p, ...pos, longFlag, '--json']);
    }
    if (shortFlag) add(topName, [...p, ...pos, shortFlag, ...(valueSpec && values[0] != null ? [values[0]] : [])]);
    if (firstArg && !firstArg.required) add(topName, [...p, sampleArg(firstArg.name), ...(valueSpec ? [longFlag, values[0]] : [longFlag])]);
    add(topName, [...p, ...pos, longFlag, ...(values[0] != null ? [values[0]] : []), '--help']);
  }
  for (const s of cmd.subcommands ?? []) walkCommands(s, p, topName);
  add(topName, [...p, 'nosuchsub']);
}

function sampleArg(name) {
  return (
    {
      names: 'Button', name: 'useClipboard', component: 'Button', query: 'table', topic: 'principles', section: 'rules',
      slug: 'neutral', files: 'theme.ts', file: 'page.tsx', path: 'out', set: 'lucide', export: 'Dice5', definition: 'random',
      icon: 'dice-5', kind: 'component', config: '../inputs/palette.config.json', package: '@acme/kit', filter: 'button',
    }[name] ?? 'sample'
  );
}

for (const c of manifest.commands) walkCommands(c, [], null);

// ---- root ----
for (const args of [[], ['--help'], ['-h'], ['help'], ['--version'], ['-V'], ['--json'], ['--bogus'], ['nosuchcommand'], ['nosuchcommand', '--json'], ['compnent'], ['serch', 'button'], ['help', 'nosuchcommand'], ['--version', '--json'], ['--zh'], ['--dense'], ['--lang', 'zh'], ['--detail', 'brief']]) {
  for (const f of ['app', 'empty']) add('root', args, {fixture: f});
}

// ---- entity sweeps ----
const compGroups = js(['component', '--list']).components;
const components = [...new Set(Object.values(compGroups).flat().map(e => e.name))];
for (const name of components) {
  add('component', ['component', name], {fixture: 'large'});
  add('component', ['component', name, '--json'], {fixture: 'large'});
  add('component', ['component', name, '--dense'], {fixture: 'large'});
  add('component', ['component', name, '--props', '--json'], {fixture: 'large'});
  add('component', ['component', name, '--zh'], {fixture: 'large'});
  add('component', ['component', name, '--detail', 'compact'], {fixture: 'large'});
  add('component', ['component', name, '--detail', 'brief'], {fixture: 'large'});
  add('component', ['component', name.toLowerCase()], {fixture: 'large', tag: 'lower'});
}
for (const name of components.slice(0, 40)) {
  for (const f of ['--source', '--showcase', '--blocks', '--props']) add('component', ['component', name, f], {fixture: 'large'});
}
add('component', ['component', ...components.slice(0, 5)], {fixture: 'large'});
add('component', ['component', ...components.slice(0, 5), '--json'], {fixture: 'large'});
for (const t of ['Buton', 'buttn', 'Tabel', 'Dialgo', 'xyz', 'card', 'TEXTINPUT']) add('component', ['component', t]);
for (const cat of Object.keys(compGroups)) add('component', ['component', '--list', '--category', cat], {fixture: 'large'});

const hookGroups = js(['hook', '--list']).components;
const hooks = Object.values(hookGroups).flat();
for (const h of hooks) {
  add('hook', ['hook', h]);
  add('hook', ['hook', h, '--json']);
  add('hook', ['hook', h, '--params']);
  add('hook', ['hook', h, '--dense']);
}
for (const cat of Object.keys(hookGroups)) add('hook', ['hook', '--list', '--category', cat]);
for (const t of ['useClipbord', 'clipboard', 'useNope']) add('hook', ['hook', t]);

const templates = js(['template', '--list']);
for (const t of templates) {
  add('template', ['template', t.id], {fixture: 'large'});
  add('template', ['template', t.id, '--json'], {fixture: 'large'});
  add('template', ['template', t.id, '--skeleton'], {fixture: 'large'});
}
for (const t of templates.slice(0, 25)) add('template', ['template', t.id, `src/pages/${t.id}.tsx`], {fixture: 'large'});
for (const t of ['dashbord', 'nope', 'Dashboard']) add('template', ['template', t]);

const topics = js(['docs']);
for (const t of topics) {
  const fixture = t.package === '@acme/kit' ? 'integration' : 'large';
  add('docs', ['docs', t.topic], {fixture});
  add('docs', ['docs', t.topic, '--json'], {fixture});
  add('docs', ['docs', t.topic, '--index'], {fixture});
  add('docs', ['docs', t.topic, '--full'], {fixture});
  add('docs', ['docs', t.topic, '--dense'], {fixture});
  add('docs', ['docs', t.topic, '--zh'], {fixture});
  let index;
  try {
    index = js(['docs', t.topic, '--index'], fixture);
  } catch {
    continue;
  }
  for (const s of index?.sections ?? []) {
    add('docs', ['docs', t.topic, s.id], {fixture});
    add('docs', ['docs', t.topic, s.id, '--json'], {fixture});
  }
  if (index?.sections?.[0]) add('docs', ['docs', t.topic, index.sections[0].title], {fixture, tag: 'title'});
}
for (const d of ['1', '2', '3']) add('docs', ['docs', 'cli', '--depth', d]);
for (const t of ['principals', 'nope', 'tokens nope']) add('docs', ['docs', ...t.split(' ')]);

const themes = js(['theme', 'list']);
for (const th of themes) {
  add('theme', ['theme', 'add', th.slug]);
  add('theme', ['theme', 'add', th.slug], {fixture: 'large'});
  add('theme', ['theme', 'add', th.slug, '--json'], {fixture: 'large'});
  add('theme', ['theme', 'eject', th.slug, 'src/theme'], {fixture: 'large'});
  add('theme', ['theme', 'list', '--package', th.package], {fixture: 'large'});
}
const targets = js(['theme', 'targets']).targets;
for (const t of targets.slice(0, 200)) add('theme', ['theme', 'targets', t.key]);

const SEARCHES = [
  'button', 'table', 'data table', 'dashboard', 'form validation', 'date picker', 'dark mode', 'color tokens', 'spacing',
  'modal dialog', 'navigation sidebar', 'login page', 'settings page', 'chart', 'icon', 'theme', 'typography', 'toast',
  'buton', 'tabel', 'dashbord', 'zorblax', 'xyzzy', 'ai chat', 'file upload', 'avatar group', 'empty state', 'tooltip',
  'accessibility', 'keyboard shortcuts', 'useClipboard', 'Card', 'how do I make a landing page', 'pricing table',
  'kanban board', 'calendar', 'search input', 'responsive layout', 'grid', 'stylex', 'tailwind', 'a', '中文', 'button   ',
];
for (const q of SEARCHES) {
  add('search', ['search', ...q.split(' ').filter(Boolean)]);
  add('search', ['search', q, '--json']);
  add('search', ['search', q, '--limit', '3']);
  add('build', ['build', q]);
  add('build', ['build', q, '--json']);
  add('discover', ['discover', q]);
  add('discover', ['discover', q, '--json']);
}
for (const q of SEARCHES.slice(0, 12)) {
  for (const t of ['component', 'hook', 'doc', 'template', 'theme']) add('search', ['search', q, '--type', t]);
  add('search', ['search', q], {fixture: 'large'});
  add('build', ['build', q], {fixture: 'large'});
  add('build', ['build', q, '--verbose']);
  add('search', ['search', q], {fixture: 'empty'});
}
for (const q of ['zorblax', 'acme card', 'zorblax hero']) {
  add('search', ['search', q], {fixture: 'integration'});
  add('discover', ['discover', q], {fixture: 'integration'});
}
for (const q of ['arrow', 'trash', 'search', 'close', 'dice']) add('experimental', ['experimental', 'icon', q], {fixture: 'large'});


// ---- depth: per-command sweeps beyond the manifest ----

// swizzle: every component, plus output folders and overwrite.
const swizzleList = js(['swizzle', '--list']);
for (const name of swizzleList) {
  add('swizzle', ['swizzle', name]);
  add('swizzle', ['swizzle', name, '--json']);
}
for (const name of swizzleList.slice(0, 20)) {
  add('swizzle', ['swizzle', name, '--output', 'src/ejected']);
  add('swizzle', ['swizzle', name], {pre: [['swizzle', name]], tag: 'again'});
  add('swizzle', ['swizzle', name, '--overwrite'], {pre: [['swizzle', name]]});
}
for (const f of ['empty', 'nocore', 'plain', 'large', 'integration']) add('swizzle', ['swizzle', 'Button'], {fixture: f});
for (const t of ['Buton', 'nope', 'button', '../etc', '/abs']) add('swizzle', ['swizzle', t]);
add('swizzle', ['swizzle', 'Button', '--output', '../outside']);
add('swizzle', ['swizzle', 'Button', '--output', '/tmp/astryx-conformance/work/app/abs-out']);
add('swizzle', ['swizzle', 'AcmeCard'], {fixture: 'integration'});
add('swizzle', ['swizzle', 'AcmeCard', '--package', '@acme/kit'], {fixture: 'integration'});

// upgrade: every codemod, versions, apply and lists, in each fixture.
const codemods = js(['upgrade', '--list'], 'app');
for (const cm of codemods) {
  add('upgrade', ['upgrade', '--codemod', cm.name]);
  add('upgrade', ['upgrade', '--codemod', cm.name, '--json']);
  add('upgrade', ['upgrade', '--codemod', cm.name, '--apply']);
}
const versions = [...new Set(codemods.map(c => c.version))];
for (const v of [...versions, '0.0.1', '0.5.0', '0.7.0', '0.7.12', '9.9.9', 'latest', 'v0.6.0', '']) {
  add('upgrade', ['upgrade', '--from', v]);
  add('upgrade', ['upgrade', '--from', v, '--json']);
  add('upgrade', ['upgrade', '--from', v, '--apply']);
  add('upgrade', ['upgrade', '--from', v], {fixture: 'large'});
}
for (const f of ['empty', 'nocore', 'brokencore', 'plain', 'large', 'integration', 'author']) {
  add('upgrade', ['upgrade', '--list'], {fixture: f});
  add('upgrade', ['upgrade', '--from', '0.6.0', '--apply'], {fixture: f});
}
add('upgrade', ['upgrade', '--from', '0.0.1', '--apply', '--force']);
add('upgrade', ['upgrade', '--from', '0.0.1', '--skip-codemod', codemods[0].name, codemods[1].name]);
add('upgrade', ['upgrade', '--from', '0.0.1', '--path', 'src']);
add('upgrade', ['upgrade', '--from', '0.0.1', '--path', 'nope']);
add('upgrade', ['upgrade', '--integration', '@acme/kit'], {fixture: 'integration'});

// docs tree: walk every route under every namespace topic.
const routes = new Set();
const queue = topics.map(t => t.topic);
while (queue.length && routes.size < 600) {
  const route = queue.shift();
  if (routes.has(route)) continue;
  routes.add(route);
  let node;
  try {
    node = js(['docs', route]);
  } catch {
    continue;
  }
  for (const slot of node?.slots ?? []) for (const ch of slot.children ?? []) if (ch.route) queue.push(ch.route);
}
for (const route of routes) {
  if (!route.includes('/')) continue;
  add('docs', ['docs', route], {fixture: 'large'});
  add('docs', ['docs', route, '--json'], {fixture: 'large'});
  add('docs', ['docs', route, '--detail', 'brief'], {fixture: 'large'});
}
for (const route of [...routes].filter(r => !r.includes('/')).slice(0, 40)) {
  for (const d of ['full', 'compact', 'brief']) add('docs', ['docs', route, '--detail', d], {fixture: 'large'});
  add('docs', ['docs', route, '--depth', '2'], {fixture: 'large'});
}
for (const f of ['empty', 'nocore', 'plain', 'integration']) {
  add('docs', ['docs'], {fixture: f});
  add('docs', ['docs', 'principles'], {fixture: f});
  add('docs', ['docs', 'principles', '--index'], {fixture: f});
}
for (const args of [['acme-guide'], ['acme-guide', '--json'], ['acme-guide', '--full'], ['acme-guide', '--index'], ['acme-guide', 'colors'], ['acme-guide', 'start', '--json'], ['acme-guide', '--zh'], ['acme-guide', 'nope'], ['--json']]) {
  add('docs', ['docs', ...args], {fixture: 'integration'});
}

// gap-report: every category and destination; never delivered (no network).
const categories = js(['gap-report', '--list-categories']).map(c => c.value);
for (const cat of categories) {
  add('gap-report', ['gap-report', 'Button', '--category', cat, '--reason', 'Need a compact size']);
  add('gap-report', ['gap-report', 'Button', '--category', cat, '--reason', 'Need a compact size', '--json']);
  add('gap-report', ['gap-report', 'Button', '--category', cat, '--reason', 'Need a compact size', '--confirm-public']);
}
for (const comp of components.slice(0, 30)) add('gap-report', ['gap-report', comp, '--category', 'missing_variant', '--reason', 'x']);
add('gap-report', ['gap-report', 'AcmeCard', '--category', 'missing_variant', '--reason', 'x'], {fixture: 'integration'});
add('gap-report', ['gap-report', 'AcmeCard', '--category', 'missing_variant', '--reason', 'x', '--to', '@acme/kit'], {fixture: 'integration'});
add('gap-report', ['gap-report', 'Button', '--category', 'missing_variant', '--reason', 'x', '--additional-context', 'more words'], {fixture: 'integration'});
add('gap-report', ['gap-report', 'Button', '--category', 'missing_variant'], {fixture: 'integration'});
add('gap-report', ['gap-report', 'Button', '--reason', 'x']);

// component: categories, packages, integration components, batches.
for (const cat of Object.keys(compGroups)) {
  add('component', ['component', '--list', '--category', cat, '--json'], {fixture: 'large'});
  add('component', ['component', '--category', cat]);
}
for (const pkg of ['@astryxdesign/core', '@astryxdesign/lab', '@astryxdesign/charts', '@acme/kit', 'nope']) {
  add('component', ['component', '--list', '--package', pkg], {fixture: 'large'});
  add('component', ['component', 'Button', '--package', pkg], {fixture: 'large'});
}
for (const args of [['AcmeCard'], ['AcmeCard', '--json'], ['AcmeCard', '--zh'], ['AcmeCard', '--zh', '--json'], ['AcmeCard', '--props'], ['AcmeCard', '--dense'], ['AcmeBadge'], ['AcmeBadge', '--json'], ['--list'], ['--list', '--json'], ['AcmeCard', 'Button'], ['AcmeCard', '--package', '@acme/kit']]) {
  add('component', ['component', ...args], {fixture: 'integration'});
}
for (let i = 0; i + 3 <= Math.min(components.length, 60); i += 3) {
  add('component', ['component', ...components.slice(i, i + 3)], {fixture: 'large', tag: 'batch'});
  add('component', ['component', ...components.slice(i, i + 3), '--json'], {fixture: 'large', tag: 'batch'});
}
for (const lang of ['en', 'zh', 'dense', 'fr']) add('component', ['component', 'Button', '--lang', lang]);

// hook: detail levels and languages.
for (const h of hooks.slice(0, 40)) {
  for (const d of ['compact', 'brief']) add('hook', ['hook', h, '--detail', d]);
  add('hook', ['hook', h, '--zh']);
}

// template: types, packages, cdn, writes and overwrite.
for (const type of ['page', 'block', 'bogus']) {
  add('template', ['template', '--list', '--type', type], {fixture: 'large'});
  add('template', ['template', '--list', '--type', type, '--json'], {fixture: 'large'});
}
for (const pkg of ['@astryxdesign/core', '@astryxdesign/lab', '@astryxdesign/charts', '@acme/kit', 'nope']) add('template', ['template', '--list', '--package', pkg], {fixture: 'large'});
for (const t of templates.slice(0, 20)) {
  add('template', ['template', t.id, '--cdn'], {fixture: 'large'});
  add('template', ['template', t.id, '--cdn', 'cdn/index.html'], {fixture: 'large'});
  add('template', ['template', t.id, 'src/page.tsx'], {fixture: 'large', pre: [['template', t.id, 'src/page.tsx']]});
  add('template', ['template', t.id, 'src/page.tsx', '--overwrite'], {fixture: 'large', pre: [['template', t.id, 'src/page.tsx']]});
}
for (const args of [['hero', '--type', 'block'], ['hero', '--type', 'block', '--json'], ['--list'], ['--list', '--package', '@acme/kit'], ['hero'], ['hero', 'src/hero.tsx', '--type', 'block']]) {
  add('template', ['template', ...args], {fixture: 'integration'});
}
for (const p of ['../outside.tsx', '/tmp/astryx-conformance/work/app/abs.tsx', 'src', 'src/App.tsx']) add('template', ['template', templates[0].id, p]);

// theme: lifecycle steps, build from a template theme, palette, targets.
for (const th of themes.slice(0, 8)) {
  add('theme', ['theme', 'remove', th.slug], {pre: [['theme', 'add', th.slug]], fixture: 'large'});
  add('theme', ['theme', 'use', th.slug], {pre: [['theme', 'add', th.slug]], fixture: 'large'});
  add('theme', ['theme', 'add', th.slug], {pre: [['theme', 'add', th.slug]], tag: 'again', fixture: 'large'});
  add('theme', ['theme', 'add', th.slug, '--import'], {fixture: 'large'});
  add('theme', ['theme', 'list'], {pre: [['theme', 'add', th.slug]], fixture: 'large'});
  add('theme', ['theme', 'eject', th.slug, 'src/theme', '--overwrite'], {pre: [['theme', 'eject', th.slug, 'src/theme']], fixture: 'large'});
  add('theme', ['theme', 'eject', th.slug, 'src/theme'], {pre: [['theme', 'eject', th.slug, 'src/theme']], tag: 'again', fixture: 'large'});
}
for (const slug of ['nope', 'Neutral', '../x']) {
  add('theme', ['theme', 'add', slug], {fixture: 'large'});
  add('theme', ['theme', 'remove', slug], {fixture: 'large'});
  add('theme', ['theme', 'use', slug]);
  add('theme', ['theme', 'eject', slug, 'src/t']);
}
add('theme', ['theme', 'template', 'src/my.theme.ts']);
add('theme', ['theme', 'template', 'src/my.theme.ts'], {pre: [['theme', 'template', 'src/my.theme.ts']], tag: 'again'});
add('theme', ['theme', 'template', 'src/my.theme.ts', '--overwrite'], {pre: [['theme', 'template', 'src/my.theme.ts']]});
add('theme', ['theme', 'template', '--json']);
for (const extra of [[], ['--json'], ['--check'], ['--out', 'dist/theme.css'], ['--family'], ['--detail', 'full'], ['--detail', 'brief'], ['--icons-specifier', '@acme/icons']]) {
  add('theme', ['theme', 'build', 'src/my.theme.ts', ...extra], {pre: [['theme', 'template', 'src/my.theme.ts']]});
}
for (const th of themes.slice(0, 8)) {
  add('theme', ['theme', 'build', `src/theme/${th.slug}`], {pre: [['theme', 'eject', th.slug, 'src/theme']], tag: th.slug});
}
add('theme', ['theme', 'build', 'nope.ts']);
add('theme', ['theme', 'build', '../inputs/not-json.json']);
for (const extra of [[], ['--json'], ['--out', 'palette.css'], ['--preview', 'preview.html'], ['--out', 'p.css', '--overwrite']]) {
  add('theme', ['theme', 'palette', 'generate', '../inputs/palette.config.json', ...extra]);
}
add('theme', ['theme', 'palette', 'generate', '../inputs/not-json.json']);
add('theme', ['theme', 'palette', 'generate', 'missing.json']);
for (const t of targets) add('theme', ['theme', 'targets', t.key, '--json']);
for (const f of ['button', 'BUTTON', 'nope', 'card', 'input', 'menu']) add('theme', ['theme', 'targets', f]);
for (const args of [['list'], ['list', '--json'], ['add', '--list'], ['add', 'ocean'], ['eject', 'ocean', 'src/ocean'], ['list', '--package', '@acme/kit']]) add('theme', ['theme', ...args], {fixture: 'integration'});

// init: features, agents, flags, and second runs.
for (const f of ['app', 'empty', 'plain', 'nocore', 'large', 'integration']) {
  add('init', ['init'], {fixture: f});
  add('init', ['init', '--all'], {fixture: f});
  add('init', ['init', '--json'], {fixture: f});
}
for (const agent of ['claude', 'cursor', 'codex', 'copilot', 'gemini', 'windsurf', 'bogus']) add('init', ['init', '--agent', agent]);
add('init', ['init'], {pre: [['init']], tag: 'again'});
add('init', ['init', '--remove-agents'], {pre: [['init']]});
add('init', ['init', '--user']);
add('init', ['init', '--agent-docs-path', 'docs/agents']);
add('init', ['init', '--agent-docs-path', 'a', 'b']);

// doctor: each fixture, after setup steps, built paths.
for (const f of ['app', 'empty', 'nocore', 'brokencore', 'plain', 'large', 'integration', 'author']) {
  add('doctor', ['doctor'], {fixture: f});
  add('doctor', ['doctor', '--json'], {fixture: f});
}
add('doctor', ['doctor'], {pre: [['init']]});
add('doctor', ['doctor'], {pre: [['theme', 'add', 'neutral']]});
add('doctor', ['doctor', '--built', 'dist']);
add('doctor', ['doctor', '--built', 'src']);
for (const sub of ['components', 'docs', 'templates', 'validate']) {
  for (const f of ['author', 'integration', 'app', 'empty']) add('doctor', ['doctor', 'integration', sub], {fixture: f});
  add('doctor', ['doctor', 'integration', sub, '@acme/kit'], {fixture: 'integration'});
  add('doctor', ['doctor', 'integration', sub, '@acme/kit', '--json'], {fixture: 'integration'});
  add('doctor', ['doctor', 'integration', sub, '@astryxdesign/lab'], {fixture: 'large'});
  add('doctor', ['doctor', 'integration', sub, 'nope'], {fixture: 'integration'});
}

// integration authoring: add every kind, then check.
const kinds = ['component', 'template', 'block', 'doc', 'theme', 'hook', 'agent-doc', 'icon-set', 'bogus'];
for (const kind of kinds) {
  add('integration', ['integration', 'add', kind, 'Thing'], {fixture: 'author'});
  add('integration', ['integration', 'add', kind, 'Thing', '--dry-run'], {fixture: 'author'});
  add('integration', ['integration', 'add', kind, 'Thing', '--json'], {fixture: 'author'});
  add('integration', ['integration', 'check'], {fixture: 'author', pre: [['integration', 'add', kind, 'Thing']], tag: kind});
}
for (const args of [['check', '--strict'], ['check', '--next'], ['check', '--json'], ['pack'], ['pack', '--check'], ['verify']]) {
  for (const f of ['author', 'app', 'empty', 'integration']) add('integration', ['integration', ...args], {fixture: f});
}

// search/build/discover: every component, template and topic name as a query, and typos.
const typo = w => (w.length > 4 ? w.slice(0, 2) + w.slice(3) : `${w}x`);
const names = [...components.slice(0, 120), ...templates.slice(0, 80).map(t => t.name), ...topics.map(t => t.topic)];
for (const n of names) {
  add('search', ['search', n]);
  add('search', ['search', typo(n.toLowerCase())], {tag: 'typo'});
  add('build', ['build', n]);
  add('discover', ['discover', n]);
}
for (const q of SEARCHES.slice(0, 20)) {
  for (const l of ['1', '10', '0', '-2', 'x']) add('search', ['search', q, '--limit', l]);
  for (const t of ['component', 'hook', 'doc', 'template', 'theme', 'bogus']) {
    add('build', ['build', q, '--type', t]);
    add('discover', ['discover', q, '--type', t]);
  }
  for (const flag of ['--components', '--installed', '--available']) add('discover', ['discover', q, flag]);
  add('discover', ['discover', q], {fixture: 'large'});
  add('build', ['build', q, '--limit', '2']);
  add('search', ['search', q, '--verbose']);
}
for (const f of ['empty', 'nocore', 'plain', 'integration', 'large']) {
  add('build', ['build'], {fixture: f});
  add('discover', ['discover'], {fixture: f});
}

// experimental: render inputs, icons.
for (const extra of [[], ['--json'], ['--out', 'out.png'], ['--reverse'], ['--title', 'Hello'], ['--out', 'out.png', '--overwrite']]) {
  add('experimental', ['experimental', 'render', '../inputs/page.tsx', ...extra]);
}
add('experimental', ['experimental', 'render', 'missing.tsx']);
for (const q of ['arrow', 'trash', 'search', 'close', 'dice', 'nope']) {
  add('experimental', ['experimental', 'icon', q, '--json'], {fixture: 'large'});
  add('experimental', ['experimental', 'icon', q, '--limit', '2']);
}


// ---- terminal width, global option placement, TTY ----
const WIDE = [['--help'], ['component', '--help'], ['docs'], ['docs', 'cli'], ['docs', 'principles', '--index'], ['component', '--list'], ['component', 'Button'], ['hook', '--list'], ['template', '--list'], ['theme', 'list'], ['search', 'button'], ['build', 'dashboard'], ['nosuchcommand'], ['component', 'Buton'], ['upgrade', '--list'], ['theme', 'targets'], ['init', '--help'], ['doctor']];
for (const args of WIDE) {
  const top = args[0].startsWith('-') || args[0] === 'nosuchcommand' ? 'root' : args[0];
  for (const cols of ['40', '80', '200']) add(top, args, {env: {COLUMNS: cols}, tag: `cols${cols}`});
  add(top, args, {env: {COLUMNS: ''}, tag: 'cols-empty'});
  add(top, args, {tty: true});
  add(top, args, {tty: true, env: {COLUMNS: '60'}, tag: 'cols60'});
}
for (const args of [['--json', 'component', 'Button'], ['--dense', 'component', 'Button'], ['--zh', 'docs', 'principles'], ['--detail', 'brief', 'component', 'Button'], ['component', '--json', 'Button'], ['--lang', 'dense', 'docs', 'tokens'], ['component', 'Button', '--json', '--dense'], ['component', 'Button', '--zh', '--dense'], ['component', 'Button', '--lang', 'zh', '--zh'], ['--version', 'component'], ['component', 'Button', '--version'], ['--', 'component', 'Button'], ['component', '--', 'Button'], ['component', 'Button', '--json=true'], ['component', 'Button', '--no-json'], ['COMPONENT', 'Button'], ['component', ''], ['search', ''], ['docs', '']]) {
  add('root', args, {tag: 'global'});
}
for (const args of [['search', 'button'], ['component', 'Button'], ['docs', 'tokens'], ['init'], ['theme', 'add']]) {
  add(args[0], args, {stdin: 'y\nn\n\n', tag: 'stdin'});
}

// ---- TTY and stdin ----
for (const args of [['component', 'Button'], ['docs'], ['search', 'button'], ['component', '--list'], ['--help'], ['init'], ['theme', 'add'], ['nosuchcommand']]) {
  add(args[0] === '--help' || args[0] === 'nosuchcommand' ? 'root' : args[0], args, {tty: true});
}
add('init', ['init'], {stdin: 'y\n'});
add('theme', ['theme', 'add'], {stdin: '1\n'});

// ---- write ----
fs.mkdirSync(CASES_DIR, {recursive: true});
let total = 0;
for (const [command, list] of [...byCommand].sort()) {
  const file = path.join(CASES_DIR, `${command}.json`);
  let manual = [];
  if (fs.existsSync(file)) manual = JSON.parse(fs.readFileSync(file, 'utf8')).filter(c => !c.gen);
  const ids = new Set(manual.map(c => c.id));
  const merged = [...list.filter(c => !ids.has(c.id)), ...manual];
  fs.writeFileSync(file, `${JSON.stringify(merged, null, 1)}\n`);
  total += merged.length;
  console.log(`${command.padEnd(14)} ${merged.length}`);
}
console.log(`total          ${total}`);
