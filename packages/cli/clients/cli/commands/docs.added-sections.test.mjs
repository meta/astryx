// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A topic read names, at its top, the sections other packages add to it.
 *
 * An installed integration's section joins the end of the topic it extends,
 * unless it names where it goes (spec:AST-046 FR11). In an app whose base
 * library replaces a long topic such as `theme`, a reader who reads only the
 * start of that topic never learned that a theme package added a section to
 * it. Whichever order the app configures the packages in, the section is
 * there, for a topic and for a guide replaced by its route, and the read says
 * so at its top.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {runCli} from '../../../test-utils/run-cli.mjs';

const SLOW = 60_000;

/** @type {string} */
let tmpDir;

/** @param {string} title */
const section = title => ({
  title,
  content: [{type: 'prose', text: `${title}: what this section covers.`}],
});

const GUIDE = 'authoring/quick-start';

const PACKAGES = {
  // The app's base library, which replaces `theme` with its own long guide,
  // and a guide the CLI places, by its route.
  '@acme/base': {
    'theme.doc.mjs': {
      type: 'generic',
      name: 'theme',
      replaces: 'theme',
      title: 'Theme',
      description: 'Theme an Acme app.',
      sections: ['Quick start', 'Available themes', 'Light and dark'].map(
        section,
      ),
    },
    'acme-start.doc.mjs': {
      type: 'generic',
      name: 'acme-start',
      replaces: GUIDE,
      title: 'Start with Acme',
      description: 'Start an Acme integration.',
      sections: ['Create the package', 'Add a component'].map(section),
    },
  },
  // A package that adds its notes to that guide, by its route.
  '@acme/notes': {
    'acme-notes.doc.mjs': {
      type: 'generic',
      name: 'acme-notes',
      extends: GUIDE,
      title: 'Acme notes',
      description: 'Notes on starting with Acme.',
      sections: [section('Acme release notes')],
    },
  },
  // A theme package, which documents itself by adding a section to `theme`.
  '@acme/glyph-theme': {
    'glyph-theme.doc.mjs': {
      type: 'generic',
      name: 'glyph-theme',
      extends: 'theme',
      title: 'Glyph theme',
      description: 'Install the Glyph theme.',
      sections: [section('Install the Glyph theme')],
    },
  },
};

/** @param {string[]} integrations in configured order */
function scaffold(integrations) {
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.config.mjs'),
    `export default {integrations: ${JSON.stringify(integrations)}};\n`,
  );
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-docs-added-'));
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: 'consumer', version: '1.0.0'}),
  );
  for (const [name, docs] of Object.entries(PACKAGES)) {
    const packageDir = path.join(tmpDir, 'node_modules', ...name.split('/'));
    fs.mkdirSync(path.join(packageDir, 'docs'), {recursive: true});
    fs.writeFileSync(
      path.join(packageDir, 'package.json'),
      JSON.stringify({name, version: '1.0.0'}),
    );
    fs.writeFileSync(
      path.join(packageDir, 'astryx.integration.mjs'),
      "export default {docs: './docs'};\n",
    );
    for (const [file, doc] of Object.entries(docs)) {
      fs.writeFileSync(
        path.join(packageDir, 'docs', file),
        `export const docs = ${JSON.stringify(doc, null, 2)};\n`,
      );
    }
  }
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe.each([
  ['base library first', ['@acme/base', '@acme/glyph-theme', '@acme/notes']],
  ['base library last', ['@acme/glyph-theme', '@acme/notes', '@acme/base']],
])('astryx docs, %s', (_order, integrations) => {
  beforeEach(() => scaffold(integrations));

  it(
    'keeps the theme package’s section in the base library’s topic',
    async () => {
      const read = await runCli(['--json', 'docs', 'theme'], {cwd: tmpDir});
      expect(read.status).toBe(0);
      const {package: owner, data} = JSON.parse(read.stdout);
      expect(owner).toBe('@acme/base');
      expect(
        data.sections.filter(
          (/** @type {{package: string}} */ each) =>
            each.package === '@acme/glyph-theme',
        ),
      ).toEqual([
        expect.objectContaining({
          id: 'install-the-glyph-theme',
          title: 'Install the Glyph theme',
        }),
      ]);
    },
    SLOW,
  );

  it(
    'keeps the notes package’s section in the guide the base library replaces',
    async () => {
      const read = await runCli(['--json', 'docs', GUIDE], {cwd: tmpDir});
      expect(read.status).toBe(0);
      const {package: owner, data} = JSON.parse(read.stdout);
      expect(owner).toBe('@acme/base');
      expect(
        data.sections.filter(
          (/** @type {{package: string}} */ each) =>
            each.package === '@acme/notes',
        ),
      ).toEqual([
        expect.objectContaining({
          id: 'acme-release-notes',
          title: 'Acme release notes',
        }),
      ]);
      const index = (await runCli(['docs', GUIDE, '--index'], {cwd: tmpDir}))
        .stdout;
      expect(index).toContain('sections from @acme/notes: acme-release-notes');
    },
    SLOW,
  );

  it(
    'names the added section at the top of the index and of the full read',
    async () => {
      const line = 'sections from @acme/glyph-theme: install-the-glyph-theme';
      const index = (await runCli(['docs', 'theme', '--index'], {cwd: tmpDir}))
        .stdout;
      expect(index).toContain(line);
      // Before the section list, which ends with the added section.
      expect(index.indexOf(line)).toBeLessThan(index.indexOf('quick-start'));
      const full = (await runCli(['docs', 'theme', '--full'], {cwd: tmpDir}))
        .stdout;
      expect(full).toContain(line);
      expect(full.indexOf(line)).toBeLessThan(full.indexOf('## '));
    },
    SLOW,
  );
});
