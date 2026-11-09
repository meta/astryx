// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Path-traversal regression tests for `astryx swizzle --output`.
 *
 * Runs the CLI in-process with a fake monorepo as cwd and asserts that
 * `--output ../escaped` is rejected with a clear error AND that no
 * file is created outside the project root.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {runCli} from '../../../test-utils/run-cli.mjs';

// Build a minimal fake monorepo: <root>/project/ contains a
// node_modules/@astryxdesign/core/src/Button so findCoreDir succeeds, and
// <root>/outside/ is the would-be traversal target.
function buildFakeRepo(tmpDir) {
  const project = path.join(tmpDir, 'project');
  const outside = path.join(tmpDir, 'outside');
  const core = path.join(project, 'node_modules', '@astryxdesign', 'core');
  const buttonDir = path.join(core, 'src', 'Button');
  fs.mkdirSync(buttonDir, {recursive: true});
  fs.mkdirSync(outside, {recursive: true});
  fs.writeFileSync(
    path.join(buttonDir, 'Button.tsx'),
    `// fake source\nexport const Button = () => null;\n`,
  );
  // Make findCoreDir's heuristic (or its node_modules branch) succeed by
  // also creating packages/core symlink-style structure if needed:
  fs.writeFileSync(path.join(core, 'package.json'), '{"name":"@astryxdesign/core"}');
  return {project, outside};
}

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-swizzle-paths-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('swizzle path safety', () => {
  it('rejects --output with ../ traversal and writes no file outside root', async () => {
    const {project, outside} = buildFakeRepo(tmpDir);

    const result = await runCli(
      ['swizzle', 'Button', '--output', '../outside-project'],
      project,
    );

    expect(result.code).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/traversal|outside the project root/i);

    // Hard check: nothing was written outside the project.
    expect(fs.readdirSync(outside)).toEqual([]);
    const escaped = path.join(tmpDir, 'outside-project');
    expect(fs.existsSync(escaped)).toBe(false);
  });

  it('rejects --output with absolute path', async () => {
    const {project} = buildFakeRepo(tmpDir);
    const absTarget = path.join(tmpDir, 'absolute-target');

    const result = await runCli(
      ['swizzle', 'Button', '--output', absTarget],
      project,
    );

    expect(result.code).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/absolute paths are not allowed/i);
    expect(fs.existsSync(absTarget)).toBe(false);
  });

  it('rejects a component directory that is a symlink out of the project', async () => {
    const {project, outside} = buildFakeRepo(tmpDir);
    const base = path.join(project, 'components', 'astryx');
    fs.mkdirSync(base, {recursive: true});
    fs.symlinkSync(outside, path.join(base, 'Button'));

    const result = await runCli(['--json', 'swizzle', 'Button'], project);

    expect(result.code).not.toBe(0);
    expect(JSON.parse(result.stdout).code).toBe('ERR_PATH_TRAVERSAL');
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  it('rejects an existing file that is a symlink out of the project, even with --overwrite', async () => {
    const {project, outside} = buildFakeRepo(tmpDir);
    const outDir = path.join(project, 'components', 'astryx', 'Button');
    fs.mkdirSync(outDir, {recursive: true});
    const target = path.join(outside, 'kept.txt');
    fs.writeFileSync(target, 'kept\n');
    fs.symlinkSync(target, path.join(outDir, 'Button.tsx'));

    const result = await runCli(
      ['--json', 'swizzle', 'Button', '--overwrite'],
      project,
    );

    expect(result.code).not.toBe(0);
    expect(JSON.parse(result.stdout).code).toBe('ERR_PATH_TRAVERSAL');
    expect(fs.readFileSync(target, 'utf-8')).toBe('kept\n');
  });

  it('requires --overwrite in non-interactive mode when files already exist', async () => {
    const {project} = buildFakeRepo(tmpDir);
    const outDir = path.join(project, 'components', 'astryx', 'Button');
    fs.mkdirSync(outDir, {recursive: true});
    const existingPath = path.join(outDir, 'Button.tsx');
    fs.writeFileSync(existingPath, '// my customizations\n');

    // Use --json to force non-interactive mode.
    const result = await runCli(
      ['--json', 'swizzle', 'Button'],
      project,
    );

    expect(result.code).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/overwrite/i);
    // Existing file unchanged
    expect(fs.readFileSync(existingPath, 'utf-8')).toBe('// my customizations\n');
  });

  // The CLI never prompts: without --overwrite it refuses with a code, and the
  // manifest agents read must say so.
  it('describes --overwrite by its refusal, not a prompt', async () => {
    const {project} = buildFakeRepo(tmpDir);
    const result = await runCli(['--json', 'manifest'], project);
    const swizzle = JSON.parse(result.stdout).data.commands.find(c => c.name === 'swizzle');
    const overwrite = swizzle.options.find(o => o.flag.includes('--overwrite'));
    expect(overwrite.description).not.toMatch(/prompt/i);
    expect(overwrite.description).toContain('ERR_FILE_EXISTS');
  });
});
