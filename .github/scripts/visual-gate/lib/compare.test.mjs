// Copyright (c) Meta Platforms, Inc. and affiliates.

import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {PNG} from 'pngjs';

import {
  analyzeTargeting,
  buildVerdict,
  compareCaptures,
  compareReleaseCaptures,
  partitionComparisonKeys,
} from './compare.mjs';
import {createReleasePlan} from './plan.mjs';

/** A solid rectangle, so a change is unambiguous. */
function png(width, height, [r, g, b]) {
  const image = new PNG({width, height});
  for (let index = 0; index < image.data.length; index += 4) {
    image.data[index] = r;
    image.data[index + 1] = g;
    image.data[index + 2] = b;
    image.data[index + 3] = 255;
  }
  return PNG.sync.write(image);
}

let root;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-gate-'));
  fs.mkdirSync(path.join(root, 'baseline'), {recursive: true});
  fs.mkdirSync(path.join(root, 'current'), {recursive: true});
});
afterEach(() => fs.rmSync(root, {recursive: true, force: true}));

function write(dir, key, buffer) {
  fs.writeFileSync(path.join(root, dir, `${key}.png`), buffer);
}

function manifest(shots) {
  return {
    platform: 'linux-arm64',
    viewport: {width: 100, height: 100},
    shots: Object.fromEntries(
      Object.entries(shots).map(([key, value]) => [
        key,
        {sha256: value.sha256, width: 10, height: 10, storyId: key, packageName: '@astryxdesign/core', packageNames: ['@astryxdesign/core'], stableVisual: true, theme: 'neutral', themePackageName: '@astryxdesign/theme-neutral', stableThemeVisual: true, mode: 'light', reasons: ['surface'], ...value},
      ]),
    ),
  };
}

const compare = (baseline, current) =>
  compareCaptures({
    baselineDir: path.join(root, 'baseline'),
    currentDir: path.join(root, 'current'),
    baselineManifest: baseline,
    currentManifest: current,
    diffDir: path.join(root, 'diff'),
    threshold: 0.1,
    maxDiffPixels: 0,
  });

