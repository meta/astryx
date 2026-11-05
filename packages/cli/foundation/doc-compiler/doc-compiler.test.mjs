// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the doc compiler: lowering, linking, the compiled-node
 * contract, the lenses, and the rule that readers go through the compiler.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import jscodeshift from 'jscodeshift';
import {describe, expect, it} from 'vitest';
import {parseDoc} from '../../authoring/doctypes/parse.mjs';
import {
  COMPILED_DOC_SCHEMA_VERSION,
  linkReferenceTopic,
  lowerReferenceTopic,
} from './compile.mjs';
import {parseCompiledReferenceNode} from './ir.mjs';
import {detailView, indexView, readerSections, sectionView} from './lenses.mjs';

const CLI_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

/**
 * @param {string} name
 * @param {any[]} sections
 * @param {object} [fields]
 */
function authored(name, sections, fields = {}) {
  return parseDoc(
    {
      name,
      title: `${name} title`,
      description: `About ${name}.`,
      ...fields,
      sections,
    },
    `${name}.doc.mjs`,
  );
}

/** @param {any} doc @param {object} [more] */
const file = (doc, more = {}) => ({file: `${doc.name}.doc.mjs`, doc, ...more});

/**
 * @param {any} base
 * @param {any[]} [extensions]
 * @param {string | null} [lang]
 */
const input = (base, extensions = [], lang = null) => ({
  id: base.doc?.name ?? 'demo',
  provider: '@acme/base',
  replaces: null,
  lang,
  base,
  extensions,
});

const prose = (/** @type {string} */ text) => ({type: 'prose', text});

const demo = () =>
  authored('demo', [
    {title: 'Quick Start', content: [prose('Start here.')]},
    {title: 'Props', content: [prose('Every prop.')]},
  ]);

/** @param {string} name @param {string} text */
const extension = (name, text) => ({
  ...file(
    authored(name, [{title: 'Quick Start', content: [prose(text)]}], {
      extends: 'demo',
    }),
  ),
  provider: `@acme/${name}`,
});

describe('lowerReferenceTopic', () => {
  it('lays the overlay over authored titles and keys every section', () => {
    const overlay = {
      description: '演示。',
      sections: [
        {
          section: 'Quick Start',
          title: '快速开始',
          content: [prose('从这里开始。')],
        },
      ],
    };
    const node = lowerReferenceTopic(input(file(demo(), {overlay}), [], 'zh'));
    expect(node.schemaVersion).toBe(COMPILED_DOC_SCHEMA_VERSION);
    expect(node.stage).toBe('lowered');
    expect(node.doc.description).toBe('演示。');
    expect(
      node.doc.sections.map((/** @type {any} */ s) => [s.id, s.title]),
    ).toEqual([
      ['quick-start', '快速开始'],
      ['props', 'Props'],
    ]);
    expect(node.sourceTitles).toEqual({
      'quick-start': 'Quick Start',
      props: 'Props',
    });
    expect(parseCompiledReferenceNode(node)).toBe(node);
  });

  it('merges extensions by key in order and names every provider', () => {
    const acme = authored(
      'demo-acme',
      [
        {title: 'Quick Start', content: [prose('Acme start.')]},
        {title: 'Acme Palettes', content: [prose('Palettes.')]},
      ],
      {extends: 'demo'},
    );
    const node = lowerReferenceTopic(
      input(file(demo()), [{...file(acme), provider: '@acme/ext'}]),
    );
    expect(node.doc.sections.map((/** @type {any} */ s) => s.id)).toEqual([
      'quick-start',
      'props',
      'acme-palettes',
    ]);
    expect(node.doc.sections[0].content).toEqual([prose('Acme start.')]);
    expect(node.provenance).toEqual({
      provider: '@acme/base',
      replaces: null,
      extensions: ['@acme/ext'],
    });
  });

  it('keeps the topic named as it is when extended, and renames it only when replaced', () => {
    const extended = lowerReferenceTopic(
      input(file(demo()), [extension('acme', 'Acme start.')]),
    );
    expect(extended.doc.title).toBe('demo title');
    expect(extended.doc.description).toBe('About demo.');
    const replacement = authored(
      'acme-demo',
      [{title: 'Quick Start', content: [prose('Acme start.')]}],
      {replaces: 'demo'},
    );
    const replaced = lowerReferenceTopic({
      ...input(file(replacement)),
      id: 'demo',
      provider: '@acme/replacement',
      replaces: 'demo',
    });
    expect(replaced.doc.title).toBe('acme-demo title');
    expect(replaced.doc.description).toBe('About acme-demo.');
  });

  it('applies extensions in configuration order, so the last one wins', () => {
    const node = lowerReferenceTopic(
      input(file(demo()), [
        extension('one', 'First.'),
        extension('two', 'Second.'),
      ]),
    );
    expect(node.doc.sections[0].content).toEqual([prose('Second.')]);
    expect(node.provenance.extensions).toEqual(['@acme/one', '@acme/two']);
  });

  it('reports problems in the order a reader meets them', () => {
    const broken = new Error('extension failed to load');
    const invalidBase = file(
      authored('demo', [{title: 'Only', content: [prose('x')]}]),
    );
    invalidBase.doc = {...invalidBase.doc, title: ''};
    expect(() =>
      lowerReferenceTopic(
        input(invalidBase, [
          {file: 'ext.doc.mjs', error: broken, provider: '@acme/ext'},
        ]),
      ),
    ).toThrow(/demo\.doc\.mjs is invalid/);

    const overlayError = new Error('overlay failed to load');
    expect(() =>
      lowerReferenceTopic(input(file(demo(), {overlayError}), [], 'zh')),
    ).toThrow(overlayError);

    expect(() =>
      lowerReferenceTopic(
        input(file(demo()), [
          {file: 'ext.doc.mjs', error: broken, provider: '@acme/ext'},
        ]),
      ),
    ).toThrow(broken);
  });

  it('carries authored values the way JSON does', () => {
    const doc = {
      ...demo(),
      when: new Date(0),
      render: () => 1,
      note: undefined,
    };
    doc.sections = [
      {...doc.sections[0], previewType: undefined},
      doc.sections[1],
    ];
    const node = lowerReferenceTopic(input(file(doc)));
    expect(node.doc.when).toBe('1970-01-01T00:00:00.000Z');
    expect('render' in node.doc).toBe(false);
    expect('note' in node.doc).toBe(false);
    expect('previewType' in node.doc.sections[0]).toBe(false);
    expect(parseCompiledReferenceNode(node)).toBe(node);
  });
});

