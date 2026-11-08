// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {describe, expect, it} from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(here, file), 'utf8'));
}

describe('palette authoring agent fixtures', () => {
  it('keeps the answer key out of the prompts shown to agents', () => {
    const {prompts} = readJson('prompts.json');
    const answers = readJson('expected-decisions.json');

    expect(prompts.every(prompt => prompt.expectedDecision == null)).toBe(true);
    expect(prompts.map(prompt => prompt.id).sort()).toEqual(
      Object.keys(answers).sort(),
    );
  });
});
