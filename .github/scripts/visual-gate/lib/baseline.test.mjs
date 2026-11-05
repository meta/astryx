// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {
  accept,
  assertPromotableVerdict,
  compactBaselineManifest,
  incomparable,
  readBaseline,
} from './baseline.mjs';

describe('compact baseline manifest', () => {
  it('keeps comparison and ownership fields without generated story metadata', () => {
    const compact = compactBaselineManifest({
      version: 1,
      platform: 'linux-arm64',
      browser: 'chromium-149',
      viewport: {width: 1024, height: 768},
      shots: {
        a: {
          sha256: 'aa',
          storyId: 'core-button--primary',
          theme: 'neutral',
          mode: 'light',
          packageName: '@astryxdesign/core',
          themePackageName: '@astryxdesign/theme-neutral',
          title: 'Core/Button',
          name: 'Primary',
          reasons: ['surface'],
          packageNames: ['@astryxdesign/core'],
          stableVisual: true,
          stableThemeVisual: true,
          membershipSource: 'current-story',
          width: 1024,
          height: 768,
        },
      },
    });
    expect(compact.shots.a).toEqual({
      sha256: 'aa',
      storyId: 'core-button--primary',
      theme: 'neutral',
      mode: 'light',
      packageName: '@astryxdesign/core',
      themePackageName: '@astryxdesign/theme-neutral',
    });
    expect(JSON.stringify(compact)).not.toContain('Core/Button');
  });
});
let root;
let baselineDir;
let captureDir;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-baseline-'));
  baselineDir = path.join(root, 'baseline');
  captureDir = path.join(root, 'capture');
  fs.mkdirSync(path.join(captureDir, 'shots'), {recursive: true});
  fs.writeFileSync(path.join(captureDir, 'shots', 'a.png'), 'new-a');
  fs.writeFileSync(path.join(captureDir, 'shots', 'b.png'), 'new-b');
});
afterEach(() => fs.rmSync(root, {recursive: true, force: true}));

const currentManifest = {
  platform: 'linux-arm64',
  viewport: {width: 1024, height: 768},
  capturedAt: '2026-08-23T00:00:00.000Z',
  shots: {a: {sha256: 'aa'}, b: {sha256: 'bb'}},
};

const promote = overrides =>
  accept({
    baselineDir,
    captureDir,
    currentManifest,
    verdict: {status: 'changed'},
    keys: ['a'],
    reason: 'Button radius changed on purpose',
    actor: 'tester',
    ...overrides,
  });

// Every way a capture can arrive without a verdict the gate stood behind: the
// gate's own failed and skipped statuses, no verdict.json at all (null), a
// verdict.json that did not parse into an object, and statuses this gate never
// writes.
const UNPROMOTABLE_VERDICTS = [
  ['failed', {status: 'failed'}],
  ['skipped', {status: 'skipped'}],
  ['missing', null],
  ['undefined', undefined],
  ['unreadable (not an object)', 'pass'],
  ['unreadable (no status)', {}],
  ['unreadable (null status)', {status: null}],
  ['unknown (crashed)', {status: 'crashed'}],
  ['unknown (empty)', {status: ''}],
  ['unknown (wrong case)', {status: 'PASS'}],
];

describe('assertPromotableVerdict', () => {
  it('lets pass and changed through', () => {
    expect(() => assertPromotableVerdict({status: 'pass'})).not.toThrow();
    expect(() => assertPromotableVerdict({status: 'changed'})).not.toThrow();
  });

  it.each(UNPROMOTABLE_VERDICTS)('refuses a %s verdict', (_label, verdict) => {
    expect(() => assertPromotableVerdict(verdict)).toThrow(
      /Refusing to promote/,
    );
  });
});

