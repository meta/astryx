// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {collectResults} from './collect-results.mjs';

const tempDirs = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

describe('collectResults', () => {
  it('copies an optional canonical provenance sidecar beside result metadata', () => {
    const iterDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-collect-'));
    tempDirs.push(iterDir);
    const projectDir = path.join(iterDir, 'projects', 'prompt-a');
    fs.mkdirSync(projectDir, {recursive: true});
    fs.writeFileSync(
      path.join(projectDir, 'prompt-a.tsx'),
      'export default null;',
    );
    fs.writeFileSync(path.join(projectDir, 'prompt-a.json'), '{}');
    fs.writeFileSync(
      path.join(projectDir, 'prompt-a.provenance.json'),
      '{"schemaVersion":1}',
    );

    const summary = collectResults(iterDir);

    expect(summary).toEqual({copied: 3, missing: 0, projects: 1});
    expect(
      fs.readFileSync(
        path.join(iterDir, 'results', 'prompt-a.provenance.json'),
        'utf-8',
      ),
    ).toBe('{"schemaVersion":1}');
  });

  it('keeps old results without sidecars valid', () => {
    const iterDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-collect-'));
    tempDirs.push(iterDir);
    const projectDir = path.join(iterDir, 'projects', 'prompt-old');
    fs.mkdirSync(projectDir, {recursive: true});
    fs.writeFileSync(
      path.join(projectDir, 'prompt-old.tsx'),
      'export default null;',
    );
    fs.writeFileSync(path.join(projectDir, 'prompt-old.json'), '{}');

    expect(collectResults(iterDir)).toEqual({
      copied: 2,
      missing: 0,
      projects: 1,
    });
  });
});
