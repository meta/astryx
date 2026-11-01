// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file integrationDocFiles(): exactly the docs each root's reader serves, a
 * nested root's files given to that root, and a root its reader cannot read.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {discoverIntegrationComponents} from './component-discovery.mjs';
import {integrationDocFiles} from './integration-doc-files.mjs';

/** @type {string} */
let pkg;

beforeEach(() => {
  pkg = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-doc-files-')),
  );
});

afterEach(() => {
  fs.rmSync(pkg, {recursive: true, force: true});
});

/**
 * @param {string} rel
 * @param {string} text
 */
function write(rel, text) {
  const file = path.join(pkg, rel);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, text);
  return file;
}

/** @param {string} name */
const component = name =>
  `export default {type: 'component', name: '${name}', displayName: '${name}', usage: {description: 'x'}, props: []};\n`;
/** @param {string} name */
const topic = name =>
  `export default {type: 'generic', name: '${name}', title: 'T', description: 'D', sections: [{title: 'S', content: [{type: 'prose', text: 'x'}]}]};\n`;
/** @param {string} rel a template doc, with its same-stem source */
const template = rel => {
  write(rel.replace(/\.doc\.mjs$/, '.tsx'), 'export default () => null;\n');
  return write(
    rel,
    `export default {type: 'block', name: '${path.basename(rel, '.doc.mjs')}', description: 'D'};\n`,
  );
};

/** @param {Awaited<ReturnType<typeof integrationDocFiles>>['files']} files */
const listed = files =>
  files
    .map(f => [path.relative(pkg, f.path).split(path.sep).join('/'), f.root])
    .sort();

