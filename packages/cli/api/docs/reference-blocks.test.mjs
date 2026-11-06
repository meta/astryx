// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A topic section's `reference` block (spec:AST-047 FR9). A read
 * includes the doc it names from that doc's own source, narrowed by its
 * projection, and still returns only the stable block kinds. A block that
 * cannot include what it names fails the authoring check.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {docs} from './docs.mjs';
import {
  builtinCatalog,
  docsLinkProblems,
  linkResolver,
  loadDocsCatalog,
  projectTree,
} from './_adapter.mjs';
import {integrationDocConflicts} from '../integration/authoring-checks.mjs';
import {checkDocsTree} from '../doctor/doctor.mjs';
import {createDocId} from '../../foundation/identity/provider-identity.mjs';
import {CLI_PROVIDER_ID} from '../../foundation/identity/providers.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

const SLOW = 60_000;

/** The block kinds a read returns: a token reference and a reference block are inlined. */
const READ_KINDS = new Set(['prose', 'heading', 'code', 'table', 'list']);

/** The primary fixture: two fields of the CLI's integration manifest schema. */
const MANIFEST_FIELDS = {
  type: 'reference',
  target: '@astryxdesign/cli:schema:integration',
  projection: {fields: ['components', 'docs']},
};

/** A topic whose sections include canonical CLI docs. */
const SETUP = {
  type: 'generic',
  name: 'acme-setup',
  title: 'Acme setup',
  description: 'Set up the Acme kit.',
  sections: [
    {
      id: 'manifest',
      title: 'Point the manifest at your folders',
      content: [
        {type: 'prose', text: 'Add these fields to astryx.integration.mjs.'},
        MANIFEST_FIELDS,
      ],
    },
    {
      id: 'check',
      title: 'Check the docs',
      content: [
        {type: 'prose', text: 'Run the check before you publish.'},
        {
          type: 'reference',
          target: '@astryxdesign/cli:command:doctor integration docs',
          presentation: 'compact',
        },
      ],
    },
    {
      id: 'more',
      title: 'Read more',
      content: [
        {
          type: 'reference',
          target: '@astryxdesign/cli:function:docs',
          presentation: 'summary',
        },
        {type: 'reference', target: '@astryxdesign/cli:generic:theme'},
      ],
    },
  ],
};

/** A topic whose reference blocks each name something they cannot include. */
const BROKEN = {
  type: 'generic',
  name: 'acme-broken',
  title: 'Acme broken',
  description: 'References that include nothing.',
  sections: [
    {
      id: 'gaps',
      title: 'Gaps',
      content: [
        {
          type: 'reference',
          target: '@astryxdesign/cli:schema:integration',
          projection: {fields: ['components', 'nope']},
        },
        {type: 'reference', target: '@astryxdesign/cli:schema:nothing'},
        {
          type: 'reference',
          target: '@astryxdesign/cli:command:doctor',
          projection: {fields: ['--json']},
        },
        {
          type: 'reference',
          target: '@astryxdesign/cli:schema:config',
          projection: {sections: ['fields']},
        },
        {
          type: 'reference',
          target: '@astryxdesign/cli:generic:theme',
          presentation: 'full',
        },
      ],
    },
  ],
};

/** @type {string} */
let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-reference-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/**
 * A consumer project that configures `@acme/kit`, which ships these docs.
 * @param {Record<string, object>} files doc file name -> doc
 */
