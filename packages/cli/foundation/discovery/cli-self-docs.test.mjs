// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the CLI's own typed docs. Every command, API function,
 * schema, and enum doc this package ships declares the group that reads it,
 * and each way one can fail to be read is reported: no namespace, a namespace
 * nothing reads, a clash with the authoring topic's list, a doc that does not
 * load, and a leaf too large for one read. What `astryx docs <route>` prints
 * for one doc is pinned here; where the tree puts it is tree.test.mjs's job.
 *
 * @input This package's own docs, and fixture doc trees written under the
 *   working directory.
 * @output Assertions on the audit and on each doc's rendered content.
 * @position packages/cli/foundation/discovery — tests for cli-self-docs.mjs.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, describe, expect, it} from 'vitest';
import {
  CLI_DOC_NAMESPACES,
  auditCliSelfDocs,
  cliDocIndex,
  cliDocSection,
  discoverCliSelfDocSources,
} from './cli-self-docs.mjs';
import {routeSegment} from './docs-section-key.mjs';
import {formatCliCommand} from '../env/package-manager.mjs';

const SLOW = 60_000;

/** @type {string[]} */
const tmpRoots = [];
afterAll(() => {
  for (const root of tmpRoots) fs.rmSync(root, {recursive: true, force: true});
});

/** Write `files` (relative path -> content) under a fresh directory. */
function writeTree(/** @type {Record<string, string>} */ files) {
  const root = fs.mkdtempSync(path.join(process.cwd(), '.astryx-cli-docs-'));
  tmpRoots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, content);
  }
  return root;
}

const docModule = (/** @type {any} */ doc) =>
  `export const doc = ${JSON.stringify(doc, null, 2)};\n`;

const command = (/** @type {string} */ name, extra = {}) => ({
  type: 'command',
  name,
  displayName: `astryx ${name}`,
  namespace: 'cli/commands',
  summary: `Do ${name}`,
  ...extra,
});

const fn = (/** @type {string} */ name, extra = {}) => ({
  type: 'function',
  kind: 'api',
  name,
  displayName: `${name}()`,
  namespace: 'cli/api',
  summary: `The ${name} function.`,
  importPath: '@astryxdesign/cli/api',
  params: [],
  returns: [{type: name, description: 'The result.'}],
  ...extra,
});

const enumDoc = (/** @type {string} */ name, extra = {}) => ({
  type: 'enum',
  name,
  displayName: name,
  namespace: 'cli/api',
  description: `The ${name}.`,
  members: [{value: 'A', description: 'The a.'}],
  ...extra,
});

const schema = (/** @type {string} */ name, extra = {}) => ({
  type: 'schema',
  name,
  displayName: name,
  namespace: 'authoring',
  description: `The ${name} file.`,
  fields: [{name: 'x', type: 'string', description: 'The x.'}],
  ...extra,
});

/** Audit a fixture tree with nothing in the authoring topic's list. */
const audit = (/** @type {string} */ root, authoringSources = []) =>
  auditCliSelfDocs({root, authoringSources});

describe('the CLI docs this package ships', () => {
  it(
    'each declare a namespace something reads, and none fails, clashes, or overflows',
    async () => {
      const result = await auditCliSelfDocs();
      expect({
        missing: result.missing,
        unknown: result.unknown,
        misfiled: result.misfiled,
        failed: result.failed,
        oversized: result.oversized,
      }).toEqual({
        missing: [],
        unknown: [],
        misfiled: [],
        failed: [],
        oversized: [],
      });
      expect(result.docs).toBeGreaterThan(0);
      expect(result.tree + result.authoring).toBe(result.docs);
    },
    SLOW,
  );
});