describe('integrationDocFiles', () => {
  it('reads a fixture folder relative to its root, so a package under a `__tests__` folder is checked', async () => {
    write(
      '__tests__/acme/components/Hidden.doc.mjs',
      `${component('Hidden')}\n  hidden: true\n`,
    );
    write(
      '__tests__/acme/components/__tests__/Tested.doc.mjs',
      component('Tested'),
    );

    const {files, fixtures} = await integrationDocFiles({
      name: '@acme/widgets',
      components: path.join(pkg, '__tests__', 'acme', 'components'),
    });

    expect(listed(files)).toEqual([
      ['__tests__/acme/components/Hidden.doc.mjs', 'components'],
    ]);
    expect(fixtures).toBe(1);
  });

  it("gives a nested root's files to that root", async () => {
    write('src/Badge.doc.mjs', component('Badge'));
    write('src/docs/guide.doc.mjs', topic('guide'));
    write('src/docs/guide.doc.zh.mjs', 'export const docsZh = {};\n');
    template('templates/hero.doc.mjs');

    const {files, unread} = await integrationDocFiles({
      name: '@acme/widgets',
      components: path.join(pkg, 'src'),
      docs: path.join(pkg, 'src', 'docs'),
      templates: path.join(pkg, 'templates'),
    });

    expect(unread).toEqual([]);
    expect(listed(files)).toEqual([
      ['src/Badge.doc.mjs', 'components'],
      ['src/docs/guide.doc.mjs', 'docs'],
      ['src/docs/guide.doc.zh.mjs', 'docs-overlay'],
      ['templates/hero.doc.mjs', 'templates'],
    ]);
  });

  it('takes every doc the roots hold, served or not, and counts a test fixture no reader serves', async () => {
    write('components/__fixtures__/Fixture.doc.mjs', component('Fixture'));
    write('components/.drafts/Draft.doc.mjs', component('Draft'));
    write('components/__tests__/Tested.doc.mjs', component('Tested'));
    write(
      'components/Hidden.doc.mjs',
      `${component('Hidden')}\n  hidden: true\n`,
    );
    write('components/Twice.doc.mjs', component('Twice'));
    write('components/again/Twice.doc.mjs', component('Twice'));
    write('shared/Linked.doc.mjs', component('Linked'));
    fs.symlinkSync(
      path.join(pkg, 'shared', 'Linked.doc.mjs'),
      path.join(pkg, 'components', 'Linked.doc.mjs'),
    );
    template('templates/__tests__/tested.doc.mjs');
    write('templates/orphan.doc.mjs', "export default {type: 'block'};\n");
    // The template reader reads `__fixtures__`: a template doc there without
    // its source is the package's, so it is checked.
    write(
      'templates/__fixtures__/bad.doc.mjs',
      "export default {type: 'block'};\n",
    );
    write('docs/__tests__/sample.doc.mjs', topic('sample'));
    write('docs/.drafts/topic.doc.mjs', topic('topic'));
    write('docs/.drafts/topic.doc.zh.mjs', 'export const docsZh = {};\n');
    write('docs/copy.doc.mjs', topic('topic'));
    write('docs/orphan.doc.dense.mjs', 'export const docsDense = {};\n');
    write('themes/oceanTheme.doc.mjs', 'export default {};\n');
    const integration = {
      name: '@acme/widgets',
      components: path.join(pkg, 'components'),
      templates: path.join(pkg, 'templates'),
      docs: path.join(pkg, 'docs'),
      themes: path.join(pkg, 'themes'),
    };

    const {files, unread, fixtures} = await integrationDocFiles(integration);

    // Component discovery skips `__tests__` and a `hidden` doc, and serves the
    // first doc of a name; a template without its source, a second topic of
    // a name, and an overlay without its topic are not served either. All of
    // them ship, so all are checked, but a test fixture no reader serves.
    const served = discoverIntegrationComponents(integration).map(c =>
      path.relative(pkg, c.docPath),
    );
    expect(served.filter(file => file.endsWith('Twice.doc.mjs'))).toHaveLength(
      1,
    );
    expect(listed(files)).toEqual(
      [
        ...served.map(file => [file, 'components']),
        ['components/Hidden.doc.mjs', 'components'],
        ['components/again/Twice.doc.mjs', 'components'],
        ['docs/.drafts/topic.doc.mjs', 'docs'],
        ['docs/.drafts/topic.doc.zh.mjs', 'docs-overlay'],
        ['docs/copy.doc.mjs', 'docs'],
        ['docs/orphan.doc.dense.mjs', 'docs-overlay'],
        ['templates/__fixtures__/bad.doc.mjs', 'templates'],
        ['templates/__tests__/tested.doc.mjs', 'templates'],
        ['templates/orphan.doc.mjs', 'templates'],
      ].sort(),
    );
    // `components/__tests__/Tested` and `docs/__tests__/sample`.
    expect(fixtures).toBe(2);
    expect(served.sort()).toEqual(
      expect.arrayContaining([
        'components/.drafts/Draft.doc.mjs',
        'components/Linked.doc.mjs',
        'components/__fixtures__/Fixture.doc.mjs',
      ]),
    );
    expect(served.some(file => /Tested|Hidden/.test(file))).toBe(false);
    // Theme discovery serves no theme from this root, so none is checked,
    // and the root says why.
    expect(unread).toEqual([
      {
        path: integration.themes,
        reason: expect.stringMatching(
          /^the themes root does not load, so no doc in it was checked: .*lower-kebab/,
        ),
      },
    ]);
  });

  it('takes each icon set descriptor, and the descriptor of a set that does not parse', async () => {
    const data = JSON.stringify({
      schemaVersion: 1,
      module: '@acme/icons',
      icons: [],
    });
    write(
      'icon-sets/outline/outline.doc.mjs',
      "export default {type: 'icon-set', name: 'outline', displayName: 'Outline', description: 'D', maintained: true, license: 'MIT'};\n",
    );
    write('icon-sets/outline/outline.icons.json', data);
    // A descriptor with a wrongly typed field: discovery withdraws the set,
    // but the file still ships and is still checked.
    write(
      'icon-sets/solid/solid.doc.mjs',
      "export default {type: 'icon-set', name: 'solid', displayName: 'Solid', description: 'D', maintained: 'yes', license: 'MIT'};\n",
    );
    write('icon-sets/solid/solid.icons.json', data);
    const {files, unread} = await integrationDocFiles({
      name: '@acme/icons',
      iconSets: path.join(pkg, 'icon-sets'),
    });
    expect(listed(files)).toEqual([
      ['icon-sets/outline/outline.doc.mjs', 'icon-sets'],
      ['icon-sets/solid/solid.doc.mjs', 'icon-sets'],
    ]);
    expect(unread).toEqual([]);
  });

  it("takes a scoped package's namespace docs and placed guides where they are, with each guide's overlays", async () => {
    write(
      'docs/guides/guides.doc.mjs',
      `export const docs = ${JSON.stringify({type: 'namespace', name: 'guides', title: 'Guides', summary: 'Every guide.', slots: {guides: {title: 'Guides', accepts: {kinds: ['generic']}}}})};\n`,
    );
    write(
      'docs/guides/setup.doc.mjs',
      `export const docs = ${JSON.stringify({type: 'generic', name: 'setup', title: 'Set up', description: 'D', placement: {parent: 'namespace:guides', slot: 'guides', order: 1}, sections: [{title: 'S', content: [{type: 'prose', text: 'x'}]}]})};\n`,
    );
    write('docs/guides/setup.doc.zh.mjs', 'export const docsZh = {};\n');
    write('docs/guides/setup.doc.dense.mjs', 'export const docsDense = {};\n');

    const {files, unread} = await integrationDocFiles({
      name: '@acme/widgets',
      docs: path.join(pkg, 'docs'),
    });

    expect(unread).toEqual([]);
    expect(listed(files)).toEqual([
      ['docs/guides/guides.doc.mjs', 'docs'],
      ['docs/guides/setup.doc.dense.mjs', 'docs-overlay'],
      ['docs/guides/setup.doc.mjs', 'docs'],
      ['docs/guides/setup.doc.zh.mjs', 'docs-overlay'],
    ]);
  });

  it('leaves a root validate reports to that issue, and lists a root whose reader fails inside it', async () => {
    write('components/Badge.doc.mjs', component('Badge'));
    write('components/locked/Inner.doc.mjs', component('Inner'));
    write('docs/guide.doc.mjs', topic('guide'));
    const locked = path.join(pkg, 'components', 'locked');
    fs.chmodSync(path.join(pkg, 'docs'), 0o000);
    fs.chmodSync(locked, 0o000);
    try {
      const {files, unread} = await integrationDocFiles({
        name: '@acme/widgets',
        components: path.join(pkg, 'components'),
        docs: path.join(pkg, 'docs'),
        templates: path.join(pkg, 'missing'),
      });

      // `validate` reports the unreadable docs root and the missing templates
      // root itself; the components root reads until its locked folder.
      expect(files).toEqual([]);
      expect(unread).toEqual([
        {
          path: path.join(pkg, 'components'),
          reason: expect.stringMatching(
            /^the components root does not load, so no doc in it was checked: .*EACCES/,
          ),
        },
      ]);
    } finally {
      fs.chmodSync(path.join(pkg, 'docs'), 0o755);
      fs.chmodSync(locked, 0o755);
    }
  });
});
