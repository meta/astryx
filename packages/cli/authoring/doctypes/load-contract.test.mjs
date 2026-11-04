// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every authored doc kind has a compile-time lock between its load check
 * and its published type: the `_*DriftLock` typedefs in `_schema.mjs` and
 * `template/parse.mjs`, which the strict typecheck evaluates. A lock names each
 * place the loader is deliberately looser than the type. These tests pin that
 * looser behavior and the published unknown-field policy, so tightening a load
 * check is a reviewed change rather than a silent one.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {describe, expect, it} from 'vitest';
import {parseDoc} from './parse.mjs';
import {AuthoredDocKindSchema} from './_schema.mjs';
import {doc as graphFieldsDoc} from './base/graph-fields.doc.mjs';
import {doc as iconDefinitionDoc} from './icon-definition/icon-definition.doc.mjs';
import {problemsInTopic} from '../../foundation/discovery/docs-discovery.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KINDS = AuthoredDocKindSchema.options;

/** The lock that pins each kind's load check to its published type. */
const LOCKS = {
  component: '_ComponentDocDriftLock',
  function: '_FunctionDocDriftLock',
  generic: '_ReferenceDocDriftLock',
  page: '_PageTemplateDocDriftLock',
  block: '_BlockTemplateDocDriftLock',
  schema: '_SchemaDocDriftLock',
  command: '_CommandDocDriftLock',
  enum: '_EnumDocDriftLock',
  namespace: '_NamespaceDocDriftLock',
  'icon-definition': '_IconDefinitionDocDriftLock',
};

/** One valid example doc per kind, from the typed examples. */
const EXAMPLES = Object.fromEntries(
  await Promise.all(
    KINDS.map(async kind => {
      const file = {generic: 'reference', function: 'function'}[kind] ?? kind;
      const url = pathToFileURL(
        path.join(HERE, '../../test/authoring-types', `${file}.doc.mjs`),
      );
      return [kind, (await import(url.href)).docs];
    }),
  ),
);

describe('load check vs published type', () => {
  it('locks every doc kind', () => {
    const source = [
      '_schema.mjs',
      'template/parse.mjs',
      'theme/parse.mjs',
      'icon-definition/parse.mjs',
    ]
      .map(file => fs.readFileSync(path.join(HERE, file), 'utf8'))
      .join('\n');
    expect(Object.keys(LOCKS).sort()).toEqual([...KINDS].sort());
    const locks = [
      ...Object.values(LOCKS),
      '_AuthoredDocKindDriftLock',
      '_HookDocIsFunctionDocLock',
      '_ThemeDocDriftLock',
    ];
    for (const lock of locks) {
      expect(source, `${lock} is missing`).toMatch(
        new RegExp(`\\}\\s*${lock}\\b`),
      );
    }
  });

  it('dispatches every doc kind and refuses any other', () => {
    for (const kind of KINDS) {
      expect(() => parseDoc(EXAMPLES[kind], `${kind}.doc.mjs`)).not.toThrow();
    }
    expect(() => parseDoc({type: 'widget', name: 'x'}, 'x.doc.mjs')).toThrow(
      /x\.doc\.mjs is invalid/u,
    );
  });
});

