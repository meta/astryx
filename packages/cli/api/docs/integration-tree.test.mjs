// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Integration docs in the docs tree (spec:AST-046, spec:AST-047): an
 * integration's namespace docs and placed guides join the CLI's tree with the
 * same moves, links, search, and doctor checks, named by its provider id.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {docs} from './docs.mjs';
import {loadDocsCatalog} from './_adapter.mjs';
import {search} from '../search/search.mjs';
import {checkDocsTree} from '../doctor/doctor.mjs';
import {integrationDocConflicts} from '../integration/authoring-checks.mjs';

const SLOW = 60_000;

/** @type {string} */
let tmpDir;

const NAMESPACE = {
  type: 'namespace',
  name: 'acme',
  title: 'Acme',
  summary: 'Everything about the Acme kit.',
  slots: {guides: {title: 'Guides', accepts: {kinds: ['generic']}}},
};

/**
 * A guide placed in the acme namespace.
 * @param {string} name
 * @param {object} [fields]
 */
function guide(name, fields = {}) {
  return {
    type: 'generic',
    name,
    title: `Acme ${name}`,
    description: `How to ${name} the Acme kit.`,
    placement: {parent: 'namespace:acme', slot: 'guides'},
    sections: [
      {title: 'Overview', content: [{type: 'prose', text: `Do ${name}.`}]},
    ],
    ...fields,
  };
}

/** The docs of a small integration: a namespace, two guides, and a topic. */
function kit() {
  return {
    'acme.doc.mjs': NAMESPACE,
    'setup.doc.mjs': guide('setup', {
      placement: {parent: 'namespace:acme', slot: 'guides', order: 1},
      sections: [
        {
          title: 'Install',
          content: [
            {
              type: 'prose',
              text: 'Frobnicate the kit, then check it with {@link @astryxdesign/cli:command:doctor}.',
            },
            {type: 'prose', text: 'Next: {@link generic:deploy}.'},
          ],
        },
        {
          title: 'Configure',
          content: [{type: 'prose', text: 'Add it to astryx.config.'}],
        },
      ],
    }),
    'deploy.doc.mjs': guide('deploy', {
      placement: {parent: 'namespace:acme', slot: 'guides', order: 2},
    }),
    'notes.doc.mjs': {
      type: 'generic',
      name: 'acme-notes',
      title: 'Acme notes',
      description: 'Notes about the kit.',
      sections: [
        {
          title: 'Start',
          content: [{type: 'prose', text: 'Start at {@link generic:setup}.'}],
        },
      ],
    },
  };
}

/** A guide whose only link names no doc. */
const broken = () =>
  guide('broken', {
    sections: [
      {
        title: 'Overview',
        content: [{type: 'prose', text: 'See {@link generic:nope}.'}],
      },
    ],
  });

