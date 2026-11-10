#!/usr/bin/env node
// Differential fuzzing: random but plausible invocations, run by both the JS
// CLI and the clone in the suite's sandbox (lib.mjs runCase), compared on
// stdout, stderr, exit code and files.
//
// Each difference is checked for JS nondeterminism (the JS CLI runs twice),
// minimized, and (with --save) appended as a case to cases/<command>.fuzz.json.
// Record the new cases' goldens afterwards with record.mjs --missing.
//
// Usage: node fuzz.mjs --bin <astryx binary> [--n 2000] [--jobs 16] [--seed s]
//          [--save] [--state file] [--summary file]

import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {CASES_DIR, caseEnv, ensureDirs, jsBin, pool, runCase} from './lib.mjs';
import {FIXTURES, JS_CLI, setup} from './setup.mjs';

const argv = process.argv.slice(2);
const opt = (name, d) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : d;
};
const binArg = opt('bin');
if (!binArg) {
  console.error('usage: node fuzz.mjs --bin <astryx binary> [--n 2000] [--jobs 16] [--seed s] [--save]');
  process.exit(2);
}
const binPath = path.resolve(binArg);
const N = Number(opt('n', 2000));
const jobs = Number(opt('jobs', 16));
const seedText = opt('seed', String(Date.now()));
const save = argv.includes('--save');
const stateFile = path.resolve(opt('state', '/tmp/astryx-conformance/fuzz-state.json'));
const summaryFile = opt('summary') ? path.resolve(opt('summary')) : null;
const timeoutMs = Number(opt('timeout', 30000));

function findCliRoot(bin) {
  let dir = path.dirname(bin);
  while (dir !== path.dirname(dir)) {
    const candidate = path.join(dir, 'packages', 'cli');
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
    dir = path.dirname(dir);
  }
  throw new Error('no packages/cli above the binary');
}
const RS = {cmd: [binPath], cliRoot: findCliRoot(binPath), timeoutMs};
const JS = {...jsBin(), timeoutMs};

await setup();
ensureDirs();