describe('where loading is deliberately looser than the type', () => {
  it('a stamped component needs no displayName; usage, theming and examples are unchecked', () => {
    expect(() =>
      parseDoc(
        {
          type: 'component',
          name: 'Badge',
          category: 'badges',
          props: [],
          usage: 'free text',
          theming: 5,
          examples: [{title: 'Basic'}],
        },
        'Badge.doc.mjs',
      ),
    ).not.toThrow();
  });

  it('each entry of a stamped group doc needs a name, and nothing more', () => {
    const group = (/** @type {unknown[]} */ components) => ({
      type: 'component',
      name: 'Tabs',
      components,
    });
    expect(() =>
      parseDoc(
        group([{name: 'Tab'}, {name: 'TabPanel', description: 'x'}]),
        'Tabs.doc.mjs',
      ),
    ).not.toThrow();
    for (const bad of [null, 5, 'Tab', {}, {name: ''}, {displayName: 'Tab'}]) {
      expect(() => parseDoc(group([bad]), 'Tabs.doc.mjs')).toThrow(
        /components\.0/,
      );
    }
  });

  it('a stamped function needs no displayName; usage is unchecked', () => {
    expect(() =>
      parseDoc(
        {type: 'function', name: 'useX', params: [], returns: [], usage: 5},
        'useX.doc.mjs',
      ),
    ).not.toThrow();
  });

  it('a stamped generic doc loads without title, description or sections, but is no topic', () => {
    const doc = parseDoc({type: 'generic', name: 'notes'}, 'notes.doc.mjs');
    expect(doc.title).toBe('notes');
    expect(problemsInTopic(doc)).toEqual([
      'description: expected a non-empty string',
      'sections: expected at least one section',
    ]);
  });

  it('a template needs no displayName or aspectRatio and may use its own category', () => {
    expect(() =>
      parseDoc(
        {type: 'block', name: 'widget-demo', category: 'components/Widget'},
        'widget-demo.doc.mjs',
      ),
    ).not.toThrow();
    expect(() =>
      parseDoc(
        {type: 'page', name: 'widget-page', category: 'Widgets'},
        'widget-page.doc.mjs',
      ),
    ).not.toThrow();
  });

  it('schema, command and enum docs load only as their type allows', () => {
    const {fields, ...schemaDoc} = EXAMPLES.schema;
    const {summary, ...commandDoc} = EXAMPLES.command;
    const {members, ...enumDoc} = EXAMPLES.enum;
    expect(() => parseDoc(schemaDoc, 's.doc.mjs')).toThrow(/fields/);
    expect(() => parseDoc(commandDoc, 'c.doc.mjs')).toThrow(/summary/);
    expect(() => parseDoc(enumDoc, 'e.doc.mjs')).toThrow(/members/);
  });
});

describe('unknown fields', () => {
  const keeps = KINDS.filter(kind => {
    try {
      parseDoc({...EXAMPLES[kind], notAField: true}, `${kind}.doc.mjs`);
      return true;
    } catch {
      return false;
    }
  });

  it('match the published policy', () => {
    const policy = graphFieldsDoc.notes
      .map(note => ('text' in note ? note.text : ''))
      .find(text => text.startsWith('Unknown fields'));
    expect(policy, 'graph-fields.doc.mjs states the policy').toBeDefined();
    const [kept, refused] = /** @type {string} */ (policy).split(
      ' docs accept',
    );
    const named = (/** @type {string} */ text) =>
      [...text.matchAll(/`([a-z][a-z-]*)`/g)].map(match => match[1]).sort();
    expect(named(kept)).toEqual([...keeps].sort());
    // The experimental icon-definition kind states its own policy in its
    // schema doc, on its experimental route (spec:AST-017 FR27).
    const stable = KINDS.filter(kind => kind !== 'icon-definition');
    expect(named(refused).filter(kind => stable.includes(kind))).toEqual(
      stable.filter(kind => !keeps.includes(kind)).sort(),
    );
    expect(keeps).not.toContain('icon-definition');
    const iconDefinitionNotes = JSON.stringify(iconDefinitionDoc.notes);
    expect(iconDefinitionNotes).toContain('refuses a field it does not know');
  });

  it("are refused inside a section's reference block, which a section takes", () => {
    const [section] = EXAMPLES.generic.sections;
    const reference = {
      type: 'reference',
      target: '@astryxdesign/cli:schema:integration',
      projection: {fields: ['docs']},
      presentation: 'compact',
    };
    /** @param {object} block */
    const withBlock = block =>
      parseDoc(
        {...EXAMPLES.generic, sections: [{...section, content: [block]}]},
        'r.doc.mjs',
      );
    expect(() => withBlock(reference)).not.toThrow();
    expect(() => withBlock({...reference, notAField: true})).toThrow();
    expect(() =>
      withBlock({...reference, projection: {fields: ['docs'], rows: []}}),
    ).toThrow();
    // Workflow and collection blocks belong to a namespace doc.
    expect(() =>
      withBlock({type: 'collection', source: {slot: 'guides'}}),
    ).toThrow();
  });

  it('are refused inside sections and content blocks', () => {
    const [section] = EXAMPLES.generic.sections;
    expect(() =>
      parseDoc(
        {...EXAMPLES.generic, sections: [{...section, notAField: true}]},
        'r.doc.mjs',
      ),
    ).toThrow();
    expect(() =>
      parseDoc(
        {
          ...EXAMPLES.generic,
          sections: [
            {
              ...section,
              content: [{type: 'prose', text: 'x', notAField: true}],
            },
          ],
        },
        'r.doc.mjs',
      ),
    ).toThrow();
  });
});
