// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file End-to-end tests for integration-contributed doc topics: a scaffolded
 * consumer project whose configured integration ships a `docs` root, read back
 * through the public surfaces — `docs()`, `search()`, and the agent-docs block.
 *
 * The unit-level rules (what a docs root contributes, what the catalog does
 * with `replaces`/`extends`) are covered in
 * foundation/discovery/docs-discovery.test.mjs. What is pinned here is that a
 * contributed topic is indistinguishable from a built-in one at the surfaces
 * an agent actually reads.
 *
 * Fixtures live under a repo-local temp dir, not /tmp, because Vite refuses to
 * dynamically import a module from outside the project root.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {docs} from './docs.mjs';
import {search} from '../search/search.mjs';
import {loadDocsCatalog} from './_adapter.mjs';
import {AstryxError} from '../error.mjs';
import {discoverCoreTemplates} from '../../foundation/discovery/template-adapter.mjs';

const SLOW = 30_000;

let tmpDir;

/** A minimal, valid topic. */
function topic(fields) {
  return {
    type: 'generic',
    name: 'deploying',
    title: 'Deploying',
    description: 'How to ship an app built with Acme widgets.',
    category: 'guide',
    sections: [
      {title: 'Overview', content: [{type: 'prose', text: 'Push the button.'}]},
    ],
    ...fields,
  };
}

/**
 * A consumer project that configures one integration, optionally with a docs
 * root holding the given topics.
 * @param {Record<string, object|string>} [topics] file name → doc
 * @param {{config?: string}} [options]
 */
