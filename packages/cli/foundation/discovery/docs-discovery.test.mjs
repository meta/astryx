// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated tests for reference-doc discovery: what an integration's
 * docs root contributes, what the catalog does with `replaces` / `extends`,
 * and which authored mistakes are caught at the load boundary rather than
 * reaching a reader as a blank section.
 *
 * Fixtures are scaffolded under a repo-local temp dir, not /tmp, because Vite
 * refuses to dynamically import a module from outside the project root.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  BUILTIN_DOCS_PACKAGE,
  DocsCatalog,
  discoverBuiltinTopics,
  discoverIntegrationDocs,
  mergeTopic,
  problemsInTopic,
} from './docs-discovery.mjs';

let tmpDir;

/** A minimal, valid topic. */
function topic(fields) {
  return {
    type: 'generic',
    name: 'deploying',
    title: 'Deploying',
    description: 'How to ship it.',
    sections: [
      {title: 'Overview', content: [{type: 'prose', text: 'Ship it.'}]},
    ],
    ...fields,
  };
}

/** Write a docs root holding one file per topic; returns the integration. */
function integration(name, topics, {docsDir = 'docs'} = {}) {
  const root = path.join(tmpDir, name.replace(/[^\w]/g, '_'), docsDir);
  fs.mkdirSync(root, {recursive: true});
  for (const [file, value] of Object.entries(topics)) {
    fs.writeFileSync(
      path.join(root, file),
      typeof value === 'string'
        ? value
        : `export const docs = ${JSON.stringify(value, null, 2)};\n`,
    );
  }
  return {name, docs: root};
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-docs-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('discoverBuiltinTopics', () => {
  it("finds the CLI's own topics and not their localization overlays", () => {
    const topics = discoverBuiltinTopics();
    expect(Object.keys(topics).length).toBeGreaterThan(0);
    expect(topics.color).toMatch(/assets[/\\]docs[/\\]color\.doc\.mjs$/);
    for (const name of Object.keys(topics)) {
      expect(name).not.toMatch(/\.(zh|dense)$/);
    }
  });
});

describe('discoverIntegrationDocs', () => {
  it('contributes nothing when no docs root is declared or the root is gone', async () => {
    const nothing = {records: [], errors: [], namespaces: [], guides: []};
    expect(await discoverIntegrationDocs({name: '@acme/widgets'})).toEqual(
      nothing,
    );
    expect(
      await discoverIntegrationDocs({
        name: '@acme/widgets',
        docs: path.join(tmpDir, 'nope'),
      }),
    ).toEqual(nothing);
  });

  it('reads every topic under the root, with what it declares', async () => {
    const {records, errors} = await discoverIntegrationDocs(
      integration('@acme/widgets', {
        'deploying.doc.mjs': topic(),
        'getting-started.doc.mjs': topic({
          name: 'getting-started',
          title: 'Getting started',
          replaces: 'getting-started',
        }),
        'theme-extra.doc.mjs': topic({name: 'theme-extra', extends: 'theme'}),
      }),
    );
    expect(errors).toEqual([]);
    expect(
      records.map(r => [r.name, r.package, r.replaces, r.extendsTopic]),
    ).toEqual([
      ['deploying', '@acme/widgets', undefined, undefined],
      ['getting-started', '@acme/widgets', 'getting-started', undefined],
      ['theme-extra', '@acme/widgets', undefined, 'theme'],
    ]);
  });

  it('accepts a stamped default export as well as `export const docs`', async () => {
    const {records, errors} = await discoverIntegrationDocs(
      integration('@acme/default-export', {
        'deploying.doc.mjs': `export default ${JSON.stringify(topic())};\n`,
      }),
    );
    expect(errors).toEqual([]);
    expect(records.map(r => r.name)).toEqual(['deploying']);
  });

  it('ignores a localization overlay beside a topic', async () => {
    const {records} = await discoverIntegrationDocs(
      integration('@acme/localized', {
        'deploying.doc.mjs': topic(),
        'deploying.doc.zh.mjs': `export const docsZh = {description: '部署', sections: []};\n`,
      }),
    );
    expect(records.map(r => r.name)).toEqual(['deploying']);
  });

  it('reports a doc that exports nothing, rather than skipping it silently', async () => {
    const {records, errors} = await discoverIntegrationDocs(
      integration('@acme/empty', {
        'deploying.doc.mjs': 'export const nope = 1;\n',
      }),
    );
    expect(records).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('exports no doc');
  });

  it('reports two files claiming one topic name', async () => {
    const {records, errors} = await discoverIntegrationDocs(
      integration('@acme/dupes', {
        'a-deploying.doc.mjs': topic(),
        'b-deploying.doc.mjs': topic({title: 'Deploying, again'}),
      }),
    );
    expect(records).toHaveLength(1);
    expect(errors[0].message).toContain('both define the topic "deploying"');
  });

  it('reports a doc that both replaces and extends', async () => {
    const {records, errors} = await discoverIntegrationDocs(
      integration('@acme/both', {
        'deploying.doc.mjs': topic({replaces: 'theme', extends: 'theme'}),
      }),
    );
    expect(records).toEqual([]);
    expect(errors[0].message).toContain('declares both');
  });

  it('rejects graph blocks at the legacy topic-reader boundary', async () => {
    const {records, errors} = await discoverIntegrationDocs(
      integration('@acme/graph-block', {
        'deploying.doc.mjs': topic({
          sections: [
            {
              id: 'steps',
              title: 'Steps',
              content: [
                {type: 'collection', source: {slot: 'guides'}},
              ],
            },
          ],
        }),
      }),
    );
    expect(records).toEqual([]);
    expect(errors[0].message).toContain('Invalid discriminator value');
  });

  it('hands namespace docs and placed guides to the docs tree, by provider id', async () => {
    const found = await discoverIntegrationDocs({
      ...integration('@acme/namespace', {
        'guides.doc.mjs': {
          type: 'namespace',
          name: 'guides',
          title: 'Guides',
          summary: 'Every guide.',
          slots: {guides: {title: 'Guides', accepts: {kinds: ['generic']}}},
        },
        'setup.doc.mjs': topic({
          name: 'setup',
          title: 'Set up',
          placement: {parent: 'namespace:guides', slot: 'guides', order: 1},
        }),
        'deploying.doc.mjs': topic(),
      }),
      providerId: '@acme/tree-provider',
    });
    expect(found.errors).toEqual([]);
    expect(found.records.map(record => record.name)).toEqual(['deploying']);
    expect(found.records[0].providerId).toBe('@acme/tree-provider');
    expect(found.namespaces).toMatchObject([
      {
        provider: '@acme/namespace',
        providerId: '@acme/tree-provider',
        source: '@acme/namespace/guides.doc.mjs',
        doc: {name: 'guides'},
      },
    ]);
    expect(found.guides).toMatchObject([
      {
        provider: '@acme/namespace',
        providerId: '@acme/tree-provider',
        kind: 'generic',
        name: 'setup',
        placement: {parent: 'namespace:guides', slot: 'guides', order: 1},
      },
    ]);
  });

  it('names what a namespace doc lacks, and refuses a placed guide that replaces a topic', async () => {
    const {errors, namespaces, guides} = await discoverIntegrationDocs(
      integration('@acme/namespace', {
        'guides.doc.mjs': {type: 'namespace', name: 'guides', title: 'Guides'},
        'setup.doc.mjs': topic({
          name: 'setup',
          replaces: 'getting-started',
          placement: {parent: 'namespace:guides', slot: 'guides'},
        }),
      }),
    );
    expect(namespaces).toEqual([]);
    expect(guides).toEqual([]);
    expect(errors.map(error => error.message).join('\n')).toMatch(
      /guides\.doc\.mjs.*slots/,
    );
    expect(errors.map(error => error.message).join('\n')).toContain(
      'is placed in the docs tree and also declares `replaces`',
    );
  });
});

describe('problemsInTopic', () => {
  it('passes a well-formed topic', () => {
    expect(problemsInTopic(topic())).toEqual([]);
  });

  it('catches the mistakes that would render as a blank section', () => {
    expect(problemsInTopic(topic({title: ''}))).toContain(
      'title: expected a non-empty string',
    );
    expect(problemsInTopic(topic({sections: []}))).toContain(
      'sections: expected at least one section',
    );
    // A misspelled required field: the block renders nothing at all.
    expect(
      problemsInTopic(
        topic({
          sections: [
            {title: 'Overview', content: [{type: 'prose', txt: 'oops'}]},
          ],
        }),
      ),
    ).toEqual([
      'sections[0].content[0].text: required for a prose block',
      'sections[0].content[0].txt: not a field of a prose block',
    ]);
    // A heading level the renderer does not index.
    expect(
      problemsInTopic(
        topic({
          sections: [
            {
              title: 'Overview',
              content: [{type: 'heading', level: 2, text: 'x'}],
            },
          ],
        }),
      ),
    ).toContain('sections[0].content[0].level: 2 is not one of 3, 4, 5, 6');
    // A short row renders blank cells; a long one drops its tail.
    expect(
      problemsInTopic(
        topic({
          sections: [
            {
              title: 'Overview',
              content: [{type: 'table', headers: ['A', 'B'], rows: [['1']]}],
            },
          ],
        }),
      ),
    ).toContain(
      'sections[0].content[0].rows[0]: has 1 cells but the table has 2 headers',
    );
  });

  it('rejects graph metadata at the legacy topic-reader boundary', () => {
    for (const fields of [
      {placement: {parent: 'namespace:cli'}},
      {aliases: ['setup']},
      {audience: 'internal'},
    ]) {
      expect(problemsInTopic(topic(fields)).join('\n')).toContain(
        'requires the compiled graph reader',
      );
    }
  });

  it('takes a reference block, and checks its projection and presentation', () => {
    /** @param {any[]} content */
    const withBlocks = content =>
      problemsInTopic(topic({sections: [{title: 'Overview', content}]}));
    expect(
      withBlocks([
        {type: 'reference', target: 'schema:integration'},
        {
          type: 'reference',
          target: '@astryxdesign/cli:schema:integration',
          projection: {fields: ['docs']},
          presentation: 'compact',
        },
      ]),
    ).toEqual([]);
    expect(
      withBlocks([
        {type: 'reference', target: ''},
        {type: 'reference', target: 'schema:x', presentation: 'card'},
        {type: 'reference', target: 'schema:x', projection: {fields: []}},
        {type: 'reference', target: 'schema:x', projection: {rows: ['a']}},
        {type: 'reference', target: 'schema:x', projection: ['docs']},
        {type: 'reference', target: 'schema:x', link: {}},
      ]),
    ).toEqual([
      'sections[0].content[0].target: expected a non-empty string',
      'sections[0].content[1].presentation: "card" is not one of summary, compact, full',
      'sections[0].content[2].projection.fields: expected a non-empty array of names',
      'sections[0].content[3].projection.rows: not a field of a projection',
      'sections[0].content[4].projection: expected {fields?, sections?}, naming the parts of the doc to include',
      'sections[0].content[5].link: not a field of a reference block',
    ]);
    // Workflow and collection blocks stay in a namespace doc's `blocks`.
    for (const type of ['workflow', 'collection']) {
      expect(withBlocks([{type}]).join('\n')).toContain(
        'requires the compiled graph renderer',
      );
    }
  });

  it('rejects a name that is not URL-safe', () => {
    expect(problemsInTopic(topic({name: 'not a topic'})).join('\n')).toContain(
      'URL-safe',
    );
  });
});

describe('DocsCatalog', () => {
  const record = fields => ({
    name: 'deploying',
    package: '@acme/widgets',
    path: '/pkg/docs/deploying.doc.mjs',
    ...fields,
  });

  it('starts from the built-in topics, owned by the CLI', () => {
    const catalog = DocsCatalog.fromBuiltins({tokens: '/cli/tokens.doc.mjs'});
    expect(catalog.names()).toEqual(['tokens']);
    expect(catalog.resolve('tokens').package).toBe(BUILTIN_DOCS_PACKAGE);
    expect(catalog.resolve('TOKENS').name).toBe('tokens');
    expect(catalog.resolve('nope')).toBeUndefined();
    expect(catalog.resolve(42)).toBeUndefined();
  });

  it('adds a new topic', () => {
    const catalog = DocsCatalog.fromBuiltins({tokens: '/cli/tokens.doc.mjs'});
    expect(catalog.add(record())).toBeNull();
    expect(catalog.names()).toEqual(['tokens', 'deploying']);
    expect(catalog.resolve('deploying').package).toBe('@acme/widgets');
  });

  it('treats topic identities case-insensitively without losing display case', () => {
    const catalog = DocsCatalog.fromBuiltins();
    expect(catalog.add(record({name: 'Deploying'}))).toBeNull();
    expect(catalog.resolve('deploying').name).toBe('Deploying');
    expect(catalog.resolve('DEPLOYING').name).toBe('Deploying');

    const issue = catalog.add(
      record({name: 'deploying', package: '@acme/duplicate'}),
    );
    expect(issue).toMatchObject({code: 'invalid_doc', severity: 'error'});
  });

  it('refuses to shadow an existing topic by name alone', () => {
    const catalog = DocsCatalog.fromBuiltins({tokens: '/cli/tokens.doc.mjs'});
    const issue = catalog.add(record({name: 'tokens'}));
    expect(issue).toMatchObject({code: 'invalid_doc', severity: 'error'});
    expect(issue.message).toContain('already provided by @astryxdesign/cli');
    expect(issue.message).toContain("replaces: 'tokens'");
    // The built-in topic is untouched.
    expect(catalog.resolve('tokens').package).toBe(BUILTIN_DOCS_PACKAGE);
  });

  it('replaces a topic in place, keeping its position', () => {
    const catalog = DocsCatalog.fromBuiltins({
      'getting-started': '/cli/getting-started.doc.mjs',
      tokens: '/cli/tokens.doc.mjs',
    });
    expect(
      catalog.add(
        record({name: 'getting-started', replaces: 'getting-started'}),
      ),
    ).toBeNull();
    expect(catalog.names()).toEqual(['getting-started', 'tokens']);
    const entry = catalog.resolve('getting-started');
    expect(entry.package).toBe('@acme/widgets');
    expect(entry.replaces).toBe('getting-started');
  });

  it('leaves the old name as an alias when the replacement renames it', () => {
    const catalog = DocsCatalog.fromBuiltins({
      'getting-started': '/cli/getting-started.doc.mjs',
    });
    catalog.add(record({name: 'setup', replaces: 'getting-started'}));
    expect(catalog.names()).toEqual(['setup']);
    expect(catalog.resolve('getting-started').name).toBe('setup');
    expect(catalog.resolve('setup').name).toBe('setup');
  });

  it('keeps every name a twice-renamed topic has answered to', () => {
    const catalog = DocsCatalog.fromBuiltins({
      'getting-started': '/cli/getting-started.doc.mjs',
    });
    catalog.add(record({name: 'setup', replaces: 'getting-started'}));
    catalog.add(
      record({name: 'install', package: '@acme/later', replaces: 'setup'}),
    );
    expect(catalog.resolve('getting-started').name).toBe('install');
    expect(catalog.resolve('setup').name).toBe('install');
  });

  it('warns, and lets the later package win, when two replace one topic', () => {
    const catalog = DocsCatalog.fromBuiltins({tokens: '/cli/tokens.doc.mjs'});
    expect(
      catalog.add(record({name: 'tokens', replaces: 'tokens'})),
    ).toBeNull();
    const issue = catalog.add(
      record({name: 'tokens', package: '@acme/later', replaces: 'tokens'}),
    );
    expect(issue).toMatchObject({code: 'duplicate_doc', severity: 'warning'});
    expect(issue.message).toContain(
      '@acme/later is configured later, so it wins',
    );
    expect(catalog.resolve('tokens').package).toBe('@acme/later');
  });

  it('records an extension against its target rather than adding a topic', () => {
    const catalog = DocsCatalog.fromBuiltins({theme: '/cli/theme.doc.mjs'});
    expect(
      catalog.add(record({name: 'theme-extra', extendsTopic: 'theme'})),
    ).toBeNull();
    expect(catalog.names()).toEqual(['theme']);
    expect(catalog.resolve('theme').extensions).toEqual([
      {package: '@acme/widgets', path: '/pkg/docs/deploying.doc.mjs'},
    ]);
  });

  it('reports a replace/extend target that no package provides', () => {
    const catalog = DocsCatalog.fromBuiltins({tokens: '/cli/tokens.doc.mjs'});
    expect(catalog.add(record({replaces: 'nope'}))).toMatchObject({
      code: 'invalid_doc',
      severity: 'error',
    });
    expect(catalog.add(record({extendsTopic: 'nope'}))).toMatchObject({
      code: 'invalid_doc',
      severity: 'error',
    });
    expect(catalog.names()).toEqual(['tokens']);
  });
});

describe('mergeTopic', () => {
  const base = {
    title: 'Theme',
    description: 'Theming.',
    sections: [
      {title: 'Install', content: [{type: 'prose', text: 'npm i'}]},
      {title: 'Tokens', content: [{type: 'prose', text: 'use tokens'}]},
    ],
  };

  it('replaces a section by title, appends a new one, and leaves the rest', () => {
    const merged = mergeTopic(base, {
      sections: [
        {title: 'Install', content: [{type: 'prose', text: 'yarn add'}]},
        {title: 'Internal', content: [{type: 'prose', text: 'the meta way'}]},
      ],
    });
    expect(merged.sections.map(s => s.title)).toEqual([
      'Install',
      'Tokens',
      'Internal',
    ]);
    expect(merged.sections[0].content[0].text).toBe('yarn add');
    expect(merged.sections[1].content[0].text).toBe('use tokens');
    // The base is untouched.
    expect(base.sections[0].content[0].text).toBe('npm i');
  });

  it('finds a retitled base section by the key its old title derives', () => {
    // A base section retitled later keeps its old key as its `id`; an
    // extension that still names it by the old title replaces it.
    const merged = mergeTopic(
      {
        ...base,
        sections: [
          {id: 'quick-start', title: 'Wrap your app in a theme', content: []},
          {id: 'tokens', title: 'Tokens', content: []},
        ],
      },
      {sections: [{title: 'Quick Start', content: []}]},
    );
    expect(merged.sections.map(section => [section.id, section.title])).toEqual(
      [
        ['quick-start', 'Quick Start'],
        ['tokens', 'Tokens'],
      ],
    );
  });

  it('replaces a section by stable ID even when its title changes', () => {
    const merged = mergeTopic(
      {
        ...base,
        sections: [
          {id: 'install', title: 'Install', content: []},
          {id: 'tokens', title: 'Tokens', content: []},
        ],
      },
      {
        sections: [{id: 'install', title: 'Setup', content: []}],
      },
    );
    expect(merged.sections.map(section => [section.id, section.title])).toEqual(
      [
        ['install', 'Setup'],
        ['tokens', 'Tokens'],
      ],
    );
  });

  it('migrates a legacy section to a stable ID without duplicating it', () => {
    const merged = mergeTopic(base, {
      sections: [
        {
          id: 'install',
          title: 'Install',
          content: [{type: 'prose', text: 'yarn add'}],
        },
      ],
    });
    expect(
      merged.sections.map(section => [section.id ?? null, section.title]),
    ).toEqual([
      ['install', 'Install'],
      [null, 'Tokens'],
    ]);
    expect(merged.sections[0].content[0].text).toBe('yarn add');
  });

  it('lets a legacy extension replace a section that has since gained an ID', () => {
    const merged = mergeTopic(
      {
        ...base,
        sections: [
          {id: 'setup-steps', title: 'Install', content: []},
          {title: 'Tokens', content: []},
        ],
      },
      {
        sections: [
          {title: 'Install', content: [{type: 'prose', text: 'yarn add'}]},
        ],
      },
    );
    expect(
      merged.sections.map(section => [section.id ?? null, section.title]),
    ).toEqual([
      ['setup-steps', 'Install'],
      [null, 'Tokens'],
    ]);
    expect(merged.sections[0].content[0].text).toBe('yarn add');
  });

  it('keeps two different authored IDs distinct under one title', () => {
    const merged = mergeTopic(
      {...base, sections: [{id: 'install', title: 'Install', content: []}]},
      {sections: [{id: 'install-yarn', title: 'Install', content: []}]},
    );
    expect(merged.sections.map(section => section.id)).toEqual([
      'install',
      'install-yarn',
    ]);
  });

  it('keeps the base title and description: an extension never renames a topic', () => {
    const merged = mergeTopic(base, {
      title: 'Acme theme notes',
      description: 'Our additions.',
      sections: [],
    });
    expect(merged.title).toBe('Theme');
    expect(merged.description).toBe('Theming.');
  });
});

describe('problemsInTopic section keys', () => {
  /** @param {object[]} sections */
  const doc = sections => ({
    type: 'generic',
    name: 'keys',
    title: 'Keys',
    description: 'Section keys.',
    sections: sections.map(s => ({
      content: [{type: 'prose', text: 'x'}],
      ...s,
    })),
  });

  it('keeps legacy title-only key conflicts readable', () => {
    expect(
      problemsInTopic(doc([{title: 'Quick Start'}, {title: 'Quick-start'}])),
    ).toEqual([]);
  });

  it('rejects an unsafe id', () => {
    expect(
      problemsInTopic(doc([{id: 'Quick Start', title: 'Quick Start'}])),
    ).toEqual([expect.stringContaining('is not a stable key')]);
  });

  it('keeps a legacy title that has no derived key readable', () => {
    expect(problemsInTopic(doc([{title: '亮/暗模式'}]))).toEqual([]);
    expect(
      problemsInTopic(doc([{id: 'light-dark', title: '亮/暗模式'}])),
    ).toEqual([]);
  });
});

describe('mergeTopic by section key', () => {
  const base = {
    title: 'Theme',
    sections: [
      {title: 'Quick Start', content: [{type: 'prose', text: 'base'}]},
      {title: 'Light/Dark Mode', content: [{type: 'prose', text: 'base'}]},
    ],
  };
  const titles = doc =>
    doc.sections.map(s => [s.id ?? null, s.title, s.content[0].text]);

  it('replaces the section whose derived key an extension id names', () => {
    const merged = mergeTopic(base, {
      sections: [
        {
          id: 'quick-start',
          title: 'Quick Start with Acme',
          content: [{type: 'prose', text: 'acme'}],
        },
      ],
    });
    expect(titles(merged)).toEqual([
      ['quick-start', 'Quick Start with Acme', 'acme'],
      [null, 'Light/Dark Mode', 'base'],
    ]);
  });

  it('keeps a legacy title variant as a separate section', () => {
    const merged = mergeTopic(base, {
      sections: [
        {title: 'Light-Dark Mode', content: [{type: 'prose', text: 'acme'}]},
      ],
    });
    expect(titles(merged)).toEqual([
      [null, 'Quick Start', 'base'],
      [null, 'Light/Dark Mode', 'base'],
      [null, 'Light-Dark Mode', 'acme'],
    ]);
  });

  it('prefers the key over a legacy title for an extension with an id', () => {
    const merged = mergeTopic(base, {
      sections: [
        {
          id: 'light-dark-mode',
          title: 'Quick Start',
          content: [{type: 'prose', text: 'acme'}],
        },
      ],
    });
    expect(titles(merged)).toEqual([
      [null, 'Quick Start', 'base'],
      ['light-dark-mode', 'Quick Start', 'acme'],
    ]);
  });
});