describe('linking and lenses', () => {
  const tokens = () =>
    lowerReferenceTopic(
      input(
        file(
          authored('tokens', [
            {
              title: 'Spacing',
              previewType: 'spacing-bar',
              content: [
                {type: 'table', headers: ['Token'], rows: [['--space-1']]},
              ],
            },
          ]),
          {overlay: {sections: [{section: 'Spacing', title: '间距'}]}},
        ),
        [],
        'zh',
      ),
    );
  const guide = () =>
    lowerReferenceTopic(
      input(
        file(
          authored('guide', [
            {
              title: 'By Title',
              content: [
                {type: 'token-ref', topic: 'tokens', section: 'SPACING'},
              ],
            },
            {
              title: 'By Key',
              content: [
                {type: 'token-ref', topic: 'tokens', section: 'spacing'},
              ],
            },
            {
              title: 'No Topic',
              content: [{type: 'token-ref', topic: 'nope', section: 'x'}],
            },
            {
              title: 'No Section',
              content: [{type: 'token-ref', topic: 'tokens', section: 'nope'}],
            },
          ]),
        ),
        [],
        'zh',
      ),
    );
  const targets = async (/** @type {string} */ name) =>
    name === 'tokens' ? tokens() : null;

  it('resolves a reference by key or authored title in the reading language', async () => {
    const linked = await linkReferenceTopic(guide(), targets);
    expect(linked.stage).toBe('linked');
    expect(parseCompiledReferenceNode(linked)).toBe(linked);
    const [byTitle, byKey, noTopic, noSection] = detailView(linked).sections;
    for (const section of [byTitle, byKey]) {
      expect(section.content).toEqual([
        {type: 'table', headers: ['Token'], rows: [['--space-1']]},
      ]);
      expect(section.previewType).toBe('spacing-bar');
    }
    expect(noTopic.content).toEqual([
      prose('[token-ref: unknown topic "nope"]'),
    ]);
    expect(noSection.content).toEqual([
      prose('[token-ref: section "nope" not found in "tokens"]'),
    ]);
  });

  it('takes the preview type of the last reference that has one', async () => {
    const palette = lowerReferenceTopic(
      input(
        file(
          authored('palette', [
            {
              title: 'Spacing',
              previewType: 'spacing-bar',
              content: [{type: 'table', headers: ['S'], rows: [['1']]}],
            },
            {title: 'Plain', content: [prose('No preview.')]},
            {
              title: 'Radius',
              previewType: 'radius-box',
              content: [{type: 'table', headers: ['R'], rows: [['2']]}],
            },
          ]),
        ),
      ),
    );
    const both = lowerReferenceTopic(
      input(
        file(
          authored('guide', [
            {
              title: 'Both',
              content: ['spacing', 'plain', 'radius'].map(section => ({
                type: 'token-ref',
                topic: 'palette',
                section,
              })),
            },
          ]),
        ),
      ),
    );
    const [section] = detailView(
      await linkReferenceTopic(both, async () => palette),
    ).sections;
    expect(section.previewType).toBe('radius-box');
    expect(Object.keys(section)).toEqual([
      'title',
      'content',
      'id',
      'previewType',
    ]);
    expect(section.content.map((/** @type {any} */ b) => b.type)).toEqual([
      'table',
      'prose',
      'table',
    ]);
  });

  it('gives every inlined copy of a referenced section its own blocks', async () => {
    const shared = tokens();
    const sameTarget = async (/** @type {string} */ name) =>
      name === 'tokens' ? shared : null;
    const twice = lowerReferenceTopic(
      input(
        file(
          authored('guide', [
            {
              title: 'First',
              content: [
                {type: 'token-ref', topic: 'tokens', section: 'spacing'},
              ],
            },
            {
              title: 'Second',
              content: [
                {type: 'token-ref', topic: 'tokens', section: 'spacing'},
              ],
            },
          ]),
        ),
        [],
        'zh',
      ),
    );
    const [first, second] = detailView(
      await linkReferenceTopic(twice, sameTarget),
    ).sections;
    expect(first.content).toEqual(second.content);
    expect(first.content[0]).not.toBe(second.content[0]);
    expect(first.content[0]).not.toBe(shared.doc.sections[0].content[0]);
  });

  it('hands out views that share nothing with the node', async () => {
    const lowered = lowerReferenceTopic(
      input(file({...demo(), extra: {tags: ['a']}})),
    );
    // Authored sections hold only scalars besides content; a node read back
    // from JSON may hold more, and the lens copies that too.
    lowered.doc.sections[0] = {
      ...lowered.doc.sections[0],
      meta: {level: 1},
      content: [{type: 'table', headers: ['A'], rows: [['1']]}],
    };
    const node = await linkReferenceTopic(lowered, async () => null);
    const view = detailView(node);
    expect(JSON.stringify(view)).toBe(JSON.stringify(node.doc));
    expect(view.extra).not.toBe(node.doc.extra);
    expect(view.sections[0].meta).not.toBe(node.doc.sections[0].meta);
    expect(view.sections[0].content[0]).not.toBe(
      node.doc.sections[0].content[0],
    );
    expect(view.sections[0].content[0].rows).not.toBe(
      node.doc.sections[0].content[0].rows,
    );
  });

  it('reads the index and section lookups without linking', () => {
    const node = guide();
    expect(indexView(node).sections.map(s => s.id)).toEqual([
      'by-title',
      'by-key',
      'no-topic',
      'no-section',
    ]);
    expect(readerSections(node).map(s => s.title)).toEqual([
      'By Title',
      'By Key',
      'No Topic',
      'No Section',
    ]);
    expect(() => sectionView(node, node.doc.sections[0])).toThrow(
      /before it was linked/,
    );
    expect(() => detailView(node)).toThrow(/must be linked/);
  });
});

