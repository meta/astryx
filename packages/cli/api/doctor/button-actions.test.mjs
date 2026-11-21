// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Doctor's `button-actions` check in an app: it names each Core button
 * in the app's own source that does nothing when pressed, by file, line and
 * label; it leaves out test, story and fixture files; it follows a path
 * alias to the app's own code; and it passes when there is no such button,
 * naming how many source files it read.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {runChecks} from './doctor.mjs';

const SLOW = 60_000;

/** @type {string} */
let tmp;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-button-actions-'));
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

/** A module whose one component renders a button with no action. */
const HERO = [
  "import {Button} from '@astryxdesign/core';",
  'export default function Hero() {',
  '  return <Button label="Start" />;',
  '}',
  '',
].join('\n');

const MAIN = [
  "import {createRoot} from 'react-dom/client';",
  "import App from './App';",
  "createRoot(document.getElementById('root')!).render(<App />);",
  '',
].join('\n');

/**
 * The `button-actions` check of a run in an app on Core with these files.
 * @param {Record<string, string>} files path under the app → text
 */
async function buttonCheck(files) {
  const app = path.join(tmp, 'app');
  const all = {
    'package.json': JSON.stringify({name: 'app', private: true, dependencies: {'@astryxdesign/core': '*'}}),
    ...files,
  };
  for (const [rel, text] of Object.entries(all)) {
    const file = path.join(app, rel);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, text);
  }
  const report = await runChecks({cwd: app});
  return report.checks.find(check => check.id === 'button-actions');
}

/**
 * An App module that renders these lines in a VStack; the first is line 5.
 * @param {string[]} lines
 */
function app(...lines) {
  return [
    "import {Button} from '@astryxdesign/core';",
    "import {VStack} from '@astryxdesign/core/Layout';",
    'export default function App() {',
    '  return <VStack>',
    ...lines.map(line => `    ${line}`),
    '  </VStack>;',
    '}',
    '',
  ].join('\n');
}