describe('compareCaptures', () => {
  it('balances the current 3,378-shot comparison across two CPU workers', () => {
    const keys = Array.from({length: 3378}, (_, index) => `shot-${index}`);
    const partitions = partitionComparisonKeys(keys, 2);
    expect(partitions.map(partition => partition.length)).toEqual([1689, 1689]);
    expect(new Set(partitions.flat()).size).toBe(3378);
  });

  it('calls an identical shot unchanged without decoding it', async () => {
    write('baseline', 'a', png(10, 10, [255, 0, 0]));
    write('current', 'a', png(10, 10, [255, 0, 0]));
    const result = await compare(manifest({a: {sha256: 'same'}}), manifest({a: {sha256: 'same'}}));
    expect(result).toMatchObject({unchanged: ['a'], changes: [], added: [], removed: []});
  });

  it('skips pixelmatch when differently encoded PNGs decode to identical pixels', async () => {
    const image = png(10, 10, [255, 0, 0]);
    const decoded = PNG.sync.read(image);
    write('baseline', 'a', PNG.sync.write(decoded, {deflateLevel: 1, filterType: 0}));
    write('current', 'a', PNG.sync.write(decoded, {deflateLevel: 9, filterType: -1}));

    const result = await compare(
      manifest({a: {sha256: 'baseline-encoding'}}),
      manifest({a: {sha256: 'current-encoding'}}),
    );

    expect(result).toMatchObject({unchanged: ['a'], changes: []});
    expect(fs.readdirSync(path.join(root, 'diff'))).toEqual([]);
  });

  it('reports a changed shot with its pixel count and writes a diff image', async () => {
    write('baseline', 'a', png(10, 10, [255, 0, 0]));
    write('current', 'a', png(10, 10, [0, 0, 255]));
    const result = await compare(manifest({a: {sha256: 'one'}}), manifest({a: {sha256: 'two'}}));
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({key: 'a', diffPixels: 100, sizeChanged: false});
    expect(fs.existsSync(path.join(root, 'diff', 'a.png'))).toBe(true);
  });

  it('treats a size change as a change even when the shared pixels match', async () => {
    write('baseline', 'a', png(10, 10, [255, 0, 0]));
    write('current', 'a', png(10, 20, [255, 0, 0]));
    const result = await compare(manifest({a: {sha256: 'one'}}), manifest({a: {sha256: 'two'}}));
    expect(result.changes[0].sizeChanged).toBe(true);
  });

  it('adopts a shot with no baseline instead of failing it', async () => {
    write('current', 'new', png(10, 10, [0, 255, 0]));
    const result = await compare(manifest({}), manifest({new: {sha256: 'x'}}));
    expect(result).toMatchObject({added: ['new'], changes: []});
  });

  it('never reports removals from an ordinary comparison', async () => {
    const result = await compare(manifest({gone: {sha256: 'x'}}), manifest({}));
    expect(result.removed).toEqual([]);
  });

  it('reports a true removal only from an exact canonical release capture', async () => {
    const baseline = manifest({kept: {sha256: 'same'}, gone: {sha256: 'old'}});
    const current = manifest({kept: {sha256: 'same'}});
    current.context = {releasePlan: createReleasePlan([{key: 'kept'}])};
    const result = await compareReleaseCaptures({
      baselineDir: path.join(root, 'baseline'),
      currentDir: path.join(root, 'current'),
      baselineManifest: baseline,
      currentManifest: current,
      diffDir: path.join(root, 'diff'),
      threshold: 0.1,
      maxDiffPixels: 0,
      failures: [],
    });
    expect(result.removed).toEqual(['gone']);
  });

  it.each([
    ['subset', ['a']],
    ['superset', ['a', 'b', 'c']],
  ])('rejects a canonical %s that differs from captured keys', async (_name, keys) => {
    const current = manifest({a: {sha256: 'a'}, b: {sha256: 'b'}});
    current.context = {releasePlan: createReleasePlan(keys.map(key => ({key})))};
    await expect(compareReleaseCaptures({
      baselineDir: path.join(root, 'baseline'),
      currentDir: path.join(root, 'current'),
      baselineManifest: manifest({}),
      currentManifest: current,
      diffDir: path.join(root, 'diff'),
      threshold: 0.1,
      maxDiffPixels: 0,
      failures: [],
    })).rejects.toThrow(/exactly cover/);
  });

  it('returns an incomplete comparison for capture failures without removals', async () => {
    const current = manifest({a: {sha256: 'a'}});
    current.context = {releasePlan: createReleasePlan([{key: 'a'}])};
    const failures = [{key: 'a', error: 'capture failed'}];
    const comparison = await compareReleaseCaptures({
      baselineDir: path.join(root, 'baseline'),
      currentDir: path.join(root, 'current'),
      baselineManifest: manifest({gone: {sha256: 'old'}}),
      currentManifest: current,
      diffDir: path.join(root, 'diff'),
      threshold: 0.1,
      maxDiffPixels: 0,
      failures,
    });
    expect(comparison.removed).toEqual([]);
    expect(
      buildVerdict({
        comparison,
        currentManifest: current,
        baselineManifest: manifest({}),
        targeting: {},
        failures,
        context: current.context,
      }).status,
    ).toBe('failed');
  });

  it('prunes only enumerated reviewed removal keys', () => {
    const gate = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../gate.mjs');
    const baselineDir = path.join(root, 'accepted-baseline');
    const captureDir = path.join(root, 'release-capture');
    fs.mkdirSync(path.join(baselineDir, 'shots'), {recursive: true});
    fs.mkdirSync(path.join(captureDir, 'shots'), {recursive: true});
    fs.writeFileSync(path.join(baselineDir, 'shots/b.png'), png(1, 1, [1, 1, 1]));
    fs.writeFileSync(path.join(baselineDir, 'shots/c.png'), png(1, 1, [2, 2, 2]));
    fs.writeFileSync(path.join(baselineDir, 'manifest.json'), JSON.stringify(manifest({b: {sha256: 'b'}, c: {sha256: 'c'}})));
    const current = manifest({a: {sha256: 'a'}});
    current.context = {releasePlan: createReleasePlan([{key: 'a'}])};
    fs.writeFileSync(path.join(captureDir, 'manifest.json'), JSON.stringify(current));
    fs.writeFileSync(path.join(captureDir, 'verdict.json'), JSON.stringify({
      status: 'changed',
      removed: ['b', 'c'],
      context: current.context,
    }));
    execFileSync(process.execPath, [gate, 'accept', '--baseline', baselineDir, '--out', captureDir, '--keys', 'b', '--prune', '--reason', 'Reviewed deletion'], {encoding: 'utf8'});
    const accepted = JSON.parse(fs.readFileSync(path.join(baselineDir, 'manifest.json'), 'utf8'));
    expect(accepted.shots.b).toBeUndefined();
    expect(accepted.shots.c).toBeDefined();
    expect(accepted.context?.releasePlan).toBeUndefined();
    expect(fs.existsSync(path.join(baselineDir, 'shots/c.png'))).toBe(true);
  });

  it('prunes every reviewed removal when keys=all', () => {
    const gate = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../gate.mjs');
    const baselineDir = path.join(root, 'all-baseline');
    const captureDir = path.join(root, 'all-release-capture');
    fs.mkdirSync(path.join(baselineDir, 'shots'), {recursive: true});
    fs.mkdirSync(path.join(captureDir, 'shots'), {recursive: true});
    for (const [key, value] of [
      ['b', [1, 1, 1]],
      ['c', [2, 2, 2]],
    ]) {
      fs.writeFileSync(
        path.join(baselineDir, `shots/${key}.png`),
        png(1, 1, value),
      );
    }
    fs.writeFileSync(
      path.join(baselineDir, 'manifest.json'),
      JSON.stringify(manifest({b: {sha256: 'b'}, c: {sha256: 'c'}})),
    );
    const current = manifest({a: {sha256: 'a'}});
    current.context = {releasePlan: createReleasePlan([{key: 'a'}])};
    fs.writeFileSync(
      path.join(captureDir, 'manifest.json'),
      JSON.stringify(current),
    );
    fs.writeFileSync(
      path.join(captureDir, 'verdict.json'),
      JSON.stringify({
        status: 'changed',
        removed: ['b', 'c'],
        context: current.context,
      }),
    );

    execFileSync(
      process.execPath,
      [
        gate,
        'accept',
        '--baseline',
        baselineDir,
        '--out',
        captureDir,
        '--keys',
        'all',
        '--prune',
        '--reason',
        'Reviewed policy reduction',
      ],
      {encoding: 'utf8'},
    );

    const accepted = JSON.parse(
      fs.readFileSync(path.join(baselineDir, 'manifest.json'), 'utf8'),
    );
    expect(Object.keys(accepted.shots)).toEqual([]);
    expect(fs.existsSync(path.join(baselineDir, 'shots/b.png'))).toBe(false);
    expect(fs.existsSync(path.join(baselineDir, 'shots/c.png'))).toBe(false);
  });

  it('rejects caller-controlled canonical release scope', () => {
    const gate = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../gate.mjs');
    expect(() =>
      execFileSync(process.execPath, [gate, 'release', '--tiers', 'surface'], {encoding: 'utf8'}),
    ).toThrow(/stable release plan is internal/);
  });

  it('keeps current-manifest order when equal diffs cross worker partitions', async () => {
    const keys = ['a', 'b', 'c', 'd'];
    for (const key of keys) {
      write('baseline', key, png(10, 10, [255, 0, 0]));
      write('current', key, png(10, 10, [0, 0, 255]));
    }
    const before = manifest(
      Object.fromEntries(keys.map(key => [key, {sha256: `before-${key}`}]))
    );
    const after = manifest(
      Object.fromEntries(keys.map(key => [key, {sha256: `after-${key}`}]))
    );

    const result = await compare(before, after);

    expect(result.changes.map(change => change.key)).toEqual(keys);
  });

  it('ranks the biggest change first', async () => {
    write('baseline', 'small', png(10, 10, [255, 0, 0]));
    write('current', 'small', png(10, 10, [255, 0, 10]));
    write('baseline', 'big', png(10, 10, [255, 0, 0]));
    write('current', 'big', png(10, 10, [0, 0, 255]));
    const before = manifest({small: {sha256: '1'}, big: {sha256: '2'}});
    const after = manifest({small: {sha256: '3'}, big: {sha256: '4'}});
    const result = await compare(before, after);
    expect(result.changes[0].key).toBe('big');
  });
});

