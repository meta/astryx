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
        'src/__fixtures__/Demo.tsx': app('<Button label="In a fixture" />'),
        'tests/host.tsx': app('<Button label="In a test folder" />'),
      });
      expect(check).toEqual({
        id: 'button-actions',
        label: 'Button actions',
        status: 'warn',
        message:
          '4 buttons do nothing when pressed: src/App.tsx:5 "Try it", src/App.tsx:7 "Start" (href="#"), src/App.tsx:8 "Undo" (empty onClick), src/App.tsx:9 IconButton.',
        fix: 'Give each one an action: `onClick` (or `clickAction` for async work), a real `href`, or `type="submit"` inside a form. If it has no action yet, disable it with `isDisabled` or remove it: an empty handler or a `#` link still does nothing.',
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
