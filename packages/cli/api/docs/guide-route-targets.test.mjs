// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file An integration's flat topic replaces or extends a guide the docs tree
 * places, by its route, and an extension places its sections with `before` or
 * `after`. Every read names the package of the guide and of each section, in
 * text and JSON (architecture:cli-surface INV28). A route that holds no guide,
 * and a `before`/`after` that names no section, fail nothing: they are listed
 * notes (INV35).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {docs} from './docs.mjs';
import {integrationDocConflicts} from '../integration/authoring-checks.mjs';
import {validateIntegration} from '../integration/validate-integration.mjs';
import {integrationCheck} from '../integration/check/check.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
import {search} from '../search/search.mjs';
import {sectionPositionCliProblem} from '../../foundation/integrations/cli-requirement.mjs';
import {
  DocsCatalog,
  mergeTopic,
} from '../../foundation/discovery/docs-discovery.mjs';

const SLOW = 60_000;
const CLI = '@astryxdesign/cli';
const KIT = '@acme/kit';
const GUIDE = 'authoring/quick-start';

/** @type {string} */
let tmpDir;

/**
 * A flat topic of the kit.
 * @param {string} name
 * @param {object} fields
 */
function topic(name, fields) {
  return {
    type: 'generic',
    name,
    title: `Acme ${name}`,
    description: `The Acme ${name}.`,
    sections: [
      {
        id: `acme-${name}`,
        title: `Acme ${name}`,
        content: [{type: 'prose', text: `Acme ${name}.`}],
      },
    ],
    ...fields,
  };
}

/**
 * One section of an extension.
 * @param {string} id
 * @param {object} [fields]
 */
function section(id, fields = {}) {
  return {
    id,
    title: id.replace(/-/g, ' '),
    content: [{type: 'prose', text: `Acme ${id}.`}],
    ...fields,
  };
}

/** The installed kit's folder. */
const kitDir = () => path.join(tmpDir, 'node_modules', '@acme', 'kit');

/**
 * A project that configures `@acme/kit`, which ships these docs.
 * @param {Record<string, object>} files
 */
function scaffold(files) {
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: 'consumer'}),
  );
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.config.mjs'),
    `export default {integrations: ['${KIT}']};\n`,
  );
  fs.mkdirSync(path.join(kitDir(), 'docs'), {recursive: true});
  fs.writeFileSync(
    path.join(kitDir(), 'package.json'),
    JSON.stringify({name: KIT, version: '1.0.0', type: 'module'}),
  );
  fs.writeFileSync(
    path.join(kitDir(), 'astryx.integration.mjs'),
    "export default {docs: './docs'};\n",
  );
  for (const [file, doc] of Object.entries(files)) {
    fs.writeFileSync(
      path.join(kitDir(), 'docs', file),
      `export default ${JSON.stringify(doc, null, 2)};\n`,
    );
  }
}

/** @param {string[]} args */
async function cliText(args) {
  const {status, stdout} = await runCli(args, tmpDir);
  return {status, stdout};
}