// ---- seeded random ----
let seed = Number.parseInt(createHash('sha256').update(seedText).digest('hex').slice(0, 8), 16) >>> 0;
function rand() {
  // mulberry32
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const chance = p => rand() < p;
const pick = a => a[Math.floor(rand() * a.length)];
const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---- entities, read from the JS CLI ----
function js(args, fixture = 'large') {
  const r = spawnSync(process.execPath, [JS_CLI, ...args, '--json'], {
    cwd: path.join(FIXTURES, fixture),
    env: {...caseEnv({}), LD_PRELOAD: '', HOME: '/tmp/astryx-conformance/gen-home', TMPDIR: '/tmp'},
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  });
  try {
    return JSON.parse(r.stdout).data;
  } catch {
    return null;
  }
}
const uniq = a => [...new Set(a.filter(x => typeof x === 'string' && x))];
const manifest = js(['manifest'], 'app');
const compGroups = js(['component', '--list']) ?? {};
const compGroupsInt = js(['component', '--list'], 'integration') ?? {};
const components = uniq([...Object.values(compGroups.components ?? {}), ...Object.values(compGroupsInt.components ?? {})].flat().map(e => e?.name));
const componentCats = uniq([...Object.keys(compGroups.components ?? {})]);
const hookGroups = js(['hook', '--list'])?.components ?? {};
const hooks = uniq(Object.values(hookGroups).flat());
const hookCats = Object.keys(hookGroups);
const templates = uniq([...(js(['template', '--list']) ?? []), ...(js(['template', '--list'], 'integration') ?? [])].map(t => t.id));
const topicList = [...(js(['docs']) ?? []), ...(js(['docs'], 'integration') ?? [])];
const topics = uniq(topicList.map(t => t.topic));
const sectionsByTopic = {};
for (const t of topics.slice(0, 80)) {
  const idx = js(['docs', t, '--index']);
  sectionsByTopic[t] = uniq((idx?.sections ?? []).flatMap(s => [s.id, chance(0.2) ? s.title : null]));
}
const allSections = uniq(Object.values(sectionsByTopic).flat());
const themeData = js(['theme', 'list']);
const themes = uniq([...(Array.isArray(themeData) ? themeData : themeData?.themes ?? []).map(t => t.slug ?? t.name ?? t.id), 'neutral', 'sunset']);
const blogData = js(['blog']);
const blogs = uniq((Array.isArray(blogData) ? blogData : blogData?.posts ?? []).map(b => b.slug ?? b.id));
const targetData = js(['theme', 'targets']);
const targets = uniq((Array.isArray(targetData) ? targetData : targetData?.targets ?? []).map(t => (typeof t === 'string' ? t : t.name ?? t.id ?? t.key)));
const ICON_CWD = 'discover-iconsets/app';
const iconIcons = js(['experimental', 'icon', '--set', 'glyphs', '--all-icons'], ICON_CWD)?.icons ?? [];
const iconDefs = (js(['experimental', 'icon', '--definitions'], ICON_CWD)?.definitions ?? []).map(d => d.name);
const icons = uniq(iconIcons.flatMap(i => [i.id, i.export]));
const definitions = uniq([...iconDefs, 'random', 'nope']);
const iconSets = uniq(['glyphs', 'lucide', 'heroicons', 'astryx', 'nope']);
const packages = ['@astryxdesign/core', '@astryxdesign/lab', '@astryxdesign/charts', '@astryxdesign/build', '@acme/kit', '@acme/widgets', 'nope-pkg', '@astryxdesign/theme-neutral', 'core', '@acme'];

// Fixtures: every top-level folder; a folder with no package.json also offers its subfolders as cwd.
const fixtures = [];
for (const name of fs.readdirSync(FIXTURES)) {
  const d = path.join(FIXTURES, name);
  if (!fs.statSync(d).isDirectory()) continue;
  fixtures.push({fixture: name});
  if (!fs.existsSync(path.join(d, 'package.json'))) {
    for (const sub of fs.readdirSync(d)) if (fs.statSync(path.join(d, sub)).isDirectory()) fixtures.push({fixture: name, cwd: `${name}/${sub}`});
  }
}
// The odd-setup fixture: also its nested folders (src, a workspace member).
for (const rel of ['fuzzodd/deep/src', 'fuzzodd/deep/src/features/a', 'fuzzodd/workspace/packages/web', 'fuzzodd/workspace/packages', 'fuzzodd/spaced ü/src/pages', 'large/src', 'app/node_modules', 'integration/node_modules/@acme/kit']) {
  if (fs.existsSync(path.join(FIXTURES, rel))) fixtures.push({fixture: rel.split('/')[0], cwd: rel});
}
const mainFixtures = ['app', 'large', 'integration', 'author', 'empty', 'fuzzodd'];
// Fixtures (or fixture/cwd) built for a command, by its lane; half that command's inputs use one.
const PREFERRED = {};
for (const f of fixtures) {
  const name = f.cwd ?? f.fixture;
  const key = name.split(/[-/]/)[0];
  const top = {upgrade: 'upgrade', doctor: 'doctor', discover: 'discover', docsbroken: 'docs', docsint: 'docs', gapreport: 'gap-report', initdone: 'init', renderpages: 'experimental', themes: 'theme', comptheme: 'component', compkit: 'component'}[key];
  if (top) (PREFERRED[top] ??= []).push(name);
}
(PREFERRED.experimental ??= []).push('discover-iconsets/app', 'discover-iconsets/app');
(PREFERRED.integration ??= []).push('author', 'integration');

console.error(
  `fuzz: seed=${seedText} n=${N} components=${components.length} hooks=${hooks.length} templates=${templates.length} topics=${topics.length} sections=${allSections.length} themes=${themes.length} blogs=${blogs.length} targets=${targets.length} icons=${icons.length} definitions=${definitions.length} fixtures=${fixtures.length}`,
);

// ---- values ----
const WEIRD = ['', ' ', '-', '--', '.', '..', '0', '-1', '-0', '1e3', '3.7', 'NaN', 'Infinity', '999999999999', '0x10', 'true', 'null', 'undefined', 'ü', 'Bütton', '按钮', '😀', 'a b', 'a,b,,c', ',', '\t', 'x\ny', 'A'.repeat(300), 'é'.repeat(70), '../..', '/', '/etc', '%s', '${HOME}', '*', '[]', '{}', '"q"', "'", '\\', 'constructor', '__proto__', 'toString', 'hasOwnProperty', 'CON', '.hidden'];
const WORDS = ['table', 'button', 'form', 'login', 'dashboard', 'chart', 'modal', 'dialog', 'nav', 'sidebar', 'card', 'list', 'settings', 'profile', 'search', 'input', 'date', 'picker', 'theme', 'dark', 'color', 'token', 'spacing', 'icon', 'page', 'layout', 'grid', 'menu', 'tabs', 'toast', 'avatar', 'data', 'empty', 'the', 'a', 'with', 'and', 'for', 'of'];

function mutate(s) {
  if (!s) return pick(WEIRD);
  const i = int(0, s.length - 1);
  switch (int(0, 13)) {
    case 0: return s.toLowerCase();
    case 1: return s.toUpperCase();
    case 2: return s.slice(0, i) + s.slice(i + 1);
    case 3: return s.slice(0, i) + s[i] + s.slice(i);
    case 4: return i + 1 < s.length ? s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2) : s + 'x';
    case 5: return s + 's';
    case 6: return ` ${s}`;
    case 7: return `${s} `;
    case 8: return s.replace(/-/g, '_').replace(/([a-z])([A-Z])/g, '$1-$2');
    case 9: return s.slice(0, Math.max(1, Math.floor(s.length / 2)));
    case 10: return `${s}${pick(['2', 'x', '.', '/', 'é', '!'])}`;
    case 11: return `${pick(['@', '-', './', 'use', 'X'])}${s}`;
    case 12: return s.replace(/[aeiou]/, '');
    default: return `${s}${pick([',', ' ', '/'])}${s}`;
  }
}
const maybeMutate = (s, p = 0.25) => (chance(p) ? mutate(s) : s);

