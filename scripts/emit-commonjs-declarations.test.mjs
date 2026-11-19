// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  emitCommonJsDeclarations,
  toCommonJsDeclarations,
} from './emit-commonjs-declarations.mjs';

let dir;
afterEach(() => {
  if (dir) fs.rmSync(dir, {recursive: true, force: true});
});

function write(file, source) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), {recursive: true});
  fs.writeFileSync(path.join(dir, file), source);
}

describe('emit-commonjs-declarations', () => {
  it('points relative .js specifiers at .cjs and drops the source map', () => {
    expect(
      toCommonJsDeclarations(
        "export {a} from './a.js';\nimport type {B} from '../b.js';\nexport type {C} from '@scope/pkg';\n//# sourceMappingURL=x.d.ts.map",
      ),
    ).toBe(
      "export {a} from './a.cjs';\nimport type {B} from '../b.cjs';\nexport type {C} from '@scope/pkg';\n",
    );
  });

  it('writes a .d.cts for the entry and every declaration it reaches', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cjs-decl-'));
    write('dist/source.d.ts', "export {a} from './a.js';\n");
    write('dist/a.d.ts', "export {b} from './nested/b.js';\n");
    write('dist/nested/b.d.ts', 'export declare const b: 1;\n');
    write('dist/unrelated.d.ts', 'export {};\n');

    expect(emitCommonJsDeclarations(dir, ['dist/source.d.ts'])).toEqual([
      'dist/a.d.cts',
      'dist/nested/b.d.cts',
      'dist/source.d.cts',
    ]);
    expect(fs.readFileSync(path.join(dir, 'dist/source.d.cts'), 'utf8')).toBe(
      "export {a} from './a.cjs';\n",
    );
    expect(fs.existsSync(path.join(dir, 'dist/unrelated.d.cts'))).toBe(false);
  });
});
