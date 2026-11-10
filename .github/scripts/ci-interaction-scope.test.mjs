// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract: the interaction lanes' scope leaves out the files under a
 *   package's src that put nothing on a page the proofs load (unit tests,
 *   docs, Markdown records and accessibility specs), in both engines, in the
 *   leg-count job and in each lane's own scope step.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

import {isInteractionSpec, isProofPage} from './playwright-legs.mjs';
import {proofImporters} from './a11y-pr-contracts.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const ci = yaml.parse(
  fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'),
);
const scopeOf = (job, id) =>
  new RegExp(ci.jobs[job].steps.find(step => step.id === id).with.paths);

const SCOPES = {
  'Chromium legs': scopeOf('interaction-legs', 'scope-chromium'),
  'Chromium proofs': scopeOf('pr-interaction', 'scope'),
  'WebKit legs': scopeOf('interaction-legs', 'scope-webkit'),
  'WebKit proofs': scopeOf('pr-interaction-webkit', 'scope'),
};

// Real files the proofs never load.
const NON_RUNTIME = [
  'packages/core/src/BottomSheet/BottomSheet.test.tsx',
  'packages/core/src/BottomSheet/BottomSheetCloseFocus.test.tsx',
  'packages/core/src/BottomSheet/BottomSheet.doc.mjs',
  // Accessibility specs, in and outside a `__tests__/` folder.
  'packages/core/src/Table/__tests__/TableFocusRing.a11y.chromium.spec.ts',
  'packages/core/src/Lightbox/LightboxKeyboard.a11y.browser.spec.ts',
];

// Real files a proof's page or fixture loads.
const RUNTIME = [
  'packages/core/src/BottomSheet/BottomSheet.tsx',
  'packages/core/src/BottomSheet/BottomSheetPanel.tsx',
  'packages/core/src/BottomSheet/useSheetGestures.ts',
  'apps/storybook/stories/BottomSheet.stories.tsx',
  'packages/core/src/gestures/__tests__/browser/fixture.ts',
  'packages/themes/neutral/src/neutralTheme.ts',
  // Theme sources are shared infrastructure: a test there selects too.
  'packages/themes/neutral/src/neutralTheme.test.ts',
  'packages/core/src/theme/Theme.test.tsx',
  // So are a component package's shared folders.
  'packages/lab/src/__tests__/ReorderGripPinchZoom.a11y.chromium.spec.ts',
  'packages/core/src/gestures/README.md',
  'packages/core/src/gestures/__tests__/GestureHost.test.ts',
  // So is every package outside the component packages.
  'packages/native/src/contract/contracts.test.ts',
];

describe('the interaction scope', () => {
  for (const [lane, scope] of Object.entries(SCOPES)) {
    it(`${lane}: a test-, doc- or record-only change selects nothing`, () => {
      for (const file of NON_RUNTIME) {
        expect(scope.test(file), file).toBe(false);
      }
    });

    it(`${lane}: a runtime file still selects the proofs`, () => {
      for (const file of RUNTIME) {
        expect(scope.test(file), file).toBe(true);
      }
    });

    if (lane.startsWith('Chromium'))
      it(`${lane}: a test at the root of a package outside the component packages still selects them`, () => {
        // WebKit's scope never covered a package's src root.
        expect(scope.test('packages/build/src/babel.test.mjs')).toBe(true);
        // A component package's src root is shared too.
        expect(scope.test('packages/charts/src/Chart.test.tsx')).toBe(true);
      });

    it(`${lane}: a changed interaction spec still selects them`, () => {
      expect(
        scope.test(
          'packages/core/src/BottomSheet/__tests__/BottomSheetDetent.interaction.browser.spec.ts',
        ),
      ).toBe(true);
    });
  }

  it('each lane decides the same way in the leg count and in its own scope step', () => {
    expect(SCOPES['Chromium legs'].source).toBe(
      SCOPES['Chromium proofs'].source,
    );
    expect(SCOPES['WebKit legs'].source).toBe(SCOPES['WebKit proofs'].source);
  });
});