function query() {
  const n = int(1, 4);
  const parts = [];
  for (let i = 0; i < n; i++) parts.push(chance(0.6) ? pick(WORDS) : pick([...components, ...templates, ...hooks, ...topics]).toString());
  let q = parts.join(chance(0.9) ? ' ' : pick(['-', ',', '  ']));
  if (chance(0.2)) q = mutate(q);
  return q;
}

function pathValue() {
  return pick(['out', 'out/x.tsx', 'src/theme.ts', 'src/pages/page.tsx', '../inputs/page.tsx', '../inputs/palette.config.json', '../inputs/not-json.json', 'nope.json', 'src', '.', '', 'src/App.tsx', 'package.json', 'out.png', 'cdn-out', 'deep/a/b/c', '/tmp/x', 'out dir', 'ü.tsx']);
}

/** A positional value for an argument, by its name and command path. */
function argValue(name, p, state) {
  const top = p[0];
  switch (name) {
    case 'names':
    case 'component':
      if (top === 'gap-report' && chance(0.3)) return mutate(pick(components));
      return maybeMutate(pick(components));
    case 'name':
      if (top === 'hook') return maybeMutate(pick(hooks));
      if (top === 'template') return maybeMutate(pick(templates));
      if (p.includes('new-set') || p.includes('new-definition')) return maybeMutate(pick(['acme', 'my-set', 'icons', 'Arrow', 'arrow-up', ...icons.slice(0, 20)]));
      if (top === 'integration') return maybeMutate(pick(['widget', 'Card', 'my-theme', 'guide', 'page', 'Fancy', 'acme']));
      return maybeMutate(pick(components));
    case 'kind':
      return maybeMutate(pick(['component', 'template', 'theme', 'doc', 'docs', 'hook', 'block', 'page', 'icon']), 0.15);
    case 'slug':
      if (top === 'blog') return maybeMutate(pick(blogs.length ? blogs : ['nope']));
      return maybeMutate(pick(themes));
    case 'topic': {
      const t = maybeMutate(pick(topics), 0.15);
      state.topic = t;
      return t;
    }
    case 'section':
      return maybeMutate(pick(sectionsByTopic[state.topic]?.length && chance(0.8) ? sectionsByTopic[state.topic] : allSections.length ? allSections : ['rules']), 0.2);
    case 'query':
      return query();
    case 'package':
      return maybeMutate(pick(packages), 0.15);
    case 'export':
    case 'icon':
      return maybeMutate(pick(icons.length ? icons : ['Dice5', 'dice-5']));
    case 'definition':
      return maybeMutate(pick(definitions));
    case 'set':
      return maybeMutate(pick(iconSets));
    case 'filter':
      return maybeMutate(pick(targets.length ? targets : ['button']));
    case 'files':
    case 'file':
    case 'config':
    case 'path':
      return pathValue();
    default:
      return pick([...WORDS, ...WEIRD]);
  }
}

