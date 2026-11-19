// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every doc whose behavior changes in global mode says so (spec
 * AST-081). Global mode changes behavior in ways a reader cannot guess from
 * one page: a command that does something else outside a project, or an
 * integration that applies only outside projects when installed for the
 * computer. Each such doc carries one note in a single shared form, a prose
 * block that starts with `In global mode:` and links the global guide with
 * `{@link namespace:global}`, so a reader of any of them finds the guide.
 *
 * - Every command doc whose `outsideProject` is not `same` carries one.
 * - So does every authoring doc on integration manifests and their
 *   contributions: the integration guides' namespaces, the guides placed
 *   under them, and the manifest and discover-source schema docs.
 * - So does every API function doc whose result depends on whether `cwd` is
 *   inside a project or on the integrations installed for the computer, in
 *   its description (function docs have no notes field).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {describe, expect, it} from 'vitest';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOTE = /^In global mode: [\s\S]*\{@link namespace:global\}/;

/**
 * Every prose text in a doc, wherever it sits.
 * @param {unknown} value
 * @param {string[]} [out]
 * @returns {string[]}
 */
function proseTexts(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) proseTexts(item, out);
  } else if (value && typeof value === 'object') {
    const block = /** @type {Record<string, unknown>} */ (value);
    if (block.type === 'prose' && typeof block.text === 'string') {
      out.push(block.text);
    }
    for (const child of Object.values(block)) proseTexts(child, out);
  }
  return out;
}

/** @param {unknown} doc */
const hasNote = doc => proseTexts(doc).some(text => NOTE.test(text));

/**
 * @param {string} file
 * @returns {Promise<any>}
 */
async function load(file) {
  const mod = await import(pathToFileURL(file).href);
  return mod.doc ?? mod.docs;
}

/**
 * Guides under those namespaces about how to write one item's content, whose
 * behavior global mode never changes. Every other guide there carries the
 * note.
 */
const WRITING_DETAIL_GUIDES = new Set([
  'check-your-docs',
  'define-the-theme',
  'document-the-theme',
  'fonts-and-assets',
  'generate-a-palette',
  'links',
  'sections-and-placement',
  'short-and-findable',
]);

/** The namespaces whose guides are about integration manifests and what they add. */
const AUTHORING_NAMESPACES = [
  'integrations',
  'building-blocks',
  'configuration',
  'components',
  'templates',
  'docs',
  'themes',
];

describe('global mode notes', () => {
  it('every command doc that does not answer outside a project as in a new one carries the note', async () => {
    const dir = path.join(CLI, 'clients/cli/commands');
    const missing = [];
    let checked = 0;
    for (const name of fs.readdirSync(dir).sort()) {
      if (!name.endsWith('.doc.mjs')) continue;
      const doc = await load(path.join(dir, name));
      if (!doc?.outsideProject || doc.outsideProject === 'same') continue;
      checked++;
      if (!hasNote(doc.notes)) missing.push(doc.name);
    }
    expect(checked).toBeGreaterThan(5);
    expect(missing).toEqual([]);
  });

  it('every authoring doc on integration manifests and contributions carries the note', async () => {
    const tree = path.join(CLI, 'assets/docs/tree');
    /** @type {Array<{file: string, doc: any}>} */
    const docs = [];
    for (const name of fs.readdirSync(tree).sort()) {
      if (!name.endsWith('.doc.mjs')) continue;
      docs.push({file: name, doc: await load(path.join(tree, name))});
    }
    const parents = new Set(AUTHORING_NAMESPACES.map(n => `namespace:${n}`));
    const authoring = docs.filter(
      ({doc}) =>
        (doc.type === 'namespace' && AUTHORING_NAMESPACES.includes(doc.name)) ||
        (doc.type === 'generic' &&
          parents.has(doc.placement?.parent) &&
          doc.name !== 'global-integrations' &&
          !WRITING_DETAIL_GUIDES.has(doc.name)),
    );
    for (const file of [
      'authoring/integration/integration.doc.mjs',
      'authoring/discover/discover.doc.mjs',
    ]) {
      authoring.push({file, doc: await load(path.join(CLI, file))});
    }
    expect(authoring.length).toBeGreaterThan(10);
    expect(
      authoring.filter(({doc}) => !hasNote(doc)).map(({file}) => file),
    ).toEqual([]);
  });

  it('every API function doc whose result depends on global mode carries the note in its description', async () => {
    const missing = [];
    for (const name of [
      'component',
      'discover',
      'docs',
      'doctor',
      'init',
      'search',
      'upgrade',
    ]) {
      const doc = await load(path.join(CLI, 'api', name, `${name}.doc.mjs`));
      const at = doc.description?.indexOf('In global mode: ') ?? -1;
      if (at < 0 || !NOTE.test(doc.description.slice(at))) missing.push(name);
    }
    expect(missing).toEqual([]);
  });

  it('the global guide links down to every child and each child links back up', async () => {
    const tree = path.join(CLI, 'assets/docs/tree');
    const global = await load(path.join(tree, 'global.doc.mjs'));
    const text =
      proseTexts(global.blocks).join('\n') + JSON.stringify(global.blocks);
    const children = [];
    for (const name of fs.readdirSync(tree).sort()) {
      if (!name.endsWith('.doc.mjs')) continue;
      const doc = await load(path.join(tree, name));
      if (doc.placement?.parent === 'namespace:global') children.push(doc);
    }
    expect(children.map(c => c.name).sort()).toEqual([
      'ci-and-containers',
      'computer-agent-guide',
      'computer-integrations',
      'install-once',
      'monorepos',
      'problems',
      'project-global-or-both',
      'reference',
      'uninstall',
      'updates',
      'who-answers',
    ]);
    for (const child of children) {
      expect(text, child.name).toContain(`{@link generic:${child.name}}`);
      expect(
        proseTexts(child).some(t => t.includes('{@link namespace:global}')),
        child.name,
      ).toBe(true);
    }
  });
});
