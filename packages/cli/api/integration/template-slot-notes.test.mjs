// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `doctor integration validate` notes a template whose `slots` or
 * `fits` names a kind the vocabulary lacks, a page with two slots of one
 * name, and a page slot of a context kind; and it notes a package whose CLI
 * peer range admits a CLI that drops a template for either field. A note is
 * never an issue: it is not counted and never fails a check.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {validateIntegration} from './validate-integration.mjs';
import {TEMPLATE_SLOTS_CLI} from '../../foundation/integrations/cli-requirement.mjs';

/** @type {string} */
let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-template-slots-'));
});
afterEach(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

/**
 * An integration package with one page and one block template.
 * @param {{pkg?: Record<string, unknown>, slots?: string, fits?: string}} parts
 */
function writePackage({pkg = {}, slots = '', fits = ''}) {
  /** @param {string} rel @param {string} text */
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), {recursive: true});
    fs.writeFileSync(path.join(dir, rel), text);
  };
  write(
    'package.json',
    JSON.stringify({name: '@acme/slots', version: '1.0.0', ...pkg}),
  );
  write(
    'astryx.integration.mjs',
    "export default {templates: './templates'};\n",
  );
  write(
    'templates/acme-board.tsx',
    'export default function AcmeBoard() { return null; }\n',
  );
  write(
    'templates/acme-board.doc.mjs',
    `export default {type: 'page', name: 'Acme board', displayName: 'Acme board', description: 'A board.'${slots}};\n`,
  );
  write(
    'templates/acme-filter-bar.tsx',
    'export default function AcmeFilterBar() { return null; }\n',
  );
  write(
    'templates/acme-filter-bar.doc.mjs',
    `export default {type: 'block', name: 'Acme filter bar', displayName: 'Acme filter bar', description: 'A filter bar.', aspectRatio: 4, componentsUsed: []${fits}};\n`,
  );
}

/** @returns {Promise<any>} */
async function validated() {
  return (await validateIntegration(undefined, {cwd: dir})).data;
}

/** @param {any} data */
const slotNotes = data =>
  (data.notes ?? []).filter((/** @type {any} */ note) =>
    String(note.code).startsWith('template_slot_'),
  );

const PEER = {peerDependencies: {'@astryxdesign/cli': `>=${TEMPLATE_SLOTS_CLI}`}};

describe('template slot notes', () => {
  it('says nothing for known kinds and unique slot names', async () => {
    writePackage({
      pkg: PEER,
      slots: ", slots: [{name: 'filters', kind: 'toolbar'}, {name: 'body', kind: 'main'}]",
      fits: ", fits: ['toolbar', 'overlay']",
    });
    const data = await validated();
    expect(slotNotes(data)).toEqual([]);
    expect(data.olderCliNotes).toBeUndefined();
  });

  it('notes an unknown kind, a repeated slot name and a context made a slot', async () => {
    writePackage({
      pkg: PEER,
      slots:
        ", slots: [{name: 'filters', kind: 'toolbar'}, {name: 'filters', kind: 'hologram'}, {name: 'menu', kind: 'overlay'}]",
      fits: ", fits: ['toolbar', 'hologram']",
    });
    const data = await validated();
    const codes = slotNotes(data).map((/** @type {any} */ note) => note.code);
    expect(codes.sort()).toEqual([
      'template_slot_duplicate_name',
      'template_slot_not_a_place',
      'template_slot_unknown_kind',
      'template_slot_unknown_kind',
    ]);
    // A note is never an issue.
    expect(
      data.issues.filter((/** @type {any} */ issue) =>
        String(issue.code ?? '').startsWith('template_slot_'),
      ),
    ).toEqual([]);
  });

  it('notes a package whose CLI range admits a release that drops either field', async () => {
    writePackage({
      slots: ", slots: [{name: 'body', kind: 'main'}]",
      fits: ", fits: ['toolbar']",
    });
    const data = await validated();
    expect(
      data.olderCliNotes.map((/** @type {any} */ note) => [
        note.file,
        note.field,
      ]),
    ).toEqual([
      ['templates/acme-board.doc.mjs', 'slots'],
      ['templates/acme-filter-bar.doc.mjs', 'fits'],
    ]);
    for (const note of data.olderCliNotes) {
      expect(note.message).toContain(`">=${TEMPLATE_SLOTS_CLI}"`);
    }
  });
});
