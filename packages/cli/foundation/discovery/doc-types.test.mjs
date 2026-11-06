// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Each doc against its published authoring type: unknown, missing, and
 * wrongly typed fields, the root deciding the type, translations, the authors'
 * own annotations, and the visible skip when the project has no TypeScript.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {unusableTypeScriptReason} from './project-typescript.mjs';
import {
  checkDocTypes,
  DOC_TYPES_TYPESCRIPT_MISSING_REASON,
} from './doc-types.mjs';

const require = createRequire(import.meta.url);
const TYPESCRIPT_DIR = path.dirname(require.resolve('typescript/package.json'));

/** @type {string} */
let pkg;

beforeEach(() => {
  pkg = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-doc-types-'));
});

afterEach(() => {
  fs.rmSync(pkg, {recursive: true, force: true});
});

function withTypeScript() {
  fs.mkdirSync(path.join(pkg, 'node_modules'), {recursive: true});
  fs.symlinkSync(
    TYPESCRIPT_DIR,
    path.join(pkg, 'node_modules', 'typescript'),
    'dir',
  );
}

/**
 * TypeScript 7 (no JavaScript compiler API) with the TypeScript 6 API package
 * beside it, which re-exports a real TypeScript.
 */
function withTypeScript7AndItsTypeScript6Api() {
  const ts7 = path.join(pkg, 'node_modules', 'typescript');
  fs.mkdirSync(ts7, {recursive: true});
  fs.writeFileSync(
    path.join(ts7, 'package.json'),
    JSON.stringify({
      name: 'typescript',
      version: '7.0.2',
      exports: {'./package.json': './package.json'},
    }),
  );
  const ts6 = path.join(pkg, 'node_modules', '@typescript', 'typescript6');
  fs.mkdirSync(ts6, {recursive: true});
  fs.writeFileSync(
    path.join(ts6, 'package.json'),
    JSON.stringify({
      name: '@typescript/typescript6',
      version: '6.0.2',
      main: 'index.js',
    }),
  );
  fs.writeFileSync(
    path.join(ts6, 'index.js'),
    `module.exports = require(${JSON.stringify(TYPESCRIPT_DIR)});\n`,
  );
}

/**
 * @param {string} rel
 * @param {string} text
 */
function write(rel, text) {
  const file = path.join(pkg, rel);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, text);
  return file;
}

/**
 * @param {Array<[string, import('./doc-types.mjs').DocRoot]>} files
 * @param {{core?: boolean}} [options]
 */
function check(files, options = {}) {
  return checkDocTypes(
    files.map(([rel, root]) => ({path: path.join(pkg, rel), root})),
    {packageDir: pkg, resolveFrom: [pkg], ...options},
  );
}

/** @param {import('./doc-types.mjs').DocTypesReport} report */
const summary = report =>
  report.findings.map(f => `${f.doc} ${f.export} ${f.field} ${f.problem}`);

const COMPONENT = {
  type: 'component',
  name: 'Badge',
  displayName: 'Badge',
  usage: {description: 'Shows a count.'},
  props: [
    {name: 'label', type: 'string', description: 'Text.', required: true},
  ],
};

