// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Template icon meanings while authoring a set (AST-084 FR13, FR15):
 * the authoring receipts, `experimental icon --definitions`, and
 * `integration check` name the icon definitions the bundled templates use
 * that the set leaves unmapped, most used first, and never fail a check.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {
  completeGlyphs,
  glyphsData,
  writeIconPackage,
  writeIconSetProject,
} from '../../../test-utils/icon-set-fixture.mjs';
import {templateIconMeanings} from '../../../foundation/discovery/template-icon-meanings.mjs';
import {astryxIconDefinitions} from '../../../foundation/discovery/icon-definition-discovery.mjs';

/** @type {string} */
let tmp;
/** @type {string} */
let pkg;
/** @type {Array<{definition: string, templates: number}>} */
let meanings;

beforeAll(async () => {
  meanings = await templateIconMeanings();
});
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-icon-meanings-'));
  pkg = path.join(tmp, 'glyphs');
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

/** @param {string[]} args @param {string} [cwd] */
async function json(args, cwd = pkg) {
  const res = await runCli([...args, '--json'], cwd);
  return {code: res.code, body: JSON.parse(res.stdout)};
}

/** @param {Array<{definition: string, templates: number}>} list */
const isRanked = list =>
  list.every(
    (each, index) =>
      index === 0 ||
      list[index - 1].templates > each.templates ||
      (list[index - 1].templates === each.templates &&
        list[index - 1].definition < each.definition),
  );

/** Every Astryx definition mapped to `home`, plus the fixture's own. */
function everyDefinitionMapped() {
  const complete = completeGlyphs();
  const map = Object.fromEntries(
    astryxIconDefinitions().definitions.map(({doc}) => [doc.name, 'home']),
  );
  return {
    modules: complete.modules,
    data: {
      ...complete.data,
      module: '@acme/glyphs',
      map: {...map, ...complete.data.map},
    },
  };
}

describe('the bundled templates use meanings beyond the built-in ones', () => {
  it('counts each definition once per template, most used first', () => {
    expect(meanings.length).toBeGreaterThan(0);
    expect(isRanked(meanings)).toBe(true);
    const names = meanings.map(each => each.definition);
    expect(names).toContain('document');
    expect(names).toContain('share');
    const builtIn = new Set(
      astryxIconDefinitions()
        .definitions.filter(({doc}) => doc.builtIn)
        .map(({doc}) => doc.name),
    );
    expect(names.some(name => !builtIn.has(name))).toBe(true);
  });
});

