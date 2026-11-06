// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Regression test for `astryx theme build` install-instructions import paths.
 *
 * Covers the relDir-empty case: when the output directory equals the current
 * working directory, the relative dir is an empty string. Previously this
 * produced a double-slash import path like `from './/<name>'`. The build now
 * collapses the prefix to `./` so the emitted import is `from './<name>'`.
 *
 * Also covers the non-empty subdir case (`./<sub>/<name>`) to guard against
 * regressions in the opposite direction.
 */

import {describe, it, expect, beforeAll, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {ensureCoreBuilt} from './ensure-core-built.mjs';
import {runCli} from '../../../test-utils/run-cli.mjs';

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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-build-theme-import-path-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('theme build install-instructions import path', () => {
  it('emits bare ./<name> specifiers (no double slash) when out dir equals cwd', async () => {
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
    // Import + css + link paths all use the clean ./<name> form.
    expect(result.stdout).toContain("from './cwd-theme'");
    expect(result.stdout).toContain("import './cwd-theme.css'");
    expect(result.stdout).toContain('href="./cwd-theme.css"');
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
    expect(result.stdout).toContain("from './themes/sub-theme'");
    expect(result.stdout).toContain("import './themes/sub-theme.css'");
    expect(result.stdout).toContain('href="./themes/sub-theme.css"');
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
});
