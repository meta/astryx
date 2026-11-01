// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @input Canonical CI-shaped reports and hostile artifact mutations.
 * @output Exact-attempt publication and sanitization contracts, without recapture.
 * @position Node regression tests for the PR report's data-only trust boundary.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {PNG} from 'pngjs';

import {publishPrReport} from './publish-pr-report.mjs';

const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);
const TESTED = 'c'.repeat(40);
const KEY = 'core-button--default__neutral-light';
let root, input, output, verdict;
const json = () =>
  fs.writeFileSync(path.join(input, 'verdict.json'), JSON.stringify(verdict));
const run = (overrides = {}) =>
  publishPrReport({
    input,
    output,
    headSha: HEAD,
    baseSha: BASE,
    runId: '123',
    runAttempt: '2',
    ...overrides,
  });

function png(kind, red) {
  const image = new PNG({width: 2, height: 2});
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = red;
    image.data[i + 3] = 255;
  }
  const dir = path.join(input, 'report', kind);
  fs.mkdirSync(dir, {recursive: true});
  // Noncanonical encoding and metadata must not escape into the public file.
  image.gamma = 0.45;
  fs.writeFileSync(
    path.join(dir, `${KEY}.png`),
    PNG.sync.write(image, {deflateLevel: 0}),
  );
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'canonical-visual-report-'));
  input = path.join(root, 'input');
  output = path.join(root, 'output');
  fs.mkdirSync(input);
  verdict = {
    version: 1,
    status: 'changed',
    generatedAt: '2026-09-23T00:00:00Z',
    platform: 'linux-arm64',
    context: {
      sha: TESTED,
      headSha: HEAD,
      baseSha: BASE,
      runId: '123',
      runAttempt: '2',
    },
    counts: {
      total: 1,
      unchanged: 0,
      changed: 1,
      added: 0,
      removed: 0,
      failed: 0,
    },
    changes: [
      {
        key: KEY,
        component: 'Button',
        title: 'Core/Button',
        name: 'Default',
        theme: 'neutral',
        mode: 'light',
        diffPixels: 3,
        diffRatio: 0.75,
      },
    ],
    added: [],
    removed: [],
    failures: [],
  };
  json();
  for (const [kind, red] of [
    ['before', 0],
    ['after', 255],
    ['diff', 128],
  ])
    png(kind, red);
  fs.writeFileSync(
    path.join(input, 'report', 'index.html'),
    '<script>throw new Error("PR HTML executed")</script>',
  );
});
afterEach(() => fs.rmSync(root, {recursive: true, force: true}));

