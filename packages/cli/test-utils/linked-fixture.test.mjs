// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the linked fixture helper.
 * @input Fixtures that makeLinkedFixture makes in the OS temp directory.
 * @output Their place, their imports and their removal, and the refusal to
 *   remove a directory the helper did not make.
 * @position Test support for the CLI's fixture projects.
 */

import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import {describe, expect, it} from 'vitest';
import {makeLinkedFixture, removeLinkedFixture} from './linked-fixture.mjs';

describe('makeLinkedFixture', () => {
  it('makes an empty project in the temp directory whose imports resolve as the CLI resolves them', () => {
    const dir = makeLinkedFixture('astryx-linked-fixture-', [
      '@astryxdesign',
      'react',
    ]);
    const root = path.dirname(dir);
    try {
      expect(path.dirname(root)).toBe(fs.realpathSync(os.tmpdir()));
      // A fixture that links Core holds only the package.json that lists it.
      expect(fs.readdirSync(dir)).toEqual(['package.json']);
      expect(
        JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
          .dependencies,
      ).toEqual({'@astryxdesign/core': '*'});
      expect(
        JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')),
      ).toEqual({type: 'module'});
      const fromFixture = createRequire(path.join(dir, 'page.mjs'));
      const fromCli = createRequire(import.meta.url);
      expect(fs.realpathSync(fromFixture.resolve('react'))).toBe(
        fs.realpathSync(fromCli.resolve('react')),
      );
      expect(
        fs.realpathSync(path.join(root, 'node_modules/@astryxdesign/core')),
      ).toBe(fs.realpathSync(path.join(import.meta.dirname, '../../core')));
    } finally {
      removeLinkedFixture(dir);
    }
    expect(fs.existsSync(root)).toBe(false);
  });

  it('refuses to remove a directory it did not make', () => {
    const plain = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-plain-')),
    );
    const lookalike = path.join(plain, 'project');
    fs.mkdirSync(lookalike);
    try {
      expect(() => removeLinkedFixture(plain)).toThrow('not a linked fixture');
      expect(() => removeLinkedFixture(lookalike)).toThrow(
        'not a linked fixture',
      );
      expect(() =>
        removeLinkedFixture(path.join(os.tmpdir(), 'project')),
      ).toThrow('not a linked fixture');
      expect(fs.existsSync(lookalike)).toBe(true);
    } finally {
      fs.rmSync(plain, {recursive: true, force: true});
    }
  });

  it('removes a fixture once', () => {
    const dir = makeLinkedFixture('astryx-linked-fixture-', []);
    removeLinkedFixture(dir);
    expect(() => removeLinkedFixture(dir)).toThrow('not a linked fixture');
  });
});