/** @param {string[]} args */
async function cliJson(args) {
  const {status, stdout} = await runCli(['--json', ...args], tmpDir);
  return {status, json: JSON.parse(stdout)};
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(
    path.join(process.cwd(), '.astryx-guide-route-targets-'),
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('a flat topic that replaces a placed guide by its route', () => {
  beforeEach(() => {
    scaffold({
      'quick-start.doc.mjs': topic('quick-start', {replaces: GUIDE}),
    });
  });

  it(
    'is read at the route, naming its package and the one it replaced',
    async () => {
      const read = await docs(GUIDE, undefined, {cwd: tmpDir});
      expect(Object.keys(read).slice(0, 2)).toEqual(['type', 'package']);
      expect(read).toMatchObject({type: 'docs.detail', package: KIT});
      expect(read.data).toMatchObject({
        name: GUIDE,
        title: 'Acme quick-start',
        replaces: GUIDE,
        replacedPackage: CLI,
      });
      expect(read.data.sections.map(s => [s.id, s.package])).toEqual([
        ['acme-quick-start', KIT],
      ]);

      const index = await docs(GUIDE, undefined, {cwd: tmpDir, index: true});
      expect(index).toMatchObject({type: 'docs.index', package: KIT});
      expect(index.data).toMatchObject({replaces: GUIDE, replacedPackage: CLI});
      expect(index.data.sections.every(s => s.package === KIT)).toBe(true);
    },
    SLOW,
  );

  it(
    'lists under its own package where its namespace lists the guide',
    async () => {
      const parent = await docs('authoring', undefined, {cwd: tmpDir});
      const child = parent.data.slots
        .flatMap(slot => slot.children)
        .find(each => each.route === GUIDE);
      expect(child).toMatchObject({
        package: KIT,
        replaces: GUIDE,
        replacedPackage: CLI,
        title: 'Acme quick-start',
      });
      const text = await cliText(['docs', 'authoring']);
      expect(text.stdout).toContain(`quick-start (${KIT})`);
    },
    SLOW,
  );

  it(
    'names both packages in text, the replaced one right after package:',
    async () => {
      for (const args of [
        ['docs', GUIDE],
        ['docs', GUIDE, '--full'],
      ]) {
        const {status, stdout} = await cliText(args);
        expect(status).toBe(0);
        expect(stdout).toMatch(
          new RegExp(
            `package: +${KIT.replace('/', '\\/')}\\s*\\n+replaces ${CLI.replace('/', '\\/')}'s ${GUIDE.replace('/', '\\/')}`,
          ),
        );
      }
      const {json} = await cliJson(['docs', GUIDE, '--full']);
      expect(json).toMatchObject({package: KIT, data: {replacedPackage: CLI}});
    },
    SLOW,
  );

  it(
    'is an intentional override to doctor integration docs, with no issue',
    async () => {
      const result = await integrationDocConflicts(KIT, {cwd: tmpDir});
      expect(result.data.findings).toContainEqual(
        expect.objectContaining({
          topic: 'quick-start',
          severity: 'info',
          relationship: 'replaces',
          coreTopic: GUIDE,
        }),
      );
      expect(result.data.issues).toEqual([]);
    },
    SLOW,
  );
});

describe('a flat topic that extends a placed guide by its route', () => {
  /** @param {object[]} sections */
  const extend = sections =>
    scaffold({
      'quick-start-acme.doc.mjs': topic('quick-start-acme', {
        extends: GUIDE,
        sections,
      }),
    });

  it(
    'places each section before or after a key, or at the end, naming its package',
    async () => {
      extend([
        section('acme-registry', {before: 'fill-in-package-json'}),
        section('acme-login', {after: 'quick-start'}),
        section('acme-support'),
        // Replaces the guide's section in place, by its key.
        {...section('global-mode'), title: 'In global mode, at Acme'},
      ]);
      const index = await docs(GUIDE, undefined, {cwd: tmpDir, index: true});
      expect(index.package).toBe(CLI);
      expect(index.data.replaces).toBeUndefined();
      expect(index.data.sections.map(s => [s.id, s.package])).toEqual([
        ['quick-start', CLI],
        ['acme-login', KIT],
        ['acme-registry', KIT],
        ['fill-in-package-json', CLI],
        ['the-integration-file', CLI],
        ['global-mode', KIT],
        ['acme-support', KIT],
      ]);

      const read = await docs(GUIDE, undefined, {cwd: tmpDir});
      expect(read.package).toBe(CLI);
      expect(read.data.replacedPackage).toBeUndefined();
      // Readers never see the placing fields.
      for (const each of read.data.sections) {
        expect(each).not.toHaveProperty('before');
        expect(each).not.toHaveProperty('after');
      }
      expect(read.data.sections.find(s => s.id === 'acme-login').package).toBe(
        KIT,
      );
    },
    SLOW,
  );

  it(
    'labels each section it adds once, in text',
    async () => {
      extend([
        section('acme-login', {after: 'quick-start', title: `Log in (${KIT})`}),
        section('acme-support', {title: 'Acme support'}),
      ]);
      const index = await cliText(['docs', GUIDE]);
      expect(index.stdout).toContain(`package: ${CLI}`);
      expect(index.stdout).not.toContain(`replaces ${CLI}`);
      expect(index.stdout).toContain(`Acme support (${KIT})`);
      expect(index.stdout).toContain(`Log in (${KIT})`);
      expect(index.stdout).not.toContain(`(${KIT}) (${KIT})`);
      const full = await cliText(['docs', GUIDE, '--full']);
      expect(full.stdout).toContain(`Acme support (${KIT})`);
      expect(full.stdout).not.toContain(`(${KIT}) (${KIT})`);
      const one = await cliJson(['docs', GUIDE, 'acme-support']);
      expect(one.json).toMatchObject({package: KIT});
    },
    SLOW,
  );

  it(
    'adds a section whose key names no section at the end, as a listed note',
    async () => {
      extend([section('acme-registry', {before: 'no-such-section'})]);
      const index = await docs(GUIDE, undefined, {cwd: tmpDir, index: true});
      expect(index.data.sections.at(-1)).toMatchObject({
        id: 'acme-registry',
        package: KIT,
      });
      const validated = await validateIntegration(KIT, {cwd: tmpDir});
      expect(validated.data.issues).toEqual([]);
      expect(validated.data.notes).toContainEqual({
        code: 'doc_section_unplaced',
        message: expect.stringContaining('"no-such-section"'),
        next: true,
      });
      const docsCheck = await integrationDocConflicts(KIT, {cwd: tmpDir});
      expect(docsCheck.data.issues).toEqual([]);
      expect(docsCheck.data.findings).toContainEqual(
        expect.objectContaining({relationship: 'extends', coreTopic: GUIDE}),
      );
    },
    SLOW,
  );

  it(
    'places sections in a flat topic it extends the same way',
    async () => {
      scaffold({
        'theme-acme.doc.mjs': topic('theme-acme', {
          extends: 'theme',
          sections: [
            section('acme-theme', {before: 'creating-a-custom-theme'}),
          ],
        }),
      });
      const index = await docs('theme', undefined, {cwd: tmpDir, index: true});
      const ids = index.data.sections.map(s => s.id);
      expect(ids.indexOf('acme-theme')).toBe(
        ids.indexOf('creating-a-custom-theme') - 1,
      );
      expect(index.data.sections.find(s => s.id === 'acme-theme').package).toBe(
        KIT,
      );
    },
    SLOW,
  );

  it(
    'refuses a section that sets both before and after, as before',
    async () => {
      extend([
        section('acme-x', {before: 'quick-start', after: 'quick-start'}),
      ]);
      const result = await integrationDocConflicts(KIT, {cwd: tmpDir});
      expect(result.data.issues).toContainEqual(
        expect.objectContaining({code: 'invalid_doc', severity: 'error'}),
      );
    },
    SLOW,
  );
});

describe('a route that holds no guide', () => {
  it(
    'changes nothing and fails nothing, as a listed note',
    async () => {
      scaffold({
        'quick-start.doc.mjs': topic('quick-start', {
          replaces: 'authoring/no-such-guide',
        }),
      });
      const read = await docs(GUIDE, undefined, {cwd: tmpDir});
      expect(read.package).toBe(CLI);

      const validated = await validateIntegration(KIT, {cwd: tmpDir});
      expect(validated.data.issues).toEqual([]);
      expect(validated.data.notes).toContainEqual({
        code: 'doc_target_not_found',
        message: expect.stringContaining('"authoring/no-such-guide"'),
        next: true,
      });
      const docsCheck = await integrationDocConflicts(KIT, {cwd: tmpDir});
      expect(docsCheck.data.issues).toEqual([]);

      const check = await integrationCheck({cwd: kitDir(), strict: true});
      expect(check.data.failed).toBe(false);
    },
    SLOW,
  );
});

describe('a flat topic that replaces a flat topic', () => {
  it(
    'names the package it replaced in the list, the index, and text',
    async () => {
      scaffold({
        'acme-start.doc.mjs': topic('acme-start', {
          replaces: 'getting-started',
        }),
      });
      const listed = await docs(undefined, undefined, {cwd: tmpDir});
      expect(listed.data.find(t => t.topic === 'acme-start')).toMatchObject({
        package: KIT,
        replaces: 'getting-started',
        replacedPackage: CLI,
      });
      const index = await docs('acme-start', undefined, {
        cwd: tmpDir,
        index: true,
      });
      expect(index.data).toMatchObject({
        replaces: 'getting-started',
        replacedPackage: CLI,
      });
      const {stdout} = await cliText(['docs', 'getting-started']);
      expect(stdout).toContain(`replaces ${CLI}'s getting-started`);
    },
    SLOW,
  );
});

describe('a doc that names a namespace instead of a guide', () => {
  it.each(['extends', 'replaces'])(
    'changes nothing with %s, as a note naming the guides below it',
    async relationship => {
      scaffold({
        'authoring-acme.doc.mjs': topic('authoring-acme', {
          [relationship]: 'authoring',
          sections: [section('make-it-at-acme')],
        }),
      });
      const validated = await validateIntegration(KIT, {cwd: tmpDir});
      expect(validated.data.issues).toEqual([]);
      const note = validated.data.notes?.find(
        each => each.code === 'doc_target_not_found',
      );
      expect(note?.message).toContain('"authoring", which is a namespace');
      expect(note?.message).toContain('authoring/field-reference');
      const check = await integrationCheck({cwd: kitDir(), strict: true});
      expect(check.data.failed).toBe(false);
    },
    SLOW,
  );

  it(
    'extends a guide below it by its route, labeled with its package',
    async () => {
      scaffold({
        'authoring-acme.doc.mjs': topic('authoring-acme', {
          extends: 'authoring/field-reference',
          sections: [
            section('make-it-at-acme', {title: 'At Acme: make it in the kit'}),
          ],
        }),
      });
      const read = await docs('authoring/field-reference', 'make-it-at-acme', {
        cwd: tmpDir,
      });
      expect(read).toMatchObject({type: 'docs.detail.section', package: KIT});
      const {stdout} = await cliText(['docs', 'authoring/field-reference']);
      expect(stdout).toContain(`At Acme: make it in the kit (${KIT})`);
      const docsCheck = await integrationDocConflicts(KIT, {cwd: tmpDir});
      expect(docsCheck.data.findings).toContainEqual(
        expect.objectContaining({
          relationship: 'extends',
          coreTopic: 'authoring/field-reference',
        }),
      );
    },
    SLOW,
  );
});

describe('a route that moved', () => {
  it(
    'applies to the guide at the route it moved to',
    async () => {
      scaffold({
        'quick-start.doc.mjs': topic('quick-start', {
          replaces: 'cli/integrations/quick-start',
        }),
      });
      const read = await docs(GUIDE, undefined, {cwd: tmpDir});
      expect(read).toMatchObject({
        package: KIT,
        data: {replaces: GUIDE, replacedPackage: CLI},
      });
      const index = await docs(GUIDE, undefined, {cwd: tmpDir, index: true});
      expect(index.data.replaces).toBe(GUIDE);
      const {stdout} = await cliText(['docs', GUIDE, '--full']);
      expect(stdout).toContain(`replaces ${CLI}'s ${GUIDE}`);
      expect(stdout).not.toContain('cli/integrations');
      const validated = await validateIntegration(KIT, {cwd: tmpDir});
      expect(
        (validated.data.notes ?? []).filter(n => n.code.startsWith('doc_')),
      ).toEqual([]);
    },
    SLOW,
  );
});

describe('review follow-ups', () => {
  it('keeps the authored order of sections placed after one key', () => {
    const merged = mergeTopic(
      {
        sections: [
          {id: 'a', title: 'A', content: []},
          {id: 'b', title: 'B', content: []},
        ],
      },
      {
        sections: [
          {id: 'first', title: 'First', after: 'a', content: []},
          {id: 'second', title: 'Second', after: 'a', content: []},
          {id: 'zero', title: 'Zero', before: 'b', content: []},
        ],
      },
    );
    expect(merged.sections.map(each => each.id)).toEqual([
      'a',
      'first',
      'second',
      'zero',
      'b',
    ]);
  });

  it(
    'never reads back before or after, on a doc that extends nothing',
    async () => {
      scaffold({
        'plain.doc.mjs': topic('plain', {
          sections: [section('only', {after: 'nothing'})],
        }),
      });
      const read = await docs('plain', undefined, {cwd: tmpDir});
      expect(read.data.sections[0]).not.toHaveProperty('after');
    },
    SLOW,
  );

  it(
    'names the replacing and extending packages in search, as reads do',
    async () => {
      scaffold({
        'quick-start.doc.mjs': topic('quick-start', {
          replaces: GUIDE,
          sections: [section('acme-zebra-registry')],
        }),
        'field-ref.doc.mjs': topic('field-ref', {
          extends: 'authoring/field-reference',
          sections: [section('acme-walrus-login')],
        }),
      });
      for (const [query, route] of [
        ['acme zebra registry', GUIDE],
        ['acme walrus login', 'authoring/field-reference'],
      ]) {
        const found = await search(query, {cwd: tmpDir, type: 'doc'});
        // The best hit is the integration's text, at the guide's route.
        expect(found.data.results[0]).toMatchObject({
          name: route,
          package: KIT,
        });
      }
    },
    SLOW,
  );

  it(
    'checks the links in a doc that targets a guide by its route',
    async () => {
      scaffold({
        'field-ref.doc.mjs': topic('field-ref', {
          extends: 'authoring/field-reference',
          sections: [
            {
              id: 'acme-link',
              title: 'Acme link',
              content: [
                {type: 'prose', text: 'See {@link generic:no-such-acme-doc}.'},
              ],
            },
          ],
        }),
      });
      const result = await integrationDocConflicts(KIT, {cwd: tmpDir});
      expect(result.data.issues).toContainEqual(
        expect.objectContaining({
          code: 'invalid_doc_graph',
          message: expect.stringContaining('no-such-acme-doc'),
        }),
      );
    },
    SLOW,
  );

  it(
    'lets the later of two replacements of one guide win, failing nothing',
    async () => {
      const catalog = DocsCatalog.fromBuiltins();
      const record = (/** @type {string} */ pkg) => ({
        name: `${pkg.split('/')[1]}-start`,
        package: pkg,
        path: `/x/${pkg}.doc.mjs`,
        replaces: GUIDE,
      });
      expect(catalog.add(record('@acme/one'))).toBeNull();
      expect(catalog.add(record('@acme/two'))).toBeNull();
      expect(catalog.guideOverlay(GUIDE)).toMatchObject({
        replacement: {package: '@acme/two'},
        replacedPackage: '@acme/one',
      });

      scaffold({
        'a.doc.mjs': topic('acme-a', {replaces: GUIDE}),
        'b.doc.mjs': topic('acme-b', {replaces: GUIDE}),
      });
      const validated = await validateIntegration(KIT, {cwd: tmpDir});
      expect(validated.data.issues).toEqual([]);
      expect(validated.data.notes).toContainEqual({
        code: 'duplicate_guide_replacement',
        message: expect.stringContaining('"acme-b", is read'),
        next: true,
      });
      const check = await integrationCheck({cwd: kitDir(), strict: true});
      expect(check.data.failed).toBe(false);
    },
    SLOW,
  );
});

describe('second review follow-ups', () => {
  it(
    'names the earlier replacer in the namespace listing too',
    async () => {
      scaffold({
        'a.doc.mjs': topic('acme-a', {replaces: GUIDE}),
        'b.doc.mjs': topic('acme-b', {replaces: GUIDE}),
      });
      const parent = await docs('authoring', undefined, {cwd: tmpDir});
      const child = parent.data.slots
        .flatMap(slot => slot.children)
        .find(each => each.route === GUIDE);
      const read = await docs(GUIDE, undefined, {cwd: tmpDir});
      expect(child?.replacedPackage).toBe(read.data.replacedPackage);
      expect(child?.title).toBe('Acme acme-b');
    },
    SLOW,
  );

  it(
    'stacks docs that name a guide by its old and its new route, in order',
    async () => {
      scaffold({
        'a.doc.mjs': topic('acme-a', {
          replaces: 'cli/integrations/quick-start',
        }),
        'b.doc.mjs': topic('acme-b', {
          extends: GUIDE,
          sections: [section('acme-extra')],
        }),
      });
      const index = await docs(GUIDE, undefined, {cwd: tmpDir, index: true});
      expect(index.data.sections.map(each => each.id)).toEqual([
        'acme-acme-a',
        'acme-extra',
      ]);
    },
    SLOW,
  );

  it(
    'lets a later replacement by the old route drop an earlier extension',
    async () => {
      scaffold({
        'a.doc.mjs': topic('acme-a', {
          extends: GUIDE,
          sections: [section('acme-extra')],
        }),
        'b.doc.mjs': topic('acme-b', {
          replaces: 'cli/integrations/quick-start',
        }),
      });
      const index = await docs(GUIDE, undefined, {cwd: tmpDir, index: true});
      expect(index.data.sections.map(each => each.id)).toEqual(['acme-acme-b']);
    },
    SLOW,
  );

  it('asks a package that places sections for a CLI that reads before and after', () => {
    expect(
      sectionPositionCliProblem({
        peerDependencies: {'@astryxdesign/cli': '>=0.6.0'},
      }),
    ).toContain('`before` or `after`');
    expect(
      sectionPositionCliProblem({
        peerDependencies: {'@astryxdesign/cli': '>=0.7.4'},
      }),
    ).toBeNull();
  });
});

describe('third review follow-ups', () => {
  /**
   * A project that configures two kits, each with these docs.
   * @param {Record<string, object>} one
   * @param {Record<string, object>} two
   */
  function scaffoldTwo(one, two) {
    scaffold(one);
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.config.mjs'),
      `export default {integrations: ['${KIT}', '@acme/more']};\n`,
    );
    const dir = path.join(tmpDir, 'node_modules', '@acme', 'more');
    fs.mkdirSync(path.join(dir, 'docs'), {recursive: true});
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({name: '@acme/more', version: '1.0.0', type: 'module'}),
    );
    fs.writeFileSync(
      path.join(dir, 'astryx.integration.mjs'),
      "export default {docs: './docs'};\n",
    );
    for (const [file, doc] of Object.entries(two)) {
      fs.writeFileSync(
        path.join(dir, 'docs', file),
        `export default ${JSON.stringify(doc, null, 2)};\n`,
      );
    }
  }

  it(
    'keeps configured order for sections two packages place after one key',
    async () => {
      scaffoldTwo(
        {
          'a.doc.mjs': topic('acme-a', {
            extends: GUIDE,
            sections: [section('acme-first', {after: 'quick-start'})],
          }),
        },
        {
          'b.doc.mjs': topic('acme-b', {
            extends: GUIDE,
            sections: [section('acme-second', {after: 'quick-start'})],
          }),
        },
      );
      const index = await docs(GUIDE, undefined, {cwd: tmpDir, index: true});
      expect(
        index.data.sections.slice(0, 3).map(s => [s.id, s.package]),
      ).toEqual([
        ['quick-start', CLI],
        ['acme-first', KIT],
        ['acme-second', '@acme/more'],
      ]);
    },
    SLOW,
  );

  it(
    'notes one package replacing a guide by its old and its new route',
    async () => {
      scaffold({
        'a.doc.mjs': topic('acme-a', {
          replaces: 'cli/integrations/quick-start',
        }),
        'b.doc.mjs': topic('acme-b', {replaces: GUIDE}),
      });
      const validated = await validateIntegration(KIT, {cwd: tmpDir});
      expect(validated.data.notes).toContainEqual({
        code: 'duplicate_guide_replacement',
        message: expect.stringContaining('"acme-b", is read'),
        next: true,
      });
    },
    SLOW,
  );
});

