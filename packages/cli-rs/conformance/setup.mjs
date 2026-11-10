#!/usr/bin/env node
// Materializes the conformance fixtures at a fixed absolute path.
//
// Recording and running use the same paths, so absolute paths in output agree.
// Packages are real copies of their published files (never workspace links),
// so a fixture can be copied for a case that writes.
//
// Usage: node setup.mjs [--force]

import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

export const ROOT = '/tmp/astryx-conformance';
export const HERE = path.dirname(fileURLToPath(import.meta.url));
// The checkout whose JS CLI and built packages the goldens come from. Every lane
// uses the same one, so fixtures are identical on the box.
export const REPO = process.env.ASTRYX_CONFORMANCE_REPO ?? path.join(os.homedir(), 'rustcli', 'astryx');
export const JS_CLI = path.join(REPO, 'packages/cli/clients/cli/bin/astryx.mjs');
// Fixture folders lanes add: fixtures/<name>.mjs, each `export default
// function (dir, helpers)` that fills the empty folder `dir`.
export const EXTRA_FIXTURES = path.join(HERE, 'fixtures');

const TEST_FILE =
  /(\.test\.|\.spec\.[cm]?[jt]sx?$|\.spec\.d\.ts$|\.bench\.|(^|\/)__tests__(\/|$)|(^|\/)__mocks__(\/|$)|(^|\/)node_modules(\/|$))/;

/** Copy a workspace package's published files (its `files` list) to dest. */
export function copyPackage(srcDir, dest) {
  const pkg = JSON.parse(fs.readFileSync(path.join(srcDir, 'package.json'), 'utf8'));
  fs.mkdirSync(dest, {recursive: true});
  fs.copyFileSync(path.join(srcDir, 'package.json'), path.join(dest, 'package.json'));
  const entries = (pkg.files ?? []).filter(f => !f.startsWith('!'));
  for (const entry of entries) {
    const from = path.join(srcDir, entry);
    if (!fs.existsSync(from)) continue;
    fs.cpSync(from, path.join(dest, entry), {
      recursive: true,
      dereference: true,
      filter: src => !TEST_FILE.test(path.relative(srcDir, src)),
    });
  }
  return pkg;
}

export function writeFile(file, text) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, text);
}

export function writeJson(file, value) {
  writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export const PKG = rel => path.join(REPO, 'packages', rel);
export const CORE_VERSION = JSON.parse(fs.readFileSync(path.join(PKG('core'), 'package.json'), 'utf8')).version;

/**
 * The fixtures folder is named by a hash of everything that builds it, so a
 * change builds a new folder and never pulls files from under a running case.
 */
function fixturesHash() {
  const h = createHash('sha256');
  h.update(fs.readFileSync(fileURLToPath(import.meta.url)));
  h.update(CORE_VERSION);
  if (fs.existsSync(EXTRA_FIXTURES)) {
    for (const f of fs.readdirSync(EXTRA_FIXTURES).filter(f => f.endsWith('.mjs')).sort()) {
      h.update(f);
      h.update(fs.readFileSync(path.join(EXTRA_FIXTURES, f)));
    }
  }
  return h.digest('hex').slice(0, 12);
}

export const FIXTURES = path.join(ROOT, `fixtures-${fixturesHash()}`);

/** Find a dependency the way Node does: node_modules folders up from `fromDir`. */
function findDep(fromDir, name) {
  let dir = fromDir;
  while (true) {
    const candidate = path.join(dir, 'node_modules', name);
    if (fs.existsSync(path.join(candidate, 'package.json'))) return fs.realpathSync(candidate);
    if (dir === path.dirname(dir)) return null;
    dir = path.dirname(dir);
  }
}

/**
 * Install third-party packages flat into `nodeModules` as real copies, with
 * their dependencies (and required peers), resolved from the repo's install.
 */
export function installDeps(fromDir, nodeModules, names) {
  for (const name of names) {
    const dest = path.join(nodeModules, name);
    if (fs.existsSync(dest)) continue;
    const src = findDep(fromDir, name);
    if (!src) throw new Error(`fixture dependency ${name} not found from ${fromDir}`);
    fs.cpSync(src, dest, {recursive: true, dereference: true, filter: f => !/(^|\/)node_modules(\/|$)/.test(path.relative(src, f))});
    const pkg = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8'));
    const optionalPeers = new Set(Object.entries(pkg.peerDependenciesMeta ?? {}).filter(([, m]) => m.optional).map(([k]) => k));
    const next = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {}).filter(k => !optionalPeers.has(k))];
    installDeps(src, nodeModules, next);
  }
}