function scaffold(topics, {config} = {}) {
  fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({name: 'consumer'}));
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.config.mjs'),
    config ?? "export default {integrations: ['@acme/widgets']};\n",
  );

  const pkgDir = path.join(tmpDir, 'node_modules', '@acme', 'widgets');
  fs.mkdirSync(pkgDir, {recursive: true});
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({name: '@acme/widgets', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(pkgDir, 'astryx.integration.mjs'),
    `export default ${JSON.stringify(topics ? {docs: './docs'} : {})};\n`,
  );

  if (topics) {
    const docsDir = path.join(pkgDir, 'docs');
    fs.mkdirSync(docsDir, {recursive: true});
    for (const [file, doc] of Object.entries(topics)) {
      fs.writeFileSync(
        path.join(docsDir, file),
        typeof doc === 'string'
          ? doc
          : `export const docs = ${JSON.stringify(doc, null, 2)};\n`,
      );
    }
  }
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-integration-docs-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('integration-contributed topics', () => {
  it('lists and reads like a built-in topic, naming its owner', async () => {
    scaffold({'deploying.doc.mjs': topic()});

    const listed = await docs(undefined, undefined, {cwd: tmpDir});
    const entry = listed.data.find(t => t.topic === 'deploying');
    expect(entry).toMatchObject({
      topic: 'deploying',
      description: 'How to ship an app built with Acme widgets.',
      package: '@acme/widgets',
    });
    // The built-in topics keep their own owner.
    expect(listed.data.find(t => t.topic === 'color').package).toBe('@astryxdesign/cli');

    const detail = await docs('deploying', undefined, {cwd: tmpDir, full: true});
    expect(detail.type).toBe('docs.detail');
    expect(detail.data.sections[0].content[0].text).toBe('Push the button.');

    const section = await docs('deploying', 'overview', {cwd: tmpDir});
    expect(section.data.title).toBe('Overview');
  }, SLOW);

  it('reads a link to a component or a template as the command that opens it', async () => {
    scaffold({
      'using-widgets.doc.mjs': topic({
        name: 'using-widgets',
        title: 'Using widgets',
        sections: [
          {
            title: 'Overview',
            content: [
              {
                type: 'prose',
                text: 'Start with {@link component:AcmeButton} or {@link block:acme-card}, built on {@link @astryxdesign/core:component:Button}.',
              },
            ],
          },
        ],
      }),
    });
    const pkgDir = path.join(tmpDir, 'node_modules', '@acme', 'widgets');
    fs.writeFileSync(
      path.join(pkgDir, 'astryx.integration.mjs'),
      "export default {components: './components', templates: './templates', docs: './docs'};\n",
    );
    fs.mkdirSync(path.join(pkgDir, 'components'));
    fs.writeFileSync(
      path.join(pkgDir, 'components', 'AcmeButton.doc.mjs'),
      "export default {type: 'component', name: 'AcmeButton', displayName: 'Acme Button', description: 'A button.', props: []};\n",
    );
    fs.writeFileSync(
      path.join(pkgDir, 'components', 'AcmeButton.tsx'),
      'export function AcmeButton() { return null; }\n',
    );
    fs.mkdirSync(path.join(pkgDir, 'templates'));
    fs.writeFileSync(
      path.join(pkgDir, 'templates', 'acme-card.doc.mjs'),
      "export default {type: 'block', name: 'Acme card', description: 'A card.'};\n",
    );
    fs.writeFileSync(
      path.join(pkgDir, 'templates', 'acme-card.tsx'),
      'export default function Fixture() { return null; }\n',
    );

    const detail = await docs('using-widgets', undefined, {cwd: tmpDir, full: true});

    const prose = JSON.stringify(detail.data.sections);
    expect(prose).toContain('`astryx component AcmeButton --package @acme/widgets`');
    expect(prose).toContain(
      '`astryx template acme-card --type block --package @acme/widgets`',
    );
    expect(prose).toContain('`astryx component Button`');
    expect(prose).not.toContain('{@link');
  }, SLOW);

  it('renders a linked component or template summary once, so an escaped token stays written', async () => {
    scaffold({
      'using-widgets.doc.mjs': topic({
        name: 'using-widgets',
        title: 'Using widgets',
        sections: [
          {
            title: 'Overview',
            content: [
              {type: 'reference', target: 'component:AcmeButton'},
              {type: 'reference', target: 'block:acme-card'},
            ],
          },
        ],
      }),
    });
    const pkgDir = path.join(tmpDir, 'node_modules', '@acme', 'widgets');
    fs.writeFileSync(
      path.join(pkgDir, 'astryx.integration.mjs'),
      "export default {components: './components', templates: './templates', docs: './docs'};\n",
    );
    fs.mkdirSync(path.join(pkgDir, 'components'));
    fs.writeFileSync(
      path.join(pkgDir, 'components', 'AcmeButton.doc.mjs'),
      "export default {type: 'component', name: 'AcmeButton', displayName: 'Acme Button', description: 'Shows {@@pm run build}.', props: []};\n",
    );
    fs.writeFileSync(path.join(pkgDir, 'components', 'AcmeButton.tsx'), 'export function AcmeButton() { return null; }\n');
    fs.mkdirSync(path.join(pkgDir, 'templates'));
    fs.writeFileSync(
      path.join(pkgDir, 'templates', 'acme-card.doc.mjs'),
      "export default {type: 'block', name: 'Acme card', description: 'Card for {@@pm run build}.'};\n",
    );
    fs.writeFileSync(path.join(pkgDir, 'templates', 'acme-card.tsx'), 'export default function Fixture() { return null; }\n');

    const detail = await docs('using-widgets', undefined, {cwd: tmpDir, full: true});
    const text = JSON.stringify(detail.data);
    expect(text).toContain('Shows {@pm run build}.');
    expect(text).toContain('Card for {@pm run build}.');
  }, SLOW);

  it('selects Core in a link only where the bare name would open something else', async () => {
    const core = await discoverCoreTemplates();
    const page = core.find(template => template.type === 'page')?.dirName;
    const block = core.find(template => template.type === 'block')?.dirName;
    scaffold({
      'using-widgets.doc.mjs': topic({
        name: 'using-widgets',
        title: 'Using widgets',
        sections: [
          {
            title: 'Overview',
            content: [
              {
                type: 'prose',
                text:
                  'Core: {@link @astryxdesign/core:component:Button}, {@link @astryxdesign/core:component:Badge}, ' +
                  `{@link @astryxdesign/core:page:${page}}, {@link @astryxdesign/core:block:${block}}.`,
              },
            ],
          },
        ],
      }),
    });
    const pkgDir = path.join(tmpDir, 'node_modules', '@acme', 'widgets');
    // The CLI range that turns component replacement on.
    fs.writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({
        name: '@acme/widgets',
        version: '1.0.0',
        peerDependencies: {'@astryxdesign/cli': '>=0.6.7'},
        peerDependenciesMeta: {'@astryxdesign/cli': {optional: true}},
      }),
    );
    fs.writeFileSync(
      path.join(pkgDir, 'astryx.integration.mjs'),
      "export default {components: './components', templates: './templates', docs: './docs'};\n",
    );
    fs.mkdirSync(path.join(pkgDir, 'components'));
    // AcmeButton replaces Core's Button, so bare `Button` opens AcmeButton.
    fs.writeFileSync(
      path.join(pkgDir, 'components', 'AcmeButton.doc.mjs'),
      "export default {type: 'component', name: 'AcmeButton', displayName: 'Acme Button', description: 'A button.', replaces: 'Button', props: []};\n",
    );
    fs.writeFileSync(
      path.join(pkgDir, 'components', 'AcmeButton.tsx'),
      'export function AcmeButton() { return null; }\n',
    );
    // A page template with a Core page's id makes the bare id ambiguous.
    fs.mkdirSync(path.join(pkgDir, 'templates'));
    fs.writeFileSync(
      path.join(pkgDir, 'templates', `${page}.doc.mjs`),
      "export default {type: 'page', name: 'Acme page', displayName: 'Acme page', description: 'A page.'};\n",
    );
    fs.writeFileSync(
      path.join(pkgDir, 'templates', `${page}.tsx`),
      'export default function Fixture() { return null; }\n',
    );

    const detail = await docs('using-widgets', undefined, {cwd: tmpDir, full: true});

    const prose = JSON.stringify(detail.data.sections);
    expect(prose).toContain('`astryx component Button --package @astryxdesign/core`');
    expect(prose).toContain('`astryx component Badge`');
    expect(prose).toContain(
      `\`astryx template ${page} --type page --package @astryxdesign/core\``,
    );
    expect(prose).toContain(`\`astryx template ${block} --type block\``);
  }, SLOW);

  it('is invisible to a project that does not configure the integration', async () => {
    scaffold({'deploying.doc.mjs': topic()}, {config: 'export default {};\n'});
    const listed = await docs(undefined, undefined, {cwd: tmpDir});
    expect(listed.data.some(t => t.topic === 'deploying')).toBe(false);
  }, SLOW);

  it('serves the replacement of a built-in topic, and says what it replaced', async () => {
    scaffold({
      'getting-started.doc.mjs': topic({
        name: 'getting-started',
        replaces: 'getting-started',
        title: 'Getting started',
        description: 'Install Acme widgets.',
        sections: [
          {title: 'Install', content: [{type: 'prose', text: 'yarn add @acme/widgets'}]},
        ],
      }),
    });

    const detail = await docs('getting-started', undefined, {cwd: tmpDir, full: true});
    expect(detail.data.sections.map(s => s.title)).toEqual(['Install']);
    expect(detail.data.sections[0].content[0].text).toBe('yarn add @acme/widgets');

    const listed = await docs(undefined, undefined, {cwd: tmpDir});
    const entries = listed.data.filter(t => t.topic === 'getting-started');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      package: '@acme/widgets',
      replaces: 'getting-started',
    });
  }, SLOW);

  it('keeps the replaced name resolving when the replacement renames it', async () => {
    scaffold({
      'setup.doc.mjs': topic({name: 'setup', replaces: 'getting-started'}),
    });
    const byOldName = await docs('getting-started', undefined, {cwd: tmpDir, full: true});
    const byNewName = await docs('setup', undefined, {cwd: tmpDir, full: true});
    expect(byOldName.data.name).toBe('setup');
    expect(byNewName.data.name).toBe('setup');
  }, SLOW);

  it('merges an extension into the topic it extends', async () => {
    const builtin = await docs('theme', undefined, {full: true});
    const baseSectionTitle = builtin.data.sections[0].title;
    scaffold({
      'theme-internal.doc.mjs': topic({
        name: 'theme-internal',
        extends: 'theme',
        sections: [
          {title: baseSectionTitle, content: [{type: 'prose', text: 'Use the Acme theme.'}]},
          {title: 'Acme themes', content: [{type: 'prose', text: 'Three of them.'}]},
        ],
      }),
    });

    const extended = await docs('theme', undefined, {cwd: tmpDir, full: true});
    // The extension is not a topic of its own.
    expect((await docs(undefined, undefined, {cwd: tmpDir})).data.some(
      t => t.topic === 'theme-internal',
    )).toBe(false);
    expect(extended.data.sections[0].content[0].text).toBe('Use the Acme theme.');
    expect(extended.data.sections.at(-1).title).toBe('Acme themes');
    // Everything the extension did not name is still the base doc's.
    expect(extended.data.sections.length).toBe(builtin.data.sections.length + 1);
  }, SLOW);

  it('migrates a real built-in section to a stable ID without duplicating it', async () => {
    const builtin = await docs('theme', undefined, {full: true});
    // Readers see a key on every section; the migration case is one whose
    // source authors no id.
    const {docs: authored} = await import('../../assets/docs/theme.doc.mjs');
    const target = authored.sections.find(section => section.id == null);
    expect(target).toBeDefined();
    scaffold({
      'theme-internal.doc.mjs': topic({
        name: 'theme-internal',
        extends: 'theme',
        sections: [
          {
            id: 'acme-theme-setup',
            title: target.title,
            content: [{type: 'prose', text: 'Use the Acme theme.'}],
          },
        ],
      }),
    });

    const extended = await docs('theme', undefined, {cwd: tmpDir, full: true});
    expect(extended.data.sections).toHaveLength(builtin.data.sections.length);
    const matches = extended.data.sections.filter(
      section => section.title === target.title,
    );
    expect(matches).toEqual([
      expect.objectContaining({
        id: 'acme-theme-setup',
        content: [{type: 'prose', text: 'Use the Acme theme.'}],
      }),
    ]);
  }, SLOW);

  it('replaces a real built-in section by the key its index shows', async () => {
    const index = await docs('theme', undefined, {index: true});
    const target = index.data.sections[0];
    scaffold({
      'theme-internal.doc.mjs': topic({
        name: 'theme-internal',
        extends: 'theme',
        sections: [
          {
            id: target.id,
            title: `${target.title} with Acme`,
            content: [{type: 'prose', text: 'Acme first.'}],
          },
        ],
      }),
    });

    const extended = await docs('theme', undefined, {cwd: tmpDir, full: true});
    expect(extended.data.sections).toHaveLength(index.data.sections.length);
    expect(extended.data.sections.filter(s => s.id === target.id)).toEqual([
      expect.objectContaining({content: [{type: 'prose', text: 'Acme first.'}]}),
    ]);
    const read = await docs('theme', target.id, {cwd: tmpDir});
    expect(read.data.title).toBe(`${target.title} with Acme`);
  }, SLOW);

  it.each(['zh', 'dense'])(
    'replaces translated real sections by their authored titles under --%s',
    async lang => {
      const english = await docs('theme', undefined, {full: true});
      const englishTitles = english.data.sections.map(section => section.title);
      expect(englishTitles).toEqual(
        expect.arrayContaining(['Wrap your app in a theme', 'Dark mode']),
      );
      scaffold({
        'theme-internal.doc.mjs': topic({
          name: 'theme-internal',
          extends: 'theme',
          sections: [
            {
              id: 'quick-start',
              title: 'Wrap your app in a theme',
              content: [{type: 'prose', text: 'Acme themes.'}],
            },
            {
              id: 'light-dark-mode',
              title: 'Dark mode',
              content: [{type: 'prose', text: 'Acme props.'}],
            },
          ],
        }),
      });

      const base = await docs('theme', undefined, {lang, full: true});
      expect(base.data.sections.map(section => section.title)).not.toEqual(
        englishTitles,
      );
      const extended = await docs('theme', undefined, {cwd: tmpDir, lang, full: true});
      expect(extended.data.sections).toHaveLength(base.data.sections.length);
      expect(
        extended.data.sections.filter(
          section => section.id === 'quick-start',
        ),
      ).toHaveLength(1);
      expect(
        extended.data.sections.filter(
          section => section.content[0]?.text === 'Acme props.',
        ),
      ).toHaveLength(1);
    },
    SLOW,
  );

  it('offers the contributed topics as suggestions on an unknown one', async () => {
    scaffold({'deploying.doc.mjs': topic()});
    await expect(docs('zzqx-qqzz', undefined, {cwd: tmpDir, full: true})).rejects.toBeInstanceOf(
      AstryxError,
    );
    try {
      await docs('zzqx-qqzz', undefined, {cwd: tmpDir, full: true});
    } catch (err) {
      expect(err.suggestions.map(s => s.name)).toContain('deploying');
    }
  }, SLOW);

  it('indexes a contributed topic in search', async () => {
    scaffold({'deploying.doc.mjs': topic()});
    const {data} = await search('deploying', {cwd: tmpDir, type: 'doc'});
    expect(data.results[0]).toMatchObject({
      domain: 'doc',
      name: 'deploying',
      command: 'astryx docs deploying',
    });
  }, SLOW);

  it('ranks the topics that match every word of the query first', async () => {
    // Dozens of CLI docs match `integration` alone, by name or in a code
    // tick; the topics that hold both words, this one and the CLI's own
    // troubleshooting guide, must still come first.
    scaffold({
      'troubleshooting.doc.mjs': topic({
        name: 'troubleshooting',
        title: 'Troubleshooting',
        description: 'What to check when an integration does not load.',
      }),
    });
    const {data} = await search('troubleshoot integration', {cwd: tmpDir, type: 'doc'});
    const top = data.results.slice(0, 2).map(result => result.name);
    // This topic, and the CLI's own troubleshooting guide wherever the tree
    // places it.
    expect(top).toContain('troubleshooting');
    expect(
      top.some(name => /^authoring\/(?:.+\/)?troubleshooting$/.test(name)),
      top.join(', '),
    ).toBe(true);
  }, SLOW);

  it("falls back to the CLI's own topics when the project config is unreadable", async () => {
    scaffold({'deploying.doc.mjs': topic()}, {config: 'export default {integrations: 42};\n'});
    const catalog = await loadDocsCatalog(tmpDir);
    expect(catalog.resolve('color')).toBeTruthy();
    expect(catalog.resolve('deploying')).toBeUndefined();
  }, SLOW);
});