describe('auditCliSelfDocs', () => {
  it('reports a doc with no namespace, and one nothing reads', async () => {
    const root = writeTree({
      'api/alpha/alpha.doc.mjs': docModule(fn('alpha', {namespace: undefined})),
      'clients/cli/commands/beta.doc.mjs': docModule(
        command('beta', {namespace: 'cli'}),
      ),
      'api/gamma/gamma.doc.mjs': docModule(fn('gamma')),
    });
    const result = await audit(root);
    expect(result.missing).toEqual(['api/alpha/alpha.doc.mjs']);
    expect(result.unknown).toEqual([
      {source: 'clients/cli/commands/beta.doc.mjs', namespace: 'cli'},
    ]);
    expect(result.tree).toBe(1);
  });

  it('holds the authoring namespace to the authoring topic list', async () => {
    const root = writeTree({
      'authoring/x/x.doc.mjs': docModule(schema('x')),
      'authoring/y/y.doc.mjs': docModule(schema('y', {namespace: 'cli/api'})),
      'authoring/z/z.doc.mjs': docModule(schema('z')),
    });
    const result = await audit(root, ['y/y.doc.mjs', 'z/z.doc.mjs']);
    expect(result.misfiled.map(entry => entry.message)).toEqual([
      `authoring/x/x.doc.mjs has namespace "authoring", but \`${formatCliCommand('docs authoring/field-reference')}\` does not list it`,
      `authoring/y/y.doc.mjs is read in \`${formatCliCommand('docs authoring/field-reference')}\`, but its namespace is "cli/api"`,
    ]);
    expect(result.authoring).toBe(1);
    expect(result.tree).toBe(0);
  });

  it('reports a doc that fails to load, and skips fixture directories', async () => {
    const root = writeTree({
      'api/bad/bad.doc.mjs': 'throw new Error("boom");\n',
      'api/__fixtures__/ghost.doc.mjs': docModule(fn('ghost')),
      'foundation/.hidden/hidden.doc.mjs': docModule(fn('hidden')),
      'foundation/codes.doc.mjs': docModule(enumDoc('codes')),
    });
    expect(discoverCliSelfDocSources(root)).toEqual([
      'api/bad/bad.doc.mjs',
      'foundation/codes.doc.mjs',
    ]);
    const result = await audit(root);
    expect(result.failed).toEqual([
      expect.objectContaining({
        source: 'api/bad/bad.doc.mjs',
        error: expect.stringContaining('boom'),
      }),
    ]);
    expect(result.tree).toBe(1);
  });

  it('reports a tree doc too large for one read', async () => {
    const root = writeTree({
      'api/big/big.doc.mjs': docModule(
        fn('big', {description: 'x'.repeat(2_000)}),
      ),
      'api/small/small.doc.mjs': docModule(fn('small')),
    });
    const result = await auditCliSelfDocs({root, authoringSources: [], budget: 1_000});
    expect(result.oversized.map(entry => entry.key)).toEqual(['big']);
  });

  it('names every namespace a CLI doc may declare, and what reads it', () => {
    expect(CLI_DOC_NAMESPACES).toEqual({
      'cli/commands': {reader: 'tree'},
      'cli/api': {reader: 'tree'},
      authoring: {reader: 'authoring'},
    });
  });
});

/**
 * An index whose routes are the ones the docs tree gives the CLI's own docs.
 * @param {any[]} docs
 */
const indexOf = docs =>
  cliDocIndex(docs, (kind, name) =>
    kind === 'command'
      ? `cli/commands/${routeSegment(name)}`
      : kind === 'function'
        ? `cli/api/functions/${routeSegment(name)}`
        : null,
  );

