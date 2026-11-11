// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {CLI_ROOT} from '../fs/paths.mjs';
import {inputState, selfAuditInputs} from './stored-self-audit.mjs';

/** @type {string[]} */
const made = [];
afterEach(() => {
  for (const dir of made.splice(0))
    fs.rmSync(dir, {recursive: true, force: true});
});

/** A scratch folder, outside the package so no other suite sees it. */
function scratch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'self-audit-test-'));
  made.push(dir);
  return dir;
}

describe('a stored self-audit input', () => {
  it('changes when a file it read changes, keeping its size and time', () => {
    const dir = scratch();
    const file = path.join(dir, 'a.doc.mjs');
    fs.writeFileSync(file, 'export const a = 1;\n');
    const before = inputState(file);
    const {mtime} = fs.statSync(file);
    fs.writeFileSync(file, 'export const a = 2;\n');
    fs.utimesSync(file, mtime, mtime);
    expect(inputState(file)).not.toBe(before);
  });

  it('changes when a folder it read gains or loses an entry', () => {
    const dir = scratch();
    const before = inputState(dir);
    fs.writeFileSync(path.join(dir, 'b.ts'), '');
    const added = inputState(dir);
    expect(added).not.toBe(before);
    fs.rmSync(path.join(dir, 'b.ts'));
    expect(inputState(dir)).toBe(before);
  });

  it('reads as absent for a missing path', () => {
    expect(inputState(path.join(scratch(), 'missing'))).toBe('-');
  });

  it("keeps the package's own files, by path in the package, and nothing else", () => {
    const own = path.join(CLI_ROOT, 'package.json');
    const inputs = selfAuditInputs([
      own,
      path.join(CLI_ROOT, 'node_modules', 'jscodeshift', 'index.js'),
      path.join(path.dirname(CLI_ROOT), 'package.json'),
      path.join(scratch(), 'elsewhere.ts'),
    ]);
    expect(inputs).toEqual({'package.json': inputState(own)});
  });

  it('leaves out what prepack writes from a folder it read', () => {
    const dir = scratch();
    const before = inputState(dir);
    fs.writeFileSync(path.join(dir, 'docs.generated.json'), '{}');
    expect(inputState(dir)).toBe(before);
  });
});
