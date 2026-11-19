// Copyright (c) Meta Platforms, Inc. and affiliates.

import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {assertOutsideRepo, run, tscErrorsIn} from './workspace.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

describe('run', () => {
  it('returns the exit code and output', async () => {
    const result = await run([process.execPath, '-e', 'console.log("hi"); process.exit(3)']);
    expect(result).toMatchObject({code: 3, timedOut: false});
    expect(result.output).toContain('hi');
  });

  it('kills a grandchild that holds the output open when the timeout fires', async () => {
    if (process.platform === 'win32') return;
    const started = Date.now();
    const result = await run(['sh', '-c', 'sleep 30 & wait'], {timeoutMs: 300});
    expect(result.timedOut).toBe(true);
    expect(result.code).toBeNull();
    expect(Date.now() - started).toBeLessThan(5000);
  });
});

describe('assertOutsideRepo', () => {
  it('refuses the repository and folders inside it', () => {
    expect(() => assertOutsideRepo(HERE)).toThrow(/outside the repository/);
    expect(() => assertOutsideRepo(path.join(HERE, '..foo'))).toThrow(/outside the repository/);
  });

  it('accepts a temp folder', () => {
    const dir = path.join(os.tmpdir(), 'astryx-vibe-eval-test');
    expect(assertOutsideRepo(dir)).toBe(path.resolve(dir));
  });
});

describe('tscErrorsIn', () => {
  it('keeps only error lines for the file', () => {
    const output = [
      'src/App.tsx(2,22): error TS2307: Cannot find module.',
      'src/main.tsx(1,1): error TS1000: Other file.',
      'src/App.tsx(4,30): error TS2322: Bad prop.',
      'Found 3 errors.',
    ].join('\n');
    expect(tscErrorsIn(output, 'src/App.tsx')).toHaveLength(2);
  });
});