// What an app that uses Core has installed beside it: Core's dependencies and peers.
const APP_DEPS = ['intl-messageformat', 'react', 'react-dom', '@stylexjs/stylex'];

export function makeApp(dir, {name = 'app', extra = []} = {}) {
  const deps = {'@astryxdesign/core': CORE_VERSION, react: '^19.0.0', 'react-dom': '^19.0.0', '@stylexjs/stylex': '^0.19.0'};
  copyPackage(PKG('core'), path.join(dir, 'node_modules/@astryxdesign/core'));
  installDeps(PKG('core'), path.join(dir, 'node_modules'), APP_DEPS);
  for (const rel of extra) {
    const pkg = copyPackage(PKG(rel), path.join(dir, 'node_modules', ...pkgName(rel).split('/')));
    deps[pkg.name] = pkg.version;
  }
  writeJson(path.join(dir, 'package.json'), {name, version: '1.0.0', private: true, dependencies: deps});
  writeFile(path.join(dir, 'src/App.tsx'), "import {Button} from '@astryxdesign/core';\n\nexport default function App() {\n  return <Button label=\"Hi\" />;\n}\n");
}

function pkgName(rel) {
  return JSON.parse(fs.readFileSync(path.join(PKG(rel), 'package.json'), 'utf8')).name;
}

/** The integration package the CLI's own golden-reads test uses. */
export function makeIntegration(dir) {
  makeApp(dir, {name: 'golden-consumer'});
  const pj = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  pj.dependencies['@acme/kit'] = '^1.0.0';
  writeJson(path.join(dir, 'package.json'), pj);
  const w = (rel, text) => writeFile(path.join(dir, 'node_modules/@acme/kit', rel), text);
  w('package.json', JSON.stringify({name: '@acme/kit', version: '1.2.3'}));
  w('astryx.integration.mjs', "export default {components: './components', templates: './templates', docs: './docs', themes: './themes'};\n");
  w('components/AcmeCard.tsx', 'export function AcmeCard() { return null; }\n');
  w('components/AcmeCard.doc.mjs', `/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export default {
  type: 'component',
  name: 'AcmeCard',
  displayName: 'Acme Card',
  category: 'Layout',
  keywords: ['zorblax', 'card'],
  usage: {
    description: 'A zorblax card that groups one topic.',
    bestPractices: [
      {guidance: true, description: 'Keep one idea per card.'},
      {guidance: false, description: 'Do not nest cards.'},
    ],
  },
  props: [
    {name: 'title', type: 'string', required: true, description: 'Heading text.'},
    {name: 'tone', type: "'calm' | 'loud'", default: "'calm'", description: 'Visual weight.'},
  ],
  playground: {defaults: {onPress: undefined, tone: 'calm'}},
};
export const docsZh = {
  usage: {description: '一张 zorblax 卡片。'},
  propDescriptions: {title: '标题文字。'},
};
`);
  w('templates/hero.tsx', 'export default function Hero() { return <section>zorblax</section>; }\n');
  w('templates/hero.doc.mjs', "export default {type: 'block', name: 'Zorblax hero', description: 'A zorblax hero block.', aspectRatio: 2, componentsUsed: ['AcmeCard']};\n");
  const topic = fields => `export default ${JSON.stringify({
    type: 'generic',
    title: 'Acme guide',
    description: 'How zorblax cards fit together.',
    sections: [
      {title: 'Start', content: [{type: 'prose', text: 'Install the kit.'}]},
      {title: 'Colors', content: [{type: 'prose', text: 'Cards use the core tokens.'}, {type: 'token-ref', topic: 'no-such-topic', section: 'x'}]},
    ],
    ...fields,
  }, null, 2)};\n`;
  w('docs/acme-guide.doc.mjs', topic({name: 'acme-guide'}));
  w('themes/ocean/oceanTheme.ts', 'export const oceanTheme = {};\n');
  w('themes/ocean/oceanTheme.doc.mjs', "/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {type: 'theme', name: 'ocean', displayName: 'Ocean', description: 'A zorblax blue.', maintained: true};\n");
  // A TypeScript doc, so the TS strip path is covered.
  w('components/AcmeBadge.tsx', 'export function AcmeBadge() { return null; }\n');
  w('components/AcmeBadge.doc.ts', `const doc: {type: 'component'; name: string; category: string; usage: {description: string}; props: Array<{name: string; type: string; description: string}>} = {
  type: 'component',
  name: 'AcmeBadge',
  category: 'Data Display',
  usage: {description: 'A small zorblax status badge.'},
  props: [{name: 'count', type: 'number', description: 'How many.'}],
};
export default doc;
`);
}

