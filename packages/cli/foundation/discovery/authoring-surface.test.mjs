// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated tests for authoring-surface.mjs: every type this repo's
 *   `@astryxdesign/cli/authoring` exports traces to a readable self-doc, and
 *   each way a type loses its doc, or a self-doc loses its type, is named.
 */

import {afterEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  auditAuthoringSurface,
  tracePublicAuthoringTypes,
} from './authoring-surface.mjs';
import {docs} from '../../api/docs/docs.mjs';

const SLOW = 60_000;

/** @type {string[]} */
const roots = [];
afterEach(() => {
  while (roots.length) {
    fs.rmSync(/** @type {string} */ (roots.pop()), {
      recursive: true,
      force: true,
    });
  }
});

/**
 * A throwaway authoring tree. Kept under the working directory so its
 * self-docs import the way the real ones do.
 * @param {Record<string, string>} files
 * @returns {string}
 */
function tree(files) {
  const root = fs.mkdtempSync(path.join(process.cwd(), '.astryx-surface-'));
  roots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), {recursive: true});
    fs.writeFileSync(abs, content);
  }
  return root;
}

/**
 * @param {string} name
 * @param {string} [displayName]
 */
const selfDoc = (name, displayName = name) =>
  `export const doc = {type: 'schema', name: '${name}', displayName: '${displayName}', description: 'About ${name}.', fields: []};\n`;

/** One public type with its self-doc beside it. */
const FOO = {
  'index.d.ts': "export type {FooDoc} from './foo/type.js';\n",
  'foo/type.ts': 'export interface FooDoc {\n  name: string;\n}\n',
  'foo/foo.doc.mjs': selfDoc('foo-doc', 'FooDoc'),
};

describe('the public authoring surface of this repo', () => {
  it('traces every exported type to the module that declares it, and leaves the parsers out', () => {
    const {types, untraced} = tracePublicAuthoringTypes();
    expect(untraced).toEqual([]);
    const moduleOf = Object.fromEntries(types.map(t => [t.name, t.module]));
    expect(moduleOf).toMatchObject({
      NamespaceDoc: 'doctypes/namespace/type.ts',
      ComponentDoc: 'doctypes/component/type.ts',
      WorkflowDocBlock: 'doctypes/reference/type.ts',
      CollectionDocBlock: 'doctypes/reference/type.ts',
      ReferenceDocBlock: 'doctypes/reference/type.ts',
      AuthoredDocGraphFields: 'doctypes/base/type.ts',
      DocPlacement: 'doctypes/base/type.ts',
      ProviderId: 'identity/type.ts',
      AstryxConfig: 'config/type.ts',
      DebugConfig: 'config/type.ts',
      AstryxIntegration: 'integration/type.ts',
      DebugEvent: 'debug/type.ts',
      GapReportHandler: 'gap-report/type.ts',
    });
    expect(types.filter(t => t.name.startsWith('parse'))).toEqual([]);
    expect(new Set(types.map(t => t.name)).size).toBe(types.length);
  });

  it(
    'audits clean: every exported type has a readable doc and every self-doc documents one',
    async () => {
      const index = await docs('authoring/field-reference', undefined, {index: true});
      const topicKeys = new Set(
        index.data.sections.map((/** @type {any} */ s) => s.id),
      );
      expect(await auditAuthoringSurface({topicKeys})).toEqual({
        types: tracePublicAuthoringTypes().types.length,
        unreadable: [],
        untraced: [],
        unmatched: [],
      });
    },
    SLOW,
  );
});