describe('fourth review follow-ups', () => {
  /**
   * Add another configured package that ships these docs.
   * @param {string} pkg
   * @param {Record<string, object>} files
   */
  function addPackage(pkg, files) {
    const config = path.join(tmpDir, 'astryx.config.mjs');
    const listed = fs.readFileSync(config, 'utf8').match(/\[(.*)\]/)?.[1] ?? '';
    fs.writeFileSync(
      config,
      `export default {integrations: [${listed}, '${pkg}']};\n`,
    );
    const dir = path.join(tmpDir, 'node_modules', ...pkg.split('/'));
    fs.mkdirSync(path.join(dir, 'docs'), {recursive: true});
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({name: pkg, version: '1.0.0', type: 'module'}),
    );
    fs.writeFileSync(
      path.join(dir, 'astryx.integration.mjs'),
      "export default {docs: './docs'};\n",
    );
    for (const [file, doc] of Object.entries(files)) {
      fs.writeFileSync(
        path.join(dir, 'docs', file),
        `export default ${JSON.stringify(doc, null, 2)};\n`,
      );
    }
  }

  it(
    'keeps the place of a placed section that a later package replaces',
    async () => {
      scaffold({
        'a.doc.mjs': topic('acme-a', {
          extends: GUIDE,
          sections: [section('acme-first', {after: 'quick-start'})],
        }),
      });
      addPackage('@acme/two', {
        'b.doc.mjs': topic('acme-b', {
          extends: GUIDE,
          sections: [{...section('acme-first'), title: 'First, revised'}],
        }),
      });
      addPackage('@acme/three', {
        'c.doc.mjs': topic('acme-c', {
          extends: GUIDE,
          sections: [section('acme-third', {after: 'quick-start'})],
        }),
      });
      const index = await docs(GUIDE, undefined, {cwd: tmpDir, index: true});
      expect(
        index.data.sections.slice(0, 3).map(s => [s.id, s.package]),
      ).toEqual([
        ['quick-start', CLI],
        ['acme-first', '@acme/two'],
        ['acme-third', '@acme/three'],
      ]);
    },
    SLOW,
  );
});

