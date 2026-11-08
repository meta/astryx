// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  AUTHORING_SELF_DOCS,
  auditAuthoringSelfDocs,
  EXPERIMENTAL_AUTHORING_ROUTE,
  buildAuthoringTopic,
  buildExperimentalAuthoringSections,
  discoverAuthoringSelfDocSources,
} from './authoring-self-docs.mjs';
import {
  GRAPH_BLOCK_TYPES,
  GRAPH_ONLY_FIELDS,
  problemsInTopic,
} from './docs-discovery.mjs';
import {doc as graphFieldsDoc} from '../../authoring/doctypes/base/graph-fields.doc.mjs';
import {doc as namespaceDoc} from '../../authoring/doctypes/namespace/namespace.doc.mjs';
import {doc as referenceDoc} from '../../authoring/doctypes/reference/reference.doc.mjs';
import {docs} from '../../api/docs/docs.mjs';

const SLOW = 60_000;

describe('authoring self-docs', () => {
  it('lists every self-doc on disk exactly once', () => {
    expect([...AUTHORING_SELF_DOCS].sort()).toEqual(
      discoverAuthoringSelfDocSources(),
    );
    expect(new Set(AUTHORING_SELF_DOCS).size).toBe(AUTHORING_SELF_DOCS.length);
  });

  it('audits clean: every self-doc loads, is reachable, and fits one read', async () => {
    // The three experimental schemas are sections of their own route, not of
    // `astryx docs authoring` (spec:AST-084 FR0).
    expect(await auditAuthoringSelfDocs()).toEqual({
      sections: AUTHORING_SELF_DOCS.length - 3,
      experimental: 3,
      unreachable: [],
      failed: [],
      oversized: [],
    });
  });

  it('builds a valid guide with one section per stable self-doc, placed under authoring, and serves the experimental ones on their own route', async () => {
    const {placement, ...topic} = await buildAuthoringTopic();
    expect(problemsInTopic(topic)).toEqual([]);
    expect(topic.sections).toHaveLength(AUTHORING_SELF_DOCS.length - 3);
    expect(placement).toEqual({
      parent: 'namespace:authoring',
      slot: 'reference',
      order: 10,
    });
    const experimental = await buildExperimentalAuthoringSections();
    expect(experimental.map(section => section.id)).toEqual([
      'icon-set-doc',
      'icon-set-data',
      'icon-definition-doc',
    ]);
    expect(topic.sections.map(section => section.id)).not.toContain(
      'icon-set-doc',
    );
    const read = await docs(EXPERIMENTAL_AUTHORING_ROUTE, 'icon-set-data');
    expect(read.data.title).toBe('IconSetData');
  });

  it(
    'is readable progressively through the docs API',
    async () => {
      const index = await docs('authoring/field-reference', undefined, {
        index: true,
      });
      expect(index.type).toBe('docs.index');
      expect(index.data.sections.map(s => s.id)).toContain('integration');
      // The namespace answers a section read from the field reference, as
      // `astryx docs authoring <name>` always has.
      const section = await docs('authoring', 'integration');
      expect(section.data.title).toBe('Astryx Integration');
      expect(
        (await docs('authoring/field-reference', 'integration')).data,
      ).toEqual(section.data);
      expect(section.data.content.some(block => block.type === 'table')).toBe(
        true,
      );
    },
    SLOW,
  );
});

describe('what the authoring docs say about the docs tree', () => {
  it('marks exactly the fields the docs tree does not read yet', () => {
    const notReadYet = graphFieldsDoc.fields
      .filter(field =>
        /^Reserved: .*Nothing reads it today/.test(field.description),
      )
      .map(field => field.name);
    // The tree reads `placement` for every guide (spec:AST-046); the other
    // graph fields are still refused by every topic reader.
    expect(notReadYet.sort()).toEqual(
      GRAPH_ONLY_FIELDS.filter(field => field !== 'placement').sort(),
    );
    for (const field of graphFieldsDoc.fields) {
      if (GRAPH_ONLY_FIELDS.includes(field.name)) {
        expect(field.description).toMatch(/fails to load/);
      }
    }
    const placement = graphFieldsDoc.fields.find(f => f.name === 'placement');
    expect(placement.description).toMatch(
      /Read for every guide, the CLI's and each integration's/,
    );
    expect(graphFieldsDoc.description).toMatch(
      /Nothing reads `aliases` or `audience` today/,
    );
  });

  it('keeps graph blocks behind the separate GraphContentBlock type, and a section takes a reference block', () => {
    const content = referenceDoc.fields
      .flatMap(field => [field, ...(field.fields ?? [])])
      .find(field => field.name === 'sections[].content');
    expect(content.type).toBe('(ReferenceContentBlock | ReferenceDocBlock)[]');
    expect(content.description).toContain('GraphContentBlock');
    for (const type of GRAPH_BLOCK_TYPES) {
      expect(content.description).toContain(type);
    }
    // A section's reference block reads as the doc it includes.
    expect(GRAPH_BLOCK_TYPES.has('reference')).toBe(false);
    expect(content.description).toMatch(
      /A `reference` block .* includes another doc/,
    );
  });

  it('says where namespace docs live: the CLI tree, and each integration', () => {
    expect(namespaceDoc.description).toMatch(
      /an integration ships its own in its docs directory/,
    );
    expect(
      problemsInTopic({
        ...namespaceDoc.examples?.[0],
        type: 'namespace',
        name: 'x',
      }),
    ).toEqual([
      '"x" is a namespace doc, which the docs tree reads, not the topic list. The CLI keeps its own in assets/docs/tree; an integration ships its namespace docs in its docs directory.',
    ]);
  });
});

describe('auditAuthoringSelfDocs', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(process.cwd(), '.astryx-self-docs-'));
    fs.mkdirSync(path.join(root, 'kept'));
    fs.writeFileSync(
      path.join(root, 'kept', 'kept.doc.mjs'),
      "export const doc = {type: 'schema', name: 'kept', displayName: 'Kept', description: 'Listed.', fields: []};\n",
    );
  });

  afterEach(() => {
    fs.rmSync(root, {recursive: true, force: true});
  });

  it('names a self-doc on disk that the list leaves out', async () => {
    fs.writeFileSync(
      path.join(root, 'kept', 'forgotten.doc.mjs'),
      "export const doc = {name: 'forgotten', description: 'Not listed.'};\n",
    );
    const audit = await auditAuthoringSelfDocs({
      root,
      sources: ['kept/kept.doc.mjs'],
    });
    expect(audit.unreachable).toEqual(['kept/forgotten.doc.mjs']);
  });

  it('reports a self-doc that fails to load instead of throwing', async () => {
    fs.writeFileSync(
      path.join(root, 'kept', 'broken.doc.mjs'),
      'export const doc = {;\n',
    );
    const audit = await auditAuthoringSelfDocs({
      root,
      sources: ['kept/kept.doc.mjs', 'kept/broken.doc.mjs'],
    });
    expect(audit.failed.map(entry => entry.source)).toEqual([
      'kept/broken.doc.mjs',
    ]);
    expect(audit.sections).toBe(1);
  });

  it('names a section over the budget', async () => {
    const audit = await auditAuthoringSelfDocs({
      root,
      sources: ['kept/kept.doc.mjs'],
      budget: 10,
    });
    expect(audit.oversized).toEqual([
      expect.objectContaining({key: 'kept', title: 'Kept'}),
    ]);
  });
});