describe('analyzeTargeting', () => {
  const targets = [{key: 'button', component: 'Button', props: ['variant:primary'], states: []}];

  it('flags a theme override whose target never rendered', () => {
    const result = analyzeTargeting({
      observedTargets: {button: ['variant:primary']},
      targets,
      themeOverrides: {y2k: {button: ['base'], 'top-nav-item': ['selected']}},
    });
    expect(result.unexercisedOverrides).toEqual([{theme: 'y2k', key: 'top-nav-item'}]);
  });

  it('flags a state the theme styles but the DOM never reflected', () => {
    const result = analyzeTargeting({
      observedTargets: {button: ['variant:primary']},
      targets,
      themeOverrides: {y2k: {button: ['base', 'variant:ghost']}},
    });
    expect(result.unexercisedOverrides).toEqual([{theme: 'y2k', key: 'button', selector: 'variant:ghost'}]);
  });

  it('ignores base and pseudo-class selectors, which the DOM cannot confirm', () => {
    const result = analyzeTargeting({
      observedTargets: {button: []},
      targets,
      themeOverrides: {y2k: {button: ['base', ':hover']}},
    });
    expect(result.unexercisedOverrides).toEqual([]);
  });

  it('separates a documented target nothing rendered from a rendered class nothing documents', () => {
    const result = analyzeTargeting({
      observedTargets: {surprise: []},
      targets,
      themeOverrides: {},
    });
    expect(result).toMatchObject({uncoveredTargets: ['button'], undeclaredTargets: ['surprise']});
  });
});

