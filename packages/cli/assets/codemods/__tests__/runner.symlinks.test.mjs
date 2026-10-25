// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The codemod walkers never follow a symbolic link into installed
 * dependencies, a package store or version-control metadata; other linked
 * folders are still scanned, read-only.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {runCodemods} from '../runner.mjs';
import {findSourceFiles as findIntegrationSourceFiles} from '../run-codemod.mjs';

let tmpDir;
let originalCwd;

beforeEach(() => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-runner-test-'));
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('findSourceFiles — symbolic links into dependency trees', () => {
  const manifests = [
    {
      version: '0.1.3',
      transforms: [
        {
          name: 'p',
          meta: {title: 'p'},
          transform: f => f.source.replace(/foo/g, 'bar'),
        },
      ],
    },
  ];

  // A tree a symlinked dependency folder points at: a package store outside
  // the project, holding a file the transform would change.
  function seedStore() {
    const store = path.join(tmpDir, 'store', 'node_modules', 'pkg');
    fs.mkdirSync(store, {recursive: true});
    fs.writeFileSync(path.join(store, 'index.ts'), 'const foo = 1;\n');
    fs.mkdirSync(path.join(tmpDir, 'src'), {recursive: true});
    fs.writeFileSync(path.join(tmpDir, 'src', 'real.ts'), 'const foo = 2;\n');
    return store;
  }

  it('does not descend a symlinked node_modules', async () => {
    const store = seedStore();
    fs.symlinkSync(
      path.dirname(store),
      path.join(tmpDir, 'src', 'node_modules'),
    );

    const r = await runCodemods(manifests, {
      apply: true,
      path: './src',
      root: tmpDir,
      silent: true,
    });

    expect(r.writtenFiles.map(f => path.basename(f))).toEqual(['real.ts']);
    expect(r.protectedFiles).toEqual([]);
    expect(
      findIntegrationSourceFiles(path.join(tmpDir, 'src')).map(f =>
        path.relative(tmpDir, f),
      ),
    ).toEqual([path.join('src', 'real.ts')]);
  });

  it('does not descend a link whose target is inside a dependency tree', async () => {
    const store = seedStore();
    fs.symlinkSync(store, path.join(tmpDir, 'src', 'pkg'));

    const r = await runCodemods(manifests, {
      apply: true,
      path: './src',
      root: tmpDir,
      silent: true,
    });

    expect(r.writtenFiles.map(f => path.basename(f))).toEqual(['real.ts']);
    expect(r.protectedFiles).toEqual([]);
    expect(
      findIntegrationSourceFiles(path.join(tmpDir, 'src')).map(f =>
        path.relative(tmpDir, f),
      ),
    ).toEqual([path.join('src', 'real.ts')]);
  });

  it('does not descend a link into a Yarn cache folder', async () => {
    const cached = path.join(tmpDir, '.yarn', 'cache', 'pkg');
    fs.mkdirSync(cached, {recursive: true});
    fs.writeFileSync(path.join(cached, 'index.ts'), 'const foo = 1;\n');
    fs.mkdirSync(path.join(tmpDir, 'src'), {recursive: true});
    fs.writeFileSync(path.join(tmpDir, 'src', 'real.ts'), 'const foo = 2;\n');
    fs.symlinkSync(cached, path.join(tmpDir, 'src', 'pkg'));

    const r = await runCodemods(manifests, {
      apply: true,
      path: '.',
      root: tmpDir,
      silent: true,
    });

    expect(r.writtenFiles.map(f => path.basename(f))).toEqual(['real.ts']);
    expect(r.protectedFiles).toEqual([]);
    expect(
      findIntegrationSourceFiles(tmpDir).map(f => path.relative(tmpDir, f)),
    ).toEqual([path.join('src', 'real.ts')]);
  });

  it('still descends ordinary symlinked directories in a project below a node_modules folder', async () => {
    const project = path.join(tmpDir, 'node_modules', 'consumer');
    const shared = path.join(project, 'shared');
    fs.mkdirSync(path.join(project, 'src'), {recursive: true});
    fs.mkdirSync(shared, {recursive: true});
    fs.writeFileSync(path.join(shared, 'nested.ts'), 'const foo = 1;\n');
    fs.symlinkSync(shared, path.join(project, 'src', 'linked'));

    const r = await runCodemods(manifests, {
      apply: true,
      path: path.join(project, 'src'),
      root: project,
      silent: true,
    });

    expect(r.protectedFiles).toEqual([
      expect.objectContaining({
        file: 'src/linked/nested.ts',
        reason: 'symlink',
      }),
    ]);
    expect(
      findIntegrationSourceFiles(path.join(project, 'src'), project).map(f =>
        path.relative(project, f),
      ),
    ).toEqual([path.join('src', 'linked', 'nested.ts')]);
  });

  it('does not descend a link into a Yarn cache outside the project', async () => {
    const project = path.join(tmpDir, 'project');
    const cached = path.join(tmpDir, 'other-project', '.yarn', 'cache', 'pkg');
    fs.mkdirSync(cached, {recursive: true});
    fs.writeFileSync(path.join(cached, 'index.ts'), 'const foo = 1;\n');
    fs.mkdirSync(path.join(project, 'src'), {recursive: true});
    fs.writeFileSync(path.join(project, 'src', 'real.ts'), 'const foo = 2;\n');
    fs.symlinkSync(
      path.join('..', '..', 'other-project', '.yarn', 'cache', 'pkg'),
      path.join(project, 'src', 'pkg'),
    );

    const r = await runCodemods(manifests, {
      apply: true,
      path: path.join(project, 'src'),
      root: project,
      silent: true,
    });

    expect(r.writtenFiles.map(f => path.basename(f))).toEqual(['real.ts']);
    expect(r.protectedFiles).toEqual([]);
    expect(
      findIntegrationSourceFiles(path.join(project, 'src')).map(f =>
        path.relative(project, f),
      ),
    ).toEqual([path.join('src', 'real.ts')]);
    expect(fs.readFileSync(path.join(cached, 'index.ts'), 'utf-8')).toBe(
      'const foo = 1;\n',
    );
  });

  it('does not descend a link from a project below node_modules to a sibling dependency', async () => {
    const project = path.join(tmpDir, 'node_modules', 'consumer');
    const sibling = path.join(tmpDir, 'node_modules', 'dep');
    fs.mkdirSync(path.join(project, 'src'), {recursive: true});
    fs.mkdirSync(sibling, {recursive: true});
    fs.writeFileSync(path.join(sibling, 'index.ts'), 'const foo = 1;\n');
    fs.writeFileSync(path.join(project, 'src', 'real.ts'), 'const foo = 2;\n');
    fs.symlinkSync(sibling, path.join(project, 'src', 'dep'));

    const r = await runCodemods(manifests, {
      apply: true,
      path: path.join(project, 'src'),
      root: project,
      silent: true,
    });

    expect(r.writtenFiles.map(f => path.basename(f))).toEqual(['real.ts']);
    expect(r.protectedFiles).toEqual([]);
    expect(
      findIntegrationSourceFiles(path.join(project, 'src'), project).map(f =>
        path.relative(project, f),
      ),
    ).toEqual([path.join('src', 'real.ts')]);
    expect(fs.readFileSync(path.join(sibling, 'index.ts'), 'utf-8')).toBe(
      'const foo = 1;\n',
    );
  });
});
