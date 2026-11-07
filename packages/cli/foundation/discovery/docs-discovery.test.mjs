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
import {parseDoc} from '../../authoring/doctypes/parse.mjs';
import {
  BUILTIN_DOCS_PACKAGE,
  DocsCatalog,
  discoverBuiltinTopics,
  discoverIntegrationDocs,
  loadTopicModule,
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

describe('assets/docs audience', () => {
  // packages/cli/assets/docs ships to people BUILDING WITH Astryx, not people
  // building Astryx itself - see the README's own audience rule and routing
  // table. These five words are a clean, measured signal for material that
  // belongs on the wiki instead: 0 hits across the directory as authored
  // today, 56 in the draft (#5351) that prompted this check. Deliberately
  // narrower than the README's own longer "tells" list - audit/checklist/gate
  // also match plenty of innocent prose ("Verification Checklist", "Audit
  // every reset stylesheet"), which would make the check noisy enough to get
  // suppressed rather than acted on.
  //
  // The README's own rule (line 24) is that these words are a tell "as
  // things the reader must produce" - not as vocabulary. "A component's
  // theme targets are stable once published" is caller-facing even where it
  // sounds like process; only a statement asking the reader to produce or
  // hand over one of these things is ours. "GPU compositor promotion" is a
  // real caller-facing rendering term with no reader-facing directive
  // anywhere near it, and matched before this fixed it (#5370).
  //
  // So a process word only counts when the SAME sentence also names the
  // MAINTAINER-SIDE handoff - who receives the thing, or the gate it passes
  // through: "reviewer(s)", "before merging/promoting", "attach", "produce",
  // "checklist", "gate", "sign off". A bare directive word - "you", "must",
  // "should", "complete", "pass" - is not on this list: ordinary caller
  // guidance uses all of those too ("You should animate transforms to keep
  // compositor promotion", "You should use browser-support evidence to
  // select a tier"), so a directive alone does not tell a maintainer
  // instruction apart from a caller one. Only a handoff/audience marker does
  // - exactly the shape of language the draft (#5351) that prompted this
  // check actually used ("Reviewers must attach evidence to the readiness
  // checklist before sign-off").
  const OUR_PROCESS_WORDS =
    /\b(rubric|readiness|promotion|sign-off|evidence)\b/i;
  const PROCESS_DIRECTIVE_CONTEXT =
    /\b(reviewer|reviewers|before (merging|promoting)|attach|produce|checklist|gate|sign[- ]?off)\b/i;

  /**
   * A verified, reviewable exception: exactly the (file, section title) pair
   * where a hit was checked by hand and confirmed caller-facing. A new
   * occurrence under any OTHER section, in this file or any other, is still
   * reported and needs the same by-hand check before it's added here - this
   * is not a way to turn the check off for a whole file.
   * @type {Array<{file: string, section: string, reason: string}>}
   */
  const EXEMPT_SECTIONS = [];

  function isExemptSection(file, sectionTitle) {
    return EXEMPT_SECTIONS.some(
      exemption => exemption.file === file && exemption.section === sectionTitle,
    );
  }

/**
   * Sentence-level, not file-level: a process word appearing anywhere in a
   * long topic file, however many caller-facing paragraphs away from any
   * directive language, is not the pattern this check exists to catch.
   */
  function findOurProcessWordHitsInText(text) {
    const words = [];
    for (const sentence of text.split(/(?<=[.!?])\s+|\n{2,}/)) {
      const wordMatch = sentence.match(OUR_PROCESS_WORDS);
      if (wordMatch && PROCESS_DIRECTIVE_CONTEXT.test(sentence)) {
        words.push(wordMatch[0]);
      }
    }
    return words;
  }

  /**
   * Every string a block carries that a reader actually reads as prose:
   * `prose`/`heading.text`, `code.code`, `list.items`, and `table`'s
   * `headers` and each `rows` cell. A process sentence in a list item or a
   * table cell is exactly as much a maintainer-audience leak as one in a
   * paragraph - the shipped topics use all of these formats for guidance,
   * not just prose blocks.
   *
   * @param {{type?: string, text?: string, code?: string, items?: string[], headers?: string[], rows?: string[][]}} block
   * @returns {string[]}
   */
  function textsInBlock(block) {
    const texts = [];
    if (typeof block.text === 'string') {
      texts.push(block.text);
    }
    if (typeof block.code === 'string') {
      texts.push(block.code);
    }
    if (Array.isArray(block.items)) {
      texts.push(...block.items.filter(item => typeof item === 'string'));
    }
    if (Array.isArray(block.headers)) {
      texts.push(...block.headers.filter(header => typeof header === 'string'));
    }
    if (Array.isArray(block.rows)) {
      for (const row of block.rows) {
        if (Array.isArray(row)) {
          texts.push(...row.filter(cell => typeof cell === 'string'));
        }
      }
    }
    return texts;
  }

  /**
   * Section-level, not file-level, for WHERE a hit is reported: a topic can
   * carry several sections, and "the file" alone leaves a reader searching a
   * whole page for one flagged sentence.
   *
   * @param {{sections?: Array<{title?: string, content?: Array<object>}>}} doc
   * @returns {Array<{section: string, word: string}>}
   */
  function findOurProcessWordHits(doc) {
    const hits = [];
    for (const section of doc.sections ?? []) {
      for (const block of section.content ?? []) {
        for (const text of textsInBlock(block)) {
          for (const word of findOurProcessWordHitsInText(text)) {
            hits.push({section: section.title ?? '(untitled)', word});
          }
        }
      }
    }
    return hits;
  }

  /** Build a minimal doc with one prose block, for the matcher's own unit tests. */
  function docWithProse(text, sectionTitle = 'Section') {
    return {
      sections: [{title: sectionTitle, content: [{type: 'prose', text}]}],
    };
  }

  // Advisory only: this lists sentences a reviewer may want to look at, and
  // never fails the suite. A vocabulary check cannot tell maintainer process
  // from caller guidance reliably enough to block an edit (#5370).
  it('reports our-process words in a caller-facing doc topic without failing', async () => {
    const hits = [];
    // discoverBuiltinTopics already excludes localization/dense overlays
    // (layout.doc.dense.mjs, foo.doc.zh.mjs, …) - those merge onto a base
    // topic rather than exporting one of their own, so loadTopicModule
    // throws on them. README.md documents the audience rule; it isn't
    // shipped as a topic either, and was never in this map.
    for (const [, filePath] of Object.entries(discoverBuiltinTopics())) {
      const file = path.basename(filePath);
      const doc = parseDoc(await loadTopicModule(filePath), file);
      for (const hit of findOurProcessWordHits(doc)) {
        if (isExemptSection(file, hit.section)) {
          continue;
        }
        hits.push(`${file} §${hit.section}: "${hit.word}"`);
      }
    }
    if (hits.length > 0) {
      console.warn(
        'assets/docs: these sentences may describe building Astryx, not ' +
          "building with it. If so, move them to the wiki page named in " +
          "assets/docs/README.md's routing table. If they are caller-facing, " +
          'add a reviewed (file, section) entry to EXEMPT_SECTIONS.\n' +
          hits.join('\n'),
      );
    }
    expect(Array.isArray(hits)).toBe(true);
  });

  it('flags process language asking the reader to produce one of these things', () => {
    expect(
      findOurProcessWordHits(
        docWithProse(
          'Reviewers must attach evidence to the readiness checklist before sign-off.',
        ),
      ),
    ).toEqual([{section: 'Section', word: 'evidence'}]);
  });

  it('flags process language in a list item, not just a prose paragraph', () => {
    const doc = {
      sections: [
        {
          title: 'Before you submit',
          content: [
            {
              type: 'list',
              style: 'unordered',
              items: [
                'Reviewers must attach evidence to the readiness checklist before sign-off.',
                'Use a descriptive branch name.',
              ],
            },
          ],
        },
      ],
    };
    expect(findOurProcessWordHits(doc)).toEqual([
      {section: 'Before you submit', word: 'evidence'},
    ]);
  });

  it('flags process language in a table cell', () => {
    const doc = {
      sections: [
        {
          title: 'Checklist',
          content: [
            {
              type: 'table',
              headers: ['Step', 'Detail'],
              rows: [
                [
                  '3',
                  'Reviewers must attach evidence to the readiness checklist before sign-off.',
                ],
              ],
            },
          ],
        },
      ],
    };
    expect(findOurProcessWordHits(doc)).toEqual([
      {section: 'Checklist', word: 'evidence'},
    ]);
  });

  it('flags process language inside a code block comment', () => {
    const doc = {
      sections: [
        {
          title: 'Example',
          content: [
            {
              type: 'code',
              lang: 'ts',
              code: '// Reviewers must attach evidence to the readiness checklist before sign-off.',
            },
          ],
        },
      ],
    };
    expect(findOurProcessWordHits(doc)).toEqual([
      {section: 'Example', word: 'evidence'},
    ]);
  });

  it('allows a caller-facing rendering term that happens to share a word', () => {
    // The exact false positive from #5370: "promotion" describing GPU
    // compositor behavior, a fact about the system a caller can rely on, not
    // a reader-facing directive.
    expect(
      findOurProcessWordHits(
        docWithProse(
          'A layer with a running transform animation gets its own compositor ' +
            'promotion, which keeps the animation off the main thread.',
        ),
      ),
    ).toEqual([]);
  });

  it('allows a caller directive that happens to name a process word, with no maintainer-side handoff', () => {
    // A bare directive ("you should") is not enough on its own - that shape
    // is ordinary caller guidance too. Two real examples from review: "You
    // should animate transforms to keep compositor promotion" and "You
    // should use browser-support evidence to select a tier" - neither asks
    // the reader to hand evidence to a reviewer or through a gate.
    expect(
      findOurProcessWordHits(
        docWithProse(
          'You should provide evidence for the browser you are targeting ' +
            'before choosing a support tier.',
        ),
      ),
    ).toEqual([]);
  });

  it('reports which section a hit is in, not just which file', () => {
    const doc = {
      sections: [
        {title: 'Overview', content: [{type: 'prose', text: 'Ship it.'}]},
        {
          title: 'Contributing',
          content: [
            {
              type: 'prose',
              text: 'Reviewers must attach evidence to the readiness checklist before sign-off.',
            },
          ],
        },
      ],
    };
    expect(findOurProcessWordHits(doc)).toEqual([
      {section: 'Contributing', word: 'evidence'},
    ]);
  });

  it('EXEMPT_SECTIONS narrows the exception to the exact (file, section) pair verified caller-facing', () => {
    // Drives the real EXEMPT_SECTIONS array and isExemptSection - the same
    // two the corpus scan above uses - not a local stand-in, so a
    // regression in the real matching (a typo in the field names it reads,
    // a comparison that's accidentally case-insensitive, …) would actually
    // fail this test.
    const violatingHits = findOurProcessWordHits(
      docWithProse(
        'Reviewers must attach evidence to the readiness checklist before sign-off.',
        'Verified caller-facing section',
      ),
    );
    expect(violatingHits).toEqual([
      {section: 'Verified caller-facing section', word: 'evidence'},
    ]);

    expect(
      isExemptSection('example.doc.mjs', 'Verified caller-facing section'),
    ).toBe(false);
    expect(
      violatingHits.filter(
        hit => !isExemptSection('example.doc.mjs', hit.section),
      ),
    ).toEqual(violatingHits);

    // Push a temporary entry onto the real list - cleaned up in `finally` so
    // it can't leak into the corpus scan or any other test in this file.
    EXEMPT_SECTIONS.push({
      file: 'example.doc.mjs',
      section: 'Verified caller-facing section',
      reason: 'test fixture demonstrating the exemption mechanism',
    });
    try {
      // Exempted for that exact file+section…
      expect(
        violatingHits.filter(
          hit => !isExemptSection('example.doc.mjs', hit.section),
        ),
      ).toEqual([]);
      // …but NOT for a different section in the same file, and not for the
      // same section title in a different file.
      expect(
        isExemptSection('example.doc.mjs', 'A different section'),
      ).toBe(false);
      expect(
        isExemptSection('other.doc.mjs', 'Verified caller-facing section'),
      ).toBe(false);
      expect(
        violatingHits.filter(
          hit => !isExemptSection('other.doc.mjs', hit.section),
        ),
      ).toEqual(violatingHits);
    } finally {
      EXEMPT_SECTIONS.length = 0;
    }
  });
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
