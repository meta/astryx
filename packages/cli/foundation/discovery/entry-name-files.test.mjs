// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the integration docs spelling check: the words index lets
 * a folder skip its docs only when no doc there can spell the name, so the
 * answer is the docs a full read of every folder gives.
 *
 * @input two integration docs folders with docs that spell names with
 *   spaces, hyphens and mixed case
 * @output assertions on integrationsDocsSpelling against
 *   integrationDocsSpelling
 * @position foundation/discovery/ beside the module it tests
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  foldEntryName,
  integrationDocsSpelling,
  integrationsDocsSpelling,
} from './entry-name-files.mjs';

/** @type {string} */
let root;
/** @type {Array<string | undefined>} */
let dirs;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-docs-spelling-'));
  const one = path.join(root, 'one');
  const two = path.join(root, 'two');
  fs.mkdirSync(path.join(one, 'nested'), {recursive: true});
  fs.mkdirSync(path.join(two, 'node_modules'), {recursive: true});
  fs.writeFileSync(
    path.join(one, 'guide.doc.mjs'),
    "export default {name: 'quoxle-guide', title: 'Quoxle Guide'};\n",
  );
  fs.writeFileSync(
    path.join(one, 'nested', 'setup.doc.mjs'),
    "export default {name: 'set up_now', text: 'see wobble$x and -zeta'};\n",
  );
  fs.writeFileSync(path.join(one, 'notes.txt'), 'glimmer panel\n');
  fs.writeFileSync(
    path.join(two, 'panel.doc.ts'),
    "export default {name: 'Glimmer  Panel'};\n",
  );
  fs.writeFileSync(
    path.join(two, 'node_modules', 'hidden.doc.mjs'),
    "export default {name: 'hidden-topic'};\n",
  );
  dirs = [one, undefined, two, path.join(root, 'missing')];
});

afterAll(() => {
  fs.rmSync(root, {recursive: true, force: true});
});

describe('integrationsDocsSpelling', () => {
  it('lists the docs a full read of every folder lists', () => {
    for (const typed of [
      'quoxle-guide',
      'QuoxleGuide',
      'quoxle',
      'guide',
      'glimmer panel',
      'glimmerpanel',
      'set up_now',
      'setup_now',
      'up_now',
      'wobble',
      'zeta',
      'hidden-topic',
      'quoxleguides',
      'uoxleguide',
      'wobble$x',
      'zorblet',
    ]) {
      const wanted = foldEntryName(typed);
      expect(integrationsDocsSpelling(dirs, wanted), typed).toEqual(
        dirs.flatMap(dir => integrationDocsSpelling(dir, wanted)),
      );
    }
  });

  it('finds a name spelled across words, and none no doc spells', () => {
    expect(integrationsDocsSpelling(dirs, 'quoxleguide')).toEqual([
      path.join(root, 'one', 'guide.doc.mjs'),
    ]);
    expect(integrationsDocsSpelling(dirs, 'glimmerpanel')).toEqual([
      path.join(root, 'two', 'panel.doc.ts'),
    ]);
    expect(integrationsDocsSpelling(dirs, 'zorblet')).toEqual([]);
    expect(integrationsDocsSpelling(dirs, 'hiddentopic')).toEqual([]);
  });
});