describe('fifth review follow-ups', () => {
  it(
    'does not call a route replacement named like a CLI topic an accidental conflict',
    async () => {
      scaffold({
        'getting-started.doc.mjs': topic('getting-started', {replaces: GUIDE}),
      });
      const result = await integrationDocConflicts(KIT, {cwd: tmpDir});
      expect(result.data.issues).toEqual([]);
      expect(
        result.data.findings.filter(each => each.relationship === 'accidental'),
      ).toEqual([]);
      const listed = await docs(undefined, undefined, {cwd: tmpDir});
      expect(
        listed.data.find(each => each.topic === 'getting-started')?.package,
      ).toBe(CLI);
    },
    SLOW,
  );

  it(
    'names what a topic replaced twice took over the same way in every read',
    async () => {
      scaffold({
        'a.doc.mjs': topic('acme-a', {replaces: 'getting-started'}),
        'b.doc.mjs': topic('acme-b', {replaces: 'getting-started'}),
      });
      const listed = await docs(undefined, undefined, {cwd: tmpDir});
      const item = listed.data.find(each => each.topic === 'acme-b');
      const index = await docs('acme-b', undefined, {cwd: tmpDir, index: true});
      const read = await docs('acme-b', undefined, {cwd: tmpDir});
      expect(index.data.replaces).toBe(item?.replaces);
      expect(read.data.replaces).toBe(item?.replaces);
      expect(read.data.replacedPackage).toBe(item?.replacedPackage);
    },
    SLOW,
  );
});

