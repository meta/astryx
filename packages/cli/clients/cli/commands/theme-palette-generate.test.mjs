// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {runCli} from '../../../test-utils/run-cli.mjs';

let temporaryDirectory;

beforeEach(() => {
  temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'astryx-palette-cli-'),
  );
  fs.writeFileSync(
    path.join(temporaryDirectory, 'palette.config.json'),
    JSON.stringify({
      modeStrategy: 'dark-only',
      stops: [10, 50, 90],
      families: [{id: 'blue', seed: '#0074e2'}],
    }),
  );
});

afterEach(() => {
  fs.rmSync(temporaryDirectory, {recursive: true, force: true});
});

describe('astryx theme palette generate', () => {
  it('previews a candidate without writing', async () => {
    const {status, stdout} = await runCli(
      ['theme', 'palette', 'generate', 'palette.config.json'],
      {cwd: temporaryDirectory},
    );

    expect(status).toBe(0);
    expect(stdout).toContain('Palette candidate');
    expect(stdout).toContain('astryx-oklch-v1');
    expect(fs.readdirSync(temporaryDirectory)).toEqual(['palette.config.json']);
  });

  it('preserves mixed stop order in the terminal preview', async () => {
    fs.writeFileSync(
      path.join(temporaryDirectory, 'palette.config.json'),
      JSON.stringify({
        modeStrategy: 'light-only',
        stops: [12.5, 50, 80],
        families: [{id: 'blue', seed: '#0074e2'}],
      }),
    );

    const {status, stdout} = await runCli(
      ['theme', 'palette', 'generate', 'palette.config.json'],
      {cwd: temporaryDirectory},
    );

    expect(status).toBe(0);
    expect(stdout.indexOf('"12.5":')).toBeLessThan(stdout.indexOf('"50":'));
    expect(stdout.indexOf('"50":')).toBeLessThan(stdout.indexOf('"80":'));
  });

  it('writes candidate files and returns one JSON envelope', async () => {
    const {status, stdout} = await runCli(
      [
        '--json',
        'theme',
        'palette',
        'generate',
        'palette.config.json',
        '--out',
        'ocean.palette.ts',
        '--preview',
        'ocean.palette.html',
      ],
      {cwd: temporaryDirectory},
    );

    expect(status).toBe(0);
    const response = JSON.parse(stdout);
    expect(response.type).toBe('theme.palette.generate');
    expect(response.data).toMatchObject({
      recipe: 'astryx-oklch-v1',
      stopCount: 3,
      modes: ['dark'],
      output: 'ocean.palette.ts',
      receipt: 'ocean.palette.receipt.json',
      preview: 'ocean.palette.html',
      written: true,
    });
    expect(
      fs.existsSync(path.join(temporaryDirectory, response.data.output)),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(temporaryDirectory, response.data.receipt)),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(temporaryDirectory, response.data.preview)),
    ).toBe(true);
  });

  it('preserves mixed stop order in the JSON response', async () => {
    fs.writeFileSync(
      path.join(temporaryDirectory, 'palette.config.json'),
      JSON.stringify({
        modeStrategy: 'light-only',
        stops: [12.5, 50, 80],
        families: [{id: 'blue', seed: '#0074e2'}],
      }),
    );

    const {status, stdout} = await runCli(
      ['--json', 'theme', 'palette', 'generate', 'palette.config.json'],
      {cwd: temporaryDirectory},
    );

    expect(status).toBe(0);
    expect(JSON.parse(stdout).data.candidate.stops).toEqual([12.5, 50, 80]);
  });

  it('returns the stable palette-generation error code', async () => {
    fs.writeFileSync(
      path.join(temporaryDirectory, 'palette.config.json'),
      JSON.stringify({stops: [], families: [{id: 'blue', seed: '#0074e2'}]}),
    );
    const {status, stdout} = await runCli(
      ['--json', 'theme', 'palette', 'generate', 'palette.config.json'],
      {cwd: temporaryDirectory},
    );

    expect(status).toBe(1);
    expect(JSON.parse(stdout)).toMatchObject({
      code: 'ERR_PALETTE_GENERATION',
    });
  });

  it('returns ERR_WRITE_FAILED for an output path it cannot use', async () => {
    fs.writeFileSync(path.join(temporaryDirectory, 'blocker'), '');
    const {status, stdout} = await runCli(
      [
        '--json',
        'theme',
        'palette',
        'generate',
        'palette.config.json',
        '--out',
        'blocker/ocean.palette.ts',
      ],
      {cwd: temporaryDirectory},
    );

    expect(status).toBe(1);
    expect(JSON.parse(stdout)).toMatchObject({code: 'ERR_WRITE_FAILED'});
  });
});
