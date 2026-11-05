// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A write that fails on the filesystem reports ERR_WRITE_FAILED.
 *
 * An unwritable target produced `{"error": "EACCES: permission denied, open
 * '/abs/host/path/readonly/x.tsx'", "code": "ERR_UNKNOWN"}` — the raw Node
 * errno error, with the wrong code and an absolute host path in the message.
 * ERR_WRITE_FAILED is in the frozen registry for exactly this case, and every
 * other Astryx message names its target relative to the project.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runCli} from '../../../test-utils/run-cli.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

// chmod means nothing to root, so the unwritable directory would be writable
// and the command would succeed. Skip rather than assert something false.
const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;

let dir;
let readonlyDir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-write-fail-'));
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name: 'scratch',
      version: '1.0.0',
      dependencies: {'@astryxdesign/core': '0.6.3'},
    }),
  );
  fs.mkdirSync(path.join(dir, 'node_modules', '@astryxdesign'), {recursive: true});
  fs.symlinkSync(
    path.join(REPO, 'packages', 'core'),
    path.join(dir, 'node_modules', '@astryxdesign', 'core'),
    'dir',
  );
  readonlyDir = path.join(dir, 'readonly');
  fs.mkdirSync(readonlyDir);
  fs.chmodSync(readonlyDir, 0o500);
});

afterEach(() => {
  try {
    fs.chmodSync(readonlyDir, 0o700);
  } catch {
    // already gone
  }
  fs.rmSync(dir, {recursive: true, force: true});
});

/** @param {string[]} args */
const json = async args => {
  const {status, stdout} = await runCli(['--json', ...args], {cwd: dir});
  return {status, body: JSON.parse(stdout)};
};

describe.skipIf(asRoot)('a failed write reports ERR_WRITE_FAILED', () => {
  it('template into an unwritable directory', async () => {
    const {status, body} = await json(['template', 'ai-chat', 'readonly/x.tsx']);

    expect(status).toBe(1);
    expect(body.code).toBe('ERR_WRITE_FAILED');
    expect(body.error).toContain('readonly/x.tsx');
    expect(body.error).toContain('EACCES');
    // The whole point of the relative form: no absolute host path escapes.
    expect(body.error).not.toContain(dir);
    expect(fs.existsSync(path.join(readonlyDir, 'x.tsx'))).toBe(false);
  });

  it('swizzle into an unwritable directory', async () => {
    const {status, body} = await json([
      'swizzle',
      'Button',
      '--output',
      'readonly/sub',
    ]);

    expect(status).toBe(1);
    expect(body.code).toBe('ERR_WRITE_FAILED');
    expect(body.error).toContain('readonly/sub');
    expect(body.error).not.toContain(dir);
    expect(fs.existsSync(path.join(readonlyDir, 'sub'))).toBe(false);
  });

  it('still writes normally into a writable directory', async () => {
    const {status, body} = await json(['template', 'ai-chat', 'src/page.tsx']);

    expect(status, JSON.stringify(body).slice(0, 200)).toBe(0);
    expect(body.type).toBe('template.copy');
    expect(fs.existsSync(path.join(dir, 'src', 'page.tsx'))).toBe(true);
  });
});

describe.skipIf(asRoot)('a swizzle that fails part-way undoes what it wrote', () => {
  it('restores replaced files, removes created ones, and says nothing was written', async () => {
    // Learn the component's files, in copy order, from a successful swizzle.
    const probe = await json(['swizzle', 'Button', '--output', 'probe']);
    expect(probe.status, JSON.stringify(probe.body).slice(0, 200)).toBe(0);
    const files = probe.body.data.files;
    expect(files.length).toBeGreaterThan(1);
    const outDir = path.join(dir, 'out', path.basename(probe.body.data.outputDir));

    // The first file exists (replaceable), the middle ones do not, and the
    // last one is read-only, so --overwrite fails after writing the others.
    const first = files[0];
    const middle = files.slice(1, -1);
    const last = files[files.length - 1];
    fs.mkdirSync(outDir, {recursive: true});
    fs.writeFileSync(path.join(outDir, first), 'before first\n');
    fs.writeFileSync(path.join(outDir, last), 'before last\n');
    fs.chmodSync(path.join(outDir, last), 0o444);

    const {status, body} = await json([
      'swizzle',
      'Button',
      '--output',
      'out',
      '--overwrite',
    ]);
    fs.chmodSync(path.join(outDir, last), 0o644);

    expect(status).toBe(1);
    expect(body.code).toBe('ERR_WRITE_FAILED');
    expect(body.error).toContain(last);
    expect(body.error).toContain('Nothing was written.');
    expect(body.error).not.toContain(dir);
    expect(fs.readFileSync(path.join(outDir, first), 'utf8')).toBe('before first\n');
    expect(fs.readFileSync(path.join(outDir, last), 'utf8')).toBe('before last\n');
    for (const file of middle) {
      expect(fs.existsSync(path.join(outDir, file))).toBe(false);
    }
  });

  it('undoes the copy when a destination cannot be read back', async () => {
    const probe = await json(['swizzle', 'Button', '--output', 'probe']);
    expect(probe.status, JSON.stringify(probe.body).slice(0, 200)).toBe(0);
    const files = probe.body.data.files;
    const outDir = path.join(dir, 'out', path.basename(probe.body.data.outputDir));

    // A directory where the last file goes: the rollback snapshot cannot read
    // it, and the earlier files are already written when the copy reaches it.
    const first = files[0];
    const middle = files.slice(1, -1);
    const last = files[files.length - 1];
    fs.mkdirSync(path.join(outDir, last), {recursive: true});
    fs.writeFileSync(path.join(outDir, first), 'before first\n');

    const {status, body} = await json([
      'swizzle',
      'Button',
      '--output',
      'out',
      '--overwrite',
    ]);

    expect(status).toBe(1);
    expect(body.code).toBe('ERR_WRITE_FAILED');
    expect(body.error).toContain(last);
    expect(body.error).toContain('Nothing was written.');
    expect(body.error).not.toContain(dir);
    expect(fs.readFileSync(path.join(outDir, first), 'utf8')).toBe('before first\n');
    expect(fs.statSync(path.join(outDir, last)).isDirectory()).toBe(true);
    for (const file of middle) {
      expect(fs.existsSync(path.join(outDir, file))).toBe(false);
    }
  });
});