function scaffold(files) {
  fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name": "consumer"}\n');
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.config.mjs'),
    "export default {integrations: ['@acme/kit']};\n",
  );
  const kit = path.join(tmpDir, 'node_modules', '@acme', 'kit');
  fs.mkdirSync(path.join(kit, 'docs'), {recursive: true});
  fs.writeFileSync(
    path.join(kit, 'package.json'),
    JSON.stringify({name: '@acme/kit', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(kit, 'astryx.integration.mjs'),
    "export default {docs: './docs'};\n",
  );
  for (const [file, doc] of Object.entries(files)) {
    fs.writeFileSync(
      path.join(kit, 'docs', file),
      `export const docs = ${JSON.stringify(doc, null, 2)};\n`,
    );
  }
}

/**
 * @param {string} topic
 * @param {string} [section]
 */
async function read(topic, section) {
  return (await docs(topic, section, {cwd: tmpDir})).data;
}

describe('a reference block in a topic section', () => {
  it(
    'includes the fields a schema reference names, then where they come from',
    async () => {
      scaffold({'acme-setup.doc.mjs': SETUP});
      const section = await read('acme-setup', 'manifest');
      expect(section.content.map(block => block.type)).toEqual([
        'prose',
        'table',
        'prose',
      ]);
      const table = section.content[1];
      expect(table.headers).toEqual([
        'Field',
        'Type',
        'Required',
        'Description',
      ]);
      // The fields the block names, in the order it names them.
      expect(table.rows.map(row => row[0])).toEqual(['components', 'docs']);
      expect(section.content[2]).toEqual({
        type: 'prose',
        text: 'From Astryx Integration: `astryx docs authoring integration`',
      });
    },
    SLOW,
  );

  it(
    "reads the included fields from the schema's own doc, not a copy",
    async () => {
      scaffold({'acme-setup.doc.mjs': SETUP});
      const included = (await read('acme-setup', 'manifest')).content[1].rows;
      const schema = (await docs('authoring', 'integration')).data.content.find(
        block => block.type === 'table',
      );
      expect(included).toEqual(
        MANIFEST_FIELDS.projection.fields.map(name =>
          schema.rows.find(row => row[0] === name),
        ),
      );
    },
    SLOW,
  );

  it(
    'returns only the stable block kinds in every read, in JSON and in each language',
    async () => {
      scaffold({'acme-setup.doc.mjs': SETUP});
      for (const lang of [null, 'zh']) {
        const whole = (await docs('acme-setup', undefined, {cwd: tmpDir, lang}))
          .data;
        const kinds = new Set(
          whole.sections.flatMap(section => section.content.map(b => b.type)),
        );
        expect([...kinds].filter(kind => !READ_KINDS.has(kind))).toEqual([]);
        for (const {id} of whole.sections) {
          const one = (await docs('acme-setup', id, {cwd: tmpDir, lang})).data;
          expect(one.content.every(block => READ_KINDS.has(block.type))).toBe(
            true,
          );
        }
      }
    },
    SLOW,
  );

  it(
    'includes a whole command doc, without code when compact; a summary and a topic show as one line',
    async () => {
      scaffold({'acme-setup.doc.mjs': SETUP});
      const check = (await read('acme-setup', 'check')).content;
      expect(check.some(block => block.type === 'code')).toBe(false);
      expect(check.find(block => block.type === 'table')?.headers).toEqual([
        'Argument',
        'Description',
      ]);
      // The included doc's own links resolve against its own provider.
      expect(
        check.some(
          block =>
            block.type === 'prose' &&
            block.text.includes(
              'Read it with `astryx docs cli/api/functions/integration-doc-conflicts`.',
            ),
        ),
      ).toBe(true);
      expect(check.at(-1)).toEqual({
        type: 'prose',
        text: 'From astryx doctor integration docs: `astryx docs cli/commands/doctor-integration-docs`',
      });
      const more = (await read('acme-setup', 'more')).content;
      expect(more).toHaveLength(2);
      expect(more[0].text).toMatch(
        /^docs\(\): Read the reference docs: .* Read it with `astryx docs cli\/api\/functions\/docs`\.$/,
      );
      expect(more[1].text).toMatch(
        /^Theming: .* Read it with `astryx docs theme`\.$/,
      );
    },
    SLOW,
  );

  it(
    'prints the included content in text',
    async () => {
      scaffold({'acme-setup.doc.mjs': SETUP});
      const {status, stdout} = await runCli(
        ['docs', 'acme-setup', 'manifest'],
        tmpDir,
      );
      expect(status).toBe(0);
      expect(stdout).toMatch(/^Field +\| Type +\| Required +\| Description/m);
      expect(stdout).toMatch(/^components +\| string +\| no +\| /m);
      expect(stdout).toContain(' docs authoring integration`');
    },
    SLOW,
  );
});

describe('a reference block that includes what it names', () => {
  it(
    'passes the authoring check',
    async () => {
      scaffold({'acme-setup.doc.mjs': SETUP});
      const {data} = await integrationDocConflicts('@acme/kit', {cwd: tmpDir});
      expect(data.issues).toEqual([]);
      const cli = await runCli(
        ['doctor', 'integration', 'docs', '@acme/kit'],
        tmpDir,
      );
      expect(cli.status).toBe(0);
    },
    SLOW,
  );
});

describe('what a reference block names', () => {
  it('resolves a CLI authoring schema by identity, to its section of the field reference', async () => {
    const resolve = await linkResolver(builtinCatalog(), CLI_PROVIDER_ID);
    expect(await resolve('schema:integration')).toMatchObject({
      id: createDocId(CLI_PROVIDER_ID, 'schema', 'integration'),
      route: 'authoring/field-reference',
      title: 'Astryx Integration',
      command: 'astryx docs authoring integration',
    });
    const opened = await docs('authoring', 'integration');
    expect(opened.type).toBe('docs.detail.section');
    expect(opened.data.id).toBe('integration');
  });

  it(
    "leaves no reference in the CLI's own docs that cannot include what it names",
    async () => {
      const catalog = builtinCatalog();
      expect(
        await docsLinkProblems(catalog, await projectTree(catalog), {
          references: true,
        }),
      ).toEqual([]);
    },
    SLOW,
  );
});

describe('a reference block that cannot include what it names', () => {
  it(
    'fails the authoring check, once for each part it cannot include',
    async () => {
      scaffold({'acme-broken.doc.mjs': BROKEN});
      const {data} = await integrationDocConflicts('@acme/kit', {cwd: tmpDir});
      const errors = data.issues.filter(
        issue => issue.code === 'invalid_doc_reference',
      );
      expect(errors.every(issue => issue.severity === 'error')).toBe(true);
      const messages = errors.map(issue => issue.message);
      expect(messages).toHaveLength(5);
      expect(messages[0]).toMatch(
        /^acme-broken § gaps: projection\.fields: "nope" is not a field of Astryx Integration/,
      );
      expect(messages[1]).toMatch(
        /"@astryxdesign\/cli:schema:nothing" names no doc/,
      );
      expect(messages[2]).toMatch(
        /projection\.fields: names the fields of a schema doc/,
      );
      expect(messages[3]).toMatch(/projection\.sections: /);
      expect(messages[4]).toMatch(
        /"@astryxdesign\/cli:generic:theme" is a topic/,
      );
      // They are not also reported as links that print as written.
      expect(
        data.issues.filter(issue => issue.code === 'invalid_doc_graph'),
      ).toEqual([]);
      const cli = await runCli(
        ['doctor', 'integration', 'docs', '@acme/kit'],
        tmpDir,
      );
      expect(cli.status).toBe(1);
    },
    SLOW,
  );

  it(
    'marks the missing content where a read would show it',
    async () => {
      scaffold({'acme-broken.doc.mjs': BROKEN});
      const texts = (await read('acme-broken', 'gaps')).content
        .filter(block => block.type === 'prose')
        .map(block => block.text);
      expect(texts).toContain(
        '[reference: field "nope" not found in "@astryxdesign/cli:schema:integration"]',
      );
      expect(texts).toContain(
        '[reference: "@astryxdesign/cli:schema:nothing" names no doc]',
      );
      // The field it could include is still there.
      const table = (await read('acme-broken', 'gaps')).content.find(
        block => block.type === 'table',
      );
      expect(table.rows.map(row => row[0])).toEqual(['components']);
    },
    SLOW,
  );

  it(
    "warns in a project's doctor, which an app cannot fix",
    async () => {
      scaffold({'acme-broken.doc.mjs': BROKEN});
      const check = await checkDocsTree({
        docsCatalog: await loadDocsCatalog(tmpDir),
      });
      expect(check.status).toBe('warn');
      expect(check.message).toContain(
        '"nope" is not a field of Astryx Integration',
      );
    },
    SLOW,
  );
});
