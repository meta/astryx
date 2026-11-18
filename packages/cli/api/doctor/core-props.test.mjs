// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Doctor's `core-props` check in an app on the repository's own Core:
 * it names each prop the app gives a Core component that the component does
 * not take, with the documented prop the name is closest to; it does not
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
  const app = path.join(tmp, 'app');
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
    'names each prop a Core component does not take, with the prop the name is closest to',
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
      });
      expect(check?.status).toBe('pass');
      expect(check?.message).toMatch(/^Every prop given to a Core component is one it takes \(\d+ props read\)\.$/);
    },
    SLOW,
  );

  it(
    'says it did not run without TypeScript',
    async () => {
      const check = await propsCheck({'src/App.tsx': app('TabList', '<TabList selectedID="a" />')}, {typescript: false});
      expect(check?.status).toBe('info');
      expect(check?.message).toMatch(/^Not checked: TypeScript is not installed in this project, so the props were not checked\./);
    },
    SLOW,
  );
});
