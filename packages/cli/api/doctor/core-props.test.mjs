// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Doctor's `core-props` check in an app on the repository's own Core:
 * it names each prop the app gives a Core component that the component does
 * not take, with a documented prop that has the same words; it does not
 * report an HTML or ARIA attribute, a prop Core's types take that its docs
 * leave out, a generic component's props, another component's props, or a
 * test file's; and without TypeScript it says it did not run.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {runChecks} from './doctor.mjs';

const SLOW = 120_000;
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

/** @type {string} */
let tmp;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-core-props-'));
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

/**
 * Link a package into the app's node_modules.
 * @param {string} app
 * @param {string} name
 * @param {string} target
 */
function link(app, name, target) {
  const at = path.join(app, 'node_modules', ...name.split('/'));
  fs.mkdirSync(path.dirname(at), {recursive: true});
  fs.symlinkSync(fs.realpathSync(target), at, 'dir');
}

/**
 * The `core-props` check of a run in an app on the repository's Core, with
 * these files, and the project's TypeScript unless `typescript` is false.
 * @param {Record<string, string>} files path under the app → text
 * @param {{typescript?: boolean}} [options]
 */
async function propsCheck(files, {typescript = true} = {}) {
  const app = fs.mkdtempSync(path.join(tmp, 'app-'));
  const all = {
    'package.json': JSON.stringify({name: 'app', private: true, dependencies: {'@astryxdesign/core': '*', react: '*'}}),
    ...files,
  };
  for (const [rel, text] of Object.entries(all)) {
    const file = path.join(app, rel);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, text);
  }
  link(app, '@astryxdesign/core', path.join(REPO, 'packages', 'core'));
  link(app, '@types/react', path.join(REPO, 'node_modules', '@types', 'react'));
  if (typescript) link(app, 'typescript', path.join(REPO, 'node_modules', 'typescript'));
  const report = await runChecks({cwd: app});
  return report.checks.find(check => check.id === 'core-props');
}

/**
 * An App module that imports these Core components and renders these lines;
 * the first line is line 5.
 * @param {string} names
 * @param {string[]} lines
 */
function app(names, ...lines) {
  return [
    `import {${names}} from '@astryxdesign/core';`,
    "import {VStack} from '@astryxdesign/core/Layout';",
    'export default function App() {',
    '  return <VStack>',
    ...lines.map(line => `    ${line}`),
    '  </VStack>;',
    '}',
    '',
  ].join('\n');
}

