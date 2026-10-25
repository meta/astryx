// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A protected file a codemod cannot parse is declined for manual review
 * instead of failing the run; every other codemod error still fails it.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {runCodemods} from '../runner.mjs';
import {parseCss, processSelector} from '../parse.mjs';
import validateDataTokenOwnership, {
  meta as validateDataTokenOwnershipMeta,
} from '../transforms/v0.7.0/validate-data-token-ownership.mjs';
import migrateThemeSelectors, {
  meta as migrateThemeSelectorsMeta,
} from '../transforms/v0.6.0/migrate-astryx-theme-selectors-to-data-attrs.mjs';
import migrateDeprecatedThemeSurface, {
  meta as migrateDeprecatedThemeSurfaceMeta,
} from '../transforms/v0.7.0/migrate-deprecated-theme-surface.mjs';

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

describe('runCodemods — protected files that do not parse', () => {
  // A transform that parses every file it is handed, like real codemods do.
  const manifests = [
    {
      version: '0.1.3',
      transforms: [
        {
          name: 'rename-foo',
          meta: {title: 'rename foo'},
          transform: (file, {jscodeshift: j}) => {
            const root = j(file.source);
            root.find(j.Identifier, {name: 'foo'}).forEach(p => {
              p.node.name = 'bar';
            });
            return root.toSource();
          },
        },
      ],
    },
  ];
  const BROKEN = 'export const foo = {;\n';

  function seedVendored() {
    fs.mkdirSync(path.join(tmpDir, 'src'), {recursive: true});
    fs.mkdirSync(path.join(tmpDir, 'vendor'), {recursive: true});
    fs.writeFileSync(
      path.join(tmpDir, '.gitattributes'),
      'vendor/** linguist-vendored\n',
    );
    fs.writeFileSync(path.join(tmpDir, 'src', 'owned.ts'), 'const foo = 1;\n');
    fs.writeFileSync(path.join(tmpDir, 'vendor', 'bundle.js'), BROKEN);
  }

  it('declines a vendored file that does not parse and completes the owned edits', async () => {
    seedVendored();

    const r = await runCodemods(manifests, {
      apply: true,
      path: '.',
      silent: true,
    });

    expect(r.errors).toEqual([]);
    expect(r.protectedFiles).toEqual([]);
    expect(r.declinedCandidates).toEqual([
      {
        file: path.join('vendor', 'bundle.js'),
        codemod: 'core:rename-foo',
        location: '1:21',
        reason: expect.stringMatching(
          /^unparseable protected file \(vendored\): /,
        ),
      },
    ]);
    expect(fs.readFileSync(path.join(tmpDir, 'src', 'owned.ts'), 'utf-8')).toBe(
      'const bar = 1;\n',
    );
    expect(
      fs.readFileSync(path.join(tmpDir, 'vendor', 'bundle.js'), 'utf-8'),
    ).toBe(BROKEN);
  });

  it('declines the same file in a dry run', async () => {
    seedVendored();

    const r = await runCodemods(manifests, {
      apply: false,
      path: '.',
      silent: true,
    });

    expect(r.errors).toEqual([]);
    expect(r.declinedCandidates.map(item => item.file)).toEqual([
      path.join('vendor', 'bundle.js'),
    ]);
    expect(r.changedFiles.map(f => path.basename(f))).toEqual(['owned.ts']);
  });

  it('declines an unparseable file under an ignore rule or a generated marker', async () => {
    fs.mkdirSync(path.join(tmpDir, 'src'), {recursive: true});
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), 'ignored/\n');
    fs.mkdirSync(path.join(tmpDir, 'ignored'), {recursive: true});
    fs.writeFileSync(path.join(tmpDir, 'ignored', 'a.js'), BROKEN);
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'gen.js'),
      `// @generated\n${BROKEN}`,
    );

    const r = await runCodemods(manifests, {
      apply: true,
      path: '.',
      silent: true,
    });

    expect(r.errors).toEqual([]);
    expect(r.declinedCandidates.map(item => item.file).sort()).toEqual([
      path.join('ignored', 'a.js'),
      path.join('src', 'gen.js'),
    ]);
  });

  it('still analyses a protected file that parses and reports its required change', async () => {
    seedVendored();
    fs.writeFileSync(
      path.join(tmpDir, 'vendor', 'parsed.js'),
      'export const foo = 1;\n',
    );

    const r = await runCodemods(manifests, {
      apply: true,
      path: '.',
      silent: true,
    });

    expect(r.protectedFiles).toEqual([
      expect.objectContaining({
        file: path.join('vendor', 'parsed.js'),
        reason: 'vendored',
      }),
    ]);
    expect(r.declinedCandidates.map(item => item.file)).toEqual([
      path.join('vendor', 'bundle.js'),
    ]);
  });

  it('still fails on owned source that does not parse', async () => {
    fs.mkdirSync(path.join(tmpDir, 'src'), {recursive: true});
    fs.writeFileSync(path.join(tmpDir, 'src', 'broken.js'), BROKEN);

    const r = await runCodemods(manifests, {
      apply: true,
      path: '.',
      silent: true,
    });

    expect(r.declinedCandidates).toEqual([]);
    expect(r.errors).toEqual([
      expect.objectContaining({
        file: path.join('src', 'broken.js'),
        codemod: 'core:rename-foo',
      }),
    ]);
  });

  it('still fails when a transform throws on a protected file that parses', async () => {
    seedVendored();
    fs.writeFileSync(
      path.join(tmpDir, 'vendor', 'bundle.js'),
      'const x = 1;\n',
    );
    const throwing = [
      {
        version: '0.1.3',
        transforms: [
          {
            name: 'throws',
            meta: {title: 'throws'},
            transform: file => {
              if (file.path.endsWith('bundle.js')) throw new Error('boom');
              return null;
            },
          },
        ],
      },
    ];

    const r = await runCodemods(throwing, {
      apply: true,
      path: '.',
      silent: true,
    });

    expect(r.declinedCandidates).toEqual([]);
    expect(r.errors).toEqual([
      {
        file: path.join('vendor', 'bundle.js'),
        codemod: 'core:throws',
        error: 'boom',
      },
    ]);
  });

  it('keeps a CSS codemod error on a generated stylesheet that parses', async () => {
    fs.mkdirSync(path.join(tmpDir, 'src'), {recursive: true});
    const theme =
      '/* @generated by `astryx theme build` */\n' +
      ':root {\n  --color-data-1: #000;\n}\n';
    fs.writeFileSync(path.join(tmpDir, 'src', 'theme.css'), theme);

    const r = await runCodemods(
      [
        {
          version: '0.7.0',
          transforms: [
            {
              name: 'validate-data-token-ownership',
              transform: validateDataTokenOwnership,
              meta: validateDataTokenOwnershipMeta,
            },
          ],
        },
      ],
      {apply: true, path: '.', silent: true},
    );

    expect(r.declinedCandidates).toEqual([]);
    expect(r.errors).toEqual([
      {
        file: path.join('src', 'theme.css'),
        codemod: 'core:validate-data-token-ownership',
        error: expect.stringContaining('astryx theme build'),
      },
    ]);
    expect(
      fs.readFileSync(path.join(tmpDir, 'src', 'theme.css'), 'utf-8'),
    ).toBe(theme);
  });

  it('declines a protected stylesheet that does not parse as CSS', async () => {
    fs.mkdirSync(path.join(tmpDir, 'vendor'), {recursive: true});
    fs.writeFileSync(
      path.join(tmpDir, '.gitattributes'),
      'vendor/** linguist-vendored\n',
    );
    fs.writeFileSync(path.join(tmpDir, 'vendor', 'broken.css'), 'a {\n');

    const r = await runCodemods(
      [
        {
          version: '0.1.3',
          transforms: [
            {
              name: 'css',
              meta: {title: 'css', fileExtensions: ['.css']},
              transform: file => parseCss(file.source).toString(),
            },
          ],
        },
      ],
      {apply: true, path: '.', silent: true},
    );

    expect(r.errors).toEqual([]);
    expect(r.declinedCandidates).toEqual([
      {
        file: path.join('vendor', 'broken.css'),
        codemod: 'core:css',
        location: '1:1',
        reason: 'unparseable protected file (vendored): Unclosed block',
      },
    ]);
  });

  it('declines a vendored stylesheet whose selector the real theme codemod cannot parse', async () => {
    fs.mkdirSync(path.join(tmpDir, 'vendor'), {recursive: true});
    fs.writeFileSync(
      path.join(tmpDir, '.gitattributes'),
      'vendor/** linguist-vendored\n',
    );
    const bundle = 'a:: { color: red; }\n';
    fs.writeFileSync(path.join(tmpDir, 'vendor', 'bundle.css'), bundle);

    const r = await runCodemods(
      [
        {
          version: '0.7.0',
          transforms: [
            {
              name: 'migrate-deprecated-theme-surface',
              transform: migrateDeprecatedThemeSurface,
              meta: migrateDeprecatedThemeSurfaceMeta,
            },
          ],
        },
      ],
      {apply: true, path: '.', silent: true},
    );

    expect(r.errors).toEqual([]);
    expect(r.protectedFiles).toEqual([]);
    expect(r.declinedCandidates).toEqual([
      {
        file: path.join('vendor', 'bundle.css'),
        codemod: 'core:migrate-deprecated-theme-surface',
        location: '1:3',
        reason:
          'unparseable protected file (vendored): Expected a pseudo-class or pseudo-element.',
      },
    ]);
    expect(
      fs.readFileSync(path.join(tmpDir, 'vendor', 'bundle.css'), 'utf-8'),
    ).toBe(bundle);
  });

  it('keeps an error a transform throws after the file parses', async () => {
    fs.mkdirSync(path.join(tmpDir, 'vendor'), {recursive: true});
    fs.writeFileSync(
      path.join(tmpDir, '.gitattributes'),
      'vendor/** linguist-vendored\n',
    );
    fs.writeFileSync(
      path.join(tmpDir, 'vendor', 'a.css'),
      'a { color: red; }\n',
    );

    const r = await runCodemods(
      [
        {
          version: '0.1.3',
          transforms: [
            {
              name: 'walks',
              meta: {title: 'walks', fileExtensions: ['.css']},
              transform: file => {
                parseCss(file.source).walkRules(rule =>
                  processSelector(rule.selector, () => {
                    throw new Error('callback failed');
                  }),
                );
                return null;
              },
            },
          ],
        },
      ],
      {apply: true, path: '.', silent: true},
    );

    expect(r.declinedCandidates).toEqual([]);
    expect(r.errors).toEqual([
      {
        file: path.join('vendor', 'a.css'),
        codemod: 'core:walks',
        error: 'callback failed',
      },
    ]);
  });

  it('lists a file another codemod still needs to change under protectedFiles only', async () => {
    fs.mkdirSync(path.join(tmpDir, 'vendor'), {recursive: true});
    fs.writeFileSync(
      path.join(tmpDir, '.gitattributes'),
      'vendor/** linguist-vendored\n',
    );
    fs.writeFileSync(
      path.join(tmpDir, 'vendor', 'bundle.css'),
      'a:: { color: red; }\n',
    );

    const r = await runCodemods(
      [
        {
          version: '0.6.0',
          transforms: [
            {
              name: 'migrate-astryx-theme-selectors-to-data-attrs',
              transform: migrateThemeSelectors,
              meta: migrateThemeSelectorsMeta,
            },
          ],
        },
        {
          version: '0.7.0',
          transforms: [
            {
              name: 'migrate-deprecated-theme-surface',
              transform: migrateDeprecatedThemeSurface,
              meta: migrateDeprecatedThemeSurfaceMeta,
            },
          ],
        },
      ],
      {apply: true, path: '.', silent: true},
    );

    expect(r.errors).toEqual([]);
    expect(r.protectedFiles.map(item => item.file)).toEqual([
      'vendor/bundle.css',
    ]);
    expect(r.declinedCandidates).toEqual([]);
  });

  it('gives a rejected @scope prelude its position in the stylesheet', async () => {
    fs.mkdirSync(path.join(tmpDir, 'vendor'), {recursive: true});
    fs.writeFileSync(
      path.join(tmpDir, '.gitattributes'),
      'vendor/** linguist-vendored\n',
    );
    fs.writeFileSync(
      path.join(tmpDir, 'vendor', 'bundle.css'),
      '.x { color: blue; }\n\n@scope (a::) {\n  b { color: red; }\n}\n',
    );

    const r = await runCodemods(
      [
        {
          version: '0.7.0',
          transforms: [
            {
              name: 'migrate-deprecated-theme-surface',
              transform: migrateDeprecatedThemeSurface,
              meta: migrateDeprecatedThemeSurfaceMeta,
            },
          ],
        },
      ],
      {apply: true, path: '.', silent: true},
    );

    expect(r.errors).toEqual([]);
    expect(r.declinedCandidates).toEqual([
      {
        file: path.join('vendor', 'bundle.css'),
        codemod: 'core:migrate-deprecated-theme-surface',
        location: '3:9',
        reason:
          'unparseable protected file (vendored): Expected a pseudo-class or pseudo-element.',
      },
    ]);
  });
});