describe('accept', () => {
  it('refuses to promote without a reason, because the reason is the record', () => {
    expect(() => promote({reason: ' '})).toThrow(/reason/);
  });

  it('promotes from a pass verdict as well as a changed one', () => {
    promote({verdict: {status: 'pass'}});
    expect(fs.existsSync(path.join(baselineDir, 'shots', 'a.png'))).toBe(true);
  });

  it.each(UNPROMOTABLE_VERDICTS)(
    'writes no baseline file from a %s verdict',
    (_label, verdict) => {
      expect(() => promote({verdict})).toThrow(/Refusing to promote/);
      expect(() => promote({verdict, keys: ['a', 'b']})).toThrow(
        /Refusing to promote/,
      );
      // Nothing was created: no manifest, no shots directory, no baseline dir.
      expect(fs.existsSync(baselineDir)).toBe(false);
    },
  );

  it.each(UNPROMOTABLE_VERDICTS)(
    'neither overwrites nor prunes an existing baseline from a %s verdict',
    (_label, verdict) => {
      promote({keys: ['a', 'b']});
      const before = fs.readFileSync(
        path.join(baselineDir, 'manifest.json'),
        'utf8',
      );
      fs.writeFileSync(path.join(captureDir, 'shots', 'a.png'), 'broken-a');

      expect(() => promote({verdict, keys: ['a']})).toThrow(
        /Refusing to promote/,
      );
      expect(() =>
        promote({verdict, keys: [], prune: ['b'], reason: 'story deleted'}),
      ).toThrow(/Refusing to promote/);

      expect(
        fs.readFileSync(path.join(baselineDir, 'shots', 'a.png'), 'utf8'),
      ).toBe('new-a');
      expect(fs.existsSync(path.join(baselineDir, 'shots', 'b.png'))).toBe(
        true,
      );
      expect(
        fs.readFileSync(path.join(baselineDir, 'manifest.json'), 'utf8'),
      ).toBe(before);
    },
  );

  it('refuses keys that are not shot keys — they name files under shots/', () => {
    // shotKey() output is [a-zA-Z0-9._-] only; anything path-shaped (or
    // dots-only) must be rejected before it is joined into a path, whichever
    // list it arrives in.
    for (const bad of ['../escape', 'a/b', 'a\\b', '..', ' a']) {
      expect(() => promote({keys: [bad]})).toThrow(/Invalid shot key/);
      expect(() => promote({keys: [], prune: [bad]})).toThrow(
        /Invalid shot key/,
      );
    }
    expect(fs.existsSync(baselineDir)).toBe(false);
  });

  it('copies only the named shots into the baseline', () => {
    promote();
    expect(
      fs.readFileSync(path.join(baselineDir, 'shots', 'a.png'), 'utf8'),
    ).toBe('new-a');
    expect(fs.existsSync(path.join(baselineDir, 'shots', 'b.png'))).toBe(false);
    expect(Object.keys(readBaseline(baselineDir).manifest.shots)).toEqual([
      'a',
    ]);
  });

  it('records who promoted what, and why', () => {
    promote();
    const [decision] = readBaseline(baselineDir).manifest.decisions;
    expect(decision).toMatchObject({
      actor: 'tester',
      promoted: ['a'],
      reason: 'Button radius changed on purpose',
    });
  });

  it('keeps earlier decisions when promoting again', () => {
    promote();
    promote({keys: ['b'], reason: 'Badge padding, intentional'});
    expect(readBaseline(baselineDir).manifest.decisions).toHaveLength(2);
  });

  it('drops pruned shots from both the manifest and disk', () => {
    promote({keys: ['a', 'b']});
    promote({keys: [], prune: ['b'], reason: 'story deleted'});
    expect(fs.existsSync(path.join(baselineDir, 'shots', 'b.png'))).toBe(false);
    expect(Object.keys(readBaseline(baselineDir).manifest.shots)).toEqual([
      'a',
    ]);
  });
});

