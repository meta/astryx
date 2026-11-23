// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The not-found hint names a Core family whose folder doc the component
 * lookup opens, though no component file has the family's name.
 *
 * @input a made-up Core folder with a family doc and one member component
 * @output assertions on findOtherCommand's hint for a docs miss
 * @position foundation/suggest/ beside the module it tests
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {findOtherCommand} from './other-command.mjs';

/** @type {string} */
let root;
/** @type {string} */
let coreDir;

/**
 * @param {string} rel
 * @param {string} text
 */
function write(rel, text) {
  const file = path.join(coreDir, 'src', rel);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, text);
}

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-family-doc-'));
  coreDir = path.join(root, 'core');
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"app"}');
  write('Zinnet/Zinnet.doc.mjs', "export const docs = {name: 'Zinnet'};\n");
  write('Zinnet/ZinnetPane.tsx', 'export function ZinnetPane() {}\n');
  write(
    'Zinnet/ZinnetPane.doc.mjs',
    "export const docs = {name: 'ZinnetPane'};\n",
  );
  write('Quorl/QuorlBar.tsx', 'export function QuorlBar() {}\n');
});

afterAll(() => fs.rmSync(root, {recursive: true, force: true}));

describe('a family doc', () => {
  it('is named by a docs miss for the family', async () => {
    const found = await findOtherCommand('zinnet', {
      from: 'docs',
      cwd: root,
      coreDir,
    });
    expect(found?.hint.name).toBe('astryx component Zinnet');
  });

  it('needs the folder to have its own doc', async () => {
    const found = await findOtherCommand('Quorl', {
      from: 'docs',
      cwd: root,
      coreDir,
    });
    expect(found).toBeNull();
  });
});