describe('parseCompiledReferenceNode', () => {
  const node = () => lowerReferenceTopic(input(file(demo())));
  const linked = async () =>
    linkReferenceTopic(
      lowerReferenceTopic(
        input(
          file(
            authored('guide', [
              {
                title: 'Ref',
                content: [{type: 'token-ref', topic: 'nope', section: 'x'}],
              },
            ]),
          ),
        ),
      ),
      async () => null,
    );

  it('returns a valid node as given', () => {
    const value = JSON.parse(JSON.stringify(node()));
    expect(parseCompiledReferenceNode(value)).toBe(value);
  });

  it('names an unsupported schema version', () => {
    expect(() =>
      parseCompiledReferenceNode({...node(), schemaVersion: 99}),
    ).toThrow(/schema version 99 is not supported/);
  });

  it('rejects a node that lost an authored title or duplicated a key', () => {
    expect(() =>
      parseCompiledReferenceNode({...node(), sourceTitles: {}}),
    ).toThrow(/no authored title for section "quick-start"/);
    const twice = node();
    twice.doc.sections[1] = {...twice.doc.sections[1], id: 'quick-start'};
    expect(() => parseCompiledReferenceNode(twice)).toThrow(
      /two sections have the key/,
    );
  });

  it.each([
    [
      'a function in a block',
      (/** @type {any} */ n) => {
        n.doc.sections[0].content[0].text = () => 1;
      },
      /a function is not JSON/,
    ],
    [
      'a Date',
      (/** @type {any} */ n) => {
        n.doc.when = new Date(0);
      },
      /a Date is not JSON/,
    ],
    [
      'an undefined value',
      (/** @type {any} */ n) => {
        n.doc.note = undefined;
      },
      /undefined is not JSON/,
    ],
    [
      'a symbol key',
      (/** @type {any} */ n) => {
        n.doc[Symbol('x')] = 1;
      },
      /symbol keys/,
    ],
    [
      'a cycle',
      (/** @type {any} */ n) => {
        n.doc.self = n.doc;
      },
      /refers back to itself/,
    ],
    [
      'a block that is a number',
      (/** @type {any} */ n) => {
        n.doc.sections[0].content.push(42);
      },
      /expected a block with a type/,
    ],
    [
      'a null block',
      (/** @type {any} */ n) => {
        n.doc.sections[0].content.push(null);
      },
      /expected a block with a type/,
    ],
    [
      'a block with no type',
      (/** @type {any} */ n) => {
        n.doc.sections[0].content.push({text: 'x'});
      },
      /expected a block with a type/,
    ],
    [
      'a path in the provenance',
      (/** @type {any} */ n) => {
        n.provenance.provider = '/home/me/acme';
      },
      /naming packages, not paths/,
    ],
    [
      'a resolution on a lowered node',
      (/** @type {any} */ n) => {
        n.doc.sections[0].content.push({
          type: 'token-ref',
          topic: 't',
          section: 's',
          resolved: {status: 'unknown-topic'},
        });
      },
      /a lowered node carries no resolution/,
    ],
  ])('rejects %s', (_, mutate, message) => {
    const value = node();
    mutate(value);
    expect(() => parseCompiledReferenceNode(value)).toThrow(message);
  });

  it('rejects a linked node with an unresolved or malformed reference', async () => {
    const unresolved = await linked();
    delete unresolved.doc.sections[0].content[0].resolved;
    expect(() => parseCompiledReferenceNode(unresolved)).toThrow(
      /a linked node resolves every reference/,
    );
    const malformed = await linked();
    malformed.doc.sections[0].content[0] = {
      ...malformed.doc.sections[0].content[0],
      resolved: {status: 'maybe'},
    };
    expect(() => parseCompiledReferenceNode(malformed)).toThrow(
      /token reference to "nope"/,
    );
  });
});

