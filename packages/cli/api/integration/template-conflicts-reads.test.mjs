// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The templates check (integrationTemplateConflicts) reads only the Core
 * template docs an integration template names. Every Core id and kind comes
 * from Core's files, and a collision reads its Core template's name.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

const coreDocReads = vi.hoisted(() => ({count: 0}));

vi.mock('../../foundation/doc-compiler/read.mjs', async importOriginal => {
  /** @type {typeof import('../../foundation/doc-compiler/read.mjs')} */
  const original = await importOriginal();
  return {
    ...original,
    /** @type {typeof original.readDocView} */
    readDocView: (docPath, options) => {
      if (/[\\/]assets[\\/]templates[\\/](pages|blocks)[\\/]/.test(docPath)) {
        coreDocReads.count += 1;
      }
      return original.readDocView(docPath, options);
    },
  };
});

const {discoverCoreTemplates} =
  await import('../../foundation/discovery/template-adapter.mjs');
const {integrationTemplateConflicts} = await import('./authoring-checks.mjs');

const REPO = fileURLToPath(new URL('../../../../', import.meta.url));

/** @type {string} */
let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(REPO, '.astryx-template-conflicts-reads-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/**
 * An integration package with one template per entry.
 * @param {Array<{id: string, type: 'page' | 'block'}>} templates
 */
function writeIntegration(templates) {
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: '@acme/widgets', version: '1.2.3'}),
  );
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.integration.mjs'),
    "export default {templates: './templates'};\n",
  );
  fs.mkdirSync(path.join(tmpDir, 'templates'), {recursive: true});
  for (const {id, type} of templates) {
    fs.writeFileSync(
      path.join(tmpDir, 'templates', `${id}.doc.mjs`),
      `export default {type: '${type}', name: 'Fixture ${id}', description: 'fixture'};\n`,
    );
    fs.writeFileSync(
      path.join(tmpDir, 'templates', `${id}.tsx`),
      'export default function Fixture() { return null; }\n',
    );
  }
}

describe('integrationTemplateConflicts', () => {
  it('reads the doc of only the Core template it collides with', async () => {
    const core = await discoverCoreTemplates();
    const page = core.find(template => template.type === 'page');
    expect(page).toBeDefined();
    writeIntegration([
      {id: /** @type {any} */ (page).dirName, type: 'page'},
      {id: 'acme-own-page', type: 'page'},
    ]);

    coreDocReads.count = 0;
    const result = await integrationTemplateConflicts(undefined, {cwd: tmpDir});

    expect(result.data.conflicts.map(conflict => conflict.id)).toEqual([
      /** @type {any} */ (page).dirName,
    ]);
    expect(result.data.conflicts[0].coreMatches).toEqual([
      {type: 'page', name: /** @type {any} */ (page).name},
    ]);
    // Core holds hundreds of templates; one collides.
    expect(core.length).toBeGreaterThan(100);
    expect(coreDocReads.count).toBe(1);
  });

  it('reads no Core template doc when nothing collides', async () => {
    writeIntegration([{id: 'acme-own-page', type: 'page'}]);

    coreDocReads.count = 0;
    const result = await integrationTemplateConflicts(undefined, {cwd: tmpDir});

    expect(result.data.conflicts).toEqual([]);
    expect(result.data.issues).toEqual([]);
    expect(coreDocReads.count).toBe(0);
  });
});
