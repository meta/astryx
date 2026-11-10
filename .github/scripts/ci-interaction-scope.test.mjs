// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract: the interaction lanes' scope leaves out the files under a
 *   package's src that put nothing on a page the proofs load (unit tests,
 *   docs, Markdown records and accessibility specs), in both engines, in the
 *   leg-count job and in each lane's own scope step.
 */

import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

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

const NON_RUNTIME = [
  'packages/core/src/BottomSheet/BottomSheet.test.tsx',
  'packages/core/src/BottomSheet/__tests__/snap.test.ts',
  'packages/core/src/BottomSheet/BottomSheet.doc.mjs',
  'packages/core/src/BottomSheet/README.md',
  'packages/lab/src/Tour/Tour.spec.md',
  'packages/core/src/Table/__tests__/TableFocusRing.a11y.chromium.spec.ts',
  'packages/lab/src/__tests__/ReorderGripPinchZoom.a11y.chromium.spec.ts',
  'packages/themes/neutral/src/neutralTheme.test.ts',
];

const RUNTIME = [
  'packages/core/src/BottomSheet/BottomSheet.tsx',
  'packages/core/src/BottomSheet/useSheetGestures.ts',
  'packages/core/src/BottomSheet/BottomSheet.stylex.ts',
  // A story and a spec's fixture render on the page a proof loads.
  'packages/core/src/BottomSheet/BottomSheet.stories.tsx',
  'packages/core/src/BottomSheet/__tests__/fixtures/sheet.tsx',
  'packages/themes/neutral/src/neutralTheme.ts',
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

    it(`${lane}: a changed interaction spec still selects them`, () => {
      expect(
        scope.test(
          'packages/core/src/BottomSheet/__tests__/BottomSheet.interaction.browser.spec.ts',
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