describe('a left-out file that a proof imports', () => {
  it("is found through the proofs' value imports", () => {
    // A spec that imports a `.test` helper beside it.
    const tree = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-imports-'));
    const files = {
      'packages/core/src/Sheet/__tests__/Sheet.interaction.browser.spec.ts':
        "import {drag} from './drag.test';\nimport type {Kind} from './kinds.test';\n",
      'packages/core/src/Sheet/__tests__/drag.test.ts':
        "export {ease} from '../Sheet.doc.mjs';\n",
      'packages/core/src/Sheet/__tests__/kinds.test.ts': '',
      'packages/core/src/Sheet/Sheet.doc.mjs': '',
    };
    for (const [file, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(tree, file)), {recursive: true});
      fs.writeFileSync(path.join(tree, file), text);
    }
    const importers = proofImporters({
      root: tree,
      listed: Object.keys(files),
      isProof: isInteractionSpec,
    });
    const spec =
      'packages/core/src/Sheet/__tests__/Sheet.interaction.browser.spec.ts';
    expect([...importers.keys()].sort()).toEqual([
      'packages/core/src/Sheet/Sheet.doc.mjs',
      'packages/core/src/Sheet/__tests__/drag.test.ts',
    ]);
    expect([...importers.get('packages/core/src/Sheet/Sheet.doc.mjs')]).toEqual(
      [spec],
    );
    // So the scopes would leave out files this proof loads.
    for (const file of importers.keys())
      expect(SCOPES['Chromium proofs'].test(file), file).toBe(false);
  });

  it('is found through a fixture a proof bundles by path', () => {
    const tree = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-imports-'));
    const files = {
      'packages/core/src/Sheet/__tests__/Sheet.interaction.browser.spec.ts':
        "const entry = new URL('./sheetBundle.ts', import.meta.url);\nconst other = bundleOf('bare.ts');\n",
      'packages/core/src/Sheet/__tests__/sheetBundle.ts':
        "import {ease} from '../ease.test';\n",
      'packages/core/src/Sheet/__tests__/bare.ts': '',
      'packages/core/src/Sheet/ease.test.ts': '',
    };
    for (const [file, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(tree, file)), {recursive: true});
      fs.writeFileSync(path.join(tree, file), text);
    }
    const importers = proofImporters({
      root: tree,
      listed: Object.keys(files),
      isProof: isProofPage,
    });
    expect([...importers.keys()].sort()).toEqual([
      'packages/core/src/Sheet/__tests__/bare.ts',
      'packages/core/src/Sheet/__tests__/sheetBundle.ts',
      'packages/core/src/Sheet/ease.test.ts',
    ]);
  });

  it('is found through a story a proof opens', () => {
    const tree = fs.mkdtempSync(path.join(os.tmpdir(), 'story-imports-'));
    const files = {
      'apps/storybook/stories/Sheet.stories.tsx':
        "import {Sheet} from '@astryxdesign/core/Sheet/Sheet';\n",
      'packages/core/src/Sheet/Sheet.tsx':
        "import {notes} from './Sheet.doc.mjs';\n",
      'packages/core/src/Sheet/Sheet.doc.mjs': '',
    };
    for (const [file, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(tree, file)), {recursive: true});
      fs.writeFileSync(path.join(tree, file), text);
    }
    const importers = proofImporters({
      root: tree,
      listed: Object.keys(files),
      isProof: isProofPage,
    });
    expect([...importers.get('packages/core/src/Sheet/Sheet.doc.mjs')]).toEqual(
      ['apps/storybook/stories/Sheet.stories.tsx'],
    );
  });

  it('does not exist: no proof, story or Storybook preview in the repository loads a file the scopes leave out', () => {
    const listed = execFileSync('git', ['ls-files'], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean);
    const importers = proofImporters({
      root,
      listed,
      isProof: isProofPage,
    });
    expect(importers.size).toBeGreaterThan(0);
    const leftOut = [...importers.keys()].filter(
      file =>
        /^packages\/[^/]+\/src\//.test(file) &&
        (!SCOPES['Chromium proofs'].test(file) ||
          (/^packages\/[^/]+\/src\/[^/]+\//.test(file) &&
            !SCOPES['WebKit proofs'].test(file))),
    );
    // A proof that needs such a file: rename the file so its name says it is
    // runtime code, or narrow the scopes' lookahead.
    expect(leftOut).toEqual([]);
  });
});
