// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A section read on a namespace (spec:AST-046 FR6): `astryx docs
 * <namespace> <section>` answers from the one guide below the namespace that
 * has the section, exactly as that guide's own section read does, so a section
 * read that worked before a topic became a namespace still works.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {docs} from './docs.mjs';
import {oneGuide} from './detail/section/section.mjs';

const SLOW = 60_000;

/** @type {string} */
let tmpDir;

/** @param {Record<string, object>} files the integration's doc files */
function scaffold(files) {
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: 'consumer'}),
  );
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.config.mjs'),
    "export default {integrations: ['@acme/kit']};\n",
  );
  const pkgDir = path.join(tmpDir, 'node_modules', '@acme', 'kit');
  fs.mkdirSync(path.join(pkgDir, 'docs'), {recursive: true});
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({name: '@acme/kit', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(pkgDir, 'astryx.integration.mjs'),
    "export default {docs: './docs'};\n",
  );
  for (const [file, doc] of Object.entries(files)) {
    fs.writeFileSync(
      path.join(pkgDir, 'docs', file),
      `export const docs = ${JSON.stringify(doc, null, 2)};\n`,
    );
  }
}

/**
 * @param {string} name
 * @param {number} order
 * @param {Array<{title: string, id?: string}>} sections
 */
function guide(name, order, sections) {
  return {
    type: 'generic',
    name,
    title: `Acme ${name}`,
    description: `The ${name} guide.`,
    placement: {parent: 'namespace:acme', slot: 'guides', order},
    sections: sections.map(section => ({
      ...section,
      content: [{type: 'prose', text: `${section.title} text.`}],
    })),
  };
}

/** A namespace of two guides that both have a section titled "...setup". */
function kit() {
  return {
    'acme.doc.mjs': {
      type: 'namespace',
      name: 'acme',
      title: 'Acme',
      summary: 'Everything about the Acme kit.',
      slots: {guides: {title: 'Guides', accepts: {kinds: ['generic']}}},
    },
    'install.doc.mjs': guide('install', 1, [
      {title: 'Package setup', id: 'package-setup'},
      {title: 'Verify'},
    ]),
    'theme.doc.mjs': guide('theme', 2, [
      {title: 'Theme setup'},
      {title: 'Dark mode'},
    ]),
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(
    path.join(process.cwd(), '.astryx-namespace-section-test-'),
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('a section read on a namespace', () => {
  it(
    'returns the one guide section, by key and by title, as the guide read does',
    async () => {
      for (const query of ['side-panels', 'Side panels', 'side panels']) {
        const read = await docs('layout', query);
        expect(read).toEqual(await docs('layout/side-panels', 'side-panels'));
        expect(read).toMatchObject({
          type: 'docs.detail.section',
          package: '@astryxdesign/cli',
          data: {id: 'side-panels', title: 'Side panels'},
        });
      }
      // A section in a guide of its own, and a section past a guide's first.
      expect((await docs('layout', 'shell')).data.id).toBe('shell');
      expect((await docs('layout', 'responsive-contract')).data.id).toBe(
        'responsive-contract',
      );
    },
    SLOW,
  );

  it(
    'reads dense and Chinese the way the guide read does',
    async () => {
      for (const options of [{dense: true}, {zh: true}, {lang: 'dense'}]) {
        expect(await docs('layout', 'side-panels', options)).toEqual(
          await docs('layout/side-panels', 'side-panels', options),
        );
      }
    },
    SLOW,
  );

  it(
    "prefers the guide whose section key is the query over another guide's title match",
    async () => {
      scaffold(kit());
      const read = await docs('acme', 'package-setup', {cwd: tmpDir});
      expect(read.data).toMatchObject({
        id: 'package-setup',
        title: 'Package setup',
      });
      expect(read.data.links.up).toBe('astryx docs acme/install --index');
      expect((await docs('acme', 'dark mode', {cwd: tmpDir})).data.title).toBe(
        'Dark mode',
      );
    },
    SLOW,
  );

  it(
    'fails on a miss, naming every guide below the namespace',
    async () => {
      const err = await docs('layout', 'zzzz-nope').catch(e => e);
      expect(err.code).toBe('ERR_UNKNOWN_SECTION');
      const names = err.suggestions.map(s => s.name);
      expect(names).toContain('layout/scaffold');
      expect(names).toContain('layout/side-panels');
      expect(names.every(name => name.startsWith('layout/'))).toBe(true);
      // At any depth: guides under nested namespaces are named, namespaces are not.
      const authoring = await docs('authoring', 'zzzz-nope').catch(e => e);
      expect(authoring.code).toBe('ERR_UNKNOWN_SECTION');
      expect(authoring.suggestions.map(s => s.name)).toContain(
        'authoring/building-blocks/components/add-a-component',
      );
      expect(authoring.suggestions.map(s => s.name)).not.toContain(
        'authoring/building-blocks',
      );
    },
    SLOW,
  );

  it(
    'still fails a section on a typed doc, naming the doc',
    async () => {
      const err = await docs('cli/commands/docs', 'anything').catch(e => e);
      expect(err.code).toBe('ERR_UNKNOWN_SECTION');
      expect(err.suggestions.map(s => s.name)).toEqual(['cli/commands/docs']);
    },
    SLOW,
  );
});

describe('a namespace read answers what the guide read answers', () => {
  /** A guide with a title match before a key match, and a second guide. */
  function competing() {
    return {
      ...kit(),
      'install.doc.mjs': guide('install', 1, [
        {title: 'Shell contract'},
        {title: 'Shell'},
      ]),
      'theme.doc.mjs': guide('theme', 2, [{title: 'Setup', id: 'setup'}]),
      'extra.doc.mjs': guide('extra', 3, [{title: 'Theme setup'}]),
    };
  }

  it(
    'returns the section the guide read returns, even when a later section has the key',
    async () => {
      scaffold(competing());
      const own = await docs('acme/install', 'shell', {cwd: tmpDir});
      const read = await docs('acme', 'shell', {cwd: tmpDir});
      expect(read).toEqual(own);
      expect(read.data.title).toBe('Shell contract');
    },
    SLOW,
  );

  it(
    "prefers the guide whose own match is the query's key over another guide's title match",
    async () => {
      scaffold(competing());
      const read = await docs('acme', 'setup', {cwd: tmpDir});
      expect(read).toEqual(await docs('acme/theme', 'setup', {cwd: tmpDir}));
      expect(read.data).toMatchObject({id: 'setup', title: 'Setup'});
    },
    SLOW,
  );

  it(
    'names the children of a namespace with no guide below it',
    async () => {
      const err = await docs('cli/api', 'anything').catch(e => e);
      expect(err.code).toBe('ERR_UNKNOWN_SECTION');
      const api = (await docs('cli/api')).data;
      expect(err.suggestions.map(s => s.name)).toEqual(
        api.slots.flatMap(slot => slot.children.map(child => child.route)),
      );
      expect(err.suggestions.length).toBeGreaterThan(0);
      expect(err.message).toContain('Open one of its children');
    },
    SLOW,
  );
});

describe('a section query that matches sections in several guides', () => {
  // It used to guess; now it asks. A flat topic's section read returns its
  // first title match; across guides, the read names each guide instead.
  it(
    'asks which guide, naming each guide that matches',
    async () => {
      scaffold(kit());
      const err = await docs('acme', 'setup', {cwd: tmpDir}).catch(e => e);
      expect(err.code).toBe('ERR_UNKNOWN_SECTION');
      expect(err.suggestions).toEqual([
        {name: 'acme/install', reason: 'has "Package setup"'},
        {name: 'acme/theme', reason: 'has "Theme setup"'},
      ]);
    },
    SLOW,
  );

  it('decides in one place: oneGuide answers only a single match', () => {
    const a = /** @type {any} */ ({guide: {route: 'acme/install'}});
    const b = /** @type {any} */ ({guide: {route: 'acme/theme'}});
    expect(oneGuide([a])).toBe(a);
    expect(oneGuide([a, b])).toBeNull();
    expect(oneGuide([])).toBeNull();
  });
});