describe('cliDocSection', () => {
  it('links a command and the function it runs by identity, never by route', () => {
    const docs = [fn('docs', {command: 'docs'}), command('docs', {fn: 'docs'})];
    const index = indexOf(docs);
    expect(JSON.stringify(cliDocSection(docs[1], index).content)).toContain(
      'It runs `docs()` from `@astryxdesign/cli/api`. Read it with {@link function:docs}.',
    );
    expect(JSON.stringify(cliDocSection(docs[0], index).content)).toContain(
      '`astryx docs` runs it. Read it with {@link command:docs}.',
    );
  });

  it("links a function to the command its command line starts with, or to none", () => {
    const docs = [
      fn('integrationAddTheme', {command: 'integration add theme'}),
      command('integration add'),
      fn('gone', {command: 'gone away'}),
    ];
    const index = cliDocIndex(docs);
    expect(JSON.stringify(cliDocSection(docs[0], index).content)).toContain(
      '`astryx integration add theme` runs it. Read it with {@link command:integration add}.',
    );
    expect(JSON.stringify(cliDocSection(docs[2], index).content)).not.toContain(
      'runs it',
    );
  });

  it('renders a command: usage, arguments, options, examples, exit codes, subcommands', () => {
    const docs = [
      command('grp', {subcommands: ['sub', 'gone']}),
      command('grp sub', {
        description: 'The long form.',
        fn: 'grpSub',
        args: [
          {name: 'files', required: true, variadic: true, description: 'Files.'},
        ],
        options: [
          {flag: '--fast', description: 'Go fast'},
          {
            flag: '--mode <m>',
            description: 'Mode',
            choices: ['a', 'b'],
            default: 'a',
          },
          {flag: '--limit <n>', param: 'options.limit'},
          {flag: '--dry', description: 'Dry run.', default: false},
        ],
        examples: [
          {label: 'Run it', cli: 'astryx grp sub x'},
          {cli: 'astryx grp sub y'},
        ],
        exitCodes: [{code: 1, when: 'it fails'}],
      }),
      fn('grpSub', {
        params: [{name: 'options.limit', type: 'number', description: 'Max.'}],
      }),
    ];
    // `grp gone` has no doc, so it gets no line.
    const index = cliDocIndex(docs, (kind, name) =>
      kind === 'command' && name === 'grp gone'
        ? null
        : kind === 'command'
          ? `cli/commands/${routeSegment(name)}`
          : `cli/api/functions/${routeSegment(name)}`,
    );
    const group = cliDocSection(docs[0], index);
    const sub = cliDocSection(docs[1], index);
    expect(group.content).toContainEqual({
      type: 'list',
      style: 'unordered',
      items: ['`astryx grp sub`: {@link command:grp sub}'],
    });
    expect(sub).toMatchObject({id: 'grp-sub', title: 'astryx grp sub'});
    expect(sub.content).toEqual([
      {type: 'prose', text: 'Do grp sub'},
      {type: 'prose', text: 'The long form.'},
      {type: 'code', lang: 'bash', code: 'astryx grp sub <files...>'},
      {
        type: 'table',
        headers: ['Argument', 'Description'],
        rows: [['`files`', 'Files.']],
      },
      {
        type: 'table',
        headers: ['Option', 'Description'],
        rows: [
          ['`--fast`', 'Go fast'],
          ['`--mode <m>`', 'Mode. One of: `a`, `b`. Default: `a`.'],
          ['`--limit <n>`', 'Max.'],
          ['`--dry`', 'Dry run.'],
        ],
      },
      {
        type: 'code',
        lang: 'bash',
        code: '# Run it\nastryx grp sub x\nastryx grp sub y',
      },
      {
        type: 'table',
        headers: ['Exit code', 'When'],
        rows: [['1', 'it fails']],
      },
      {
        type: 'prose',
        text: 'It runs `grpSub()` from `@astryxdesign/cli/api`. Read it with {@link function:grpSub}.',
      },
    ]);
  });

  it('marks required parameters and adds a Default column when a parameter has a default', () => {
    const beta = fn('beta', {
      params: [
        {name: 'slug', type: 'string', description: 'The slug.', required: true},
        {name: 'options.limit', type: 'number', description: 'How many.', default: '20'},
      ],
    });
    const table = cliDocSection(beta, indexOf([beta])).content.find(
      (/** @type {any} */ block) => block.type === 'table',
    );
    expect(table).toEqual({
      type: 'table',
      headers: ['Parameter', 'Type', 'Default', 'Description'],
      rows: [
        ['`slug` (required)', '`string`', '', 'The slug.'],
        ['`options.limit`', '`number`', '20', 'How many.'],
      ],
    });
  });

  it('renders an API function, an enum, and a schema', () => {
    const alpha = fn('alpha', {
      description: 'Longer.',
      signature: 'alpha(x: string): Promise<Alpha>',
      params: [{name: 'x', type: 'string', description: 'The x.'}],
      throws: [{code: 'ERR_X', when: 'x is bad'}],
      examples: [{label: 'Call it', code: "await alpha('x');"}],
    });
    const codes = enumDoc('codes', {
      members: [
        {value: 'A', description: 'The a.'},
        {value: 'B', description: 'The b.', deprecated: 'Use A.'},
      ],
    });
    const output = schema('output', {namespace: 'cli/api'});
    const index = indexOf([alpha, codes, output]);
    expect(cliDocSection(alpha, index).content).toEqual([
      {type: 'prose', text: 'The alpha function.'},
      {type: 'prose', text: 'Longer.'},
      {type: 'code', lang: 'ts', code: 'alpha(x: string): Promise<Alpha>'},
      {type: 'prose', text: 'Import it from `@astryxdesign/cli/api`.'},
      {
        type: 'table',
        headers: ['Parameter', 'Type', 'Description'],
        rows: [['`x`', '`string`', 'The x.']],
      },
      {
        type: 'table',
        headers: ['Returns', 'Description'],
        rows: [['`alpha`', 'The result.']],
      },
      {
        type: 'table',
        headers: ['Throws', 'When'],
        rows: [['`ERR_X`', 'x is bad']],
      },
      {type: 'code', lang: 'ts', label: 'Call it', code: "await alpha('x');"},
    ]);
    expect(cliDocSection(codes, index)).toEqual({
      id: 'codes',
      title: 'codes',
      content: [
        {type: 'prose', text: 'The codes.'},
        {
          type: 'table',
          headers: ['Value', 'Meaning'],
          rows: [
            ['`A`', 'The a.'],
            ['`B`', 'The b. Deprecated: Use A.'],
          ],
        },
      ],
    });
    const rendered = cliDocSection(output, index);
    expect(rendered.id).toBe('output');
    expect(JSON.stringify(rendered.content)).toContain('The output file.');
  });
});