describe('canonical visual report publication', () => {
  it('publishes fork-run report data without substituting a newer live base', () => {
    expect(run({baseSha: ''}).context.baseSha).toBe(BASE);
    verdict.context.baseSha = 'not-a-sha';
    json();
    expect(() => run({baseSha: ''})).toThrow('exact CI');
  });

  it('preserves the CI verdict without recapturing or comparing again', () => {
    const result = run();
    expect(result.status).toBe('changed');
    // These 2x2 frames differ at four pixels, but the report must retain the
    // CI-reported three. A publisher is not another comparison authority.
    expect(result.changes[0].diffPixels).toBe(3);
    expect(result.context).toEqual(verdict.context);
    const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
    expect(html).toContain(`before/${KEY}.png`);
    expect(html).not.toContain('PR HTML executed');
    expect(html).not.toContain('/accept-visual');
    expect(fs.existsSync(path.join(output, 'evidence.json'))).toBe(false);
    const bytes = fs.readFileSync(path.join(output, 'after', `${KEY}.png`));
    expect(bytes).not.toEqual(
      fs.readFileSync(path.join(input, 'report', 'after', `${KEY}.png`)),
    );
    expect([...PNG.sync.read(bytes).data]).toEqual([
      255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255,
    ]);
  });

  it('accepts a report from an earlier attempt of the same run, never a later one', () => {
    // Rerunning only the failed jobs keeps the passing visual job's artifact.
    verdict.context.runAttempt = '1';
    json();
    expect(run({runAttempt: '2'}).context.runAttempt).toBe('1');
    verdict.context.runAttempt = '3';
    json();
    expect(() => run({runAttempt: '2'})).toThrow('exact CI');
  });

  it.each(['headSha', 'baseSha', 'runId', 'runAttempt'])(
    'refuses stale or forged %s',
    field => {
      verdict.context[field] = field.endsWith('Sha') ? 'd'.repeat(40) : '9';
      json();
      expect(() => run()).toThrow('exact CI head/base/run/attempt');
    },
  );

  it('rejects a malformed tested-tree SHA and invalid trusted identity', () => {
    verdict.context.sha = 'main';
    json();
    expect(() => run()).toThrow('exact CI');
    expect(() => run({runAttempt: '0'})).toThrow(
      'invalid trusted run identity',
    );
  });

  it.each(['pass', 'skipped', 'failed'])(
    'reports %s without manufacturing comparison evidence',
    status => {
      verdict.status = status;
      verdict.changes = [];
      verdict.counts.changed = 0;
      verdict.counts.unchanged = status === 'pass' ? 1 : 0;
      if (status === 'failed') {
        verdict.failures = [{key: KEY, error: 'Capture failed'}];
        verdict.counts.failed = 1;
      }
      if (status === 'skipped') verdict.reason = 'Over review budget';
      json();
      expect(run().status).toBe(status);
      expect(fs.existsSync(path.join(output, 'after'))).toBe(false);
      const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
      expect(html).not.toContain('daily release gate');
      if (status === 'skipped')
        expect(html).toContain('not passing visual evidence');
    },
  );

  it.each(['added', 'removed'])(
    'publishes the canonical %s frame, without inferring new keys',
    kind => {
      verdict.changes = [];
      verdict.counts.changed = 0;
      verdict[kind] = [KEY];
      verdict.counts[kind] = 1;
      json();
      const result = run();
      expect(result[kind]).toEqual([KEY]);
      const imageKind = kind === 'added' ? 'after' : 'before';
      expect(fs.existsSync(path.join(output, imageKind, `${KEY}.png`))).toBe(
        true,
      );
    },
  );

  it.each(['../escape', '..', 'frame/escape', 'bad" onerror="x'])(
    'rejects unsafe image key %s',
    value => {
      verdict.changes[0].key = value;
      json();
      expect(() => run()).toThrow('invalid shot key');
    },
  );

  it('escapes text and rejects markup in numeric fields', () => {
    verdict.changes[0].name = '<img src=x onerror=alert(1)>';
    json();
    run();
    expect(fs.readFileSync(path.join(output, 'index.html'), 'utf8')).toContain(
      '&lt;img src=x onerror=alert(1)&gt;',
    );
    verdict.counts.total = '<script>alert(1)</script>';
    json();
    expect(() => run()).toThrow('invalid report number');
  });

  it('refuses inconsistent counts and unknown statuses', () => {
    verdict.counts.changed = 0;
    json();
    expect(() => run()).toThrow('counts do not match');
    verdict.status = 'not-a-verdict';
    json();
    expect(() => run()).toThrow('invalid verdict');
  });

  it('bounds JSON and image allocations', () => {
    fs.writeFileSync(
      path.join(input, 'verdict.json'),
      ' '.repeat(2 * 1024 * 1024 + 1),
    );
    expect(() => run()).toThrow('invalid artifact file');
    json();
    const file = path.join(input, 'report', 'before', `${KEY}.png`);
    const bytes = fs.readFileSync(file);
    bytes.writeUInt32BE(100_000, 16);
    fs.writeFileSync(file, bytes);
    expect(() => run()).toThrow('invalid PNG dimensions');
  });

  it('rejects missing/corrupt frames instead of publishing broken evidence', () => {
    fs.writeFileSync(
      path.join(input, 'report', 'before', `${KEY}.png`),
      'not an image',
    );
    expect(() => run()).toThrow('invalid PNG header');
    fs.rmSync(path.join(input, 'report', 'after', `${KEY}.png`));
    png('before', 0);
    expect(() => run()).toThrow();
  });

  it('refuses symlink files and parent directories outside the artifact', () => {
    const original = path.join(input, 'report', 'before', `${KEY}.png`);
    const external = path.join(root, 'external.png');
    fs.renameSync(original, external);
    fs.symlinkSync(external, original);
    expect(() => run()).toThrow('invalid artifact file');
    fs.rmSync(path.join(input, 'report', 'before'), {recursive: true});
    const outside = path.join(root, 'outside');
    fs.mkdirSync(outside);
    fs.copyFileSync(external, path.join(outside, `${KEY}.png`));
    fs.symlinkSync(outside, path.join(input, 'report', 'before'));
    expect(() => run()).toThrow('invalid artifact file');
  });
});
