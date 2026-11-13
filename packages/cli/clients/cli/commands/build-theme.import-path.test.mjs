// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Regression test for `astryx theme build` install-instructions import paths.
 *
 * The printed paths are relative to a file in src/, as the snippet's header
 * says: an output in the project root is `../<name>` (never `.//<name>`), one
 * in a folder beside src/ is `../<sub>/<name>`, one under src/ is
 * `./<sub>/<name>`; a family build's snippet says the same.
 */

import {describe, it, expect, beforeAll, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {ensureCoreBuilt} from './ensure-core-built.mjs';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../../test-utils/linked-fixture.mjs';

function writeTheme(dir, name) {
  fs.mkdirSync(dir, {recursive: true});
  const file = path.join(dir, `${name}.mjs`);
  fs.writeFileSync(
    file,
    `export default { name: ${JSON.stringify(name)}, tokens: { '--color-bg': '#fff' } };\n`,
  );
  return file;
}

// `astryx theme build` imports the compiled @astryxdesign/core/theme entry (there is no
// in-CLI fallback generator). Build core once if it isn't already present so
// the suite works in any CI job, regardless of job ordering.
beforeAll(() => {
  ensureCoreBuilt();
}, 200_000);

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'astryx-build-theme-import-path-'),
  );
});
afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('theme build install-instructions import path', () => {
  it('emits ../<name> specifiers (no double slash) when out dir equals cwd', async () => {
    // Source theme lives directly in the project root, so the output dir
    // is the cwd and the relative dir is an empty string.
    const project = path.join(tmpDir, 'project');
    const themeFile = writeTheme(project, 'cwd-theme');

    const result = await runCli(
      ['--detail', 'full', 'theme', 'build', path.relative(project, themeFile)],
      project,
    );

    expect(result.code).toBe(0);
    // No double slash anywhere in the install instructions.
    expect(result.stdout).not.toContain('.//');
    // From a file in src/, the project root is one level up.
    expect(result.stdout).toContain("from '../cwd-theme'");
    expect(result.stdout).toContain("import '../cwd-theme.css'");
    expect(result.stdout).toContain('href="../cwd-theme.css"');
  });

  it('keeps the subdir in the import path for a non-src subdirectory build', async () => {
    const project = path.join(tmpDir, 'project');
    const themeFile = writeTheme(path.join(project, 'themes'), 'sub-theme');

    const result = await runCli(
      ['--detail', 'full', 'theme', 'build', path.relative(project, themeFile)],
      project,
    );

    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain('.//');
    // From a file in src/, a folder beside src/ is one level up.
    expect(result.stdout).toContain("from '../themes/sub-theme'");
    expect(result.stdout).toContain("import '../themes/sub-theme.css'");
    expect(result.stdout).toContain('href="../themes/sub-theme.css"');
  });

  it('strips a leading src/ from the import path (relative to a file in src/)', async () => {
    const project = path.join(tmpDir, 'project');
    const themeFile = writeTheme(
      path.join(project, 'src', 'themes', 'ocean'),
      'ocean',
    );

    const result = await runCli(
      ['--detail', 'full', 'theme', 'build', path.relative(project, themeFile)],
      project,
    );

    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain('.//');
    // The leading src/ is dropped, but themes/ocean/ is kept (people need it).
    expect(result.stdout).toContain("from './themes/ocean/ocean'");
    expect(result.stdout).toContain("import './themes/ocean/ocean.css'");
    expect(result.stdout).not.toContain('./src/');
  });

  it('experimental theme compile prints the same path from src/', async () => {
    const project = path.join(tmpDir, 'project');
    const themeFile = writeTheme(path.join(project, 'themes', 'd'), 'd');

    const result = await runCli(
      [
        '--detail',
        'full',
        'experimental',
        'theme',
        'compile',
        path.relative(project, themeFile),
      ],
      project,
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("from '../themes/d/d'");
    expect(result.stdout).toContain("import '../themes/d/d.css'");
    expect(result.stdout).not.toContain("'./themes/d/d'");
  });

  it('a family outside src/ prints ../ paths under a header that says what they are relative to', async () => {
    const project = makeLinkedFixture('astryx-family-import-', [
      '@astryxdesign',
    ]);
    try {
      const dir = path.join(project, 'themes');
      fs.mkdirSync(dir, {recursive: true});
      fs.writeFileSync(
        path.join(project, 'package.json'),
        '{"type":"module"}\n',
      );
      fs.writeFileSync(
        path.join(dir, 'ocean.mjs'),
        `import {defineTheme} from '@astryxdesign/core/theme';\nexport const oceanTheme = defineTheme({name: 'ocean', tokens: {'--color-background-body': '#ffffff'}});\n`,
      );
      fs.writeFileSync(
        path.join(dir, 'ocean-calm.mjs'),
        `import {defineTheme} from '@astryxdesign/core/theme';\nimport {oceanTheme} from './ocean.mjs';\nexport const oceanCalmTheme = defineTheme({name: 'ocean-calm', extends: oceanTheme, tokens: {'--color-background-body': '#eeeeee'}});\n`,
      );
      const result = await runCli(
        [
          'theme',
          'build',
          '--family',
          'themes/ocean.mjs',
          'themes/ocean-calm.mjs',
          '--family-key',
          'ocean-family',
        ],
        project,
      );
      expect(result.stdout).toContain("from '../themes/ocean-family'");
      expect(result.stdout).toMatch(
        /select any member by theme identity \(paths are relative to a file in src\/; adjust if yours lives elsewhere\):/,
      );
    } finally {
      removeLinkedFixture(project);
    }
  });

  it('from inside src/, an output under src/ is still ./ (the trailer and the family snippet)', async () => {
    const project = makeLinkedFixture('astryx-src-cwd-import-', [
      '@astryxdesign',
    ]);
    try {
      const src = path.join(project, 'src');
      const dir = path.join(src, 'themes');
      fs.mkdirSync(dir, {recursive: true});
      fs.writeFileSync(
        path.join(project, 'package.json'),
        '{"type":"module"}\n',
      );
      fs.writeFileSync(
        path.join(dir, 'ocean.mjs'),
        `import {defineTheme} from '@astryxdesign/core/theme';\nexport const oceanTheme = defineTheme({name: 'ocean', tokens: {'--color-background-body': '#ffffff'}});\n`,
      );
      fs.writeFileSync(
        path.join(dir, 'ocean-calm.mjs'),
        `import {defineTheme} from '@astryxdesign/core/theme';\nimport {oceanTheme} from './ocean.mjs';\nexport const oceanCalmTheme = defineTheme({name: 'ocean-calm', extends: oceanTheme, tokens: {'--color-background-body': '#eeeeee'}});\n`,
      );
      const single = await runCli(
        ['--detail', 'full', 'theme', 'build', 'themes/ocean.mjs'],
        src,
      );
      expect(single.stdout).toContain("from './themes/ocean'");
      expect(single.stdout).not.toContain("'../themes/ocean'");
      const family = await runCli(
        [
          'theme',
          'build',
          '--family',
          'themes/ocean.mjs',
          'themes/ocean-calm.mjs',
          '--family-key',
          'ocean-family',
        ],
        src,
      );
      expect(family.stdout).toContain("from './themes/ocean-family'");
    } finally {
      removeLinkedFixture(project);
    }
  });
});
