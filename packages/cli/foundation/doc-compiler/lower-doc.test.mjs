// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file lowerDoc, the compiled-node parsers, and diagnostics: every doc kind
 *   lowers into one sealed node shape, and every failure has one diagnostic.
 */

import {describe, expect, it} from 'vitest';
import {
  COMPILED_DOC_KINDS,
  COMPILED_DOC_SCHEMA_VERSION,
  lowerDoc,
} from './compile.mjs';
import {
  DIAGNOSTIC_CODES,
  diagnostic,
  diagnosticProblem,
  sortDiagnostics,
} from './diagnostics.mjs';
import {parseCompiledDocNode, parseCompiledDocsBundle} from './ir.mjs';

/**
 * @param {any} doc
 * @param {object} [more]
 * @returns {any}
 */
const input = (doc, more = {}) => ({
  id: '@acme/kit:components:Card',
  root: 'components',
  provider: '@acme/kit',
  source: '@acme/kit/src/Card.doc.mjs',
  lang: null,
  file: {file: 'Card.doc.mjs', doc},
  ...more,
});

const card = {
  type: 'component',
  name: 'Card',
  displayName: 'Card',
  usage: {description: 'A card.'},
  props: [{name: 'title', type: 'string', description: 'The title.'}],
};

describe('lowerDoc', () => {
  it('lowers each root into its kind, with package provenance and JSON doc', () => {
    const cases = [
      ['components', card, 'component'],
      [
        'components',
        {name: 'Old', description: 'Legacy.', props: []},
        'component',
      ],
      [
        'hooks',
        {
          type: 'function',
          kind: 'hook',
          name: 'useThing',
          displayName: 'useThing',
          description: 'Does a thing.',
          params: [],
          returns: [],
        },
        'function',
      ],
      [
        'templates',
        {type: 'page', name: 'Home', description: 'A page.'},
        'page',
      ],
      [
        'templates',
        {type: 'block', name: 'Hero', description: 'A block.'},
        'block',
      ],
      [
        'themes',
        {
          type: 'theme',
          name: 'ocean',
          displayName: 'Ocean',
          description: 'Blue.',
          maintained: true,
        },
        'theme',
      ],
      [
        'self-docs',
        {type: 'enum', name: 'codes', description: 'Codes.', values: []},
        'enum',
      ],
    ];
    for (const [root, doc, kind] of cases) {
      const {node, diagnostics} = lowerDoc(input(doc, {root}));
      expect({root, kind: node?.kind}).toEqual({root, kind});
      expect(node?.provenance).toEqual({
        provider: '@acme/kit',
        source: '@acme/kit/src/Card.doc.mjs',
      });
      expect(node?.schemaVersion).toBe(COMPILED_DOC_SCHEMA_VERSION);
      expect(() => parseCompiledDocNode(node)).not.toThrow();
      // Legacy and stamped docs parse cleanly; nothing to report.
      expect(diagnostics.filter(d => d.code !== 'invalid_doc')).toEqual([]);
    }
  });

  it('carries the authored doc as JSON: key order kept, undefined dropped', () => {
    const {node} = lowerDoc(
      input({
        ...card,
        playground: {defaults: {onOpenChange: undefined, size: 'md'}},
      }),
    );
    expect(Object.keys(node?.doc)).toEqual([
      'type',
      'name',
      'displayName',
      'usage',
      'props',
      'playground',
    ]);
    expect(node?.doc.playground).toEqual({defaults: {size: 'md'}});
  });

  it('lays the translation for the reading language over the doc', () => {
    const {node} = lowerDoc(
      input(card, {
        lang: 'zh',
        file: {
          file: 'Card.doc.mjs',
          doc: card,
          overlay: {
            usage: {description: '卡片。'},
            propDescriptions: {title: '标题。'},
          },
        },
      }),
    );
    expect(node?.lang).toBe('zh');
    expect(node?.doc.usage.description).toBe('卡片。');
    expect(node?.doc.props[0]).toEqual({
      name: 'title',
      type: 'string',
      description: '标题。',
    });
  });

  it('keeps a doc that fails its parser, and reports why', () => {
    const {node, diagnostics, failure} = lowerDoc(
      input({type: 'component', name: 'Card'}),
    );
    expect(node?.doc).toEqual({type: 'component', name: 'Card'});
    expect(diagnostics.map(d => d.code)).toEqual(['invalid_doc']);
    expect(failure).toBeInstanceOf(Error);
    expect(diagnostics[0].message).toBe(/** @type {Error} */ (failure).message);
  });

  it("keeps a doc of another kind, in its root's kind, and names the mismatch", () => {
    const {node, diagnostics} = lowerDoc(
      input({type: 'page', name: 'Home', description: 'A page.'}),
    );
    expect(node?.kind).toBe('component');
    expect(diagnostics.map(d => d.code)).toEqual(['wrong_kind']);
  });

  it('yields no node, and records what failed, when the file cannot be read', () => {
    const thrown = new SyntaxError('Unexpected token');
    const loaded = lowerDoc(
      input(card, {file: {file: 'Card.doc.mjs', error: thrown}}),
    );
    expect(loaded.node).toBeNull();
    expect(loaded.loadFailure).toBe(thrown);
    expect(loaded.diagnostics.map(d => d.code)).toEqual(['load_failed']);
    const empty = lowerDoc(
      input(card, {file: {file: 'Card.doc.mjs', doc: null}}),
    );
    expect(empty).toMatchObject({
      node: null,
      missing: true,
      missingValue: null,
    });
    expect(empty.diagnostics.map(d => d.code)).toEqual(['missing_export']);
    const overlaid = lowerDoc(
      input(card, {
        file: {file: 'Card.doc.mjs', doc: card, overlayError: thrown},
      }),
    );
    expect(overlaid).toMatchObject({node: null, overlayFailure: thrown});
    expect(overlaid.view).toBeUndefined();
    expect(overlaid.diagnostics.map(d => d.code)).toEqual(['overlay_failed']);
  });

  it('keeps the parse failure first when the translation also breaks', () => {
    const {failure, overlayFailure, diagnostics} = lowerDoc(
      input(
        {type: 'component', name: 'Card'},
        {
          lang: 'zh',
          file: {
            file: 'Card.doc.mjs',
            doc: {type: 'component', name: 'Card'},
            overlay: {
              get props() {
                throw new TypeError('bad translation');
              },
            },
          },
        },
      ),
    );
    expect(/** @type {Error} */ (failure).message).toMatch(
      /Card\.doc\.mjs is invalid/,
    );
    expect(overlayFailure).toBeInstanceOf(TypeError);
    expect(diagnostics.map(d => d.code)).toEqual([
      'invalid_doc',
      'overlay_failed',
    ]);
  });

  it('refuses a theme descriptor outside the themes root, as readers always did', () => {
    const theme = {
      type: 'theme',
      name: 'ocean',
      displayName: 'Ocean',
      description: 'd',
      maintained: true,
    };
    for (const root of ['components', 'hooks', 'self-docs']) {
      const {failure} = lowerDoc(
        input(theme, {root, label: '/x/Ocean.doc.mjs'}),
      );
      expect(/** @type {Error} */ (failure).message).toBe(
        '/x/Ocean.doc.mjs has unsupported type "theme".',
      );
    }
  });

  it('hands readers the authored value, and only the node goes through JSON', () => {
    const cyclic = /** @type {any} */ ({
      ...card,
      big: 10n,
      when: new Date(0),
      fn() {},
    });
    cyclic.self = cyclic;
    cyclic.gone = undefined;
    const {view, node, diagnostics} = lowerDoc(input(cyclic));
    expect(view).toBe(cyclic);
    expect(node).toBeNull();
    expect(diagnostics.at(-1)?.code).toBe('not_json');
    expect(diagnostics.at(-1)?.message).not.toMatch(/^\//);
    const read = lowerDoc(input(cyclic), {check: false, node: false});
    expect(read).toEqual({node: null, diagnostics: [], view: cyclic});
  });

  it('never puts a machine path in a diagnostic', () => {
    const {diagnostics} = lowerDoc(
      input(
        {type: 'component', name: 'Card'},
        {label: '/home/someone/kit/Card.doc.mjs'},
      ),
    );
    expect(diagnostics[0].message).not.toContain('/home/someone');
  });

  it('refuses a value JSON cannot hold', () => {
    const cyclic = /** @type {any} */ ({...card});
    cyclic.self = cyclic;
    for (const doc of [cyclic, {...card, big: 1n}]) {
      const {node, diagnostics} = lowerDoc(input(doc));
      expect(node).toBeNull();
      expect(diagnostics.at(-1)?.code).toBe('not_json');
    }
  });

  it("carries the parser's result only when asked to", () => {
    const block = {
      type: 'block',
      name: 'Hero',
      description: 'A block.',
      extra: 1,
    };
    const authored = lowerDoc(input(block, {root: 'templates'}));
    const parsed = lowerDoc(input(block, {root: 'templates', useParsed: true}));
    expect(authored.node?.doc.extra).toBe(1);
    expect(parsed.node?.doc).toEqual(
      expect.objectContaining({type: 'block', name: 'Hero'}),
    );
  });
});

describe('diagnostics', () => {
  it('fixes phase, severity, scope, and remediation per code', () => {
    for (const [code, rule] of Object.entries(DIAGNOSTIC_CODES)) {
      const d = diagnostic(code, {message: 'x'});
      expect(d).toEqual({
        code,
        phase: rule.phase,
        severity: rule.severity,
        scope: rule.scope,
        provider: null,
        source: null,
        field: null,
        message: 'x',
        remediation: rule.remediation,
      });
      expect(diagnosticProblem(d)).toBeNull();
    }
    expect(() => diagnostic('nope', {message: 'x'})).toThrow(/Unknown/);
    for (const name of [
      'toString',
      'constructor',
      '__proto__',
      'hasOwnProperty',
    ]) {
      expect(() => diagnostic(name, {message: 'x'})).toThrow(/Unknown/);
      expect(
        diagnosticProblem({
          ...diagnostic('invalid_doc', {message: 'x'}),
          code: name,
        }),
      ).toMatch(/not a compiler diagnostic code/);
    }
  });

  it('rejects a diagnostic a reader reinterpreted', () => {
    const d = diagnostic('invalid_doc', {message: 'x'});
    expect(diagnosticProblem({...d, severity: 'warning'})).toMatch(
      /always has severity/,
    );
    expect(diagnosticProblem({...d, code: 'made_up'})).toMatch(
      /not a compiler diagnostic code/,
    );
    expect(diagnosticProblem({...d, extra: 1})).toMatch(/unknown fields/);
    expect(diagnosticProblem({...d, source: ''})).toMatch(/source/);
    for (const source of [
      '/tmp/x/Card.doc.mjs',
      'C:\\x\\Card.doc.mjs',
      '@acme/kit/../x',
    ]) {
      expect(diagnosticProblem({...d, source})).toMatch(
        /not a location on one machine/,
      );
    }
  });

  it('sorts by source, then phase, code, field, and message', () => {
    const at = (
      /** @type {string} */ code,
      /** @type {string|null} */ source,
      field = null,
    ) => diagnostic(code, {source, field, message: `${code} ${field}`});
    const list = [
      at('unresolved_reference', 'b/x', 'sections.b'),
      at('invalid_doc', 'b/x'),
      at('load_failed', 'b/x'),
      at('unresolved_reference', 'b/x', 'sections.a'),
      at('invalid_doc', null),
      at('duplicate_id', 'a/x'),
    ];
    const sorted = sortDiagnostics(list);
    expect(sorted.map(d => `${d.source}:${d.code}:${d.field}`)).toEqual([
      'a/x:duplicate_id:null',
      'b/x:load_failed:null',
      'b/x:invalid_doc:null',
      'b/x:unresolved_reference:sections.a',
      'b/x:unresolved_reference:sections.b',
      'null:invalid_doc:null',
    ]);
    expect(sortDiagnostics([...list].reverse())).toEqual(sorted);
  });
});

describe('parseCompiledDocNode and parseCompiledDocsBundle', () => {
  const node = () =>
    /** @type {any} */ (structuredClone(lowerDoc(input(card)).node));
  const bundle = () => ({
    schemaVersion: COMPILED_DOC_SCHEMA_VERSION,
    lang: null,
    nodes: [node()],
    diagnostics: [diagnostic('unresolved_reference', {message: 'x'})],
  });

  it('accepts a node of every kind and a bundle, as given', () => {
    const value = bundle();
    expect(parseCompiledDocsBundle(value)).toBe(value);
    expect(COMPILED_DOC_KINDS).toHaveLength(11);
    // A namespace doc, which the docs tree reads, lowers to a node too.
    const namespace = {...node(), kind: 'namespace'};
    expect(parseCompiledDocNode(namespace)).toBe(namespace);
  });

  it('names schema skew with its own diagnostic, before anything else', () => {
    for (const parse of [parseCompiledDocNode, parseCompiledDocsBundle]) {
      try {
        parse({schemaVersion: 99, nope: true});
        throw new Error('expected a throw');
      } catch (error) {
        expect(/** @type {any} */ (error).message).toMatch(
          /schema version 99 is not supported/,
        );
        expect(/** @type {any} */ (error).diagnostic.code).toBe(
          'unsupported_schema',
        );
      }
    }
  });

  it.each([
    [
      'an unknown field',
      (/** @type {any} */ n) => (n.extra = 1),
      /unknown fields: extra/,
    ],
    [
      'an unknown kind',
      (/** @type {any} */ n) => (n.kind = 'workflow'),
      /not a compiled doc kind/,
    ],
    [
      'a machine path as provider',
      (/** @type {any} */ n) => (n.provenance.provider = '/home/x'),
      /not a machine path/,
    ],
    [
      'a machine path as source',
      (/** @type {any} */ n) => (n.provenance.source = 'C:\\x\\Card.doc.mjs'),
      /not a machine path/,
    ],
    [
      'a source that climbs out of its package',
      (/** @type {any} */ n) => (n.provenance.source = '@acme/kit/../x'),
      /not a machine path/,
    ],
    [
      'a stage other than lowered',
      (/** @type {any} */ n) => (n.stage = 'linked'),
      /stage/,
    ],
    [
      'a doc without a name',
      (/** @type {any} */ n) => delete n.doc.name,
      /doc with a name/,
    ],
    [
      'a page node without a page doc',
      (/** @type {any} */ n) => {
        n.kind = 'page';
        n.doc.type = 'block';
      },
      /a page node holds a page doc/,
    ],
    [
      'a function in the doc',
      (/** @type {any} */ n) => (n.doc.render = () => null),
      /is not JSON/,
    ],
    [
      'undefined in the doc',
      (/** @type {any} */ n) => (n.doc.gone = undefined),
      /undefined is not JSON/,
    ],
  ])('rejects %s', (_name, mutate, message) => {
    const value = node();
    mutate(value);
    expect(() => parseCompiledDocNode(value)).toThrow(message);
    try {
      parseCompiledDocNode(value);
    } catch (error) {
      expect(/** @type {any} */ (error).diagnostic.code).toBe('invalid_bundle');
    }
  });

  it('rejects a bundle with a duplicate id, a bad node, or a reinterpreted diagnostic', () => {
    const twice = bundle();
    twice.nodes.push(node());
    expect(() => parseCompiledDocsBundle(twice)).toThrow(/appears twice/);
    const bad = bundle();
    bad.nodes[0].kind = 'nope';
    expect(() => parseCompiledDocsBundle(bad)).toThrow(/nodes\[0\]\.kind/);
    const reinterpreted = bundle();
    reinterpreted.diagnostics[0] = {
      ...reinterpreted.diagnostics[0],
      severity: 'error',
    };
    expect(() => parseCompiledDocsBundle(reinterpreted)).toThrow(
      /diagnostics\[0\]/,
    );
    expect(() => parseCompiledDocsBundle({...bundle(), extra: 1})).toThrow(
      /unknown fields/,
    );
  });
});