describe('browser-refresh recovery', () => {
  function refresh() {
    const manifest = structuredClone(currentManifest);
    manifest.browser = 'chromium-140.0';
    for (const key of ['a', 'b']) {
      manifest.shots[key].sha256 = crypto
        .createHash('sha256')
        .update(`new-${key}`)
        .digest('hex');
    }
    promote({
      currentManifest: {...manifest, browser: 'chromium-139.0'},
      keys: ['a', 'b'],
    });
    const verdict = {
      status: 'failed',
      counts: {total: 2, failed: 1},
      failures: [
        {
          key: 'baseline',
          error:
            'baseline was captured with chromium-139.0, this run with chromium-140.0 — refresh the baseline (gate.mjs accept --keys all --reason "browser bump").',
        },
      ],
      removed: [],
    };
    return {
      currentManifest: manifest,
      verdict,
      keys: ['a', 'b'],
      reason: 'browser bump',
    };
  }

  it('refreshes every shot and records the browser bump without changing the failed verdict', () => {
    const options = refresh();
    fs.writeFileSync(path.join(baselineDir, 'shots', 'a.png'), 'old-a');
    const result = promote(options);
    expect(result.promoted).toEqual(['a', 'b']);
    expect(result.manifest.browser).toBe('chromium-140.0');
    expect(result.manifest.decisions.at(-1).reason).toBe('browser bump');
    expect(
      fs.readFileSync(path.join(baselineDir, 'shots', 'a.png'), 'utf8'),
    ).toBe('new-a');
    expect(options.verdict.status).toBe('failed');
  });

  it.each([
    [
      'another capture failure',
      options => options.verdict.failures.push({key: 'a', error: 'timeout'}),
    ],
    [
      'another baseline error',
      options => (options.verdict.failures[0].error = 'baseline is corrupt'),
    ],
    [
      'an unrelated failure key',
      options => (options.verdict.failures[0].key = 'a'),
    ],
    [
      'inconsistent failure count',
      options => (options.verdict.counts.failed = 2),
    ],
    [
      'inconsistent capture count',
      options => (options.verdict.counts.total = 3),
    ],
    ['no failure list', options => delete options.verdict.failures],
    [
      'a platform change',
      options => (options.currentManifest.platform = 'darwin-arm64'),
    ],
    [
      'a viewport change',
      options => (options.currentManifest.viewport.width = 800),
    ],
    ['missing viewport', options => delete options.currentManifest.viewport],
    [
      'an unchanged browser',
      options => (options.currentManifest.browser = 'chromium-139.0'),
    ],
    [
      'missing browser identity',
      options => delete options.currentManifest.browser,
    ],
    ['a partial selection', options => (options.keys = ['a'])],
    [
      'an omitted baseline shot',
      options => {
        delete options.currentManifest.shots.b;
        options.keys = ['a'];
        options.verdict.counts.total = 1;
      },
    ],
    ['pruning', options => (options.prune = ['b'])],
    ['reported removals', options => (options.verdict.removed = ['b'])],
    ['a missing PNG', () => fs.rmSync(path.join(captureDir, 'shots', 'b.png'))],
    [
      'a changed PNG',
      () =>
        fs.writeFileSync(path.join(captureDir, 'shots', 'b.png'), 'corrupt'),
    ],
    [
      'a missing digest',
      options => delete options.currentManifest.shots.b.sha256,
    ],
  ])('refuses %s without changing any baseline bytes', (_label, mutate) => {
    const options = refresh();
    const before = fs.readFileSync(
      path.join(baselineDir, 'manifest.json'),
      'utf8',
    );
    fs.writeFileSync(path.join(baselineDir, 'shots', 'a.png'), 'old-a');
    fs.writeFileSync(path.join(baselineDir, 'shots', 'b.png'), 'old-b');
    mutate(options);
    expect(() => promote(options)).toThrow(/Refusing to promote/);
    expect(
      fs.readFileSync(path.join(baselineDir, 'shots', 'a.png'), 'utf8'),
    ).toBe('old-a');
    expect(
      fs.readFileSync(path.join(baselineDir, 'shots', 'b.png'), 'utf8'),
    ).toBe('old-b');
    expect(
      fs.readFileSync(path.join(baselineDir, 'manifest.json'), 'utf8'),
    ).toBe(before);
  });
});

describe('incomparable', () => {
  it('refuses a baseline from another platform', () => {
    expect(
      incomparable({platform: 'darwin-arm64'}, {platform: 'linux-arm64'}),
    ).toMatch(/darwin-arm64/);
  });

  it('refuses a baseline captured at another viewport', () => {
    const reason = incomparable(
      {platform: 'linux-arm64', viewport: {width: 800, height: 600}},
      {platform: 'linux-arm64', viewport: {width: 1024, height: 768}},
    );
    expect(reason).toMatch(/viewport/);
  });

  it('allows a first run against an empty baseline', () => {
    expect(incomparable({}, {platform: 'linux-arm64'})).toBeNull();
  });
});