function optValue(o, spec, p) {
  if (o.choices) {
    if (chance(0.65)) return pick(o.choices);
    if (chance(0.6)) return mutate(pick(o.choices));
    return pick(WEIRD);
  }
  switch (spec) {
    case '<n>':
    case '<levels>':
      return pick(['0', '1', '2', '3', '5', '10', '100', '-1', '-5', '1.5', 'abc', '', '1e2', ' 3', '3 ', '0x3', '+2', '07', '9999999999999999999']);
    case '<version>':
      return pick(['0.1.0', '0.5.0', '0.6.0', '0.7.0', '0.8.0', '1.0.0', 'latest', 'v0.6.0', '0.6', '0', 'not-a-version', '', '99.0.0', '0.6.0-beta.1']);
    case '<category>':
      return maybeMutate(pick([...componentCats, ...hookCats, 'nope']), 0.2);
    case '<name>':
      if (p.includes('icon')) return maybeMutate(pick(iconSets));
      return maybeMutate(pick([...components, 'nope', 'rename-props']));
    case '<name...>':
      return pick(['rename-props', 'nope', 'all', '']);
    case '<package>':
    case '<pkg>':
      return maybeMutate(pick(packages), 0.15);
    case '<domain>':
      return maybeMutate(pick(['component', 'hook', 'doc', 'docs', 'template', 'theme', 'block', 'page', 'bogus']), 0.2);
    case '<type>':
    case '<kind>':
      return maybeMutate(pick(['page', 'block', 'component', 'template', 'theme', 'docs', 'bogus']), 0.2);
    case '<theme>':
      return maybeMutate(pick(themes));
    case '<topic>':
      return maybeMutate(pick(topics));
    case '<locale>':
      return maybeMutate(pick(['en', 'zh', 'dense', 'fr', 'EN']), 0.2);
    case '<tool>':
      return maybeMutate(pick(['claude', 'cursor', 'codex', 'copilot', 'windsurf', 'gemini', 'bogus', 'all']), 0.2);
    case '<list>':
    case '<names>':
      return pick(['a,b', 'agents', 'agents,docs', '', ',', 'x', 'Foo,Bar', 'dice-5,arrow']);
    case '<path>':
    case '<path...>':
    case '<dir>':
    case '<file>':
    case '[path]':
      return pathValue();
    case '<reason>':
    case '<text>':
      return pick(['Need a compact size', 'hello world', '', 'é'.repeat(30), 'x'.repeat(500)]);
    case '<module>':
    case '<specifier>':
      return pick(['@acme/glyphs', '@acme/icons', 'lucide-react', 'nope', '']);
    case '<id>':
      return maybeMutate(pick(icons.length ? icons : ['dice-5']));
    case '<key>':
      return pick(['brand', 'neutral', '', 'x y']);
    case '<namespace>':
      return pick(['acme', 'nope', '']);
    case '<variant>':
      return pick(['outline', 'solid', 'nope']);
    default:
      return chance(0.5) ? pick(WORDS) : pick(WEIRD);
  }
}

// ---- environment and setup-step variants ----
const ENV_VARIANTS = [
  ['npm_config_user_agent', ['pnpm/9.12.0 npm/? node/v22.0.0 linux x64', 'yarn/1.22.22 npm/? node/v22.0.0 linux x64', 'yarn/4.5.0 npm/? node/v22.0.0 linux x64', 'bun/1.1.30 npm/? node/v22.0.0 linux x64', 'npm/10.9.0 node/v22.0.0 linux x64 workspaces/false', '']],
  ['npm_execpath', ['/usr/lib/node_modules/pnpm/bin/pnpm.cjs', '/usr/lib/node_modules/npm/bin/npm-cli.js', '/usr/bin/yarn']],
  ['COLUMNS', ['40', '80', '200', '0', 'abc']],
  ['CI', ['true', '1']],
  ['NO_COLOR', ['']],
  ['TERM', ['xterm-256color']],
  ['LANG', ['zh_CN.UTF-8', 'C']],
  ['NO_UPDATE_NOTIFIER', ['', '0']],
];
const PRE = {
  theme: [() => ['theme', 'add', pick(themes)], () => ['theme', 'add', pick(themes), '--import'], () => ['init']],
  init: [() => ['init'], () => ['init', '--all'], () => ['init', '--agent', pick(['claude', 'cursor', 'codex'])]],
  swizzle: [() => ['swizzle', pick(components)], () => ['init']],
  template: [() => ['template', pick(templates), 'src/pages/page.tsx']],
  doctor: [() => ['init'], () => ['init', '--all'], () => ['theme', 'add', pick(themes)]],
  upgrade: [() => ['init'], () => ['theme', 'add', pick(themes)]],
  experimental: [() => ['experimental', 'icon', 'use', 'glyphs'], () => ['experimental', 'icon', 'new-set', 'acme']],
  component: [() => ['swizzle', pick(components)], () => ['init', '--all']],
  search: [() => ['init']],
  build: [() => ['init', '--all'], () => ['theme', 'add', pick(themes)]],
  docs: [() => ['init']],
  integration: [() => ['integration', 'add', pick(['component', 'template', 'theme', 'doc']), pick(['Fancy', 'my-page', 'guide'])]],
  'gap-report': [() => ['init']],
  discover: [() => ['theme', 'add', pick(themes)]],
};