describe('whole-diff self-review', () => {
  it('keeps a chain of after placements in order across packages', () => {
    let doc = {
      sections: [
        {id: 'x', title: 'X', content: []},
        {id: 'y', title: 'Y', content: []},
      ],
    };
    for (const overlay of [
      {sections: [{id: 'first', title: 'First', after: 'x', content: []}]},
      {sections: [{id: 'second', title: 'Second', after: 'x', content: []}]},
      {
        sections: [
          {
            id: 'under-first',
            title: 'Under first',
            after: 'first',
            content: [],
          },
        ],
      },
      {
        sections: [
          {
            id: 'before-second',
            title: 'Before second',
            before: 'second',
            content: [],
          },
        ],
      },
      {sections: [{id: 'last', title: 'Last', after: 'x', content: []}]},
    ]) {
      doc = mergeTopic(doc, overlay);
    }
    expect(doc.sections.map((/** @type {any} */ each) => each.id)).toEqual([
      'x',
      'first',
      'under-first',
      'before-second',
      'second',
      'last',
      'y',
    ]);
  });

  it(
    'counts a key an earlier doc of the package adds as a section of the guide',
    async () => {
      scaffold({
        'a.doc.mjs': topic('acme-a', {
          extends: GUIDE,
          sections: [section('acme-x', {after: 'quick-start'})],
        }),
        'b.doc.mjs': topic('acme-b', {
          extends: GUIDE,
          sections: [section('acme-y', {after: 'acme-x'})],
        }),
      });
      const index = await docs(GUIDE, undefined, {cwd: tmpDir, index: true});
      expect(index.data.sections.slice(0, 3).map(s => s.id)).toEqual([
        'quick-start',
        'acme-x',
        'acme-y',
      ]);
      const validated = await validateIntegration(KIT, {cwd: tmpDir});
      expect(
        (validated.data.notes ?? []).filter(
          n => n.code === 'doc_section_unplaced',
        ),
      ).toEqual([]);
    },
    SLOW,
  );

  it(
    'still notes a key no doc of the target adds, with earlier extensions merged',
    async () => {
      scaffold({
        'a.doc.mjs': topic('acme-a', {
          extends: GUIDE,
          sections: [section('acme-x', {after: 'quick-start'})],
        }),
        'b.doc.mjs': topic('acme-b', {
          extends: GUIDE,
          sections: [section('acme-y', {after: 'acme-nope'})],
        }),
      });
      const validated = await validateIntegration(KIT, {cwd: tmpDir});
      expect(
        (validated.data.notes ?? []).filter(
          n => n.code === 'doc_section_unplaced',
        ),
      ).toEqual([
        expect.objectContaining({
          message: expect.stringContaining('"acme-nope"'),
        }),
      ]);
    },
    SLOW,
  );
});

describe('old routes in messages', () => {
  it(
    'names the guide at its route now in notes and doctor findings',
    async () => {
      scaffold({
        'a.doc.mjs': topic('acme-a', {
          extends: 'cli/integrations/quick-start',
          sections: [section('acme-x', {after: 'acme-nope'})],
        }),
      });
      const validated = await validateIntegration(KIT, {cwd: tmpDir});
      const note = (validated.data.notes ?? []).find(
        n => n.code === 'doc_section_unplaced',
      );
      expect(note?.message).toContain(`docs ${GUIDE} --index`);
      expect(note?.message).not.toContain('cli/integrations');
      const result = await integrationDocConflicts(KIT, {cwd: tmpDir});
      const finding = result.data.findings.find(f => f.topic === 'acme-a');
      expect(finding).toMatchObject({
        relationship: 'extends',
        coreTopic: GUIDE,
      });
      expect(finding?.message).not.toContain('cli/integrations');
    },
    SLOW,
  );
});
