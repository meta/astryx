// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Integration proof for filesystems that reject hard links.
 *
 * A module mock makes `fs.linkSync` fail the way those filesystems do (EPERM,
 * or EXDEV across devices), so `applyWrites` publishes through the
 * exclusive-copy fallback on every run. Private tests use injected seams, not
 * environment variables (AST-017 FR14, DEC-5); the last case holds the
 * publish-file module and its proofs to that.
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import {fileURLToPath} from 'node:url';
import jscodeshift from 'jscodeshift';

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    linkSync: vi.fn(() => {
      throw Object.assign(new Error('EPERM: operation not permitted, link'), {code: 'EPERM'});
    }),
    copyFileSync: vi.fn(actual.copyFileSync),
  };
});

const {applyWrites} = await import('../../api/integration/add-helpers.mjs');
const fs = await import('node:fs');

describe.each(['EPERM', 'EXDEV'])('hard links fail with %s', code => {
  let testDir;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.linkSync).mockImplementation(() => {
      throw Object.assign(new Error(`${code}: cannot link`), {code});
    });
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), '.astryx-publish-proof-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, {recursive: true, force: true});
  });

  it('applyWrites creates files through the exclusive-copy fallback', () => {
    const plans = [
      {
        path: path.join(testDir, 'MyComponent.tsx'),
        contents: '// MyComponent\nexport default function MyComponent() {}\n',
        createOnly: true,
      },
      {
        path: path.join(testDir, 'MyComponent.test.tsx'),
        contents: '// test\nimport MyComponent from "./MyComponent";\n',
        createOnly: true,
      },
    ];

    const rollback = applyWrites(plans);
    expect(typeof rollback).toBe('function');
    expect(fs.readFileSync(plans[0].path, 'utf-8')).toContain('MyComponent');
    expect(fs.readFileSync(plans[1].path, 'utf-8')).toContain('test');
    expect(fs.linkSync).toHaveBeenCalledTimes(plans.length);
    for (const plan of plans) {
      expect(fs.copyFileSync).toHaveBeenCalledWith(
        expect.any(String),
        plan.path,
        fs.constants.COPYFILE_EXCL,
      );
    }
  });

  it('applyWrites preserves no-clobber behavior', () => {
    const target = path.join(testDir, 'existing.tsx');
    fs.writeFileSync(target, '// original\n');

    expect(() =>
      applyWrites([
        {
          path: target,
          contents: '// replacement\n',
          createOnly: true,
        },
      ]),
    ).toThrow(/overwrite|exists/i);
    expect(fs.readFileSync(target, 'utf-8')).toBe('// original\n');
  });

  it('applyWrites rolls back partial publication', () => {
    const good = path.join(testDir, 'good.tsx');
    const bad = path.join(testDir, 'bad.tsx');
    fs.writeFileSync(bad, '// preexisting\n');

    expect(() =>
      applyWrites([
        {path: good, contents: '// good file\n', createOnly: true},
        {path: bad, contents: '// replacement\n', createOnly: true},
      ]),
    ).toThrow();
    expect(fs.existsSync(good)).toBe(false);
    expect(fs.readFileSync(bad, 'utf-8')).toBe('// preexisting\n');
  });

  it('applyWrites keeps compare-and-swap replacement behavior', () => {
    const target = path.join(testDir, 'config.json');
    const original = '{"version": 1}\n';
    fs.writeFileSync(target, original);

    const rollback = applyWrites([
      {
        path: target,
        contents: '{"version": 2}\n',
        createOnly: false,
        expectedOriginal: Buffer.from(original),
      },
    ]);
    expect(typeof rollback).toBe('function');
    expect(fs.readFileSync(target, 'utf-8')).toBe('{"version": 2}\n');
  });
});

describe('private test seams', () => {
  it('no publish-file module or proof reads process.env', () => {
    const self = fileURLToPath(import.meta.url);
    const dir = path.dirname(self);
    const files = fs.readdirSync(dir).filter(name => /^publish-file.*\.mjs$/.test(name));
    const j = jscodeshift.withParser('babylon');
    const reads = files.flatMap(name =>
      j(fs.readFileSync(path.join(dir, name), 'utf8'))
        .find(j.MemberExpression, {object: {name: 'process'}})
        .filter(p => (p.node.computed ? p.node.property.value : p.node.property.name) === 'env')
        .nodes()
        .map(node => `${name}:${node.loc?.start.line}`),
    );

    expect(files).toEqual(expect.arrayContaining(['publish-file.mjs', path.basename(self)]));
    expect(reads).toEqual([]);
  });
});
