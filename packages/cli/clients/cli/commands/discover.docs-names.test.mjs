// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx discover` names an installed integration's docs the way
 * `astryx docs` opens them.
 *
 * A doc opens where it lands, not by the name on its file: a doc that adds
 * sections to `theme` opens with `theme`, and a guide by its route. Discover
 * listed each doc by its file's name, so a reader who passed that name to
 * `astryx docs` got an unknown topic. Both commands now read one rule, so
 * every name discover prints opens.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {
  definitionSource,
  writeIconSetProject,
} from '../../../test-utils/icon-set-fixture.mjs';

const SLOW = 60_000;

/** @type {string} */
let tmpDir;

/** @param {string} title */
const section = title => ({
  title,
  content: [{type: 'prose', text: `${title}: what the Acme kit adds.`}],
});

/** Every way an integration's doc can land, one doc each. */
const DOCS = {
  // A topic of its own.
  'acme-setup.doc.mjs': {
    type: 'generic',
    name: 'acme-setup',
    title: 'Acme setup',
    description: 'Set up the Acme kit.',
    sections: [section('Install')],
  },
  // Sections added to the CLI's `theme` topic, the shape a theme package
  // ships to document its theme.
  'acme-theme.doc.mjs': {
    type: 'generic',
    name: 'acme-theme',
    title: 'Acme theme',
    description: 'Apply the Acme theme.',
    extends: 'theme',
    sections: [section('Apply the Acme theme')],
  },
  // The package's own namespace, and a guide placed in it.
  'acme.doc.mjs': {
    type: 'namespace',
    name: 'acme',
    title: 'Acme docs',
    summary: 'Build with the Acme kit.',
    slots: {guides: {title: 'Guides', accepts: {kinds: ['generic']}}},
  },
  'getting-started.doc.mjs': {
    type: 'generic',
    name: 'getting-started',
    title: 'Getting started',
    description: 'Start building with Acme.',
    placement: {parent: 'namespace:acme', slot: 'guides'},
    sections: [section('First page')],
  },
  // Sections added to a guide the CLI places, by its route.
  'acme-quick-start.doc.mjs': {
    type: 'generic',
    name: 'acme-quick-start',
    title: 'Acme quick start',
    description: 'Start an Acme integration.',
    extends: 'authoring/quick-start',
    sections: [section('Acme notes')],
  },
};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-discover-docs-'));
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: 'consumer', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.config.mjs'),
    "export default {integrations: ['@acme/kit']};\n",
  );
  const packageDir = path.join(tmpDir, 'node_modules', '@acme', 'kit');
  fs.mkdirSync(path.join(packageDir, 'docs'), {recursive: true});
  fs.writeFileSync(
    path.join(packageDir, 'package.json'),
    JSON.stringify({name: '@acme/kit', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(packageDir, 'astryx.integration.mjs'),
    "export default {docs: './docs'};\n",
  );
  for (const [file, doc] of Object.entries(DOCS)) {
    fs.writeFileSync(
      path.join(packageDir, 'docs', file),
      `export const docs = ${JSON.stringify(doc, null, 2)};\n`,
    );
  }
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/** @returns {Promise<string[]>} the docs discover lists for `@acme/kit` */
async function listedDocs() {
  const result = await runCli(['--json', 'discover'], {cwd: tmpDir});
  expect(result.status).toBe(0);
  const entry = JSON.parse(result.stdout).data.find(
    (/** @type {{name: string}} */ each) => each.name === '@acme/kit',
  );
  return entry.docs;
}

describe('astryx discover: docs an installed integration adds', () => {
  it(
    'names each doc where it lands, not by the name on its file',
    async () => {
      expect(await listedDocs()).toEqual([
        'acme',
        'acme-setup',
        'acme/getting-started',
        'authoring/quick-start',
        'theme',
      ]);
    },
    SLOW,
  );

  it(
    'prints only names that astryx docs opens',
    async () => {
      const names = await listedDocs();
      expect(names.length).toBeGreaterThan(0);
      for (const name of names) {
        const read = await runCli(['docs', name], {cwd: tmpDir});
        expect({name, status: read.status}).toEqual({name, status: 0});
      }
    },
    SLOW,
  );
});

describe('astryx discover: an icon set beside docs', () => {
  it(
    'lists an icon set’s own icon definitions with the set, never as docs',
    async () => {
      // The set ships an icon definition of its own, a typed doc the docs tree
      // places; the Acme kit beside it ships docs, so the catalog is built.
      const cwd = writeIconSetProject(path.join(tmpDir, 'icons'), {
        packages: [{definitions: {sparkle: definitionSource('sparkle')}}],
        config: {
          integrations: ['@acme/glyphs', '@acme/kit'],
          experimental: {iconSet: 'glyphs'},
        },
      });
      fs.cpSync(
        path.join(tmpDir, 'node_modules', '@acme', 'kit'),
        path.join(cwd, 'node_modules', '@acme', 'kit'),
        {recursive: true},
      );
      const result = await runCli(['--json', 'discover'], {cwd});
      expect(result.status).toBe(0);
      const glyphs = JSON.parse(result.stdout).data.find(
        (/** @type {{name: string}} */ each) => each.name === '@acme/glyphs',
      );
      expect(glyphs.iconSets).toEqual(['glyphs']);
      expect(glyphs.docs ?? []).toEqual([]);
    },
    SLOW,
  );
});
