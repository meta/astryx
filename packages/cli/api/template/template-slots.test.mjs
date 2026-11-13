// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every page template Astryx ships names the places where blocks go
 * (`slots`), and every block template names the kinds of place it goes in
 * (`fits`), in the shared vocabulary; template discovery and the template
 * list carry both.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {describe, expect, it} from 'vitest';
import {
  isPageKind,
  isSlotKind,
} from '../../authoring/doctypes/template/slot-kinds.mjs';
import {discoverTemplates} from './template.mjs';
import {templateList} from './list/list.mjs';

const TEMPLATES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../assets/templates',
);
const REPO = path.resolve(TEMPLATES, '../../../..');

/**
 * Each doc file under a folder.
 * @param {string} dir
 * @returns {string[]}
 */
function docsIn(dir) {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return docsIn(file);
    return entry.name.endsWith('.doc.mjs') ? [file] : [];
  });
}

/** @param {string} file */
const docOf = async file => (await import(pathToFileURL(file).href)).doc;

describe("Astryx's templates say where blocks go", () => {
  it('every page names its slots: known page kinds, unique names, a description each', async () => {
    const pages = docsIn(path.join(TEMPLATES, 'pages'));
    expect(pages.length).toBeGreaterThan(40);
    for (const file of pages) {
      const {slots} = await docOf(file);
      const where = path.relative(TEMPLATES, file);
      expect(Array.isArray(slots) && slots.length > 0, where).toBe(true);
      const names = slots.map((/** @type {any} */ slot) => slot.name);
      expect(new Set(names).size, `${where} repeats a slot name`).toBe(
        names.length,
      );
      for (const slot of slots) {
        expect(slot.name, where).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
        expect(isPageKind(slot.kind), `${where} ${slot.name}: ${slot.kind}`).toBe(
          true,
        );
        expect(slot.description?.length, `${where} ${slot.name}`).toBeGreaterThan(
          10,
        );
      }
    }
  });

  it('every block names its fit: known kinds, best first, no repeats', async () => {
    const blocks = docsIn(path.join(TEMPLATES, 'blocks'));
    expect(blocks.length).toBeGreaterThan(500);
    for (const file of blocks) {
      const {fits} = await docOf(file);
      const where = path.relative(TEMPLATES, file);
      expect(Array.isArray(fits), where).toBe(true);
      expect(fits.length, where).toBeLessThanOrEqual(3);
      expect(new Set(fits).size, where).toBe(fits.length);
      for (const kind of fits) expect(isSlotKind(kind), `${where}: ${kind}`).toBe(true);
    }
  });

  it('a shell is a layout: its navigation and a body that takes any section', async () => {
    for (const shell of ['shell-nav', 'shell-side-nav', 'shell-top-nav']) {
      const {slots} = await docOf(
        path.join(TEMPLATES, 'pages', shell, 'template.doc.mjs'),
      );
      const kinds = slots.map((/** @type {any} */ slot) => slot.kind);
      expect(kinds, shell).toContain('navigation');
      expect(kinds, shell).toContain('main');
    }
  });

  it('discovery and the template list carry slots and fits', async () => {
    const templates = await discoverTemplates(REPO);
    const list = templateList(templates).data;
    const page = list.find(t => t.type === 'page' && t.id === 'dashboard');
    expect(page?.slots?.length).toBeGreaterThan(0);
    const block = list.find(t => t.type === 'block' && t.fits && t.fits.length > 0);
    expect(block).toBeDefined();
    expect(list.filter(t => t.type === 'block').every(t => Array.isArray(t.fits))).toBe(
      true,
    );
  });
});