describe('checkDocTypes', () => {
  it('skips with a reason, and checks nothing, when the project has no TypeScript', async () => {
    write(
      'components/Badge.doc.mjs',
      `export default ${JSON.stringify(COMPONENT)};\n`,
    );

    const report = await check([['components/Badge.doc.mjs', 'components']]);

    expect(report).toEqual({
      status: 'skipped',
      reason: DOC_TYPES_TYPESCRIPT_MISSING_REASON,
      docs: 0,
      findings: [],
      unchecked: [],
    });
  });

  it('names an installed TypeScript it cannot use, rather than asking to install one', async () => {
    write(
      'components/Badge.doc.mjs',
      `export default ${JSON.stringify(COMPONENT)};\n`,
    );
    // TypeScript 7 has no JavaScript compiler API: one entry exports none,
    // another cannot be loaded at all.
    for (const stub of [
      {main: 'index.js', code: "module.exports = {version: '7.0.0'};\n"},
      {exports: {'./package.json': './package.json'}},
    ]) {
      const dir = path.join(pkg, 'node_modules', 'typescript');
      fs.rmSync(dir, {recursive: true, force: true});
      fs.mkdirSync(dir, {recursive: true});
      const {code, ...fields} = stub;
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({name: 'typescript', version: '7.0.0', ...fields}),
      );
      if (code) fs.writeFileSync(path.join(dir, 'index.js'), code);

      const report = await check([['components/Badge.doc.mjs', 'components']]);

      // The reason names the version and the fix, so a --strict failure
      // says what to install.
      expect(report.reason).toContain('TypeScript 7.0.0');
      expect(report.reason).toContain('npm install -D @typescript/typescript6');
      expect(report).toEqual({
        status: 'skipped',
        reason: unusableTypeScriptReason('7.0.0', 'docs were not checked'),
        docs: 0,
        findings: [],
        unchecked: [],
      });
      expect(report.reason).toContain('TypeScript 7.0.0 is installed');
    }
  });

  it("checks with TypeScript 7's TypeScript 6 API package when the project has one", async () => {
    write(
      'components/Badge.doc.mjs',
      `export default ${JSON.stringify(COMPONENT)};\n`,
    );
    withTypeScript7AndItsTypeScript6Api();

    const report = await check([['components/Badge.doc.mjs', 'components']]);

    expect(report.status).toBe('checked');
    expect(report.docs).toBe(1);
  });

  it('says there is nothing to check when the package has no doc files, with or without TypeScript', async () => {
    const without = await check([]);
    withTypeScript();
    const withTs = await check([]);

    for (const report of [without, withTs]) {
      expect(report).toEqual({
        status: 'checked',
        docs: 0,
        findings: [],
        unchecked: [],
      });
    }
  });

  it('reports what a value outside its type hid in the same run', async () => {
    withTypeScript();
    write(
      'components/Badge.doc.mjs',
      [
        'export default {',
        "  type: 'component',",
        "  name: 'Badge',",
        "  keyword: ['count'],",
        "  usage: {description: 'Shows a count.', bestPractices: [{guidance: 'yes', description: 'Do.'}]},",
        "  props: [{name: 'label', type: 'string', description: 'Text.'}],",
        '};',
        '',
      ].join('\n'),
    );

    const report = await check([['components/Badge.doc.mjs', 'components']]);

    expect(summary(report)).toEqual([
      'components/Badge.doc.mjs default displayName missing_field',
      'components/Badge.doc.mjs default keyword unknown_field',
      'components/Badge.doc.mjs default usage.bestPractices[0].guidance wrong_type',
    ]);
    expect(report.findings[0].fix).toBe(
      'Add `displayName`: SingleComponentDoc requires it.',
    );
  });

  it('sets aside an object whose own `type` is wrong, and reports what it hid', async () => {
    withTypeScript();
    write(
      'components/Badge.doc.mjs',
      [
        'export default {',
        "  type: 'component',",
        "  name: 'Badge',",
        "  keyword: ['count'],",
        "  usage: {description: 'Shows a count.'},",
        "  props: [{name: 'label', type: 42, description: 'Text.'}],",
        '};',
        '',
      ].join('\n'),
    );
    write(
      'docs/setup.doc.mjs',
      [
        'export default {',
        "  type: 'generic',",
        "  name: 'setup',",
        "  title: 'Setup',",
        "  description: 'How.',",
        '  extra: true,',
        "  sections: [{title: 'One', content: [{type: 'para', text: 'x'}]}],",
        '};',
        '',
      ].join('\n'),
    );

    const report = await check([
      ['components/Badge.doc.mjs', 'components'],
      ['docs/setup.doc.mjs', 'docs'],
    ]);

    expect(summary(report)).toEqual([
      'components/Badge.doc.mjs default displayName missing_field',
      'components/Badge.doc.mjs default keyword unknown_field',
      'components/Badge.doc.mjs default props[0].type wrong_type',
      'docs/setup.doc.mjs default extra unknown_field',
      'docs/setup.doc.mjs default sections[0].content[0].type wrong_type',
    ]);
  });

  it('reports a missing top-level field that nested missing fields hid, and quotes no edited text', async () => {
    withTypeScript();
    write(
      'components/Hide.doc.mjs',
      [
        'export default {',
        "  type: 'component',",
        "  name: 'Hide',",
        '  usage: {bestPractices: []},',
        "  props: [{name: 'label', type: 'string'}],",
        '};',
        '',
      ].join('\n'),
    );
    write(
      'components/Bad.doc.mjs',
      [
        'export default {',
        "  type: 'component',",
        "  name: 'Bad',",
        "  displayName: 'Bad',",
        "  usage: {description: 'x', bestPractices: [{guidance: 42}]},",
        '  props: [],',
        '};',
        '',
      ].join('\n'),
    );

    const report = await check([
      ['components/Hide.doc.mjs', 'components'],
      ['components/Bad.doc.mjs', 'components'],
    ]);

    expect(summary(report)).toEqual([
      'components/Bad.doc.mjs default usage.bestPractices[0].description missing_field',
      'components/Bad.doc.mjs default usage.bestPractices[0].guidance wrong_type',
      'components/Hide.doc.mjs default displayName missing_field',
      'components/Hide.doc.mjs default usage.description missing_field',
      'components/Hide.doc.mjs default props[0].description missing_field',
    ]);
    for (const finding of report.findings) {
      expect(finding.message).not.toMatch(/\bany\b/);
    }
  });

  it('checks a translation that carries props for its fields, not for what only the base doc needs', async () => {
    withTypeScript();
    write(
      'components/Group.doc.mjs',
      [
        'export default {',
        "  type: 'component',",
        "  name: 'Group',",
        "  displayName: 'Group',",
        "  usage: {description: 'Rows.'},",
        "  props: [{name: 'title', type: 'string', description: 'Heading.'}],",
        '};',
        'export const docsZh = {',
        "  description: '一组行。',",
        "  props: [{name: 'title', description: '标题。'}],",
        '};',
        'export const docsDense = {',
        "  props: [{name: 'title', type: 42, description: 'Heading.'}, {description: 'No name.'}],",
        '};',
        '',
      ].join('\n'),
    );
    // The overlay merges props, and sub-component entries, by name and keeps
    // the base doc's `type`: a translated entry needs only its `name`.
    write(
      'components/Family.doc.mjs',
      [
        'export default {',
        "  type: 'component',",
        "  name: 'Family',",
        "  displayName: 'Family',",
        "  usage: {description: 'Members.'},",
        "  components: [{name: 'Member', description: 'One.', props: [{name: 'size', type: 'number', description: 'Size.'}]}],",
        '};',
        'export const docsZh = {',
        "  components: [{name: 'Member', props: [{name: 'size', description: '大小。'}]}],",
        '};',
        '',
      ].join('\n'),
    );

    const report = await check([
      ['components/Group.doc.mjs', 'components'],
      ['components/Family.doc.mjs', 'components'],
    ]);

    expect(summary(report)).toEqual([
      'components/Group.doc.mjs docsDense props[0].type wrong_type',
      'components/Group.doc.mjs docsDense props[1].name missing_field',
    ]);
  });

  it('says a doc that re-exports its value is not followed', async () => {
    withTypeScript();
    write(
      'docs/shared.mjs',
      `export default ${JSON.stringify({type: 'generic', name: 'shared', title: 'Shared', description: 'x', sections: []})};\n`,
    );
    write('docs/again.doc.mjs', "export {default} from './shared.mjs';\n");

    const report = await check([['docs/again.doc.mjs', 'docs']]);

    expect(report.unchecked).toEqual([
      {
        doc: 'docs/again.doc.mjs',
        reason: expect.stringContaining('re-exports its doc from ./shared.mjs'),
      },
    ]);
  });

  it('reports every unknown field, however many', async () => {
    withTypeScript();
    const extra = Array.from({length: 8}, (_, i) => `  extra${i + 1}: ${i},`);
    write(
      'components/Badge.doc.mjs',
      [
        `export default {...${JSON.stringify(COMPONENT)},`,
        ...extra,
        '};',
        '',
      ].join('\n'),
    );

    const report = await check([['components/Badge.doc.mjs', 'components']]);

    expect(summary(report)).toEqual(
      Array.from(
        {length: 8},
        (_, i) =>
          `components/Badge.doc.mjs default extra${i + 1} unknown_field`,
      ),
    );
    expect(report.unchecked).toEqual([]);
  });

  it('passes a component doc that matches ComponentDoc, with a field another member declares', async () => {
    withTypeScript();
    write(
      'components/Badge.doc.mjs',
      `export default ${JSON.stringify({...COMPONENT, description: 'A count chip.'})};\n`,
    );

    const report = await check([['components/Badge.doc.mjs', 'components']]);

    expect(report.status).toBe('checked');
    expect(report.typescript).toMatch(/^\d+\.\d+/);
    expect(report.docs).toBe(1);
    expect(report.findings).toEqual([]);
  });

  it('names an unknown field, and the field TypeScript suggests instead', async () => {
    withTypeScript();
    write(
      'components/Badge.doc.mjs',
      [
        `export default {...${JSON.stringify(COMPONENT)},`,
        "  keyword: ['count'],",
        '};',
        '',
      ].join('\n'),
    );

    const report = await check([['components/Badge.doc.mjs', 'components']]);

    expect(report.findings).toEqual([
      {
        doc: 'components/Badge.doc.mjs',
        line: 2,
        export: 'default',
        type: 'ComponentDoc',
        field: 'keyword',
        problem: 'unknown_field',
        severity: 'warning',
        message:
          "Object literal may only specify known properties, but 'keyword' does not exist in type 'SingleComponentDoc'. Did you mean to write 'keywords'?",
        fix: 'Rename `keyword` to `keywords`.',
      },
    ]);
  });

  it('names a value outside its type, deep in the doc, at its line', async () => {
    withTypeScript();
    write(
      'components/Badge.doc.mjs',
      [
        'export default {',
        "  type: 'component',",
        "  name: 'Badge',",
        "  displayName: 'Badge',",
        '  usage: {',
        "    description: 'Shows a count.',",
        "    bestPractices: [{guidance: true, description: 'Do.'}, {guidance: 'yes', description: 'Dont.'}],",
        '  },',
        "  props: [{name: 'label', type: 'string', description: 'Text.'}],",
        '};',
        '',
      ].join('\n'),
    );

    const report = await check([['components/Badge.doc.mjs', 'components']]);

    expect(report.findings).toEqual([
      expect.objectContaining({
        line: 7,
        field: 'usage.bestPractices[1].guidance',
        problem: 'wrong_type',
        fix: 'Change `usage.bestPractices[1].guidance` to a value of type boolean.',
      }),
    ]);
  });

  it("checks a doc against its root's type, so a topic stamped beside a component source is flagged, with the rest of the doc", async () => {
    withTypeScript();
    const {displayName, ...rest} = COMPONENT;
    write(
      'components/Badge.doc.mjs',
      `export default ${JSON.stringify({...rest, type: 'generic', colour: 'red'})};\n`,
    );
    // In the docs root the `type` picks the doc's type, so a wrong one leaves
    // the rest of it unchecked.
    write(
      'docs/setup.doc.mjs',
      "export default {type: 'generc', name: 'setup', title: 1, colour: 'red'};\n",
    );

    const report = await check([
      ['components/Badge.doc.mjs', 'components'],
      ['docs/setup.doc.mjs', 'docs'],
    ]);

    expect(summary(report)).toEqual([
      'components/Badge.doc.mjs default colour unknown_field',
      'components/Badge.doc.mjs default displayName missing_field',
      'components/Badge.doc.mjs default type wrong_type',
      'docs/setup.doc.mjs default type wrong_type',
    ]);
    expect(report.findings[2].fix).toBe(
      "This doc is in the components root, so it is a component doc: set type: 'component', or move it to the docs root.",
    );
    expect(report.unchecked).toEqual([
      {
        doc: 'docs/setup.doc.mjs',
        reason:
          'its `type` names no type the docs root takes, so its other fields were not checked; fix the `type` and run the check again',
      },
    ]);
  });

  it("ignores the author's own annotation and checks the value once, against the root's type", async () => {
    withTypeScript();
    write(
      'components/Badge.doc.mjs',
      [
        "/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */",
        `export const docs = ${JSON.stringify({...COMPONENT, keyword: []})};`,
        '',
      ].join('\n'),
    );

    const report = await check([['components/Badge.doc.mjs', 'components']]);

    expect(summary(report)).toEqual([
      'components/Badge.doc.mjs docs keyword unknown_field',
    ]);
  });

  it("ignores a .doc.ts doc's own annotation and type assertion, as it does a JSDoc one", async () => {
    withTypeScript();
    const header =
      "import type {ReferenceDoc} from '@astryxdesign/cli/authoring';";
    const doc = JSON.stringify({...COMPONENT, keyword: []});
    write(
      'components/Badge.doc.ts',
      `${header}\nexport const docs: ReferenceDoc = ${doc};\n`,
    );
    write(
      'components/Chip.doc.ts',
      `${header}\nexport default <ReferenceDoc>${doc};\n`,
    );

    const report = await check([
      ['components/Badge.doc.ts', 'components'],
      ['components/Chip.doc.ts', 'components'],
    ]);

    expect(summary(report)).toEqual([
      'components/Badge.doc.ts docs keyword unknown_field',
      'components/Chip.doc.ts default keyword unknown_field',
    ]);
  });

  it('checks translations: a string overlay against ComponentTranslationDoc, a full one against ComponentDoc with no field required', async () => {
    withTypeScript();
    write(
      'components/Badge.doc.mjs',
      [
        `export default ${JSON.stringify(COMPONENT)};`,
        "export const docsDense = {name: 'Badge', displayName: 'Badge', summary: 'chip', description: 'count chip'};",
        `export const docsZh = ${JSON.stringify({...COMPONENT, displayName: undefined, keyword: []})};`,
        '',
      ].join('\n'),
    );

    const report = await check([['components/Badge.doc.mjs', 'components']]);

    expect(report.docs).toBe(3);
    expect(summary(report)).toEqual([
      'components/Badge.doc.mjs docsDense summary unknown_field',
      'components/Badge.doc.mjs docsZh keyword unknown_field',
    ]);
    expect(report.findings[0].type).toBe('ComponentTranslationDoc');
  });

  it('allows a translation overlay to name its component, as Core overlays do', async () => {
    withTypeScript();
    write(
      'components/Badge.doc.mjs',
      [
        `export default ${JSON.stringify(COMPONENT)};`,
        "export const docsZh = {name: 'Badge', displayName: '徽章', description: '计数'};",
        "export const docsDense = {name: 'Badge', displayName: 'Badge', description: 'count chip'};",
        '',
      ].join('\n'),
    );

    const report = await check([['components/Badge.doc.mjs', 'components']]);

    expect(summary(report)).toEqual([]);
  });

  it('gives each field TypeScript reports missing together a message naming only that field', async () => {
    withTypeScript();
    write(
      'components/Badge.doc.mjs',
      [
        'export default {',
        "  type: 'component',",
        "  name: 'Badge',",
        "  props: [{name: 'label', type: 'string', description: 'Text.'}],",
        '};',
        '',
      ].join('\n'),
    );

    const report = await check([['components/Badge.doc.mjs', 'components']]);
    const missing = report.findings.filter(f => f.problem === 'missing_field');

    expect(missing.length).toBeGreaterThan(1);
    expect(new Set(missing.map(f => f.message)).size).toBe(missing.length);
    for (const finding of missing) {
      const others = missing.filter(f => f !== finding).map(f => f.field);
      expect(finding.message).toContain(`'${finding.field}'`);
      for (const other of others)
        expect(finding.message).not.toContain(`'${other}'`);
    }
  });

  it('checks a template, a docs topic by its stamp, a topic overlay, and a theme', async () => {
    withTypeScript();
    write(
      'templates/Hero.doc.mjs',
      "export default {type: 'block', name: 'Hero', description: 'A hero.', category: 'components/Hero'};\n",
    );
    write(
      'docs/setup.doc.mjs',
      "export default {type: 'generic', name: 'setup', title: 'Setup', description: 'How.', sections: [{title: 'One', content: [{type: 'prose', txt: 'x'}]}]};\n",
    );
    write(
      'docs/setup.doc.zh.mjs',
      "export const docsZh = {description: '如何', sections: [{section: 'One', title: '一'}]};\n",
    );
    write(
      'themes/ocean/oceanTheme.doc.mjs',
      "export default {type: 'theme', name: 'ocean', displayName: 'Ocean', description: 'Blue.', maintained: 'yes'};\n",
    );

    const report = await check([
      ['templates/Hero.doc.mjs', 'templates'],
      ['docs/setup.doc.mjs', 'docs'],
      ['docs/setup.doc.zh.mjs', 'docs-overlay'],
      ['themes/ocean/oceanTheme.doc.mjs', 'themes'],
    ]);

    // An integration template's own category is allowed (IntegrationTemplateDoc);
    // its missing displayName and aspectRatio are not.
    // The topic's unknown `txt` hides its missing `text` from TypeScript;
    // the check looks again without it, so both are reported.
    expect(summary(report)).toEqual([
      'docs/setup.doc.mjs default sections[0].content[0].text missing_field',
      'docs/setup.doc.mjs default sections[0].content[0].txt unknown_field',
      'docs/setup.doc.zh.mjs docsZh sections[0].content missing_field',
      'templates/Hero.doc.mjs default aspectRatio missing_field',
      'templates/Hero.doc.mjs default displayName missing_field',
      'themes/ocean/oceanTheme.doc.mjs default maintained wrong_type',
    ]);
    expect(new Set(report.findings.map(f => f.type))).toEqual(
      new Set([
        'ReferenceDoc',
        'ReferenceTranslationDoc',
        'IntegrationTemplateDoc',
        'ThemeDoc',
      ]),
    );

    // Core's own templates keep TemplateDoc and its TemplateCategory values.
    const core = await check([['templates/Hero.doc.mjs', 'templates']], {
      core: true,
    });
    expect(summary(core)).toEqual([
      'templates/Hero.doc.mjs default aspectRatio missing_field',
      'templates/Hero.doc.mjs default category wrong_type',
      'templates/Hero.doc.mjs default displayName missing_field',
    ]);
    expect(new Set(core.findings.map(f => f.type))).toEqual(
      new Set(['TemplateDoc']),
    );
  });

  it('checks an icon set descriptor against IconSetDoc', async () => {
    withTypeScript();
    write(
      'icon-sets/outline/outline.doc.mjs',
      "/** @type {import('@astryxdesign/cli/authoring').IconSetDoc} */\nexport default {type: 'icon-set', name: 'outline', displayName: 'Outline', description: 'D', maintained: true, license: 1, icons: []};\n",
    );
    write(
      'icon-sets/solid/solid.doc.mjs',
      "export default {type: 'icon-set', name: 'solid', displayName: 'Solid', description: 'D', maintained: true};\n",
    );
    write(
      'icon-sets/ok/ok.doc.mjs',
      "export default {type: 'icon-set', name: 'ok', displayName: 'Ok', description: 'D', maintained: true, license: 'MIT'};\n",
    );
    const report = await check([
      ['icon-sets/outline/outline.doc.mjs', 'icon-sets'],
      ['icon-sets/solid/solid.doc.mjs', 'icon-sets'],
      ['icon-sets/ok/ok.doc.mjs', 'icon-sets'],
    ]);
    expect(report.docs).toBe(3);
    expect(summary(report)).toEqual([
      'icon-sets/outline/outline.doc.mjs default icons unknown_field',
      'icon-sets/outline/outline.doc.mjs default license wrong_type',
      'icon-sets/solid/solid.doc.mjs default license missing_field',
    ]);
    expect(new Set(report.findings.map(f => f.type))).toEqual(
      new Set(['IconSetDoc']),
    );
  });

  it('checks nothing with a TypeScript older than 4.9, even when every doc is TypeScript', async () => {
    const fake = path.join(pkg, 'node_modules', 'typescript');
    fs.mkdirSync(fake, {recursive: true});
    fs.writeFileSync(
      path.join(fake, 'package.json'),
      JSON.stringify({name: 'typescript', version: '4.8.4', main: 'index.js'}),
    );
    fs.writeFileSync(
      path.join(fake, 'index.js'),
      `module.exports = {...require(${JSON.stringify(TYPESCRIPT_DIR)}), version: '4.8.4', versionMajorMinor: '4.8'};\n`,
    );
    write(
      'components/Badge.doc.ts',
      `export default ${JSON.stringify(COMPONENT)};\n`,
    );

    const report = await check([['components/Badge.doc.ts', 'components']]);

    expect(report).toMatchObject({status: 'skipped', docs: 0, findings: []});
    expect(report.reason).toContain('needs TypeScript 4.9 or later');
  });

  it('names a doc the compiler cannot parse as not checked, never as a pass', async () => {
    withTypeScript();
    write(
      'components/Badge.doc.ts',
      "export default {type: 'component', name: 'Badge',, displayName: 'Badge'};\n",
    );

    const report = await check([['components/Badge.doc.ts', 'components']]);

    expect(report.docs).toBe(0);
    expect(report.findings).toEqual([]);
    expect(report.unchecked).toEqual([
      expect.objectContaining({
        doc: 'components/Badge.doc.ts',
        reason: expect.stringContaining('cannot parse it'),
      }),
    ]);
  });

  it('names a file that exports no doc as not checked', async () => {
    withTypeScript();
    write('components/Empty.doc.mjs', 'export const other = {};\n');

    const report = await check([['components/Empty.doc.mjs', 'components']]);

    expect(report.findings).toEqual([]);
    expect(report.unchecked).toEqual([
      {
        doc: 'components/Empty.doc.mjs',
        reason: 'it exports no doc the CLI reads (default or docs)',
      },
    ]);
  });
});
