// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {firstSentence} from '../../../foundation/text/string-utils.mjs';
import {text as textBlock} from '../formatters/index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../../..');

describe('template --list text', () => {
  it('prints the first sentence of each description; --json keeps it whole', async () => {
    const json = JSON.parse(
      (await runCli(['--json', 'template', '--list'], REPO_ROOT)).stdout,
    );
    const text = (await runCli(['template', '--list'], REPO_ROOT)).stdout;
    const shown = new Map();
    for (const block of text.split(/\n{2,}/)) {
      const id = /^id:\s+(.+)$/m.exec(block)?.[1];
      const description = /^description:\s+(.+)$/m.exec(block)?.[1];
      if (id && description) shown.set(id, description);
    }
    const flat = (/** @type {string} */ s) => s.replace(/\s+/g, ' ').trim();
    const longer = json.data.filter(
      (/** @type {{description?: string}} */ t) =>
        t.description && firstSentence(t.description) !== flat(t.description),
    );
    expect(
      longer.length,
      'a template with a longer description',
    ).toBeGreaterThan(0);
    for (const t of json.data) {
      if (!t.description) continue;
      // The kit prints ASCII, so compare with the sentence as the kit prints it.
      expect(shown.get(t.id), t.id).toBe(
        String(textBlock(firstSentence(t.description))),
      );
    }
  }, 60_000);
});