describe('buildVerdict', () => {
  const base = {
    currentManifest: manifest({a: {sha256: 'x', component: 'Button'}}),
    baselineManifest: {capturedAt: 'then', platform: 'linux-arm64'},
    targeting: {unexercisedOverrides: []},
    context: {sha: 'abc'},
  };

  it('is pass when nothing moved', () => {
    const verdict = buildVerdict({
      ...base,
      comparison: {changes: [], added: [], removed: [], unchanged: ['a']},
      failures: [],
    });
    expect(verdict.status).toBe('pass');
  });

  it('is changed — not failed — when a shot moved', () => {
    const verdict = buildVerdict({
      ...base,
      comparison: {changes: [{key: 'a', diffPixels: 9, diffRatio: 0.1, sizeChanged: false}], added: [], removed: [], unchanged: []},
      failures: [],
    });
    expect(verdict.status).toBe('changed');
    expect(verdict.changes[0].component).toBe('Button');
  });

  it('is failed when a shot could not be captured at all', () => {
    const verdict = buildVerdict({
      ...base,
      comparison: {changes: [], added: [], removed: [], unchanged: []},
      failures: [{key: 'a', error: 'boom'}],
    });
    expect(verdict.status).toBe('failed');
  });

  it('requires acceptance when stable shots are added or removed', () => {
    const verdict = buildVerdict({
      ...base,
      comparison: {changes: [], added: ['b'], removed: ['c'], unchanged: []},
      failures: [],
    });
    expect(verdict.status).toBe('changed');
    expect(verdict.counts).toMatchObject({added: 1, removed: 1});
  });
});