describe('authoring receipts name the template meanings a set leaves unmapped', () => {
  it('map: the JSON lists them ranked, and the text ends with one line', async () => {
    writeIconPackage(pkg);
    const {code, body} = await json([
      'experimental',
      'icon',
      'map',
      'delete',
      'trash',
    ]);
    expect(code).toBe(0);
    const {unmapped} = body.data.templateMeanings;
    const mapped = new Set([...Object.keys(glyphsData().map), 'delete']);
    expect(unmapped).toEqual(
      meanings.filter(each => !mapped.has(each.definition)),
    );
    expect(isRanked(unmapped)).toBe(true);
    expect(unmapped.map(each => each.definition)).toContain('document');
    expect(unmapped.map(each => each.definition)).not.toContain('delete');

    const text = await runCli(
      ['experimental', 'icon', 'map', 'share', 'home'],
      pkg,
    );
    expect(text.code).toBe(0);
    const lines = text.stdout.trim().split('\n');
    const last = lines[lines.length - 1];
    const [first] = meanings.filter(
      each => !mapped.has(each.definition) && each.definition !== 'share',
    );
    expect(last).toContain(
      `[next] Templates use ${unmapped.length - 1} meanings this set does not map: ${first.definition} (${first.templates} templates)`,
    );
    expect(last).not.toMatch(/\bshare \(/u);
    expect(last).toContain(
      'experimental icon map <definition> <icon id> --set glyphs`.',
    );
  });

  it('map --pairs reports them too', async () => {
    writeIconPackage(pkg);
    const {body} = await json([
      'experimental',
      'icon',
      'map',
      '--pairs',
      'document=home,share=home',
    ]);
    const names = body.data.templateMeanings.unmapped.map(
      (/** @type {{definition: string}} */ each) => each.definition,
    );
    expect(names).not.toContain('document');
    expect(names).not.toContain('share');
    expect(names).toContain('settings');
  });

  it('add: the receipt names them after the icon is mapped', async () => {
    writeIconPackage(pkg);
    const {code, body} = await json([
      'experimental',
      'icon',
      'add',
      'HomeIcon',
      '--from',
      './icons/home.js',
      '--id',
      'house',
      '--definition',
      'document',
    ]);
    expect(code).toBe(0);
    const names = body.data.templateMeanings.unmapped.map(
      (/** @type {{definition: string}} */ each) => each.definition,
    );
    expect(names).not.toContain('document');
    expect(names).toContain('share');
  });

  it('new-set: a new set maps nothing, so every template meaning is listed; a dry run lists none', async () => {
    fs.mkdirSync(pkg, {recursive: true});
    fs.writeFileSync(
      path.join(pkg, 'package.json'),
      JSON.stringify({name: '@acme/icons', version: '1.0.0', type: 'module'}),
    );
    const plan = await json(
      ['experimental', 'icon', 'new-set', 'outline', '--dry-run'],
      pkg,
    );
    expect(plan.body.data.templateMeanings).toBeUndefined();
    const made = await json(['experimental', 'icon', 'new-set', 'outline']);
    expect(made.code).toBe(0);
    expect(made.body.data.templateMeanings.unmapped).toEqual(meanings);
    fs.rmSync(path.join(pkg, 'icon-sets'), {recursive: true, force: true});
    const text = await runCli(
      ['experimental', 'icon', 'new-set', 'outline'],
      pkg,
    );
    const lines = text.stdout.trim().split('\n');
    expect(lines[lines.length - 1]).toContain(
      `[next] Templates use ${meanings.length} meanings this set does not map: ${meanings[0].definition} (${meanings[0].templates} templates), ${meanings[1].definition} (${meanings[1].templates})`,
    );
  });

  it('a set that maps every template meaning gets no line and an empty list', async () => {
    writeIconPackage(pkg, everyDefinitionMapped());
    const {body} = await json(['experimental', 'icon', 'map', 'close', 'x']);
    expect(body.data.templateMeanings).toEqual({unmapped: []});
    const text = await runCli(
      ['experimental', 'icon', 'map', 'close', 'x'],
      pkg,
    );
    expect(text.stdout).not.toContain('Templates use');
  });
});

describe('experimental icon --definitions marks template use and the set', () => {
  it('in an icon-set package: each definition has its template count and whether the set maps it', async () => {
    writeIconPackage(pkg);
    const {code, body} = await json(['experimental', 'icon', '--definitions']);
    expect(code).toBe(0);
    expect(body.data.set).toBe('@acme/glyphs/glyphs');
    /** @type {Map<string, any>} */
    const byName = new Map(
      body.data.definitions.map((/** @type {any} */ each) => [each.name, each]),
    );
    const counts = new Map(
      meanings.map(each => [each.definition, each.templates]),
    );
    for (const [name, each] of byName) {
      expect(each.templates).toBe(counts.get(name) ?? 0);
    }
    expect(byName.get('close').mapped).toBe(true);
    expect(byName.get('document').mapped).toBe(false);
    expect(byName.get('document').templates).toBeGreaterThan(0);

    const text = await runCli(['experimental', 'icon', '--definitions'], pkg);
    expect(text.stdout).toContain('checked against @acme/glyphs/glyphs');
    expect(text.stdout).toMatch(
      new RegExp(
        `- document \\[optional, ${counts.get('document')} templates, not mapped\\]`,
        'u',
      ),
    );
    expect(text.stdout).toMatch(
      /- close \[built-in, (\d+ templates?, )?mapped\]/u,
    );
  });

  it("in a project: the project's main set, or the set --set names", async () => {
    const project = writeIconSetProject(tmp, {
      config: {experimental: {iconSet: 'glyphs'}},
    });
    const chosen = await json(
      ['experimental', 'icon', '--definitions'],
      project,
    );
    expect(chosen.body.data.set).toBe('@acme/glyphs/glyphs');
    const named = await json(
      ['experimental', 'icon', '--definitions', '--set', 'glyphs'],
      project,
    );
    expect(named.body.data.set).toBe('@acme/glyphs/glyphs');
    const search = named.body.data.definitions.find(
      (/** @type {any} */ each) => each.name === 'search',
    );
    expect(search.mapped).toBe(true);
    const missing = await json(
      ['experimental', 'icon', '--definitions', '--set', 'nope'],
      project,
    );
    expect(missing.code).not.toBe(0);
    expect(missing.body.code).toBe('ERR_NOT_FOUND');
  });

  it('in a project whose astryx.config does not load: lists every definition, with no set', async () => {
    const project = writeIconSetProject(tmp);
    for (const config of [
      'export default {experimental: {iconSet: ',
      'export default {notAKey: true};\n',
    ]) {
      fs.writeFileSync(path.join(project, 'astryx.config.mjs'), config);
      const {code, body} = await json(
        ['experimental', 'icon', '--definitions'],
        project,
      );
      expect(code, JSON.stringify(body)).toBe(0);
      expect(body.data.set).toBeNull();
      expect(body.data.definitions.length).toBeGreaterThan(0);
    }
  });

  it('with no set anywhere, nothing is marked mapped', async () => {
    fs.mkdirSync(pkg, {recursive: true});
    fs.writeFileSync(
      path.join(pkg, 'package.json'),
      JSON.stringify({name: 'app', private: true}),
    );
    const {body} = await json(['experimental', 'icon', '--definitions']);
    expect(body.data.set).toBeNull();
    expect(
      body.data.definitions.some((/** @type {any} */ each) => 'mapped' in each),
    ).toBe(false);
  });
});

describe('integration check lists the template meanings a set leaves unmapped', () => {
  it('lists them for each set and still passes --strict', async () => {
    const complete = completeGlyphs();
    writeIconPackage(pkg, {
      modules: complete.modules,
      data: {...complete.data, module: '@acme/glyphs'},
    });
    const {body} = await json(['integration', 'check', '--strict']);
    expect(
      body.data.failures.filter(
        (/** @type {{code: string}} */ each) =>
          each.code !== 'doc_types_skipped',
      ),
    ).toEqual([]);
    expect(body.data.warnings).toBe(0);
    const validate = body.data.checks.find(
      (/** @type {{check: string}} */ each) => each.check === 'validate',
    );
    const [coverage] = validate.response.data.iconSets;
    const mapped = new Set(Object.keys(complete.data.map));
    expect(coverage.templateMeanings.unmapped).toEqual(
      meanings.filter(each => !mapped.has(each.definition)),
    );
    expect(
      coverage.templateMeanings.unmapped.map(
        (/** @type {{definition: string}} */ each) => each.definition,
      ),
    ).toContain('document');

    const text = await runCli(['integration', 'check', '--strict'], pkg);
    expect(text.stdout).toContain('Template icon meanings not mapped');
    expect(text.stdout).toMatch(
      /- glyphs: Templates use \d+ meanings this set does not map: /u,
    );
    expect(text.stdout).toContain('This list never fails a check.');
  }, 60_000);

  it('a set that maps every template meaning lists none', async () => {
    writeIconPackage(pkg, everyDefinitionMapped());
    const {body} = await json(['integration', 'check']);
    const validate = body.data.checks.find(
      (/** @type {{check: string}} */ each) => each.check === 'validate',
    );
    expect(validate.response.data.iconSets[0].templateMeanings).toEqual({
      unmapped: [],
    });
    const text = await runCli(['integration', 'check'], pkg);
    expect(text.stdout).not.toContain('Template icon meanings not mapped');
  }, 60_000);
});