/** An integration authoring package (the cwd is the integration itself). */
function makeIntegrationAuthor(dir) {
  writeJson(path.join(dir, 'package.json'), {name: '@acme/widgets', version: '0.1.0', peerDependencies: {'@astryxdesign/core': CORE_VERSION}});
  copyPackage(PKG('core'), path.join(dir, 'node_modules/@astryxdesign/core'));
  writeFile(path.join(dir, 'astryx.integration.mjs'), "export default {components: './src/components', docs: './docs'};\n");
  writeFile(path.join(dir, 'src/components/WidgetCard/WidgetCard.tsx'), 'export function WidgetCard() { return null; }\n');
  writeFile(path.join(dir, 'src/components/WidgetCard/WidgetCard.doc.mjs'), "export default {type: 'component', name: 'WidgetCard', category: 'Layout', usage: {description: 'A widget card.'}, props: []};\n");
  writeFile(path.join(dir, 'docs/widgets.doc.mjs'), "export default {type: 'generic', name: 'widgets', title: 'Widgets', description: 'Widget guide.', sections: [{title: 'Intro', content: [{type: 'prose', text: 'Hello.'}]}]};\n");
}

export function fixtureList() {
  return {
    // Core installed: the default project.
    app: dir => makeApp(dir),
    // Empty folder outside any project.
    empty: dir => fs.mkdirSync(dir, {recursive: true}),
    // Project with an integration package (@acme/kit).
    integration: dir => makeIntegration(dir),
    // Cwd is an integration package being authored.
    author: dir => makeIntegrationAuthor(dir),
    // Core plus every first-party integration and theme.
    large: dir => makeApp(dir, {name: 'large-app', extra: ['lab', 'charts', 'build', ...fs.readdirSync(PKG('themes')).filter(t => fs.existsSync(path.join(PKG('themes'), t, 'package.json'))).map(t => `themes/${t}`)]}),
    // Project that declares core but has not installed it.
    nocore: dir => {
      writeJson(path.join(dir, 'package.json'), {name: 'nocore', version: '1.0.0', dependencies: {'@astryxdesign/core': CORE_VERSION}});
    },
    // Core installed but its package.json is not valid JSON.
    brokencore: dir => {
      writeJson(path.join(dir, 'package.json'), {name: 'brokencore', version: '1.0.0', dependencies: {'@astryxdesign/core': CORE_VERSION}});
      writeFile(path.join(dir, 'node_modules/@astryxdesign/core/package.json'), '{"name": "@astryxdesign/core", "version": ');
    },
    // Lockfile flavors: the package manager the CLI detects and names in hints.
    'pm-npm': dir => {
      makeApp(dir, {name: 'pm-npm'});
      writeJson(path.join(dir, 'package-lock.json'), {name: 'pm-npm', version: '1.0.0', lockfileVersion: 3, requires: true, packages: {}});
    },
    'pm-pnpm': dir => {
      makeApp(dir, {name: 'pm-pnpm'});
      writeFile(path.join(dir, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n");
    },
    'pm-yarn': dir => {
      makeApp(dir, {name: 'pm-yarn'});
      writeFile(path.join(dir, 'yarn.lock'), '# THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.\n# yarn lockfile v1\n');
    },
    'pm-yarnberry': dir => {
      makeApp(dir, {name: 'pm-yarnberry'});
      const pj = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      writeJson(path.join(dir, 'package.json'), {...pj, packageManager: 'yarn@4.5.0'});
      writeFile(path.join(dir, 'yarn.lock'), '__metadata:\n  version: 8\n');
      writeFile(path.join(dir, '.yarnrc.yml'), 'nodeLinker: node-modules\n');
    },
    'pm-bun': dir => {
      makeApp(dir, {name: 'pm-bun'});
      writeFile(path.join(dir, 'bun.lock'), '{\n  "lockfileVersion": 1\n}\n');
    },
    // A pnpm workspace: Core hoisted at the root, used by packages/web; packages/api does not use Astryx.
    monorepo: dir => {
      writeJson(path.join(dir, 'package.json'), {name: 'mono', private: true, workspaces: ['packages/*']});
      writeFile(path.join(dir, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
      writeFile(path.join(dir, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n");
      copyPackage(PKG('core'), path.join(dir, 'node_modules/@astryxdesign/core'));
      installDeps(PKG('core'), path.join(dir, 'node_modules'), APP_DEPS);
      writeJson(path.join(dir, 'packages/web/package.json'), {name: 'web', version: '1.0.0', dependencies: {'@astryxdesign/core': CORE_VERSION, react: '^19.0.0'}});
      writeFile(path.join(dir, 'packages/web/src/App.tsx'), "import {Button} from '@astryxdesign/core';\n\nexport default function App() {\n  return <Button label=\"Hi\" />;\n}\n");
      writeJson(path.join(dir, 'packages/api/package.json'), {name: 'api', version: '1.0.0'});
      writeFile(path.join(dir, 'packages/api/index.js'), 'export {};\n');
    },
    // A workspace whose member installs Core in its own node_modules.
    'monorepo-local': dir => {
      writeJson(path.join(dir, 'package.json'), {name: 'mono-local', private: true, workspaces: ['apps/*']});
      makeApp(path.join(dir, 'apps/site'), {name: 'site'});
    },
    // Config files: integrations and issues URL; TypeScript config; a config that throws; one with a syntax error.
    configured: dir => {
      makeApp(dir, {name: 'configured', extra: ['lab', 'charts']});
      writeFile(path.join(dir, 'astryx.config.mjs'), "export default {\n  integrations: ['@astryxdesign/lab', '@astryxdesign/charts'],\n  issuesUrl: 'https://example.com/issues/new',\n};\n");
    },
    configts: dir => {
      makeApp(dir, {name: 'configts', extra: ['lab']});
      // An ES module package: otherwise Node prints a typeless-package warning that carries its PID.
      const pj = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      writeJson(path.join(dir, 'package.json'), {...pj, type: 'module'});
      writeFile(path.join(dir, 'astryx.config.ts'), "interface Config { integrations: string[] }\nconst config: Config = {integrations: ['@astryxdesign/lab']};\nexport default config;\n");
    },
    badconfig: dir => {
      makeApp(dir, {name: 'badconfig'});
      writeFile(path.join(dir, 'astryx.config.mjs'), "throw new Error('config exploded');\n");
    },
    syntaxconfig: dir => {
      makeApp(dir, {name: 'syntaxconfig'});
      writeFile(path.join(dir, 'astryx.config.mjs'), 'export default {integrations: [\n');
    },
    unknownint: dir => {
      makeApp(dir, {name: 'unknownint'});
      writeFile(path.join(dir, 'astryx.config.mjs'), "export default {integrations: ['@acme/missing']};\n");
    },
    // A project that does not use Astryx at all.
    plain: dir => {
      writeJson(path.join(dir, 'package.json'), {name: 'plain', version: '1.0.0', dependencies: {react: '^19.0.0'}});
      writeFile(path.join(dir, 'src/index.js'), 'console.log(1);\n');
    },
  };
}

/** A hash of each fixture folder's content (paths, file bytes, link targets). */
function fixtureContentHashes(root) {
  const out = {};
  for (const name of fs.readdirSync(root).sort()) {
    if (name.startsWith('.')) continue;
    const h = createHash('sha256');
    const walk = rel => {
      for (const e of fs.readdirSync(path.join(root, name, rel), {withFileTypes: true}).sort((a, b) => (a.name < b.name ? -1 : 1))) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        const abs = path.join(root, name, r);
        if (e.isDirectory()) {
          h.update(`d ${r}\0`);
          walk(r);
        } else if (e.isSymbolicLink()) h.update(`l ${r} ${fs.readlinkSync(abs)}\0`);
        else {
          h.update(`f ${r}\0`);
          h.update(fs.readFileSync(abs));
        }
      }
    };
    walk('');
    out[name] = h.digest('hex').slice(0, 16);
  }
  return out;
}

/** Content hash of each fixture, from the built fixtures folder. */
export function fixtureHashes() {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, '.hashes.json'), 'utf8'));
}

/** The hash a case's golden depends on: its fixture plus the shared inputs. */
export function caseFixtureHash(c, hashes = fixtureHashes()) {
  const names = [...new Set([c.fixture ?? 'app', 'inputs', ...(c.extraFixtures ?? [])])];
  return names.map(n => hashes[n] ?? 'missing').join('+');
}

export async function setup({force = false} = {}) {
  if (!force && fs.existsSync(path.join(FIXTURES, '.complete'))) return false;
  // Build beside the final folder, then rename it in: lanes share the box.
  const tmp = `${FIXTURES}.tmp-${process.pid}`;
  fs.rmSync(tmp, {recursive: true, force: true});
  const makers = fixtureList();
  if (fs.existsSync(EXTRA_FIXTURES)) {
    // Files starting with `_` are shared helpers, not fixtures.
    for (const f of fs.readdirSync(EXTRA_FIXTURES).filter(f => f.endsWith('.mjs') && !f.startsWith('_')).sort()) {
      const name = f.slice(0, -4);
      if (makers[name]) throw new Error(`fixture ${name} is defined twice`);
      makers[name] = (await import(path.join(EXTRA_FIXTURES, f))).default;
    }
  }
  const helpers = {copyPackage, installDeps, writeFile, writeJson, makeApp, makeIntegration, PKG, CORE_VERSION, REPO};
  for (const [name, make] of Object.entries(makers)) {
    const dir = path.join(tmp, name);
    fs.mkdirSync(dir, {recursive: true});
    await make(dir, helpers);
  }
  // Shared input files cases can pass as arguments (render, palette, theme build).
  const inputs = path.join(tmp, 'inputs');
  writeJson(path.join(inputs, 'palette.config.json'), JSON.parse(fs.readFileSync(path.join(PKG('themes/neutral'), 'palette.config.json'), 'utf8')));
  writeFile(path.join(inputs, 'not-json.json'), 'nope{');
  writeFile(path.join(inputs, 'page.tsx'), "import {Button} from '@astryxdesign/core';\n\nexport default function Page() {\n  return <Button label=\"Go\" />;\n}\n");
  writeJson(path.join(tmp, '.hashes.json'), fixtureContentHashes(tmp));
  writeFile(path.join(tmp, '.complete'), '');
  try {
    fs.renameSync(tmp, FIXTURES);
  } catch (e) {
    // Another lane finished the same build first.
    fs.rmSync(tmp, {recursive: true, force: true});
    if (!fs.existsSync(path.join(FIXTURES, '.complete'))) throw e;
  }
  return true;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const made = await setup({force: process.argv.includes('--force')});
  console.log(made ? `fixtures written to ${FIXTURES}` : `fixtures up to date at ${FIXTURES}`);
}