describe('auditAuthoringSurface', () => {
  it('passes a type whose registered self-doc sits beside its module', async () => {
    const root = tree(FOO);
    expect(
      await auditAuthoringSurface({
        root,
        sources: ['foo/foo.doc.mjs'],
        topicKeys: new Set(['foo-doc']),
      }),
    ).toEqual({types: 1, unreadable: [], untraced: [], unmatched: []});
  });

  it('names an exported type with no self-doc beside its module', async () => {
    const root = tree({
      ...FOO,
      'index.d.ts': `${FOO['index.d.ts']}export type {BarDoc, BarField} from './bar/type.js';\n`,
      'bar/type.ts':
        'export interface BarDoc {}\nexport type BarField = string;\n',
    });
    const audit = await auditAuthoringSurface({
      root,
      sources: ['foo/foo.doc.mjs'],
    });
    expect(audit.unreadable).toEqual([
      {
        module: 'bar/type.ts',
        names: ['BarDoc', 'BarField'],
        reason: 'no-self-doc',
      },
    ]);
  });

  it('does not let a self-doc in a parent folder stand in for one beside the module', async () => {
    const root = tree({
      ...FOO,
      'index.d.ts': `${FOO['index.d.ts']}export type {FooPart} from './foo/part/type.js';\n`,
      'foo/part/type.ts': 'export interface FooPart {}\n',
    });
    const audit = await auditAuthoringSurface({
      root,
      sources: ['foo/foo.doc.mjs'],
    });
    expect(audit.unreadable).toEqual([
      {module: 'foo/part/type.ts', names: ['FooPart'], reason: 'no-self-doc'},
    ]);
  });

  it('names a self-doc that exists but is not registered', async () => {
    const audit = await auditAuthoringSurface({root: tree(FOO), sources: []});
    expect(audit.unreadable).toEqual([
      {
        module: 'foo/type.ts',
        names: ['FooDoc'],
        reason: 'unregistered',
        source: 'foo/foo.doc.mjs',
      },
    ]);
  });

  it('names a registered self-doc that does not load', async () => {
    const root = tree({...FOO, 'foo/foo.doc.mjs': 'export const doc = {;\n'});
    const audit = await auditAuthoringSurface({
      root,
      sources: ['foo/foo.doc.mjs'],
    });
    expect(audit.unreadable).toEqual([
      {
        module: 'foo/type.ts',
        names: ['FooDoc'],
        reason: 'failed',
        source: 'foo/foo.doc.mjs',
      },
    ]);
  });

  it("names a registered self-doc whose section the topic's index does not list", async () => {
    const audit = await auditAuthoringSurface({
      root: tree(FOO),
      sources: ['foo/foo.doc.mjs'],
      topicKeys: new Set(['something-else']),
    });
    expect(audit.unreadable).toEqual([
      {
        module: 'foo/type.ts',
        names: ['FooDoc'],
        reason: 'missing-section',
        source: 'foo/foo.doc.mjs',
        key: 'foo-doc',
      },
    ]);
  });

  it('names a registered self-doc that documents no exported type', async () => {
    const root = tree({
      ...FOO,
      'bar/type.ts': 'export interface BarDoc {}\n',
      'bar/bar.doc.mjs': selfDoc('bar-doc', 'BarDoc'),
      'notes/notes.doc.mjs': selfDoc('notes', 'Notes'),
    });
    const audit = await auditAuthoringSurface({
      root,
      sources: ['foo/foo.doc.mjs', 'bar/bar.doc.mjs', 'notes/notes.doc.mjs'],
    });
    expect(audit.unmatched).toEqual([
      {source: 'bar/bar.doc.mjs', key: 'bar-doc'},
      {source: 'notes/notes.doc.mjs', key: 'notes'},
    ]);
    expect(audit.unreadable).toEqual([]);
  });

  it('names a self-doc titled after a type beside it that the surface does not export', async () => {
    const root = tree({
      ...FOO,
      'index.d.ts': "export type {FooField} from './foo/type.js';\n",
      'foo/type.ts':
        'export interface FooDoc {}\nexport type FooField = string;\n',
      // What the declaration build writes beside a JavaScript module.
      'foo/foo.doc.d.mts': 'export const doc: {\n  name: string;\n};\n',
    });
    const audit = await auditAuthoringSurface({
      root,
      sources: ['foo/foo.doc.mjs'],
    });
    expect(audit.unmatched).toEqual([
      {source: 'foo/foo.doc.mjs', key: 'foo-doc', subject: 'FooDoc'},
    ]);
  });

  it('does not treat a title that is no declared name as a subject', async () => {
    const root = tree({
      ...FOO,
      'foo/foo.doc.mjs': selfDoc('foo', 'Foo Doc'),
    });
    const audit = await auditAuthoringSurface({
      root,
      sources: ['foo/foo.doc.mjs'],
    });
    expect(audit.unmatched).toEqual([]);
  });

  it('follows named, renamed, star, and imported re-exports to the declaring module', () => {
    const root = tree({
      'index.d.ts': [
        "export type {A, B as Bee} from './barrel.js';",
        "import type {C} from './c/type.js';",
        'export type {C};',
        "export type * from './d/type.js';",
        "export type * as E from './e/type.js';",
        '',
      ].join('\n'),
      'barrel.ts':
        "export type * from './a/type.js';\nexport type {B} from './b/type.js';\n",
      'a/type.ts': 'export interface A {}\n',
      'b/type.ts': 'export type B = number;\n',
      'c/type.ts': 'export interface C {}\n',
      'd/type.ts': 'export interface D1 {}\nexport type D2 = D1[];\n',
      'e/type.ts': 'export interface E1 {}\n',
    });
    expect(tracePublicAuthoringTypes(root)).toEqual({
      types: [
        {name: 'A', module: 'a/type.ts'},
        {name: 'Bee', module: 'b/type.ts'},
        {name: 'C', module: 'c/type.ts'},
        {name: 'D1', module: 'd/type.ts'},
        {name: 'D2', module: 'd/type.ts'},
        {name: 'E', module: 'e/type.ts'},
      ],
      untraced: [],
    });
  });

  it('leaves out a value exported from a JavaScript module, and keeps a value-style export of a type', () => {
    const root = tree({
      'index.d.ts':
        "export {parseFoo} from './foo/parse.mjs';\nexport {FooDoc} from './foo/type.js';\nexport type {FooShape} from './foo/parse.mjs';\n",
      'foo/type.ts': 'export interface FooDoc {}\n',
      'foo/parse.mjs': 'export function parseFoo(x) {\n  return x;\n}\n',
    });
    expect(tracePublicAuthoringTypes(root)).toEqual({
      types: [
        {name: 'FooDoc', module: 'foo/type.ts'},
        {name: 'FooShape', module: 'foo/parse.mjs'},
      ],
      untraced: [],
    });
  });

  it('reports an export it cannot trace instead of dropping it', () => {
    const root = path.join(
      tree({
        'authoring/index.d.ts': [
          "export type {Ghost} from './foo/type.js';",
          "export type {Lost} from './nowhere/type.js';",
          "export type {Outside} from '../elsewhere/type.js';",
          "export * from './foo/parse.mjs';",
          "export type * from './barrel.js';",
          "export type {Loop} from './loop-a.js';",
          '',
        ].join('\n'),
        'authoring/foo/type.ts': 'export interface FooDoc {}\n',
        'authoring/foo/parse.mjs': 'export const parseFoo = x => x;\n',
        'authoring/barrel.ts': "export * from './foo/parse.mjs';\n",
        'authoring/loop-a.ts': "export type {Loop} from './loop-b.js';\n",
        'authoring/loop-b.ts': "export type {Loop} from './loop-a.js';\n",
        'elsewhere/type.ts': 'export interface Outside {}\n',
      }),
      'authoring',
    );
    const {types, untraced} = tracePublicAuthoringTypes(root);
    expect(types).toEqual([]);
    expect(untraced).toEqual([
      {
        name: 'Ghost',
        reason:
          'index.d.ts exports Ghost from "./foo/type.js", which does not declare it',
      },
      {
        name: 'Lost',
        reason:
          'index.d.ts names "./nowhere/type.js", which is not a file in authoring/',
      },
      {
        name: 'Outside',
        reason:
          'index.d.ts names "../elsewhere/type.js", which is not a file in authoring/',
      },
      {
        name: '* from "./foo/parse.mjs"',
        reason:
          'index.d.ts re-exports everything "./foo/parse.mjs" exports, and what a JavaScript module exports cannot be listed',
      },
      {
        name: '* from "./barrel.js"',
        reason:
          'barrel.ts re-exports every type of "./foo/parse.mjs", a JavaScript module whose types cannot be listed',
      },
      {
        name: 'Loop',
        reason:
          'loop-b.ts exports Loop from "./loop-a.js", which does not declare it',
      },
    ]);
  });

  it('gives a type declared in index.d.ts itself no doc, since nothing sits beside the barrel', async () => {
    const root = tree({'index.d.ts': 'export interface Loose {}\n'});
    const audit = await auditAuthoringSurface({root, sources: []});
    expect(audit.unreadable).toEqual([
      {module: 'index.d.ts', names: ['Loose'], reason: 'no-self-doc'},
    ]);
  });

  it('never executes a module it traces through', async () => {
    const marker = path.join(
      process.cwd(),
      `.astryx-surface-ran-${process.pid}`,
    );
    const root = tree({
      ...FOO,
      'index.d.ts': `${FOO['index.d.ts']}export {parseFoo} from './foo/parse.mjs';\nexport type {Shape} from './foo/shape.mjs';\n`,
      'foo/parse.mjs': `import * as fs from 'node:fs';\nfs.writeFileSync(${JSON.stringify(marker)}, 'ran');\nexport const parseFoo = x => x;\n`,
      'foo/shape.mjs': `import * as fs from 'node:fs';\nfs.writeFileSync(${JSON.stringify(marker)}, 'ran');\n`,
    });
    const before = listTree(root);
    await auditAuthoringSurface({root, sources: ['foo/foo.doc.mjs']});
    expect(fs.existsSync(marker)).toBe(false);
    expect(listTree(root)).toEqual(before);
  });
});

/**
 * Every file under `root` with its contents, to prove a read left it alone.
 * @param {string} root
 * @returns {Record<string, string>}
 */
function listTree(root) {
  /** @type {Record<string, string>} */
  const out = {};
  /** @param {string} dir */
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out[path.relative(root, full)] = fs.readFileSync(full, 'utf8');
    }
  };
  walk(root);
  return out;
}