// ---- generating one invocation ----
const EXCLUDED_FLAGS = new Set(['--watch', '--install-deps']);
const allTop = manifest.commands;

function chooseCommand() {
  let cmd = pick(allTop);
  const chain = [cmd];
  while (cmd.subcommands?.length && chance(0.75)) {
    cmd = pick(cmd.subcommands);
    chain.push(cmd);
  }
  return {cmd, p: cmd.name.split(' ')};
}

function flagForms(o) {
  const parts = o.flag.split(/[ ,]+/);
  return {long: parts.find(s => s.startsWith('--')), short: parts.find(s => /^-[A-Za-z]$/.test(s)), spec: (o.flag.match(/[<[][^>\]]+[>\]]/) ?? [])[0]};
}

function optionTokens(o, p) {
  const {long, short, spec} = flagForms(o);
  if (EXCLUDED_FLAGS.has(long)) return null;
  let name = short && chance(0.4) ? short : long;
  if (chance(0.04)) name = mutate(long.slice(2)).replace(/^/, '--');
  if (!spec) {
    if (chance(0.05)) return [`${name}=${pick(['true', 'false', '1', ''])}`];
    if (chance(0.03)) return [`--no-${long.slice(2)}`];
    return [name];
  }
  if (spec.startsWith('<') && chance(0.06)) return [name]; // missing value
  if (spec.startsWith('[') && chance(0.4)) return [name];
  const v = optValue(o, spec, p);
  if (name.startsWith('--') && chance(0.25)) return [`${name}=${v}`];
  if (name.length === 2 && chance(0.15)) return [`${name}${v}`];
  const out = [name, v];
  if (spec.endsWith('...>') && chance(0.4)) out.push(optValue(o, spec, p));
  return out;
}

function generate() {
  const {cmd, p} = chooseCommand();
  const state = {};
  const pos = [];
  for (const a of cmd.arguments ?? []) {
    const name = a.name.replace(/[!.]/g, '');
    if (chance(a.required ? 0.92 : 0.6)) pos.push(argValue(name, p, state));
    else break;
    if (a.name.endsWith('...') || name === 'names') while (chance(0.15)) pos.push(argValue(name, p, state));
  }
  if (chance(0.06)) pos.push(pick([...WORDS, ...WEIRD]));
  const groups = [];
  const opts = shuffle([...(cmd.options ?? [])]);
  const k = Math.min(opts.length, pick([0, 0, 1, 1, 1, 2, 2, 3, 4, 5, 7]));
  for (const o of opts.slice(0, k)) {
    const t = optionTokens(o, p);
    if (t) groups.push(t);
    if (t && chance(0.04)) groups.push(optionTokens(o, p) ?? t); // repeated
  }
  const globals = [];
  const gopts = manifest.globalOptions.filter(o => !/version/.test(o.flag));
  const gk = pick([0, 0, 0, 1, 1, 2]);
  for (const o of shuffle([...gopts]).slice(0, gk)) globals.push(optionTokens(o, p));
  if (chance(0.25)) groups.push(['--json']);
  if (chance(0.08)) groups.push([pick(['--bogus', '-x', '--jsn', '--help', '-h', '--verbose', '-V', '--version', '-hV', '-Vh', '--HELP', '-j', '--json=true', '--json=false', '--no-json', '--detail', '--lang', '--zh=1', '-', '---json'])]);
  // Interleave option groups among positionals; globals go before the command (sometimes) or among the rest.
  const tail = [...pos.map(x => [x]), ...groups];
  let ordered;
  if (chance(0.6)) ordered = [...pos.map(x => [x]), ...shuffle(groups)];
  else ordered = shuffle(tail);
  const front = [];
  for (const g of globals) {
    if (chance(0.3)) front.push(g);
    else ordered.splice(int(0, ordered.length), 0, g);
  }
  let args = [...front.flat(), ...p, ...ordered.flat()];
  if (chance(0.08)) args.splice(int(p.length, args.length), 0, '--');
  if (chance(0.03)) args = ['help', ...p, ...(chance(0.3) ? [pick([...WORDS, ...WEIRD])] : [])];
  if (chance(0.02)) args = [...p.slice(0, -1), mutate(p[p.length - 1]), ...args.slice(p.length)];
  if (chance(0.02)) args[0] = mutate(args[0]);
  const pref = PREFERRED[p[0]]?.filter(f => fixtures.some(x => (x.cwd ?? x.fixture) === f)) ?? [];
  let fx;
  if (pref.length && chance(0.5)) {
    const f = pick(pref);
    fx = f.includes('/') ? {fixture: f.split('/')[0], cwd: f} : {fixture: f};
  } else fx = chance(0.6) ? {fixture: pick(mainFixtures)} : pick(fixtures);
  const c = {args, fixture: fx.fixture};
  if (fx.cwd) c.cwd = fx.cwd;
  if (chance(0.02)) c.stdin = pick(['y\n', 'n\n', '{}', 'Button\n']);
  if (chance(0.03)) c.tty = true;
  if (chance(0.1)) {
    const env = {};
    for (let i = int(1, 2); i > 0; i--) {
      const [k, vs] = pick(ENV_VARIANTS);
      env[k] = pick(vs);
    }
    c.env = env;
  }
  const preOpts = PRE[p[0]];
  if (preOpts && chance(0.2)) c.pre = [pick(preOpts)()];
  return {c, p};
}

