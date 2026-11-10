// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file browser.test.mjs
 * @input One swizzle target, rendered by a sample that renders nothing
 * @output Proves that the proof's browser step fails a copy that renders
 *   nothing in Chromium (spec:AST-110 FR7, the release check)
 * @position Runs where the release check runs the browser step
 *   (SWIZZLE_PROOF_BROWSER=1); elsewhere it is skipped
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

import {createProject, listTargets, prove} from './proof.mjs';

describe.skipIf(process.env.SWIZZLE_PROOF_BROWSER !== '1')(
  'the swizzle proof in a real browser',
  () => {
    it('fails a copy that renders nothing', async () => {
      const project = fs.mkdtempSync(
        path.join(os.tmpdir(), 'astryx-swizzle-browser-'),
      );
      try {
        createProject(project);
        const target = (await listTargets(project)).find(
          t => t.key === 'core__Badge',
        );
        const samplesFile = path.join(project, 'empty-samples.mjs');
        fs.writeFileSync(
          samplesFile,
          'export const samples = {core__Badge: () => null};\n',
        );
        const {results} = await prove([target], {
          project,
          samplesFile,
          browser: true,
        });
        expect(results[0].failure).toEqual({
          step: 'browser',
          error: 'the copy rendered nothing',
        });
      } finally {
        fs.rmSync(project, {recursive: true, force: true});
      }
    }, 600_000);
  },
);