/**
 * A consumer project that configures `@acme/kit`, whose manifest names a
 * provider id that differs from its package name.
 * @param {Record<string, object>} files
 */
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
    "export default {docs: './docs', providerId: '@acme/tree-provider'};\n",
  );
  for (const [file, doc] of Object.entries(files)) {
    fs.writeFileSync(
      path.join(pkgDir, 'docs', file),
      `export const docs = ${JSON.stringify(doc, null, 2)};\n`,
    );
  }
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(
    path.join(process.cwd(), '.astryx-integration-tree-test-'),
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('integration docs in the docs tree', () => {
  it('names a package whose docs did not load, instead of dropping them silently', async () => {
    scaffold({
      ...kit(),
      'broken.doc.mjs': {
        type: 'generic',
        name: 'broken',
        title: 'Broken',
        description: 'A topic whose block no topic may hold.',
        sections: [
          {
            title: 'Only',
            content: [
              {
                type: 'workflow',
                steps: [{title: 'Set up', references: ['generic:setup']}],
              },
            ],
          },
        ],
      },
    });
    const listed = await docs(undefined, undefined, {cwd: tmpDir});
    expect(listed.meta?.notLoaded).toEqual([
      expect.objectContaining({package: '@acme/kit', message: expect.any(String)}),
    ]);
  }, 60_000);

  it('lists an integration namespace beside the CLI, named by its provider id', async () => {
    scaffold(kit());
    const listed = await docs(undefined, undefined, {cwd: tmpDir});
    expect(listed.meta.namespaces).toContainEqual({
      topic: 'acme',
      description: 'Everything about the Acme kit.',
      package: '@acme/kit',
    });
    const top = await docs('acme', undefined, {cwd: tmpDir});
    expect(top.type).toBe('docs.node');
    expect(top.data).toMatchObject({
      id: 'astryx:artifact:v1/%40acme%2Ftree-provider/namespace/acme',
      package: '@acme/kit',
      links: {up: 'astryx docs'},
    });
    expect(
      top.data.slots[0].children.map((/** @type {any} */ c) => c.route),
    ).toEqual(['acme/setup', 'acme/deploy']);
  }, SLOW);

  it('renders a placed guide summary once, so an escaped token stays written', async () => {
    scaffold({
      ...kit(),
      'deploy.doc.mjs': guide('deploy', {
        description: 'Show the syntax {@@pm run build} beside {@pm run build}.',
        placement: {parent: 'namespace:acme', slot: 'guides', order: 2},
      }),
    });
    const top = await docs('acme', undefined, {cwd: tmpDir});
    const deploy = top.data.slots[0].children.find((/** @type {any} */ c) => c.route === 'acme/deploy');
    expect(deploy.summary).toMatch(/^Show the syntax \{@pm run build\} beside `\S+ run build`\.$/);
  }, SLOW);

  it('renders a flat topic summary once, so an escaped token stays written', async () => {
    scaffold({
      ...kit(),
      'notes.doc.mjs': {...kit()['notes.doc.mjs'], description: 'Show the syntax {@@pm run build} beside {@pm run build}.'},
    });
    const listed = await docs('guides', undefined, {cwd: tmpDir});
    expect(JSON.stringify(listed.data)).toContain('Show the syntax {@pm run build} beside `');
  }, SLOW);

  it('reads a placed guide one level at a time, with its links resolved', async () => {
    scaffold(kit());
    const index = await docs('acme/setup', undefined, {cwd: tmpDir, index: true});
    expect(index.type).toBe('docs.index');
    expect(index.data.links.up).toBe('astryx docs acme');
    const install = await docs('acme/setup', 'install', {cwd: tmpDir});
    const [prose, next] = install.data.content;
    expect(prose.text).toBe(
      'Frobnicate the kit, then check it with `astryx docs cli/commands/doctor`.',
    );
    expect(next.text).toBe('Next: `astryx docs acme/deploy`.');
    const notes = await docs('acme-notes', undefined, {cwd: tmpDir});
    expect(notes.data.sections[0].content[0].text).toBe(
      'Start at `astryx docs acme/setup`.',
    );
  }, SLOW);

  it('finds a section of the guide by search, with its package and parent', async () => {
    scaffold(kit());
    const {data} = await search('frobnicate', {cwd: tmpDir, type: 'doc'});
    expect(data.results[0]).toMatchObject({
      name: 'acme/setup',
      section: 'install',
      command: 'astryx docs acme/setup install',
      parent: 'astryx docs acme/setup --index',
      package: '@acme/kit',
    });
  }, SLOW);

  it('passes doctor, and warns on a link that names no doc', async () => {
    scaffold(kit());
    const ok = await checkDocsTree({
      docsCatalog: await loadDocsCatalog(tmpDir),
    });
    expect(ok).toMatchObject({id: 'docs-tree', status: 'pass'});
    scaffold({...kit(), 'broken.doc.mjs': broken()});
    const bad = await checkDocsTree({
      docsCatalog: await loadDocsCatalog(tmpDir),
    });
    expect(bad.status).toBe('warn');
    expect(bad.message).toContain('acme/broken');
    expect(bad.message).toContain('"generic:nope" names no doc');
  }, SLOW);

  it("keeps the CLI's routes: an integration namespace or topic that claims one is withdrawn, and both doctors say so", async () => {
    const flat = (/** @type {string} */ name) => ({
      type: 'generic',
      name,
      title: `Acme ${name}`,
      description: `Acme's ${name} notes.`,
      sections: [
        {title: 'One', content: [{type: 'prose', text: 'One.'}]},
        {title: 'Two', content: [{type: 'prose', text: 'Two.'}]},
      ],
    });
    scaffold({
      ...kit(),
      'guides.doc.mjs': {...NAMESPACE, name: 'guides', title: 'Mine', summary: 'Mine.'},
      'use-a-theme.doc.mjs': {...NAMESPACE, name: 'use-a-theme', title: 'Acme use-a-theme', summary: 'Acme use-a-theme.'},
      'cli.doc.mjs': flat('cli'),
    });
    const listed = await docs(undefined, undefined, {cwd: tmpDir});
    expect(listed.meta.namespaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({topic: 'cli', package: '@astryxdesign/cli'}),
        expect.objectContaining({topic: 'guides', package: '@astryxdesign/cli'}),
      ]),
    );
    expect(listed.meta.namespaces.filter(n => ['use-a-theme', 'guides'].includes(n.topic) && n.package === '@acme/kit')).toEqual([]);
    expect(listed.data.map(entry => entry.topic)).not.toContain('cli');
    // Each name opens the CLI's doc, and a CLI topic keeps its home.
    expect((await docs('cli', undefined, {cwd: tmpDir})).data).toMatchObject({route: 'cli', package: '@astryxdesign/cli'});
    expect((await docs('guides', undefined, {cwd: tmpDir})).data).toMatchObject({route: 'guides', package: '@astryxdesign/cli'});
    const tokens = await docs('use-a-theme', undefined, {cwd: tmpDir});
    expect(tokens.type).toBe('docs.detail');
    expect(tokens.data.links.up).toBe('astryx docs guides');
    // The project doctor and the package doctor both name the claims.
    const check = await checkDocsTree({docsCatalog: await loadDocsCatalog(tmpDir)});
    expect(check.status).toBe('warn');
    expect(check.message).toContain('takes the route "guides", which the CLI\'s own docs keep');
    expect(check.message).toContain('takes the route "use-a-theme"');
    expect(check.message).toContain('both have the route "cli"');
    const result = await integrationDocConflicts('@acme/kit', {cwd: tmpDir});
    const graph = result.data.issues.filter(issue => issue.code === 'invalid_doc_graph').map(issue => issue.message).join('\n');
    expect(graph).toContain('takes the route "guides"');
    expect(graph).toContain('takes the route "use-a-theme"');
    expect(graph).toContain('route "cli"');
  }, SLOW);

  it("keeps the CLI's routes from a claim that differs only in case", async () => {
    const flat = (/** @type {string} */ name) => ({
      type: 'generic',
      name,
      title: `Acme ${name}`,
      description: `Acme's ${name} notes.`,
      sections: [
        {title: 'One', content: [{type: 'prose', text: 'One.'}]},
        {title: 'Two', content: [{type: 'prose', text: 'Two.'}]},
      ],
    });
    scaffold({...kit(), 'caps-cli.doc.mjs': flat('CLI')});
    // Another spelling, in a nested folder of the package's docs.
    const nested = path.join(tmpDir, 'node_modules', '@acme', 'kit', 'docs', 'nested');
    fs.mkdirSync(nested, {recursive: true});
    fs.writeFileSync(
      path.join(nested, 'caps-guides.doc.mjs'),
      `export const docs = ${JSON.stringify(flat('Guides'), null, 2)};\n`,
    );
    fs.writeFileSync(
      path.join(nested, 'caps-use-a-theme.doc.mjs'),
      `export const docs = ${JSON.stringify(flat('USE-A-THEME'), null, 2)};\n`,
    );
    expect((await docs('cli', undefined, {cwd: tmpDir})).data).toMatchObject({route: 'cli', package: '@astryxdesign/cli'});
    expect((await docs('guides', undefined, {cwd: tmpDir})).data).toMatchObject({route: 'guides', package: '@astryxdesign/cli'});
    expect((await docs('theme', undefined, {cwd: tmpDir, index: true})).data.links.up).toBe('astryx docs guides');
    const listed = await docs(undefined, undefined, {cwd: tmpDir});
    expect(listed.data.map(entry => entry.topic.toLowerCase())).not.toContain('cli');
    // Search does not offer a topic whose route another doc owns.
    const found = await search("Acme's CLI notes", {cwd: tmpDir, type: 'doc', limit: 20});
    expect(
      found.data.results.filter(hit => hit.package === '@acme/kit' && /^cli$/i.test(hit.name)),
    ).toEqual([]);
    const check = await checkDocsTree({docsCatalog: await loadDocsCatalog(tmpDir)});
    expect(check.status).toBe('warn');
    expect(check.message).toContain('route "CLI"');
    expect(check.message).toContain('takes the route "Guides"');
    // `USE-A-THEME` is the CLI's topic `use-a-theme` in another spelling: the CLI's wins.
    const tokens = await docs('USE-A-THEME', undefined, {cwd: tmpDir, index: true});
    expect(tokens.data).toMatchObject({name: 'use-a-theme', links: {up: 'astryx docs guides'}});
    expect(tokens.data.title).not.toBe('Acme USE-A-THEME');
    const result = await integrationDocConflicts('@acme/kit', {cwd: tmpDir});
    const graph = result.data.issues
      .filter(issue => issue.code === 'invalid_doc_graph')
      .map(issue => issue.message)
      .join('\n');
    expect(graph).toContain('route "CLI"');
    expect(graph).toContain('takes the route "Guides"');
  }, SLOW);

  it("keeps a replaced name for the topic that replaces it, over another integration's namespace", async () => {
    scaffold({...kit(), 'use-a-theme-ns.doc.mjs': {...NAMESPACE, name: 'use-a-theme', title: 'Kit use-a-theme', summary: 'Kit use-a-theme.'}});
    const two = path.join(tmpDir, 'node_modules', '@acme', 'two');
    fs.mkdirSync(path.join(two, 'docs'), {recursive: true});
    fs.writeFileSync(path.join(two, 'package.json'), JSON.stringify({name: '@acme/two', version: '1.0.0'}));
    fs.writeFileSync(path.join(two, 'astryx.integration.mjs'), "export default {docs: './docs'};\n");
    fs.writeFileSync(
      path.join(two, 'docs', 'acme-tokens.doc.mjs'),
      `export const docs = ${JSON.stringify({
        type: 'generic',
        name: 'acme-tokens',
        title: 'Acme tokens',
        description: 'Acme tokens.',
        replaces: 'use-a-theme',
        sections: [{title: 'One', content: [{type: 'prose', text: 'One.'}]}],
      }, null, 2)};\n`,
    );
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.config.mjs'),
      "export default {integrations: ['@acme/kit', '@acme/two']};\n",
    );
    const listed = await docs(undefined, undefined, {cwd: tmpDir});
    expect(listed.meta.namespaces.map(entry => entry.topic)).not.toContain('use-a-theme');
    const read = await docs('use-a-theme', undefined, {cwd: tmpDir, index: true});
    expect(read.data.name).toBe('acme-tokens');
    const check = await checkDocsTree({docsCatalog: await loadDocsCatalog(tmpDir)});
    expect(check.status).toBe('warn');
    expect(check.message).toContain('which the topic "acme-tokens" also answers to');
  }, SLOW);

  it('keeps every name a topic replaced twice answers to, and the CLI\'s links to it still open', async () => {
    scaffold({...kit(), 'use-a-theme-ns.doc.mjs': {...NAMESPACE, name: 'use-a-theme', title: 'Kit use-a-theme', summary: 'Kit use-a-theme.'}});
    /** @param {string} pkg @param {string} name @param {string} replaces */
    const replacement = (pkg, name, replaces) => {
      const dir = path.join(tmpDir, 'node_modules', '@acme', pkg);
      fs.mkdirSync(path.join(dir, 'docs'), {recursive: true});
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({name: `@acme/${pkg}`, version: '1.0.0'}));
      fs.writeFileSync(path.join(dir, 'astryx.integration.mjs'), "export default {docs: './docs'};\n");
      fs.writeFileSync(
        path.join(dir, 'docs', `${name}.doc.mjs`),
        `export const docs = ${JSON.stringify({
          type: 'generic',
          name,
          title: `Tokens by ${pkg}`,
          description: `Tokens by ${pkg}.`,
          replaces,
          sections: [{title: 'One', content: [{type: 'prose', text: 'One.'}]}],
        }, null, 2)};\n`,
      );
    };
    replacement('two', 'acme-tokens', 'use-a-theme');
    replacement('three', 'b-tokens', 'use-a-theme');
    replacement('four', 'super-tokens', 'b-tokens');
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.config.mjs'),
      "export default {integrations: ['@acme/kit', '@acme/two', '@acme/three', '@acme/four']};\n",
    );
    const listed = await docs(undefined, undefined, {cwd: tmpDir});
    expect(listed.meta.namespaces.map(entry => entry.topic)).not.toContain('use-a-theme');
    for (const name of ['use-a-theme', 'acme-tokens', 'b-tokens', 'super-tokens']) {
      expect((await docs(name, undefined, {cwd: tmpDir, index: true})).data.name).toBe('super-tokens');
    }
    // A walk over every topic: the CLI's own links to `use-a-theme` still open it.
    /** @type {string[]} */
    const raw = [];
    for (const entry of listed.data) {
      const read = await docs(entry.topic, undefined, {cwd: tmpDir});
      if (/\{@link [^}]*use-a-theme\}/.test(JSON.stringify(read.data))) raw.push(entry.topic);
    }
    expect(raw).toEqual([]);
    const theme = await docs('theme', undefined, {cwd: tmpDir});
    expect(JSON.stringify(theme.data)).toContain('astryx docs super-tokens');
    const check = await checkDocsTree({docsCatalog: await loadDocsCatalog(tmpDir)});
    expect(check.message).toContain('takes the route "use-a-theme", which the topic "super-tokens" also answers to');
    expect(check.message).not.toContain('names no doc');
  }, SLOW);

  it("keeps the CLI's routes from a replacement that answers to one, in one package or across a chain", async () => {
    const flat = (/** @type {string} */ name, /** @type {object} */ extra = {}) => ({
      type: 'generic',
      name,
      title: `Acme ${name}`,
      description: `Acme's ${name} notes.`,
      sections: [
        {title: 'One', content: [{type: 'prose', text: 'One.'}]},
        {title: 'Two', content: [{type: 'prose', text: 'Two.'}]},
      ],
      ...extra,
    });
    scaffold({
      ...kit(),
      'a-cli.doc.mjs': flat('cli'),
      'a-guides.doc.mjs': flat('Guides'),
      'z-b2.doc.mjs': flat('b2', {replaces: 'cli'}),
      'z-u2.doc.mjs': flat('u2', {replaces: 'Guides'}),
    });
    // Another package carries the chain on: c3 replaces b2, which replaced cli.
    const three = path.join(tmpDir, 'node_modules', '@acme', 'three');
    fs.mkdirSync(path.join(three, 'docs'), {recursive: true});
    fs.writeFileSync(path.join(three, 'package.json'), JSON.stringify({name: '@acme/three', version: '1.0.0'}));
    fs.writeFileSync(path.join(three, 'astryx.integration.mjs'), "export default {docs: './docs'};\n");
    fs.writeFileSync(
      path.join(three, 'docs', 'c3.doc.mjs'),
      `export const docs = ${JSON.stringify(flat('c3', {replaces: 'b2'}), null, 2)};\n`,
    );
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.config.mjs'),
      "export default {integrations: ['@acme/kit', '@acme/three']};\n",
    );
    for (const name of ['cli', 'CLI']) {
      expect((await docs(name, undefined, {cwd: tmpDir})).data).toMatchObject({route: 'cli', package: '@astryxdesign/cli'});
    }
    for (const name of ['guides', 'GUIDES']) {
      expect((await docs(name, undefined, {cwd: tmpDir})).data).toMatchObject({route: 'guides', package: '@astryxdesign/cli'});
    }
    // The replacement still answers to its own names.
    for (const name of ['b2', 'c3']) {
      expect((await docs(name, undefined, {cwd: tmpDir, index: true})).data.name).toBe('c3');
    }
    const listed = await docs(undefined, undefined, {cwd: tmpDir});
    for (const entry of listed.data) {
      const read = await docs(entry.topic, undefined, {cwd: tmpDir});
      expect(read.type).toBe('docs.detail');
      expect(read.data.name).toBe(entry.topic);
    }
    const check = await checkDocsTree({docsCatalog: await loadDocsCatalog(tmpDir)});
    expect(check.status).toBe('warn');
    expect(check.message).toContain('The topic "c3" answers to "cli" through replaces');
    expect(check.message).toContain('The topic "u2" answers to "guides" through replaces');
    const inPackage = await integrationDocConflicts('@acme/kit', {cwd: tmpDir});
    const graph = inPackage.data.issues
      .filter(issue => issue.code === 'invalid_doc_graph')
      .map(issue => issue.message)
      .join('\n');
    expect(graph).toContain('answers to "cli" through replaces');
  }, SLOW);

  it('runs the same checks inside the package: doctor integration docs', async () => {
    scaffold({...kit(), 'broken.doc.mjs': broken()});
    const result = await integrationDocConflicts('@acme/kit', {cwd: tmpDir});
    expect(result.data.issues).toContainEqual(
      expect.objectContaining({
        code: 'invalid_doc_graph',
        severity: 'warning',
        message: expect.stringContaining('"generic:nope" names no doc'),
      }),
    );
  }, SLOW);

  it('fails doctor integration docs on a placement that hides a guide, and only warns on a link', async () => {
    scaffold({
      ...kit(),
      'lost.doc.mjs': guide('lost', {
        placement: {parent: 'namespace:nope', slot: 'guides'},
      }),
    });
    const result = await integrationDocConflicts('@acme/kit', {cwd: tmpDir});
    expect(result.data.issues).toContainEqual(
      expect.objectContaining({
        code: 'invalid_doc_graph',
        severity: 'error',
        message: expect.stringContaining('namespace:nope'),
      }),
    );
  }, SLOW);

  it("resolves an extension's links against the extension's provider, not the base topic's", async () => {
    scaffold({
      ...kit(),
      'integrations.doc.mjs': guide('integrations'),
      'theme-acme.doc.mjs': {
        type: 'generic',
        name: 'theme-acme',
        title: 'Acme theming',
        description: 'Acme notes on theming.',
        extends: 'theme',
        sections: [
          {
            title: 'Acme theming notes',
            content: [
              {
                type: 'prose',
                text: 'See {@link generic:integrations}, and {@link @astryxdesign/cli:namespace:tokens} for the tokens.',
              },
            ],
          },
        ],
      },
    });
    const {data} = await docs('theme', 'acme-theming-notes', {cwd: tmpDir});
    // `generic:integrations` is the extension's own guide, never the CLI's
    // `authoring`; a provider-qualified link reaches the CLI's topic.
    expect(data.content[0].text).toBe(
      'See `astryx docs acme/integrations`, and `astryx docs tokens` for the tokens.',
    );
    // The CLI's own sections of the topic still resolve against the CLI.
    const full = await docs('theme', undefined, {cwd: tmpDir});
    expect(JSON.stringify(full.data)).not.toContain('{@link');
  }, SLOW);

  it("warns, in the project and in the package, on an extension link that names no doc of its provider", async () => {
    scaffold({
      ...kit(),
      'theme-acme.doc.mjs': {
        type: 'generic',
        name: 'theme-acme',
        title: 'Acme theming',
        description: 'Acme notes on theming.',
        extends: 'theme',
        sections: [
          {
            title: 'Acme theming notes',
            content: [{type: 'prose', text: 'See {@link generic:tokens}.'}],
          },
        ],
      },
    });
    const check = await checkDocsTree({
      docsCatalog: await loadDocsCatalog(tmpDir),
    });
    expect(check.status).toBe('warn');
    expect(check.message).toContain('"generic:tokens" names no doc');
    const result = await integrationDocConflicts('@acme/kit', {cwd: tmpDir});
    expect(result.data.issues).toContainEqual(
      expect.objectContaining({
        code: 'invalid_doc_graph',
        message: expect.stringContaining('"generic:tokens" names no doc'),
      }),
    );
  }, SLOW);

  it('keeps the CLI route when an integration claims it, and names the claim', async () => {
    scaffold({'cli.doc.mjs': {...NAMESPACE, name: 'cli', title: 'Not the CLI'}});
    const top = await docs('cli', undefined, {cwd: tmpDir});
    expect(top.data.package).toBe('@astryxdesign/cli');
    const check = await checkDocsTree({
      docsCatalog: await loadDocsCatalog(tmpDir),
    });
    expect(check.status).toBe('warn');
    expect(check.message).toContain('both have the route "cli"');
  }, SLOW);

  it('says what to write for a link that names a doc by its bare name, and when no doc has that name', async () => {
    scaffold({
      ...kit(),
      'bare.doc.mjs': guide('bare', {
        sections: [
          {
            title: 'Overview',
            content: [{type: 'prose', text: 'Read {@link deploy}, then {@link nosuchtopic}.'}],
          },
        ],
      }),
    });
    const result = await integrationDocConflicts('@acme/kit', {cwd: tmpDir});
    const graph = result.data.issues.filter(issue => issue.code === 'invalid_doc_graph').map(issue => issue.message);
    expect(graph).toEqual(
      expect.arrayContaining([
        expect.stringContaining('"deploy" is a topic: write `{@link generic:deploy}`.'),
        expect.stringContaining('no topic is named "nosuchtopic"'),
      ]),
    );
  }, SLOW);
});