describe('doctor core-props', () => {
  it(
    "reads each page with the Core it finds and its config's paths, and a workspace root's build config",
    async () => {
      const root = fs.mkdtempSync(path.join(tmp, 'workspace-'));
      const write = (/** @type {Record<string, string>} */ files) => {
        for (const [rel, text] of Object.entries(files)) {
          const file = path.join(root, rel);
          fs.mkdirSync(path.dirname(file), {recursive: true});
          fs.writeFileSync(file, text);
        }
      };
      write({
        // The root declares Core, as a workspace root that builds its members
        // does, and installs none of its own.
        'package.json': JSON.stringify({name: 'repo', private: true, workspaces: ['apps/*'], dependencies: {'@astryxdesign/core': '*'}}),
        'apps/web/package.json': JSON.stringify({name: 'web', private: true, dependencies: {'@astryxdesign/core': '*', react: '*'}}),
        'apps/web/src/App.tsx': app('TabList', '<TabList selectedID="a" />'),
      });
      // Core is installed only in the member: the member's page reads it.
      const member = path.join(root, 'apps/web');
      link(member, '@astryxdesign/core', path.join(REPO, 'packages', 'core'));
      link(member, '@types/react', path.join(REPO, 'node_modules', '@types', 'react'));
      link(root, 'typescript', path.join(REPO, 'node_modules', 'typescript'));
      const check = async (/** @type {string} */ cwd) => (await runChecks({cwd})).checks.find(each => each.id === 'core-props');
      const fromRoot = await check(root);
      expect(fromRoot?.status).toBe('warn');
      expect(fromRoot?.message).toContain('apps/web/src/App.tsx:5 TabList has no `selectedID`');
      // A config that maps Core's module path to the app's own copy.
      write({
        'apps/web/tsconfig.json': JSON.stringify({compilerOptions: {jsx: 'react-jsx', baseUrl: '.', paths: {'@astryxdesign/core': ['./src/astryx/index.ts']}}}),
        'apps/web/src/astryx/index.ts': "export {TabList} from './TabList';\n",
        'apps/web/src/astryx/TabList.tsx': 'export function TabList(props: {selectedID?: string}) {\n  return null;\n}\n',
      });
      expect((await check(member))?.status).toBe('pass');
      fs.rmSync(path.join(member, 'tsconfig.json'));
      // A workspace root's Babel config that sets emotion's runtime.
      write({
        'babel.config.js': "module.exports = {presets: [['@babel/preset-react', {runtime: 'automatic', importSource: '@emotion/react'}]]};\n",
      });
      const rootBabel = await check(member);
      expect(rootBabel?.status).toBe('info');
      expect(rootBabel?.message).toMatch(/^Not checked: the build config `\.\.\/\.\.\/babel\.config\.js` sets another JSX runtime/);
      fs.rmSync(path.join(root, 'babel.config.js'));
      // A theme package the member installs that adds the prop to Core's
      // types, read when doctor runs from the workspace root.
      write({
        'apps/web/package.json': JSON.stringify({name: 'web', private: true, dependencies: {'@astryxdesign/core': '*', react: '*', '@acme/theme': '*'}}),
        'apps/web/node_modules/@acme/theme/package.json': JSON.stringify({name: '@acme/theme', types: 'index.d.ts', dependencies: {'@astryxdesign/core': '*'}}),
        'apps/web/node_modules/@acme/theme/index.d.ts': "import '@astryxdesign/core';\ndeclare module '@astryxdesign/core' {\n  interface TabListProps {\n    selectedID?: string;\n  }\n}\n",
      });
      expect((await check(root))?.status).toBe('pass');
      // A css-prop transform installed only in the member, read from the root.
      write({'apps/web/node_modules/babel-plugin-styled-components/package.json': JSON.stringify({name: 'babel-plugin-styled-components', version: '2.0.0'})});
      const memberTransform = await check(root);
      expect(memberTransform?.status).toBe('info');
      expect(memberTransform?.message).toMatch(/^Not checked: `babel-plugin-styled-components` is installed/);
    },
    SLOW,
  );

  it(
    'reads a component from the module path the page imports it from, and says it did not run without an installed Core',
    async () => {
      const subpath = await propsCheck({
        'src/App.tsx': ["import {ToastViewport} from '@astryxdesign/core/Toast';", 'export default function App() {', '  return <ToastViewport placementGap="x" />;', '}', ''].join('\n'),
      });
      expect(subpath?.status).toBe('warn');
      expect(subpath?.message).toContain('ToastViewport has no `placementGap`');
      // A page imports Core, gives it no prop, and finds no installed Core.
      const app = fs.mkdtempSync(path.join(tmp, 'no-core-'));
      fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({name: 'app', private: true, dependencies: {'@astryxdesign/core': '*', react: '*'}}));
      fs.mkdirSync(path.join(app, 'src'));
      fs.writeFileSync(path.join(app, 'src/App.tsx'), ["import {Divider} from '@astryxdesign/core';", 'export default function App() {', '  return <Divider />;', '}', ''].join('\n'));
      link(app, 'typescript', path.join(REPO, 'node_modules', 'typescript'));
      const noCore = (await runChecks({cwd: app})).checks.find(each => each.id === 'core-props');
      expect(noCore?.status).toBe('info');
      expect(noCore?.message).toMatch(/^Not checked: Core is not installed where the pages that import it can find it/);
    },
    SLOW,
  );

  it(
    'names each prop a Core component does not take, with a documented prop that has the same words',
    async () => {
      const check = await propsCheck({
        'src/App.tsx': app(
          'TabList, Tab, CheckboxInput',
          '<TabList selectedID="a" onChange={() => {}} value="a"><Tab value="a" label="A" /></TabList>',
          '<CheckboxInput label="Pick" labelHidden value={false} onChange={() => {}} />',
        ),
      });
      expect(check?.status).toBe('warn');
      expect(check?.message).toBe(
        '2 props a Core component does not take: src/App.tsx:5 TabList has no `selectedID`, src/App.tsx:6 CheckboxInput has no `labelHidden` (did you mean `isLabelHidden`?).',
      );
      expect(check?.fix).toBe(
        'Give each component a prop it takes: `astryx component <Name>` lists them. A prop the component does not take does nothing.',
      );
      // Past eight props, the warning counts the rest.
      const many = await propsCheck({
        'src/App.tsx': app('TabList', `<TabList ${Array.from({length: 9}, (_, i) => `unknownSetting${i}="x"`).join(' ')} />`),
      });
      expect(many?.message).toMatch(/^9 props a Core component does not take: /);
      expect(many?.message.match(/ has no `/g)).toHaveLength(8);
      expect(many?.message).toMatch(/, and 1 more\.$/);
    },
    SLOW,
  );

  it(
    'does not report what a component can take or pass on, or what it cannot judge',
    async () => {
      const check = await propsCheck({
        'src/App.tsx': app(
          'Button, Badge, Selector, TimeInput',
          // HTML and ARIA attributes, which a component can pass on to what it renders.
          '<Button label="Go" title="Tip" onSelect={() => {}} aria-describedby="x" data-id="1" />',
          '<Badge label="New" color="red" />',
          // A prop Core\'s types take that its docs do not list.
          '<TimeInput label="When" hasAutoFocus />',
          // A generic component, whose props may come from what the page gives it.
          '<Selector label="Pick" options={[]} value={null} onChange={() => {}} pickedColor="red" />',
          // Another package's component.
          '<Panel tone="muted" />',
        ).replace("import {VStack}", "import {Panel} from './Panel';\nimport {VStack}"),
        'src/Panel.tsx': 'export function Panel(props: {tone: string}) { return null; }\n',
        // A test file is not read.
        'src/App.test.tsx': app('TabList', '<TabList selectedID="a" />'),
        // A custom element declared with any props, and a catch-all entry, hide no HTML attribute.
        'src/elements.d.ts':
          "import 'react';\ndeclare module 'react' {\n  namespace JSX {\n    interface IntrinsicElements {\n      'model-viewer': any;\n      [element: string]: any;\n    }\n  }\n}\n",
      });
      expect(check?.status).toBe('pass');
      expect(check?.message).toMatch(/^No prop was found that a Core component does not take \(\d+ props read\)\.$/);
    },
    SLOW,
  );

  it(
    "reads a project's own declaration that gives every component a prop, and judges no module or project on another JSX runtime",
    async () => {
      // A prop the project's own types add to a Core component's props.
      const augmented = await propsCheck({
        'src/tab-ids.d.ts': "import '@astryxdesign/core';\ndeclare module '@astryxdesign/core' {\n  interface TabListProps {\n    selectedID?: string;\n  }\n}\n",
        'src/App.tsx': app('TabList', '<TabList selectedID="a" />'),
      });
      expect(augmented?.status).toBe('pass');
      // A declaration that adds the prop through a type it imports by the
      // config's `paths`.
      const aliased = await propsCheck({
        'tsconfig.json': JSON.stringify({compilerOptions: {jsx: 'react-jsx', paths: {'@/*': ['./src/*']}}, include: ['src']}),
        'src/extra.ts': 'export interface Extra {\n  selectedID?: string;\n}\n',
        'src/tab-ids.d.ts': "import type {Extra} from '@/extra';\ndeclare module '@astryxdesign/core' {\n  interface TabListProps extends Extra {}\n}\n",
        'src/App.tsx': app('TabList', '<TabList selectedID="a" />'),
      });
      expect(aliased?.status).toBe('pass');
      // A declaration whose type resolves only through the config's
      // `customConditions`, or through its `rootDirs`.
      const conditions = await propsCheck({
        'tsconfig.json': JSON.stringify({compilerOptions: {jsx: 'react-jsx', module: 'esnext', moduleResolution: 'bundler', customConditions: ['source']}, include: ['src']}),
        'node_modules/@acme/extra/package.json': JSON.stringify({name: '@acme/extra', exports: {'.': {source: './src/index.ts', default: './dist/index.js'}}}),
        'node_modules/@acme/extra/src/index.ts': 'export interface Extra {\n  selectedID?: string;\n}\n',
        'src/tab-ids.d.ts': "import type {Extra} from '@acme/extra';\ndeclare module '@astryxdesign/core' {\n  interface TabListProps extends Extra {}\n}\n",
        'src/App.tsx': app('TabList', '<TabList selectedID="a" />'),
      });
      expect(conditions?.status).toBe('pass');
      const merged = await propsCheck({
        'tsconfig.json': JSON.stringify({compilerOptions: {jsx: 'react-jsx', rootDirs: ['src', 'generated']}, include: ['src', 'generated']}),
        'generated/extra.ts': 'export interface Extra {\n  selectedID?: string;\n}\n',
        'src/tab-ids.d.ts': "import type {Extra} from './extra';\ndeclare module '@astryxdesign/core' {\n  interface TabListProps extends Extra {}\n}\n",
        'src/App.tsx': app('TabList', '<TabList selectedID="a" />'),
      });
      expect(merged?.status).toBe('pass');
      // A declaration that adds the prop through a global type that another
      // file of the project declares.
      const globalType = await propsCheck({
        'tsconfig.json': JSON.stringify({compilerOptions: {jsx: 'react-jsx'}, include: ['src']}),
        'src/global.d.ts': 'interface AppExtras {\n  selectedID?: string;\n}\n',
        'src/tab-ids.d.ts': "import '@astryxdesign/core';\ndeclare module '@astryxdesign/core' {\n  interface TabListProps extends AppExtras {}\n}\n",
        'src/App.tsx': app('TabList', '<TabList selectedID="a" />'),
      });
      expect(globalType?.status).toBe('pass');
      // A string index on what JSX gives every component makes JSX take every name.
      const everyName = await propsCheck({
        'src/every-name.d.ts': "import 'react';\ndeclare module 'react' {\n  namespace JSX {\n    interface IntrinsicAttributes {\n      [name: string]: unknown;\n    }\n  }\n}\n",
        'src/App.tsx': app('TabList', '<TabList selectedID="a" />'),
      });
      expect(everyName?.status).toBe('pass');
      // A library's css prop, declared for every component by the project's own types.
      const declared = await propsCheck({
        'src/css-prop.d.ts': "import 'react';\ndeclare module 'react' {\n  interface Attributes {\n    css?: unknown;\n  }\n}\n",
        'src/App.tsx': app('Button', '<Button label="Go" css={{}} />'),
      });
      expect(declared?.status).toBe('pass');
      const pragma = await propsCheck({
        'src/App.tsx': ['/** @jsxImportSource @emotion/react */', app('TabList', '<TabList selectedID="a" />')].join('\n'),
      });
      expect(pragma?.status).toBe('pass');
      const config = await propsCheck({
        'tsconfig.json': JSON.stringify({compilerOptions: {jsx: 'react-jsx', jsxImportSource: '@emotion/react'}}),
        'src/App.tsx': app('TabList', '<TabList selectedID="a" />'),
      });
      expect(config?.status).toBe('info');
      expect(config?.message).toMatch(/^Not checked: the project compiles JSX with `@emotion\/react`/);
      // A classic JSX factory other than React's.
      const factory = await propsCheck({
        'tsconfig.json': JSON.stringify({compilerOptions: {jsx: 'react', jsxFactory: 'h'}}),
        'src/App.tsx': app('TabList', '<TabList selectedID="a" />'),
      });
      expect(factory?.status).toBe('info');
      expect(factory?.message).toMatch(/^Not checked: the project compiles JSX with `h`/);
      // A build config that sets another runtime, as a JavaScript app's
      // Vite or Babel config does for emotion's `css` prop.
      const vite = await propsCheck({
        'vite.config.js': "import react from '@vitejs/plugin-react';\nexport default {plugins: [react({jsxImportSource: '@emotion/react'})]};\n",
        'src/App.jsx': app('Button', '<Button label="Go" css={{color: "red"}} />'),
      });
      expect(vite?.status).toBe('info');
      expect(vite?.message).toMatch(/^Not checked: the build config `vite\.config\.js` sets another JSX runtime or compiles a `css` prop/);
      // A css-prop transform the project depends on, whatever name its
      // config gives it (Babel reads `styled-components` as
      // `babel-plugin-styled-components`).
      const manifest = (/** @type {Record<string, string>} */ devDependencies) =>
        JSON.stringify({name: 'app', private: true, dependencies: {'@astryxdesign/core': '*', react: '*'}, devDependencies});
      const babel = await propsCheck({
        'package.json': manifest({'babel-plugin-styled-components': '*'}),
        '.babelrc': JSON.stringify({presets: ['next/babel'], plugins: [['styled-components', {ssr: true}]]}),
        'src/App.jsx': app('Button', '<Button label="Go" css={{color: "red"}} />'),
      });
      expect(babel?.status).toBe('info');
      expect(babel?.message).toMatch(/^Not checked: the project depends on `babel-plugin-styled-components`, which compiles a `css` prop/);
      // A transform installed through another package, which the project does
      // not declare.
      const transitive = await propsCheck({
        'node_modules/@emotion/babel-preset-css-prop/package.json': JSON.stringify({name: '@emotion/babel-preset-css-prop', version: '11.0.0'}),
        'src/App.jsx': app('Button', '<Button label="Go" css={{color: "red"}} />'),
      });
      expect(transitive?.status).toBe('info');
      expect(transitive?.message).toMatch(/^Not checked: `@emotion\/babel-preset-css-prop` is installed, which compiles a `css` prop/);
      for (const transform of ['@emotion/babel-preset-css-prop', '@swc/plugin-styled-components', '@compiled/babel-plugin']) {
        const other = await propsCheck({'package.json': manifest({[transform]: '*'}), 'src/App.jsx': app('Button', '<Button label="Go" css={{color: "red"}} />')});
        expect(other?.status, transform).toBe('info');
      }
      // A classic factory, and Next.js's own css-prop transform.
      for (const [config, text] of [
        ['vite.config.js', "export default {esbuild: {jsxFactory: 'jsx', jsxInject: \"import {jsx} from '@emotion/react'\"}};\n"],
        ['.babelrc', JSON.stringify({presets: [['@babel/preset-react', {runtime: 'classic', pragma: 'jsx'}]]})],
        ['next.config.js', 'module.exports = {compiler: {styledComponents: true}};\n'],
      ]) {
        const other = await propsCheck({[config]: text, 'src/App.jsx': app('Button', '<Button label="Go" css={{color: "red"}} />')});
        expect(other?.status, config).toBe('info');
      }
      // React's own injected import, and a config that only names
      // styled-components (an alias), compile JSX as React does.
      for (const [config, text] of [
        ['vite.config.js', "export default {esbuild: {jsxInject: \"import React from 'react'\"}};\n"],
        ['next.config.js', 'module.exports = {compiler: {styledComponents: false}};\n'],
        ['next.config.mjs', "export default {headers: async () => [{source: '/', headers: [{key: 'Cache-Control', pragma: 'no-cache'}]}]};\n"],
        ['webpack.config.js', "module.exports = {resolve: {alias: {'styled-components': 'styled-components/dist/x.js'}}};\n"],
      ]) {
        const same = await propsCheck({[config]: text, 'src/App.tsx': app('TabList', '<TabList selectedID="a" />')});
        expect(same?.status, config).toBe('warn');
      }
      // A build config that names React's runtime is React's.
      const react = await propsCheck({
        'vite.config.js': "import react from '@vitejs/plugin-react';\nexport default {plugins: [react({jsxImportSource: 'react'})]};\n",
        'src/App.tsx': app('TabList', '<TabList selectedID="a" />'),
      });
      expect(react?.status).toBe('warn');
      // A page that gives Core no prop still has its config read.
      const noProps = await propsCheck({
        'tsconfig.json': JSON.stringify({compilerOptions: {jsx: 'react-jsx', jsxImportSource: '@emotion/react'}}),
        'src/App.tsx': ["import {Divider} from '@astryxdesign/core';", 'export default function App() {', '  return <Divider />;', '}', ''].join('\n'),
      });
      expect(noProps?.status).toBe('info');
    },
    SLOW,
  );

  it(
    "reads the type packages the page's config names, and declarations in .tsx modules",
    async () => {
      // A css prop declared for every component by a type package the config lists.
      const typed = await propsCheck({
        'tsconfig.json': JSON.stringify({compilerOptions: {jsx: 'react-jsx', types: ['css-prop']}}),
        'node_modules/@types/css-prop/package.json': JSON.stringify({name: '@types/css-prop', types: 'index.d.ts'}),
        'node_modules/@types/css-prop/index.d.ts': "import 'react';\ndeclare module 'react' {\n  interface Attributes {\n    css?: unknown;\n  }\n}\n",
        'src/App.tsx': app('Button', '<Button label="Go" css={{}} />'),
      });
      expect(typed?.status).toBe('pass');
      const tsx = await propsCheck({
        'src/css.tsx': "import 'react';\ndeclare module 'react' {\n  interface Attributes {\n    css?: unknown;\n  }\n}\nexport {};\n",
        'src/App.tsx': app('Button', '<Button label="Go" css={{}} />'),
      });
      expect(tsx?.status).toBe('pass');
    },
    SLOW,
  );

  it(
    'says it did not run without TypeScript, whatever props the pages give',
    async () => {
      for (const line of ['<TabList selectedID="a" />', '<TabList value="a" onChange={() => {}} />']) {
        const check = await propsCheck({'src/App.tsx': app('TabList', line)}, {typescript: false});
        expect(check?.status).toBe('info');
        expect(check?.message).toMatch(/^Not checked: TypeScript is not installed in this project, so the props were not checked\./);
      }
    },
    SLOW,
  );
});
