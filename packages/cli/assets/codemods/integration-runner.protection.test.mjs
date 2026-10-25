// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {runIntegrationCodemods} from './integration-runner.mjs';

let root;
let originalCwd;

beforeEach(() => {
  root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'astryx-integration-protection-'),
  );
  originalCwd = process.cwd();
  process.chdir(root);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(root, {recursive: true, force: true});
});

function write(relative, contents) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, contents);
  return file;
}

describe('integration codemod file protection', () => {
  it('uses the same resolver for integration config and code codemods', async () => {
    write(
      '.gitattributes',
      [
        'astryx.config.mjs linguist-generated=true',
        'src/generated.js linguist-vendored=true',
        '',
      ].join('\n'),
    );
    write('astryx.config.mjs', "export default {value: 'old'};\n");
    write('src/generated.js', "export const value = 'old';\n");

    const groups = [
      {
        version: '1.0.0',
        codemods: [
          {
            id: 'config',
            type: 'config',
            package: '@acme/integration',
            codemod: {
              title: 'config',
              transform: file => file.source.replace('old', 'new'),
            },
          },
          {
            id: 'code',
            type: 'code',
            package: '@acme/integration',
            codemod: {
              title: 'code',
              fileExtensions: ['.js'],
              transform: file => file.source.replace('old', 'new'),
            },
          },
        ],
      },
    ];
    const jscodeshift = (await import('jscodeshift')).default;
    const result = runIntegrationCodemods(groups, {
      apply: true,
      path: path.join(root, 'src'),
      root,
      jscodeshift,
      silent: true,
    });

    expect(result.totalFilesChanged).toBe(0);
    expect(result.protectedFiles.map(item => item.file).sort()).toEqual([
      'astryx.config.mjs',
      'src/generated.js',
    ]);
    expect(
      fs.readFileSync(path.join(root, 'astryx.config.mjs'), 'utf8'),
    ).toContain('old');
    expect(
      fs.readFileSync(path.join(root, 'src/generated.js'), 'utf8'),
    ).toContain('old');
  });

  it('lets a staged declaration protect another file in the same entry', async () => {
    write('.gitattributes', '# authored\n');
    write('src/x.js', "export const value = 'old';\n");
    const groups = [
      {
        version: '1.0.0',
        codemods: [
          {
            id: 'declare-and-change',
            type: 'code',
            package: '@acme/integration',
            codemod: {
              title: 'declare and change',
              fileExtensions: ['', '.js'],
              transform: file =>
                path.basename(file.path) === '.gitattributes'
                  ? 'src/x.js linguist-generated\n'
                  : file.source.replace('old', 'new'),
            },
          },
        ],
      },
    ];
    const jscodeshift = (await import('jscodeshift')).default;

    const preview = runIntegrationCodemods(groups, {
      apply: false,
      path: root,
      root,
      jscodeshift,
      silent: true,
    });
    expect(preview.protectedFiles).toEqual([
      expect.objectContaining({file: 'src/x.js', reason: 'generated'}),
    ]);
    expect(fs.readFileSync(path.join(root, '.gitattributes'), 'utf8')).toBe(
      '# authored\n',
    );

    const result = runIntegrationCodemods(groups, {
      apply: true,
      path: root,
      root,
      jscodeshift,
      silent: true,
    });

    expect(fs.readFileSync(path.join(root, '.gitattributes'), 'utf8')).toBe(
      'src/x.js linguist-generated\n',
    );
    expect(fs.readFileSync(path.join(root, 'src/x.js'), 'utf8')).toContain(
      'old',
    );
    expect(result.protectedFiles).toEqual([
      expect.objectContaining({
        file: 'src/x.js',
        reason: 'generated',
      }),
    ]);
  });

  it('declines a protected file that does not parse, as the core runner does', async () => {
    write('.gitattributes', 'src/vendor/** linguist-vendored\n');
    write('src/owned.js', "export const value = 'old';\n");
    write('src/vendor/bundle.js', 'export const value = {;\n');
    write('src/broken.js', 'export const value = {;\n');

    const groups = [
      {
        version: '1.0.0',
        codemods: [
          {
            id: 'code',
            type: 'code',
            package: '@acme/integration',
            codemod: {
              title: 'code',
              fileExtensions: ['.js'],
              transform: (file, {jscodeshift: j}) => {
                const ast = j(file.source);
                ast.find(j.Identifier, {name: 'value'}).forEach(p => {
                  p.node.name = 'renamed';
                });
                return ast.toSource();
              },
            },
          },
        ],
      },
    ];
    const jscodeshift = (await import('jscodeshift')).default;
    const result = runIntegrationCodemods(groups, {
      apply: true,
      path: path.join(root, 'src'),
      root,
      jscodeshift,
      silent: true,
    });

    expect(fs.readFileSync(path.join(root, 'src/owned.js'), 'utf8')).toContain(
      'renamed',
    );
    expect(result.declinedCandidates).toEqual([
      expect.objectContaining({
        file: path.join('src', 'vendor', 'bundle.js'),
        codemod: '@acme/integration:code',
        location: '1:23',
      }),
    ]);
    expect(result.errors).toEqual([
      expect.objectContaining({file: path.join('src', 'broken.js')}),
    ]);
  });
});
