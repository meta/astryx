// Copyright (c) Meta Platforms, Inc. and affiliates.

// `gate.mjs accept` is the promotion boundary: the one command that writes
// baseline files. These tests drive the real command against a scratch capture
// and baseline, matching the local preparation for a reviewed baseline PR.

import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {incomparable} from './lib/baseline.mjs';
import {buildVerdict} from './lib/compare.mjs';

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'gate.mjs',
);

let root;
let baselineDir;
let captureDir;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-gate-accept-'));
  baselineDir = path.join(root, 'baseline');
  captureDir = path.join(root, 'capture');
  fs.mkdirSync(path.join(captureDir, 'shots'), {recursive: true});
  fs.writeFileSync(path.join(captureDir, 'shots', 'a.png'), 'new-a');
  fs.writeFileSync(path.join(captureDir, 'shots', 'b.png'), 'new-b');
  fs.writeFileSync(
    path.join(captureDir, 'manifest.json'),
    JSON.stringify({
      platform: 'linux-x64',
      viewport: {width: 1024, height: 768},
      capturedAt: '2026-08-23T00:00:00.000Z',
      shots: {a: {sha256: 'aa'}, b: {sha256: 'bb'}},
    }),
  );
});
afterEach(() => fs.rmSync(root, {recursive: true, force: true}));

function writeVerdict(contents) {
  fs.writeFileSync(
    path.join(captureDir, 'verdict.json'),
    typeof contents === 'string' ? contents : JSON.stringify(contents),
  );
}

function acceptCommand(keys = 'a') {
  return spawnSync(
    process.execPath,
    [
      SCRIPT,
      'accept',
      '--baseline',
      baselineDir,
      '--out',
      captureDir,
      '--keys',
      keys,
      '--reason',
      'Button radius changed on purpose',
      '--actor',
      'tester',
    ],
    {encoding: 'utf8'},
  );
}

describe('gate.mjs accept', () => {
  it.each([
    ['pass', {status: 'pass'}],
    ['changed', {status: 'changed'}],
  ])('promotes the named shot from a %s verdict', (_label, verdict) => {
    writeVerdict(verdict);
    const result = acceptCommand();
    expect(result.status, result.stderr).toBe(0);
    expect(
      fs.readFileSync(path.join(baselineDir, 'shots', 'a.png'), 'utf8'),
    ).toBe('new-a');
    expect(fs.existsSync(path.join(baselineDir, 'shots', 'b.png'))).toBe(false);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(baselineDir, 'manifest.json'), 'utf8'),
    );
    expect(Object.keys(manifest.shots)).toEqual(['a']);
  });

  it.each([
    ['failed', {status: 'failed'}],
    ['skipped', {status: 'skipped'}],
    ['missing', null],
    ['unreadable (not JSON)', 'not json'],
    ['unreadable (no status)', {}],
    ['unknown', {status: 'crashed'}],
  ])('writes no baseline file from a %s verdict', (_label, verdict) => {
    if (verdict !== null) writeVerdict(verdict);
    const result = acceptCommand();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/Refusing to promote/);
    // Not a manifest, not a shots directory: the baseline directory itself
    // was never created.
    expect(fs.existsSync(baselineDir)).toBe(false);
  });

  it.each([false, true])(
    'handles a browser upgrade with additional capture failure=%s',
    captureFailed => {
      const manifestPath = path.join(captureDir, 'manifest.json');
      const baseline = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      baseline.browser = 'chromium-139.0';
      for (const key of ['a', 'b']) {
        baseline.shots[key].sha256 = createHash('sha256')
          .update(`new-${key}`)
          .digest('hex');
      }
      fs.writeFileSync(manifestPath, JSON.stringify(baseline));
      writeVerdict({status: 'pass'});
      expect(acceptCommand('all').status).toBe(0);
      const before = fs.readFileSync(
        path.join(baselineDir, 'manifest.json'),
        'utf8',
      );
      const current = {...baseline, browser: 'chromium-140.0'};
      fs.writeFileSync(manifestPath, JSON.stringify(current));
      // Use the producer's real verdict shape: the existing browser-upgrade
      // guidance must reach accept, but a capture failure still cannot.
      const failures = [
        {key: 'baseline', error: incomparable(baseline, current)},
      ];
      if (captureFailed) failures.push({key: 'a', error: 'timeout'});
      const verdict = buildVerdict({
        comparison: {
          changes: [],
          added: [],
          removed: [],
          unchanged: ['a', 'b'],
        },
        baselineManifest: baseline,
        currentManifest: current,
        failures,
      });
      expect(verdict.status).toBe('failed');
      writeVerdict(verdict);
      const result = acceptCommand('all');
      if (captureFailed) {
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/Refusing to promote/);
        expect(
          fs.readFileSync(path.join(baselineDir, 'manifest.json'), 'utf8'),
        ).toBe(before);
      } else {
        expect(result.status, result.stderr).toBe(0);
        const refreshed = JSON.parse(
          fs.readFileSync(path.join(baselineDir, 'manifest.json'), 'utf8'),
        );
        expect(refreshed.browser).toBe('chromium-140.0');
        expect(refreshed.decisions.at(-1).promoted).toEqual(['a', 'b']);
        expect(incomparable(refreshed, current)).toBeNull();
      }
    },
  );

  it('trims the keys the dispatch form invites: "a, b" promotes both', () => {
    writeVerdict({status: 'changed'});
    const result = acceptCommand('a, b');
    expect(result.status, result.stderr).toBe(0);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(baselineDir, 'manifest.json'), 'utf8'),
    );
    expect(Object.keys(manifest.shots).sort()).toEqual(['a', 'b']);
  });
});