describe('doc tokens in a contributed topic', () => {
  it(
    'render in the list, the read and search, for the project the read is about',
    async () => {
      scaffold({
        'deploying.doc.mjs': topic({
          description:
            'Install with {@pm install @acme/widgets}, then run {@command doctor}.',
          sections: [
            {
              title: 'Overview',
              content: [{type: 'prose', text: 'Run {@command doctor} first.'}],
            },
          ],
        }),
      });
      // The project in tmpDir uses Bun; the process's own folder uses pnpm.
      fs.writeFileSync(path.join(tmpDir, 'bun.lock'), '{}\n');

      const listed = await docs(undefined, undefined, {cwd: tmpDir});
      const entry = listed.data.find(t => t.topic === 'deploying');
      expect(entry.description).toBe(
        'Install with `bun add @acme/widgets`, then run `astryx doctor`.',
      );
      const detail = await docs('deploying', undefined, {
        cwd: tmpDir,
        full: true,
      });
      expect(JSON.stringify(detail)).not.toContain('{@');
      expect(detail.data.sections[0].content[0].text).toBe(
        'Run `astryx doctor` first.',
      );
      // Core's own docs show tokens as written on purpose; this topic's render.
      const found = await search('deploying', {cwd: tmpDir, type: 'doc'});
      const hit = found.data.results.find(
        (/** @type {any} */ result) => result.name === 'deploying',
      );
      expect(hit.description).toBe(
        'Install with `bun add @acme/widgets`, then run `astryx doctor`.',
      );
    },
    SLOW,
  );
});
