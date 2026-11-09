// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The templates check (integrationTemplateConflicts) fails when a Core
 * template doc cannot be imported, even when no integration template names
 * it.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

const broken = vi.hoisted(() => ({
  docPath: /** @type {string | null} */ (null),
}));

vi.mock('../../foundation/doc-compiler/read.mjs', async importOriginal => {
  /** @type {typeof import('../../foundation/doc-compiler/read.mjs')} */
  const original = await importOriginal();
  return {
    ...original,
    /** @type {typeof original.readDocView} */
    readDocView: (docPath, options) => {
      if (docPath === broken.docPath) {
        // As an import that throws: the reader rethrows the module's error.
        return Promise.reject(new Error('a broken Core template doc'));
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
  tmpDir = fs.mkdtempSync(path.join(REPO, '.astryx-template-broken-core-'));
});

afterEach(() => {
  broken.docPath = null;
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('integrationTemplateConflicts', () => {
  it('fails on a Core template doc that cannot be imported, though no integration template names it', async () => {
    const blocks = (await discoverCoreTemplates()).filter(
      template => template.type === 'block',
    );
    const victim = blocks[blocks.length - 1];
    expect(victim).toBeDefined();
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: '@acme/widgets', version: '1.2.3'}),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.integration.mjs'),
      "export default {templates: './templates'};\n",
    );
    fs.mkdirSync(path.join(tmpDir, 'templates'), {recursive: true});
    fs.writeFileSync(
      path.join(tmpDir, 'templates', 'acme-own-page.doc.mjs'),
      "export default {type: 'page', name: 'Fixture', description: 'fixture'};\n",
    );
    fs.writeFileSync(
      path.join(tmpDir, 'templates', 'acme-own-page.tsx'),
      'export default function Fixture() { return null; }\n',
    );
    // With every Core doc readable, the check passes: the package collides
    // with nothing.
    const clean = await integrationTemplateConflicts(undefined, {cwd: tmpDir});
    expect(clean.data.conflicts).toEqual([]);
    expect(clean.data.issues).toEqual([]);

    broken.docPath = /** @type {any} */ (victim).docPath;
    await expect(
      integrationTemplateConflicts(undefined, {cwd: tmpDir}),
    ).rejects.toThrow('a broken Core template doc');
  });
});
