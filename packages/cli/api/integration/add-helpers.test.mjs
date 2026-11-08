// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {applyWrites, packageJsonFilesUpdate} from './add-helpers.mjs';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-add-helpers-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('applyWrites', () => {
  it('refuses to replace a symlink and preserves its target', () => {
    const target = path.join(tmpDir, 'target.json');
    const link = path.join(tmpDir, 'manifest.json');
    fs.writeFileSync(target, '{"owner":"author"}\n');
    fs.symlinkSync(target, link);

    expect(() =>
      applyWrites([
        {
          path: link,
          contents: '{"owner":"agent"}\n',
          createOnly: false,
        },
      ]),
    ).toThrow(/Refusing to replace symlinked file/);
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(target, 'utf-8')).toBe('{"owner":"author"}\n');
  });

  it('rolls back only bytes still owned by the transaction', () => {
    const created = path.join(tmpDir, 'created.txt');
    const replaced = path.join(tmpDir, 'replaced.txt');
    fs.writeFileSync(replaced, 'before\n');

    const rollback = applyWrites([
      {path: created, contents: 'created-by-call\n', createOnly: true},
      {path: replaced, contents: 'replaced-by-call\n', createOnly: false},
    ]);
    fs.writeFileSync(created, 'concurrent-created\n');
    fs.writeFileSync(replaced, 'concurrent-replaced\n');

    rollback();

    expect(fs.readFileSync(created, 'utf-8')).toBe('concurrent-created\n');
    expect(fs.readFileSync(replaced, 'utf-8')).toBe('concurrent-replaced\n');
  });

  it('removes created files and restores replacements when bytes are unchanged', () => {
    const created = path.join(tmpDir, 'created.txt');
    const replaced = path.join(tmpDir, 'replaced.txt');
    fs.writeFileSync(replaced, 'before\n');

    const rollback = applyWrites([
      {path: created, contents: 'created-by-call\n', createOnly: true},
      {path: replaced, contents: 'replaced-by-call\n', createOnly: false},
    ]);
    rollback();

    expect(fs.existsSync(created)).toBe(false);
    expect(fs.readFileSync(replaced, 'utf-8')).toBe('before\n');
  });

  it('refuses a file changed after validation and preserves the new bytes', () => {
    const file = path.join(tmpDir, 'manifest.json');
    const validated = Buffer.from('{"themes":[]}\n');
    fs.writeFileSync(file, validated);
    fs.writeFileSync(file, '{"themes":[{"slug":"concurrent"}]}\n');

    expect(() =>
      applyWrites([
        {
          path: file,
          contents: '{"themes":[{"slug":"mine"}]}\n',
          createOnly: false,
          expectedOriginal: validated,
        },
      ]),
    ).toThrow(/changed while preparing/);
    expect(fs.readFileSync(file, 'utf-8')).toContain('concurrent');
  });
});

describe('packageJsonFilesUpdate', () => {
  it('never creates files when the package has no allowlist', () => {
    const file = path.join(tmpDir, 'package.json');
    fs.writeFileSync(file, '{"name":"fixture"}\n');
    expect(packageJsonFilesUpdate(file, ['astryx.integration.mjs'])).toBeNull();
  });

  it('never creates exports when the package has no exports field', () => {
    const file = path.join(tmpDir, 'package.json');
    fs.writeFileSync(file, '{"name":"fixture"}\n');
    expect(
      packageJsonFilesUpdate(
        file,
        [],
        [{subpath: 'components/Card.tsx', target: 'components/Card.tsx'}],
      ),
    ).toBeNull();
  });

  it('expands exports sugar and appends an exact source subpath', () => {
    const file = path.join(tmpDir, 'package.json');
    fs.writeFileSync(
      file,
      `${JSON.stringify({name: 'fixture', exports: './index.mjs'}, null, 2)}\n`,
    );
    const next = packageJsonFilesUpdate(
      file,
      [],
      [{subpath: 'components/Card.tsx', target: 'components/Card.tsx'}],
    );
    expect(JSON.parse(next?.contents ?? '').exports).toEqual({
      '.': './index.mjs',
      './components/Card.tsx': './components/Card.tsx',
    });
  });

  it('refuses to replace an authored export target', () => {
    const file = path.join(tmpDir, 'package.json');
    fs.writeFileSync(
      file,
      `${JSON.stringify({
        name: 'fixture',
        exports: {'./components/Card.tsx': './different.tsx'},
      })}\n`,
    );
    expect(() =>
      packageJsonFilesUpdate(
        file,
        [],
        [{subpath: 'components/Card.tsx', target: 'components/Card.tsx'}],
      ),
    ).toThrow(/refusing to replace/);
  });

  it('adds only missing normalized paths to an existing allowlist', () => {
    const file = path.join(tmpDir, 'package.json');
    fs.writeFileSync(
      file,
      `${JSON.stringify({name: 'fixture', files: ['./docs/']}, null, 2)}\n`,
    );
    const next = packageJsonFilesUpdate(file, [
      './docs',
      'astryx.integration.mjs',
    ]);
    expect(JSON.parse(next?.contents ?? '').files).toEqual([
      './docs/',
      'astryx.integration.mjs',
    ]);
    expect(next?.expectedOriginal.toString('utf-8')).toContain('"./docs/"');
  });
});