// ---- comparing ----
function linesDiff(a, b) {
  const x = a.split('\n');
  const y = b.split('\n');
  for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) return {line: i + 1, js: x[i] ?? '<eof>', rs: y[i] ?? '<eof>'};
  return null;
}
function compare(j, r) {
  const parts = [];
  if (j.stdout !== r.stdout) parts.push('stdout');
  if (j.stderr !== r.stderr) parts.push('stderr');
  if (j.exit !== r.exit) parts.push('exit');
  if (JSON.stringify(j.files) !== JSON.stringify(r.files)) parts.push('files');
  if (!parts.length) return null;
  let first;
  if (parts[0] === 'stdout') first = {part: 'stdout', ...linesDiff(j.stdout, r.stdout)};
  else if (parts[0] === 'stderr') first = {part: 'stderr', ...linesDiff(j.stderr, r.stderr)};
  else if (parts[0] === 'exit') first = {part: 'exit', js: String(j.exit), rs: String(r.exit)};
  else {
    const jf = j.files.map(f => `${f.path}:${f.status}`);
    const rf = r.files.map(f => `${f.path}:${f.status}`);
    const missing = jf.filter(f => !rf.includes(f));
    const extra = rf.filter(f => !jf.includes(f));
    first = {part: 'files', js: missing.join(' ') || '(same paths, different content)', rs: extra.join(' ') || JSON.stringify(j.files.find((f, i) => JSON.stringify(f) !== JSON.stringify(r.files[i]))?.path)};
  }
  return {parts, first};
}
const clip = s => (s.length > 200 ? `${s.slice(0, 200)}…` : s);
function signature(p, d) {
  const norm = s => clip(String(s ?? ''))
    .replace(/\d+/g, 'N')
    .replace(/(["'`]).*?\1/g, 'Q')
    .slice(0, 80);
  return `${p.join(' ')}|${d.parts.join(',')}|${d.first.part}|${norm(d.first.js)}`;
}

async function both(c) {
  const [j, r] = await Promise.all([runCase(c, JS), runCase(c, RS)]);
  return {j, r};
}

/** Differs in the same command and the same parts? */
async function stillDiffers(c, want) {
  const {j, r} = await both(c);
  if (j.exit === 'timeout' || r.exit === 'timeout') return null;
  const d = compare(j, r);
  if (!d) return null;
  if (d.parts.join(',') !== want.parts.join(',')) return null;
  return {d, j, r};
}

async function minimize(c, d) {
  let cur = {...c, args: [...c.args]};
  let best = d;
  const tryCase = async cand => {
    const res = await stillDiffers(cand, best);
    if (res) {
      cur = cand;
      best = res.d;
      return true;
    }
    return false;
  };
  for (const k of ['pre', 'tty']) {
    if (cur[k] != null) {
      const {[k]: _, ...rest} = cur;
      await tryCase(rest);
    }
  }
  if (cur.env) {
    for (const k of Object.keys(cur.env)) {
      const env = {...cur.env};
      delete env[k];
      const {env: _, ...rest} = cur;
      await tryCase(Object.keys(env).length ? {...rest, env} : rest);
    }
  }
  if (cur.stdin != null) {
    const {stdin, ...rest} = cur;
    await tryCase(rest);
  }
  if (cur.fixture !== 'app' || cur.cwd) {
    const {cwd, ...rest} = cur;
    await tryCase({...rest, fixture: 'app'});
  }
  let changed = true;
  let budget = 80;
  while (changed && budget > 0) {
    changed = false;
    // Drop pairs (flag + value) first, then single tokens.
    for (const width of [2, 1]) {
      for (let i = cur.args.length - width; i >= 0 && budget > 0; i--) {
        const args = [...cur.args.slice(0, i), ...cur.args.slice(i + width)];
        if (!args.length) continue;
        budget--;
        if (await tryCase({...cur, args})) {
          changed = true;
          i = Math.min(i, cur.args.length - width + 1);
        }
      }
    }
  }
  // Shorten long values.
  for (let i = 0; i < cur.args.length && budget > 0; i++) {
    const a = cur.args[i];
    if (a.length > 24 && !a.startsWith('-')) {
      budget--;
      const args = [...cur.args];
      args[i] = a.slice(0, 12);
      await tryCase({...cur, args});
    }
  }
  return {c: cur, d: best};
}

// ---- state: signatures already reported, existing case keys ----
const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {signatures: {}, rounds: 0};
const caseKey = c => JSON.stringify([c.args, c.fixture ?? 'app', c.cwd ?? null, c.stdin ?? null, c.tty ?? false, c.env ?? null, c.pre ?? null]);
const existing = new Map();
for (const f of fs.readdirSync(CASES_DIR).filter(f => f.endsWith('.json'))) {
  for (const c of JSON.parse(fs.readFileSync(path.join(CASES_DIR, f), 'utf8'))) existing.set(caseKey(c), `${f.split('.')[0]}/${c.id}`);
}
const topNames = new Set(allTop.map(c => c.name));

// ---- run the round ----
const inputs = [];
const seen = new Set();
while (inputs.length < N) {
  const g = generate();
  const k = caseKey(g.c);
  if (seen.has(k) || existing.has(k)) continue;
  seen.add(k);
  inputs.push(g);
}

const started = Date.now();
const jsCrashes = [];
const timeouts = [];
const stats = {jsCrash: 0, tried: 0, same: 0, timeouts: 0, nondeterministic: 0, diffs: 0, newDiffs: 0, knownSig: 0, perCommand: {}};
const found = [];
const nondet = [];
let done = 0;
await pool(inputs, jobs, async ({c, p}) => {
  const {j, r} = await both(c);
  stats.tried++;
  if (j.exit === 'timeout' || r.exit === 'timeout') {
    stats.timeouts++;
    timeouts.push({...c, js: {exit: j.exit, ms: j.ms}, rs: {exit: r.exit, ms: r.ms}});
    return;
  }
  const d = compare(j, r);
  if (!d) {
    stats.same++;
    return;
  }
  // A JS crash prints a stack trace with paths outside <cli> (node_modules): not a
  // target for the clone. Log it for the lead instead of saving a case.
  if (/^\s+at .+:\d+:\d+\)?\r?$/m.test(j.stderr + j.stdout)) {
    stats.jsCrash++;
    const msg = (j.stderr || j.stdout).split('\n').find(l => /Error/.test(l)) ?? '';
    if (!jsCrashes.some(x => x.msg === msg)) jsCrashes.push({msg, args: c.args, fixture: c.fixture, cwd: c.cwd});
    return;
  }
  const j2 = await runCase(c, JS);
  if (compare(j, j2)) {
    stats.nondeterministic++;
    nondet.push(c);
    return;
  }
  stats.diffs++;
  const top = p[0];
  (stats.perCommand[top] ??= {diffs: 0, new: 0}).diffs++;
  const sig = signature(p, d);
  if (state.signatures[sig] || found.some(f => f.sig === sig)) {
    stats.knownSig++;
    return;
  }
  // Claim the signature before minimizing so parallel workers skip it.
  const entry = {sig, p, c, d};
  found.push(entry);
  const m = await minimize(c, d);
  // The minimized input must be deterministic in the JS CLI too.
  const a = await runCase(m.c, JS);
  const b = await runCase(m.c, JS);
  if (compare(a, b)) {
    entry.nondet = true;
    return;
  }
  entry.min = m;
  stats.perCommand[top].new++;
}, () => {
  done++;
  if (done % 250 === 0) process.stderr.write(`fuzz: ${done}/${inputs.length} diffs=${stats.diffs} new=${found.length} (${((Date.now() - started) / 1000).toFixed(0)}s)\n`);
});

// ---- save cases ----
const added = [];
const byFile = {};
const minKeys = new Set();
for (const e of found) {
  if (!e.min) continue;
  const mc = e.min.c;
  const k = caseKey(mc);
  if (existing.has(k)) {
    e.existing = existing.get(k);
    continue;
  }
  if (minKeys.has(k)) {
    e.dupOf = true;
    continue;
  }
  minKeys.add(k);
  const first = mc.args.find(a => topNames.has(a));
  const file = first ?? 'root';
  const slug = mc.args.map(a => a.replace(/[^A-Za-z0-9._-]+/g, '-')).join('_').slice(0, 80) || 'bare';
  const id = `fuzz_${slug}${mc.fixture !== 'app' ? `@${mc.fixture}` : ''}${mc.tty ? '_tty' : ''}${mc.env ? '_env' : ''}${mc.pre ? '_pre' : ''}_${createHash('sha256').update(k).digest('hex').slice(0, 6)}`;
  const kase = {id, args: mc.args, fixture: mc.fixture ?? 'app'};
  if (mc.cwd) kase.cwd = mc.cwd;
  if (mc.stdin != null) kase.stdin = mc.stdin;
  if (mc.tty) kase.tty = true;
  if (mc.env) kase.env = mc.env;
  if (mc.pre) kase.pre = mc.pre;
  (byFile[file] ??= []).push(kase);
  added.push({file, id, env: kase.env, pre: kase.pre, tty: kase.tty, sig: e.sig, command: e.p.join(' '), first: e.min.d.first, parts: e.min.d.parts, args: mc.args, fixture: kase.fixture, cwd: kase.cwd});
}
if (save) {
  for (const [file, list] of Object.entries(byFile)) {
    const f = path.join(CASES_DIR, `${file}.fuzz.json`);
    const cur = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : [];
    const ids = new Set(cur.map(c => c.id));
    for (const c of list) if (!ids.has(c.id)) cur.push(c);
    fs.writeFileSync(f, `${JSON.stringify(cur, null, 2)}\n`);
  }
  for (const e of found) if (e.min && !e.dupOf) state.signatures[e.sig] = {round: state.rounds + 1, case: added.find(a => a.sig === e.sig)?.id ?? e.existing ?? null};
}
state.rounds++;
fs.mkdirSync(path.dirname(stateFile), {recursive: true});
fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 1)}\n`);

const summary = {
  seed: seedText,
  secs: Math.round((Date.now() - started) / 1000),
  ...stats,
  newSignatures: found.length,
  added,
  skippedExisting: found.filter(e => e.existing).map(e => ({sig: e.sig, case: e.existing})),
  jsCrashes,
  timeoutInputs: timeouts,
  nondeterministicInputs: nondet.slice(0, 50),
};
if (summaryFile) fs.writeFileSync(summaryFile, `${JSON.stringify(summary, null, 1)}\n`);
console.log(`fuzz: tried ${stats.tried}, same ${stats.same}, diffs ${stats.diffs} (known signature ${stats.knownSig}), nondeterministic ${stats.nondeterministic}, JS crashes ${stats.jsCrash}, timeouts ${stats.timeouts}, cases added ${added.length}, ${summary.secs}s`);
for (const [cmd, s] of Object.entries(stats.perCommand).sort()) console.log(`  ${cmd}: diffs ${s.diffs}, new ${s.new}`);
for (const t of timeouts) console.log(`  timeout: js ${t.js.exit} ${t.js.ms}ms, rs ${t.rs.exit} ${t.rs.ms}ms  <- ${JSON.stringify(t.args)} @${t.cwd ?? t.fixture}${t.pre ? ' pre ' + JSON.stringify(t.pre) : ''}${t.env ? ' env ' + JSON.stringify(t.env) : ''}`);
for (const x of jsCrashes) console.log(`  JS crash: ${x.msg}  <- ${JSON.stringify(x.args)} @${x.cwd ?? x.fixture}`);
for (const a of added) console.log(`  + ${a.file}/${a.id} [${a.parts}] ${a.first.part}:${a.first.line ?? ''}\n      js: ${clip(String(a.first.js))}\n      rs: ${clip(String(a.first.rs))}`);