describe('the button-actions check', () => {
  it(
    "does not judge a workspace member's buttons when the app imports the member by its package name",
    async () => {
      /**
       * @param {string} app the web app's App module
       * @param {boolean} [linked] whether the install linked the member
       * @param {Record<string, string>} [more] other files of the web app
       */
      const workspace = async (app, linked = true, more = {}) => {
        const root = fs.mkdtempSync(path.join(tmp, 'repo-'));
        const files = {
          'package.json': JSON.stringify({name: 'repo', private: true, workspaces: ['packages/*', 'apps/*'], dependencies: {'@astryxdesign/core': '*'}}),
          'packages/ui/package.json': JSON.stringify({name: '@acme/ui', main: 'src/Hero.tsx'}),
          'packages/ui/src/Hero.tsx': HERO,
          'apps/web/package.json': JSON.stringify({name: 'web', private: true, dependencies: {'@acme/ui': '*'}}),
          'apps/web/src/main.tsx': MAIN,
          'apps/web/src/App.tsx': app,
          ...Object.fromEntries(Object.entries(more).map(([rel, text]) => [`apps/web/${rel}`, text])),
        };
        for (const [rel, text] of Object.entries(files)) {
          const file = path.join(root, rel);
          fs.mkdirSync(path.dirname(file), {recursive: true});
          fs.writeFileSync(file, text);
        }
        if (linked) {
          fs.mkdirSync(path.join(root, 'node_modules/@acme'), {recursive: true});
          fs.symlinkSync(path.join(root, 'packages/ui'), path.join(root, 'node_modules/@acme/ui'), 'dir');
        }
        const report = await runChecks({cwd: root});
        return report.checks.find(check => check.id === 'button-actions');
      };
      // The app renders the member's Hero, under another name, inside a link.
      const imported = await workspace(
        ["import Banner from '@acme/ui';", 'export default function App() {', '  return <a href="/start"><Banner /></a>;', '}', ''].join('\n'),
      );
      expect(imported?.status).toBe('pass');
      // Before an install links it, the member is still the project's own package.
      const notInstalled = await workspace(
        ["import Banner from '@acme/ui';", 'export default function App() {', '  return <a href="/start"><Banner /></a>;', '}', ''].join('\n'),
        false,
      );
      expect(notInstalled?.status).toBe('pass');
      // An MDX page imports the member by its package name.
      const fromMdx = await workspace(['export default function App() {', '  return null;', '}', ''].join('\n'), true, {
        'src/pages/home.mdx': "import Banner from '@acme/ui';\n\n<a href=\"/start\"><Banner /></a>\n",
      });
      expect(fromMdx?.status).toBe('pass');
      // Nothing imports the member, so its Hero is a page, and its button does nothing.
      const alone = await workspace(['export default function App() {', '  return null;', '}', ''].join('\n'));
      expect(alone?.status).toBe('warn');
      expect(alone?.message).toContain('packages/ui/src/Hero.tsx');
    },
    SLOW,
  );

  it(
    'does not judge a component a module may load by a path the scan cannot read, or one an MDX or Astro page names',
    async () => {
      const page = (/** @type {string} */ body) => ['export default function App() {', `  ${body}`, '}', ''].join('\n');
      // Each case starts from an empty app folder.
      const fresh = (/** @type {Record<string, string>} */ files) => {
        fs.rmSync(path.join(tmp, 'app'), {recursive: true, force: true});
        return buttonCheck(files);
      };
      const loadedBy = async (/** @type {string} */ loader, /** @type {Record<string, string>} */ more = {}) =>
        fresh({
          'src/main.tsx': MAIN,
          'src/sections/Hero.tsx': HERO,
          'src/App.tsx': [loader, page('return null;')].join('\n'),
          ...more,
        });
      // Nothing loads Hero, so it is a page, and its button does nothing.
      expect((await loadedBy(''))?.status).toBe('warn');
      expect((await loadedBy("const sections = import.meta.glob('./sections/*.tsx');"))?.status).toBe('pass');
      expect((await loadedBy("import {lazy} from 'react';\nexport const load = (slug: string) => lazy(() => import(`./sections/${slug}`));"))?.status).toBe('pass');
      expect((await loadedBy("const sections = require.context('./sections', true, /\\.tsx$/);"))?.status).toBe('pass');
      expect((await loadedBy("const pick = (name: string) => import(name);"))?.status).toBe('pass');
      const renamed = await fresh({
        'src/main.tsx': MAIN,
        'src/sections/Hero.tsx': HERO,
        'src/App.tsx': ["const Banner = require('./sections/Hero').default;", page('return <a href="/start"><Banner /></a>;')].join('\n'),
      });
      expect(renamed?.status).toBe('pass');
      // A load from one folder leaves the modules of another folder judged.
      const elsewhere = await loadedBy("const sections = import.meta.glob('./sections/*.tsx');", {
        'src/other/Promo.tsx': HERO.replace('function Hero', 'function Promo'),
      });
      expect(elsewhere?.status).toBe('warn');
      expect(elsewhere?.message).toContain('src/other/Promo.tsx');
      expect(elsewhere?.message).not.toContain('src/sections/Hero.tsx');
      // An Astro or MDX page, and a module that does not parse, are read for
      // their loads as text.
      const astroGlob = await loadedBy('', {'src/pages/index.astro': "---\nconst sections = import.meta.glob('../sections/*.tsx');\n---\n<a href=\"/start\">{Object.keys(sections)}</a>\n"});
      expect(astroGlob?.status).toBe('pass');
      const unparsed = await loadedBy('', {'src/loader.ts': "@register\nclass Loader {}\nexport const load = (slug: string) => import(`./sections/${slug}`);\n"});
      expect(unparsed?.status).toBe('pass');
      // A root glob starts in the project folder; a glob of data files loads
      // no component.
      const rootGlob = await loadedBy("const sections = import.meta.glob('/src/sections/*.tsx');", {
        'src/other/Promo.tsx': HERO.replace('function Hero', 'function Promo'),
      });
      expect(rootGlob?.message).toContain('src/other/Promo.tsx');
      expect(rootGlob?.message).not.toContain('src/sections/Hero.tsx');
      expect((await loadedBy("const strings = import.meta.glob('/src/sections/*.json');"))?.status).toBe('warn');
      // A barrel in another folder that passes the component on, loaded by a glob.
      const barrel = await fresh({
        'src/main.tsx': MAIN,
        'src/components/Hero.tsx': HERO.replace('export default function Hero', 'export function Hero'),
        'src/demos/hero.ts': "export {Hero} from '../components/Hero';\n",
        'src/App.tsx': [
          "const demos = import.meta.glob('./demos/*.ts', {eager: true});",
          'export default function App() {',
          '  return <a href="/start">{Object.values(demos).flatMap(m => Object.values(m)).map(C => <C key="c" />)}</a>;',
          '}',
          '',
        ].join('\n'),
      });
      expect(barrel?.status).toBe('pass');
      // A TypeScript import of a module by `require`.
      const importEquals = await fresh({
        'src/main.tsx': MAIN,
        'src/sections/Hero.tsx': HERO,
        'src/App.tsx': ["import Banner = require('./sections/Hero');", page('return <a href="/start"><Banner.default /></a>;')].join('\n'),
      });
      expect(importEquals?.status).toBe('pass');
      // A root path in a template literal starts in the project folder.
      const rootTemplate = await loadedBy('', {
        'src/lib/load.ts': 'export const load = (slug: string) => import(`/src/sections/${slug}`);\n',
        'src/other/Promo.tsx': HERO.replace('function Hero', 'function Promo'),
      });
      expect(rootTemplate?.message).toContain('src/other/Promo.tsx');
      expect(rootTemplate?.message).not.toContain('src/sections/Hero.tsx');
      // A path joined with `+` starts in the folder its first part names.
      expect((await loadedBy('', {'src/lib/load.ts': "export const load = (name: string) => import('../sections/' + name);\n"}))?.status).toBe('pass');
      // An app module named like a config file is the app's own code.
      expect((await loadedBy('', {'src/sections.config.ts': "export const sections = import.meta.glob('./sections/*.tsx', {eager: true});\n"}))?.status).toBe('pass');
      // A tool's config file loads its settings, never a component.
      const config = await loadedBy('', {'next.config.js': "const path = require('node:path');\nmodule.exports = require(path.join(__dirname, 'cfg.cjs'));\n"});
      expect(config?.status).toBe('warn');
      // A build script that loads by a computed path holds back only its own folder.
      const script = await loadedBy('', {'scripts/build.cjs': "const path = require('node:path');\nmodule.exports = require(path.join(__dirname, 'cfg.cjs'));\n"});
      expect(script?.status).toBe('warn');
      // An MDX or Astro page that names the component may render it.
      const mdx = await loadedBy('', {'src/pages/home.mdx': "import Hero from '../sections/Hero';\n\n<a href=\"/start\"><Hero /></a>\n"});
      expect(mdx?.status).toBe('pass');
      const astro = await loadedBy('', {'src/pages/index.astro': "---\nimport Hero from '../sections/Hero';\n---\n<a href=\"/start\"><Hero client:load /></a>\n"});
      expect(astro?.status).toBe('pass');
    },
    SLOW,
  );

  it(
    'follows a module that imports a component and exports it again, and a nested component passed as a value',
    async () => {
      const fresh = (/** @type {Record<string, string>} */ files) => {
        fs.rmSync(path.join(tmp, 'app'), {recursive: true, force: true});
        return buttonCheck({'src/main.tsx': MAIN, ...files});
      };
      const named = HERO.replace('export default function Hero', 'export function Hero');
      const viaLazy = await fresh({
        'src/Hero.tsx': named,
        'src/sections.ts': "import {Hero} from './Hero';\nexport {Hero};\n",
        'src/App.tsx': [
          "import {lazy} from 'react';",
          "const Lazy = lazy(() => import('./sections').then(m => ({default: m.Hero})));",
          'export default function App() {',
          '  return <a href="/start"><Lazy /></a>;',
          '}',
          '',
        ].join('\n'),
      });
      expect(viaLazy?.status).toBe('pass');
      const viaNamespace = await fresh({
        'src/Hero.tsx': named,
        'src/sections.ts': "import {Hero} from './Hero';\nexport {Hero};\n",
        'src/App.tsx': [
          "import * as S from './sections';",
          'export default function App() {',
          '  return <a href="/start">{Object.values(S).map(C => <C key="c" />)}</a>;',
          '}',
          '',
        ].join('\n'),
      });
      expect(viaNamespace?.status).toBe('pass');
      const nested = await fresh({
        'src/App.tsx': [
          "import {Button} from '@astryxdesign/core';",
          'export default function App() {',
          '  function Row() {',
          '    return <Button label="Open" />;',
          '  }',
          '  return <><Row /><a href="/start">{[1].map(Row)}</a></>;',
          '}',
          '',
        ].join('\n'),
      });
      expect(nested?.status).toBe('pass');
    },
    SLOW,
  );

  it(
    'reads `.` and `..` as the folder they name, a route in a folder named build, and a linked folder',
    async () => {
      const fresh = (/** @type {Record<string, string>} */ files) => {
        fs.rmSync(path.join(tmp, 'app'), {recursive: true, force: true});
        return buttonCheck({'src/main.tsx': MAIN, ...files});
      };
      const named = HERO.replace('export default function Hero', 'export function Hero');
      const parent = await fresh({
        'src/sections/Hero.tsx': named,
        'src/sections/index.ts': "export {Hero} from './Hero';\n",
        'src/sections/list/List.tsx': [
          "import * as Sections from '..';",
          'export default function List() {',
          '  return <>{Object.values(Sections).map(C => <a key="c" href="/x"><C /></a>)}</>;',
          '}',
          '',
        ].join('\n'),
        'src/App.tsx': ["import List from './sections/list/List';", 'export default function App() {', '  return <List />;', '}', ''].join('\n'),
      });
      expect(parent?.status).toBe('pass');
      const own = await fresh({
        'src/sections/Hero.tsx': named,
        'src/sections/index.ts': "export {Hero} from './Hero';\n",
        'src/sections/Lazy.tsx': [
          "import {lazy} from 'react';",
          "const Lazy = lazy(() => import('.').then(m => ({default: m.Hero})));",
          'export default function Page() {',
          '  return <a href="/x"><Lazy /></a>;',
          '}',
          '',
        ].join('\n'),
        'src/App.tsx': ["import Page from './sections/Lazy';", 'export default function App() {', '  return <Page />;', '}', ''].join('\n'),
      });
      expect(own?.status).toBe('pass');
      // An app route in a folder named build is the app's own code.
      const route = await fresh({
        'src/components/PlanCard.tsx': named.replace(/Hero/g, 'PlanCard'),
        'src/app/build/page.tsx': [
          "import {PlanCard} from '../../components/PlanCard';",
          'export default function Page() {',
          '  return <a href="/checkout"><PlanCard /></a>;',
          '}',
          '',
        ].join('\n'),
        'src/App.tsx': ['export default function App() {', '  return null;', '}', ''].join('\n'),
      });
      expect(route?.status).toBe('pass');
      // A linked folder the walk does not follow may render any component.
      const outside = fs.mkdtempSync(path.join(tmp, 'outside-'));
      fs.writeFileSync(path.join(outside, 'Shell.tsx'), "import Hero from '../app/src/sections/Hero';\nexport const Shell = () => <a href=\"/x\"><Hero /></a>;\n");
      const linkedApp = await (async () => {
        fs.rmSync(path.join(tmp, 'app'), {recursive: true, force: true});
        fs.mkdirSync(path.join(tmp, 'app', 'src'), {recursive: true});
        fs.symlinkSync(outside, path.join(tmp, 'app', 'src', 'shell'), 'dir');
        return buttonCheck({'src/main.tsx': MAIN, 'src/sections/Hero.tsx': HERO, 'src/App.tsx': ['export default function App() {', '  return null;', '}', ''].join('\n')});
      })();
      expect(linkedApp?.status).toBe('pass');
      // Without the link, Hero is a page, and its button does nothing.
      const unlinked = await fresh({'src/sections/Hero.tsx': HERO, 'src/App.tsx': ['export default function App() {', '  return null;', '}', ''].join('\n')});
      expect(unlinked?.status).toBe('warn');
    },
    SLOW,
  );

  it(
    'follows a path alias or package.json imports key to the module it names',
    async () => {
      const fresh = (/** @type {Record<string, string>} */ files) => {
        fs.rmSync(path.join(tmp, 'app'), {recursive: true, force: true});
        return buttonCheck({'src/main.tsx': MAIN, ...files});
      };
      const named = HERO.replace('export default function Hero', 'export function Hero');
      const viaAlias = await fresh({
        'tsconfig.json': JSON.stringify({compilerOptions: {jsx: 'react-jsx', baseUrl: '.', paths: {'@components': ['./src/components']}}}),
        'src/components/Hero.tsx': named,
        'src/components/index.ts': "export {Hero} from './Hero';\n",
        'src/App.tsx': [
          "import * as C from '@components';",
          'export default function App() {',
          '  return <a href="/start">{Object.values(C).map(Each => <Each key="e" />)}</a>;',
          '}',
          '',
        ].join('\n'),
      });
      expect(viaAlias?.status).toBe('pass');
      const viaImports = await fresh({
        'package.json': JSON.stringify({name: 'app', private: true, imports: {'#hero': './src/Hero.tsx'}, dependencies: {'@astryxdesign/core': '*'}}),
        'src/Hero.tsx': HERO,
        'src/App.tsx': ["import Banner from '#hero';", 'export default function App() {', '  return <a href="/start"><Banner /></a>;', '}', ''].join('\n'),
      });
      expect(viaImports?.status).toBe('pass');
      // A fallback list as the key's target.
      const viaFallback = await fresh({
        'package.json': JSON.stringify({name: 'app', private: true, imports: {'#hero': ['./src/Hero.tsx']}, dependencies: {'@astryxdesign/core': '*'}}),
        'src/Hero.tsx': HERO,
        'src/App.tsx': ["import Banner from '#hero';", 'export default function App() {', '  return <a href="/start"><Banner /></a>;', '}', ''].join('\n'),
      });
      expect(viaFallback?.status).toBe('pass');
      // A route's page renders where its Routes sit, inside what the app renders around them.
      const HOME = ["import {Button} from '@astryxdesign/core';", 'export default function Home() {', '  return <Button label="Start" />;', '}', ''].join('\n');
      const routes = (/** @type {string} */ around) =>
        [
          "import {createRoot} from 'react-dom/client';",
          "import {BrowserRouter, Routes, Route} from 'react-router-dom';",
          "import {Shell} from './Shell';",
          "import {Layout} from './Layout';",
          "import Home from './Home';",
          `createRoot(document.getElementById('root')!).render(<BrowserRouter>${around}</BrowserRouter>);`,
          '',
        ].join('\n');
      const extras = {
        'src/Home.tsx': HOME,
        'src/Shell.tsx': "export function Shell({children}: {children: unknown}) {\n  return <div onClick={() => close()}>{children}</div>;\n}\n",
        'src/Layout.tsx': "import {Outlet} from 'react-router-dom';\nexport function Layout() {\n  return <main onClick={() => close()}><Outlet /></main>;\n}\n",
      };
      const inShell = await fresh({...extras, 'src/main.tsx': routes('<Shell><Routes><Route path="/" element={<Home />} /></Routes></Shell>')});
      expect(inShell?.status).toBe('pass');
      const inLayout = await fresh({...extras, 'src/main.tsx': routes('<Routes><Route element={<Layout />}><Route path="/" element={<Home />} /></Route></Routes>')});
      expect(inLayout?.status).toBe('pass');
      const inComponent = await fresh({...extras, 'src/main.tsx': routes('<Routes><Route Component={Layout}><Route path="/" element={<Home />} /></Route></Routes>')});
      expect(inComponent?.status).toBe('pass');
      const routed = await fresh({...extras, 'src/main.tsx': routes('<Routes><Route path="/"><Route index element={<Home />} /></Route></Routes>')});
      expect(routed?.status).toBe('warn');
      expect(routed?.message).toContain('src/Home.tsx:3 "Start"');
      // `S.default` off the app's own namespace import is that module's component.
      const viaNamespace = await fresh({
        'src/Hero.tsx': HERO,
        'src/App.tsx': ["import * as S from './Hero';", 'export default function App() {', '  return <a href="/start"><S.default /></a>;', '}', ''].join('\n'),
      });
      expect(viaNamespace?.status).toBe('pass');
      // A script that listens for a press through the DOM may act on the button.
      const delegated = await fresh({
        'src/App.tsx': app('<Button label="Start" />'),
        'src/delegate.ts': "document.getElementById('root')?.addEventListener('click', event => {\n  void event;\n});\n",
      });
      expect(delegated?.status).toBe('info');
      expect(delegated?.message).toBe('Not checked: `src/delegate.ts` may listen for a press through the DOM, so a script may act on a button in a way doctor cannot read.');
      const keys = await fresh({
        'src/App.tsx': app('<Button label="Start" />'),
        'src/keys.ts': "document.addEventListener('keydown', event => {\n  void event;\n});\n",
      });
      expect(keys?.status).toBe('warn');
      // An event named by a variable, as a helper or a list of names gives it.
      const helper = await fresh({
        'src/App.tsx': app('<Button label="Start" />'),
        'src/listen.ts': 'export function listen(type: string, handler: () => void) {\n  window.addEventListener(type, handler);\n}\n',
      });
      expect(helper?.status).toBe('info');
      const list = await fresh({
        'src/App.tsx': app('<Button label="Start" />'),
        'src/listen.ts': "for (const type of ['click', 'keydown']) {\n  document.addEventListener(type, () => {});\n}\n",
      });
      expect(list?.status).toBe('info');
      const template = await fresh({
        'src/App.tsx': app('<Button label="Start" />'),
        'src/listen.ts': "const kind = 'click';\ndocument.addEventListener(`${kind}`, () => {});\n",
      });
      expect(template?.status).toBe('info');
      for (const listen of [
        "document.addEventListener?.('click', () => {});",
        "document.addEventListener ('click', () => {});",
        "EventTarget.prototype.addEventListener.call(document, 'click', () => {});",
        "$(document).on('click', 'button', () => {});",
      ]) {
        const spelled = await fresh({'src/App.tsx': app('<Button label="Start" />'), 'src/listen.ts': `${listen}\n`});
        expect(spelled?.status, listen).toBe('info');
      }
      // A wrapper whose content a page passes in, such as a link.
      const wrapper = await fresh({
        'src/CTA.tsx': ["import {Button} from '@astryxdesign/core';", 'export function CTA({children}: {children: unknown}) {', '  return <Button label="Start" variant="primary">{children}</Button>;', '}', ''].join('\n'),
        'src/App.tsx': ["import {CTA} from './CTA';", 'export default function App() {', '  return <CTA><a href="/start">Start</a></CTA>;', '}', ''].join('\n'),
      });
      expect(wrapper?.status).toBe('pass');
    },
    SLOW,
  );

  it(
    'names each button that does nothing, by file, line and label',
    async () => {
      const check = await buttonCheck({
        'src/main.tsx': MAIN,
        'src/App.tsx': app(
          '<Button label="Try it" />',
          '<Button label="Save" onClick={() => save()} />',
          '<Button label="Start" href="#" />',
          '<Button label="Undo" onClick={() => {}} />',
          '<IconButton label={title} icon="x" />',
        ).replace("import {Button} from", "import {Button, IconButton} from"),
        'src/App.test.tsx': app('<Button label="In a test" />'),
        'src/App.stories.tsx': app('<Button label="In a story" />'),
        'src/App.cy.tsx': app('<Button label="In a Cypress test" />'),
        'src/App.fixture.tsx': app('<Button label="In a fixture file" />'),
        'src/__fixtures__/Demo.tsx': app('<Button label="In a fixture" />'),
        'tests/host.tsx': app('<Button label="In a test folder" />'),
      });
      expect(check).toEqual({
        id: 'button-actions',
        label: 'Button actions',
        status: 'warn',
        message:
          '4 buttons do nothing when pressed: src/App.tsx:5 "Try it", src/App.tsx:7 "Start" (placeholder link: replace `#` with a real href), src/App.tsx:8 "Undo" (empty onClick), src/App.tsx:9 IconButton.',
        fix: 'Give each one an action: `onClick` (or `clickAction` for async work), a real `href` in place of a placeholder, or `type="submit"` inside a form. If it has no action yet, disable it with `isDisabled` or remove it: an empty handler still does nothing.',
      });
    },
    SLOW,
  );

  it(
    'passes when every button acts, and names the files it read',
    async () => {
      const check = await buttonCheck({
        'src/main.tsx': MAIN,
        'src/App.tsx': app('<Button label="Save" onClick={() => save()} />'),
      });
      expect(check).toMatchObject({
        status: 'pass',
        message: 'No Astryx button that does nothing when pressed (2 source files read).',
      });
    },
    SLOW,
  );

  it(
    'names at most eight buttons, then counts the rest',
    async () => {
      const buttons = Array.from({length: 10}, (_, i) => `<Button label="B${i}" />`);
      const check = await buttonCheck({'src/main.tsx': MAIN, 'src/App.tsx': app(...buttons)});
      expect(check?.message).toBe(
        `10 buttons do nothing when pressed: ${buttons
          .slice(0, 8)
          .map((_, i) => `src/App.tsx:${5 + i} "B${i}"`)
          .join(', ')}, and 2 more.`,
      );
    },
    SLOW,
  );

  it(
    'a # link goes somewhere in an app that routes by the hash',
    async () => {
      const check = await buttonCheck({
        'src/main.tsx': MAIN.replace("import App from './App';", "import App from './App';\nimport {HashRouter} from 'react-router-dom';"),
        'src/App.tsx': app('<Button label="Home" href="#" />'),
      });
      expect(check?.status).toBe('pass');
      const history = await buttonCheck({
        'src/main.tsx': MAIN.replace("import App from './App';", "import App from './App';\nimport {createHashHistory} from '@tanstack/react-router';"),
        'src/App.tsx': app('<Button label="Home" href="#" />'),
      });
      expect(history?.status).toBe('pass');
      const namespace = await buttonCheck({
        // The router is read from a namespace import, and nothing wraps App in it.
        'src/main.tsx': MAIN.replace("import App from './App';", "import App from './App';\nimport * as RR from 'react-router-dom';\nexport const router = RR.createHashRouter([]);"),
        'src/App.tsx': app('<Button label="Home" href="#" />'),
      });
      expect(namespace?.status).toBe('pass');
      // An app that listens for the hash to change itself routes by the hash.
      const listener = await buttonCheck({
        'src/main.tsx': MAIN.replace("import App from './App';", "import App from './App';\nwindow.addEventListener('hashchange', () => {});"),
        'src/App.tsx': app('<Button label="Home" href="#" />'),
      });
      expect(listener?.status).toBe('pass');
      const handler = await buttonCheck({
        'src/main.tsx': MAIN.replace("import App from './App';", "import App from './App';\nwindow.onhashchange = () => {};"),
        'src/App.tsx': app('<Button label="Home" href="#" />'),
      });
      expect(handler?.status).toBe('pass');
      const wouter = await buttonCheck({
        'src/main.tsx': MAIN.replace("import App from './App';", "import App from './App';\nimport {useHashLocation} from 'wouter/use-hash-location';\nexport const hook = useHashLocation;"),
        'src/App.tsx': app('<Button label="Home" href="#" />'),
      });
      expect(wouter?.status).toBe('pass');
      // A name in a comment is not an import of a hash router, nor is an import
      // that is commented out.
      const comment = await buttonCheck({
        'src/main.tsx': MAIN.replace("import App from './App';", "import App from './App';\n// No HashRouter here.\n// import {HashRouter} from 'react-router-dom';"),
        'src/App.tsx': app('<Button label="Home" href="#" />'),
      });
      expect(comment?.status).toBe('warn');
      // A module that does not parse and names a hash router may use it (last:
      // its file stays in the app folder).
      const unparsed = await buttonCheck({
        'src/main.tsx': MAIN,
        'src/router.ts': "import {HashRouter} from 'react-router-dom';\n@register\nclass Routes {}\nexport {HashRouter};\n",
        'src/App.tsx': app('<Button label="Home" href="#" />'),
      });
      expect(unparsed?.status).toBe('pass');
    },
    SLOW,
  );

  it(
    'a module that names the component but cannot be read may render it anywhere',
    async () => {
      const check = await buttonCheck({
        'src/main.tsx': MAIN,
        'src/sections.tsx': ["import {Hero} from './Hero';", '@register', 'class Sections {}', 'export const sections = [Hero];', ''].join('\n'),
        'src/App.tsx': [
          "import {sections} from './sections';",
          'export default function App() {',
          '  return <a href="/start">{sections.map(S => <S key="s" />)}</a>;',
          '}',
          '',
        ].join('\n'),
        'src/Hero.tsx': HERO.replace('export default function Hero', 'export function Hero'),
      });
      expect(check?.status).toBe('pass');
    },
    SLOW,
  );

  it(
    'a .ts module is read as TypeScript, so its type assertions do not stop the scan',
    async () => {
      const check = await buttonCheck({
        'src/main.tsx': MAIN,
        'src/sections.ts': ["import {Hero} from './Hero';", "export const root = <HTMLElement>document.getElementById('root');", 'export {Hero};', ''].join('\n'),
        'src/App.tsx': ["import {Hero} from './sections';", 'export default function App() {', '  return <main><Hero /></main>;', '}', ''].join('\n'),
        'src/Hero.tsx': HERO.replace('export default function Hero', 'export function Hero'),
      });
      expect(check?.message).toBe('1 button does nothing when pressed: src/Hero.tsx:3 "Start".');
    },
    SLOW,
  );

  it(
    'a file in a test folder counts for where it renders a component, and none of its buttons is reported',
    async () => {
      const check = await buttonCheck({
        'src/main.tsx': MAIN,
        'src/App.tsx': app('<Button label="Try it" onClick={() => go()} />'),
        'src/Hero.tsx': app('<Button label="Start" />').replace('export default function App', 'export function Hero'),
        'src/pages/test/Wrap.tsx': [
          "import {Hero} from '../../Hero';",
          'export default function Wrap() {',
          '  return <a href="/start"><Hero /></a>;',
          '}',
          '',
        ].join('\n'),
        'src/pages/test/Page.tsx': app('<Button label="Demo" />'),
      });
      expect(check?.status).toBe('pass');
    },
    SLOW,
  );

  it(
    'follows a package.json subpath import to the app\'s own code',
    async () => {
      const files = (/** @type {string} */ body) => ({
        'package.json': JSON.stringify({
          name: 'app',
          private: true,
          imports: {'#components/*': './src/components/*.tsx'},
          dependencies: {'@astryxdesign/core': '*'},
        }),
        'src/main.tsx': MAIN,
        'src/App.tsx': ["import Hero from '#components/Hero';", 'export default function App() {', `  return ${body};`, '}', ''].join('\n'),
        'src/components/Hero.tsx': HERO,
      });
      expect((await buttonCheck(files('<a href="/start"><Hero /></a>')))?.status).toBe('pass');
      expect((await buttonCheck(files('<main><Hero /></main>')))?.message).toBe(
        '1 button does nothing when pressed: src/components/Hero.tsx:3 "Start".',
      );
    },
    SLOW,
  );

  it(
    'a component imported through an alias only the bundler knows is not reported',
    async () => {
      const check = await buttonCheck({
        'vite.config.ts': "export default {resolve: {alias: {'~': '/src'}}};\n",
        'src/main.tsx': MAIN,
        'src/App.tsx': ["import Hero from '~/Hero';", 'export default function App() {', '  return <a href="/start"><Hero /></a>;', '}', ''].join('\n'),
        'src/Hero.tsx': HERO,
      });
      expect(check?.status).toBe('pass');
    },
    SLOW,
  );

  it(
    "a component imported by the app's own package name is not reported",
    async () => {
      const files = {
        'package.json': JSON.stringify({
          name: 'app',
          private: true,
          exports: {'./components/*': './src/components/*.tsx'},
          dependencies: {'@astryxdesign/core': '*'},
        }),
        'src/main.tsx': MAIN,
        'src/App.tsx': ["import Hero from 'app/components/Hero';", 'export default function App() {', '  return <a href="/start"><Hero /></a>;', '}', ''].join('\n'),
        'src/components/Hero.tsx': HERO,
      };
      expect((await buttonCheck(files))?.status).toBe('pass');
      // A workspace can also install the app under its own name.
      fs.mkdirSync(path.join(tmp, 'node_modules'));
      fs.symlinkSync(path.join(tmp, 'app'), path.join(tmp, 'node_modules', 'app'), 'dir');
      expect((await buttonCheck(files))?.status).toBe('pass');
    },
    SLOW,
  );

  it(
    'a component loaded through lazy inside a link is not reported',
    async () => {
      const check = await buttonCheck({
        'src/main.tsx': MAIN,
        'src/App.tsx': [
          "import {lazy} from 'react';",
          "const Hero = lazy(() => import('./Hero'));",
          'export default function App() {',
          '  return <a href="/start"><Hero /></a>;',
          '}',
          '',
        ].join('\n'),
        'src/Hero.tsx': app('<Button label="Start" />').replace('export default function App', 'export default function Hero'),
      });
      expect(check?.status).toBe('pass');
    },
    SLOW,
  );

  it(
    "follows a path alias to the app's own code",
    async () => {
      const files = {
        'tsconfig.json': JSON.stringify({compilerOptions: {baseUrl: '.', paths: {'@/*': ['./src/*']}}}),
        'src/main.tsx': MAIN,
        'src/Hero.tsx': "import {Button} from '@astryxdesign/core';\nexport function Hero() {\n  return <Button label=\"Start\" />;\n}\n",
      };
      const inLink = await buttonCheck({
        ...files,
        'src/App.tsx': "import {Hero} from '@/Hero';\nexport default function App() {\n  return <a href=\"/start\"><Hero /></a>;\n}\n",
      });
      expect(inLink?.status).toBe('pass');
      const open = await buttonCheck({
        ...files,
        'src/App.tsx': "import {Hero} from '@/Hero';\nexport default function App() {\n  return <main><Hero /></main>;\n}\n",
      });
      expect(open?.message).toBe('1 button does nothing when pressed: src/Hero.tsx:3 "Start".');
    },
    SLOW,
  );
});
