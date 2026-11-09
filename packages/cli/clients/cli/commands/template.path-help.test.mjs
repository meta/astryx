// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `template <name> <path>` decides by extension whether <path> is the
 * file to write or a directory to write into. Help and the manifest say so,
 * and every extension they list is one the resolver treats as a file.
 */

import {describe, it, expect} from 'vitest';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {isFilePathArg} from '../../../foundation/fs/path-safety.mjs';

const SLOW = 30_000;

/** @param {string} text */
const listedExtensions = text =>
  [...(text.match(/ends in ([.\w, ]+ or \.\w+)/)?.[1] ?? '').matchAll(/\.\w+/g)].map(m => m[0]);

describe('template path resolution is documented', () => {
  it('help explains the file-or-directory rule and the default file names', async () => {
    const {status, stdout} = await runCli(['template', '--help']);
    expect(status).toBe(0);
    expect(stdout).toMatch(/Arguments:/);
    expect(stdout).toContain('page.tsx');
    expect(stdout).toMatch(/block's own file name/);
  }, SLOW);

  it('the manifest carries the same description, and its extensions are the resolver\'s', async () => {
    const {stdout} = await runCli(['manifest', '--json']);
    const {data} = JSON.parse(stdout);
    const template = data.commands.find((/** @type {any} */ c) => c.name === 'template');
    const pathArg = template.arguments.find((/** @type {any} */ a) => a.name === 'path');
    expect(pathArg.description).toContain('page.tsx');

    const exts = listedExtensions(pathArg.description);
    expect(exts.length).toBeGreaterThan(0);
    for (const ext of exts) expect(isFilePathArg(`out/page${ext}`)).toBe(true);
    expect(isFilePathArg('out/page')).toBe(false);
  }, SLOW);
});