describe('readers go through the compiler', () => {
  /** Compiler functions, by module. ESLint enforces the same list. */
  const RESTRICTED = {
    'foundation/discovery/docs-discovery.mjs': ['mergeTopic'],
    'foundation/discovery/docs-section-key.mjs': ['withSectionKeys'],
    'foundation/doc-compiler/compile.mjs': [
      'lowerReferenceTopic',
      'linkReferenceTopic',
      'linkReferenceSection',
      'lowerDoc',
    ],
  };
  /** The docs adapter and leaves drive the compiler; nothing else does. */
  const ALLOWED = {
    'api/docs/_adapter.mjs': ['lowerReferenceTopic', 'linkReferenceTopic'],
    'api/docs/detail/detail.mjs': ['linkReferenceTopic'],
    'api/docs/detail/section/section.mjs': ['linkReferenceSection'],
  };
  const j = jscodeshift.withParser('babel');

  /**
   * Every import of a compiler function that `rel` may not make: named under
   * any alias, namespace, re-export, and dynamic import().
   * @param {string} source
   * @param {string} rel path under packages/cli
   * @returns {string[]}
   */
  function forbiddenImports(source, rel) {
    /** @type {string[]} */
    const allowed = ALLOWED[/** @type {keyof typeof ALLOWED} */ (rel)] ?? [];
    /** @type {string[]} */
    const found = [];
    /** @param {unknown} specifier @returns {string[]} */
    const bannedFrom = specifier => {
      if (typeof specifier !== 'string' || !specifier.startsWith('.')) {
        return [];
      }
      const target = path.posix.normalize(
        path.posix.join(path.posix.dirname(rel), specifier),
      );
      const names =
        RESTRICTED[/** @type {keyof typeof RESTRICTED} */ (target)] ?? [];
      return names.filter(name => !allowed.includes(name));
    };
    /** @param {any} node */
    const checkStatic = node => {
      const banned = bannedFrom(node.source?.value);
      if (banned.length === 0) return;
      if (node.type === 'ExportAllDeclaration') {
        found.push(`${rel}: export * from ${node.source.value}`);
        return;
      }
      for (const spec of node.specifiers ?? []) {
        const name =
          spec.type === 'ImportNamespaceSpecifier'
            ? '*'
            : spec.type === 'ImportDefaultSpecifier'
              ? 'default'
              : (spec.imported ?? spec.local)?.name;
        if (name === '*' || name === 'default' || banned.includes(name)) {
          found.push(`${rel}: ${name} from ${node.source.value}`);
        }
      }
    };
    /** @param {any} node */
    const checkDynamic = node => {
      const specifier = node.source?.value ?? node.arguments?.[0]?.value;
      if (bannedFrom(specifier).length > 0) {
        found.push(`${rel}: import(${specifier})`);
      }
    };
    const root = j(source);
    root.find(j.ImportDeclaration).forEach(p => checkStatic(p.node));
    root
      .find(j.ExportNamedDeclaration)
      .forEach(p => p.node.source && checkStatic(p.node));
    root.find(j.ExportAllDeclaration).forEach(p => checkStatic(p.node));
    root.find(j.ImportExpression).forEach(p => checkDynamic(p.node));
    root
      .find(j.CallExpression, {callee: {type: 'Import'}})
      .forEach(p => checkDynamic(p.node));
    return found;
  }

  /** Temporary folders other tests create with mkdtemp and delete mid-run. */
  const TRANSIENT_DIR = /^__[a-z][a-z_]*_[A-Za-z0-9]{6}$/;

  /** @param {string} dir @returns {string[]} */
  const sources = dir =>
    fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const skip =
          entry.name === 'node_modules' || TRANSIENT_DIR.test(entry.name);
        return skip ? [] : sources(full);
      }
      return entry.name.endsWith('.mjs') && !entry.name.endsWith('.test.mjs')
        ? [full]
        : [];
    });

  it('keeps compiler functions out of api/ and clients/', () => {
    const offenders = ['api', 'clients']
      .flatMap(dir => sources(path.join(CLI_ROOT, dir)))
      .flatMap(full =>
        forbiddenImports(
          fs.readFileSync(full, 'utf8'),
          path.relative(CLI_ROOT, full).split(path.sep).join('/'),
        ),
      );
    expect(offenders).toEqual([]);
  });

  it('catches every way around the rule', () => {
    const doctor = 'api/doctor/doctor.mjs';
    const discovery = '../../foundation/discovery/docs-discovery.mjs';
    expect(
      forbiddenImports(
        `import {mergeTopic as merge} from '${discovery}'; merge({}, {});`,
        doctor,
      ),
    ).toHaveLength(1);
    expect(
      forbiddenImports(
        `import * as dd from '${discovery}'; dd['mergeTopic']({}, {});`,
        doctor,
      ),
    ).toHaveLength(1);
    expect(
      forbiddenImports(
        `async function f() { const dd = await import('${discovery}'); dd.mergeTopic.call(null, {}, {}); }`,
        doctor,
      ),
    ).toHaveLength(1);
    expect(
      forbiddenImports(
        `export {withSectionKeys} from '../../foundation/discovery/docs-section-key.mjs';`,
        doctor,
      ),
    ).toHaveLength(1);
    expect(
      forbiddenImports(`import {DocsCatalog} from '${discovery}';`, doctor),
    ).toEqual([]);
    const leaf = 'api/docs/detail/detail.mjs';
    const compiler = '../../../foundation/doc-compiler/compile.mjs';
    expect(
      forbiddenImports(`import {linkReferenceTopic} from '${compiler}';`, leaf),
    ).toEqual([]);
    expect(
      forbiddenImports(
        `import {lowerReferenceTopic} from '${compiler}';`,
        leaf,
      ),
    ).toHaveLength(1);
  });
});
