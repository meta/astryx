// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Doctor's `icon-sets` check (AST-084 FR17).
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {checkIconSets, runChecks} from './doctor.mjs';
import {
  mapTemplateIcons,
  placeholderDeclaration,
} from '../../foundation/discovery/template-icons.mjs';
import {
  glyphsData,
  writeIconSetProject,
} from '../../test-utils/icon-set-fixture.mjs';

/** @type {string} */
let tmp;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-doctor-icons-'));
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

/** @param {Parameters<typeof writeIconSetProject>[1]} options */
async function iconCheckOf(options) {
  const cwd = writeIconSetProject(tmp, options);
  // A project declares Core, so doctor checks the project, not the computer.
  const pkgFile = path.join(cwd, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  pkg.dependencies = {...pkg.dependencies, '@astryxdesign/core': '*'};
  fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2));
  const report = await runChecks({cwd});
  return report.checks.find(check => check.id === 'icon-sets');
}

describe('icon-sets check', () => {
  it('a project without experimental.iconSet has no check, sets installed or not', async () => {
    // Icon sets are experimental (spec:AST-017 FR27): the report is unchanged
    // until the project opts in.
    expect(await iconCheckOf({packages: []})).toBeUndefined();
    expect(await iconCheckOf({})).toBeUndefined();
    expect(
      await iconCheckOf({packages: [{}, {name: '@acme/lines'}]}),
    ).toBeUndefined();
  });

  it('the configured set installed passes', async () => {
    const check = await iconCheckOf({
      config: {experimental: {iconSet: 'glyphs'}},
    });
    expect(check).toMatchObject({status: 'pass'});
    expect(check?.message).toMatch(/experimental.iconSet names "glyphs"/);
  });

  it('experimental.iconSet that two packages ship fails, naming the qualified form', async () => {
    const check = await iconCheckOf({
      packages: [{}, {name: '@acme/lines', set: 'glyphs'}],
      config: {experimental: {iconSet: 'glyphs'}},
    });
    expect(check).toMatchObject({status: 'fail'});
    expect(check?.fix).toMatch(/"<package>\/<set>"/);
  });

  it('a main set and a backup, both installed, pass and name the order', async () => {
    const check = await iconCheckOf({
      packages: [{}, {name: '@acme/lines'}],
      config: {experimental: {iconSet: ['glyphs', 'lines']}},
    });
    expect(check).toMatchObject({status: 'pass'});
    expect(check?.message).toContain('"@acme/lines/lines" as backup');
  });

  it('a backup that is not installed fails', async () => {
    const check = await iconCheckOf({
      config: {experimental: {iconSet: ['glyphs', 'nope']}},
    });
    expect(check).toMatchObject({status: 'fail'});
    expect(check?.message).toMatch(/names "nope", but no installed set/);
  });

  it('two sets installed and one left out of the list fails, with the command that adds it', async () => {
    const check = await iconCheckOf({
      packages: [{}, {name: '@acme/lines'}],
      config: {experimental: {iconSet: 'glyphs'}},
    });
    expect(check).toMatchObject({status: 'fail'});
    expect(check?.message).toContain(
      '2 icon sets are installed and @acme/lines/lines is not in your list (experimental.iconSet)',
    );
    expect(check?.fix).toContain(
      '`astryx experimental icon use glyphs --backup @acme/lines/lines`',
    );
  });

  it('experimental.iconSet naming a set that is not installed fails', async () => {
    expect(
      await iconCheckOf({config: {experimental: {iconSet: 'nope'}}}),
    ).toMatchObject({
      status: 'fail',
    });
  });

  it('experimental.iconSet naming an installed set that was withdrawn fails, saying withdrawn and why', async () => {
    const invalid = await iconCheckOf({
      packages: [{data: '{nope'}],
      config: {experimental: {iconSet: 'glyphs'}},
    });
    expect(invalid).toMatchObject({status: 'fail'});
    expect(invalid?.message).toMatch(
      /names "glyphs", which is installed but withdrawn: .*not valid JSON/,
    );
    expect(invalid?.message).not.toMatch(/no installed set has that name/);
    fs.rmSync(tmp, {recursive: true, force: true});
    fs.mkdirSync(tmp);
    const unresolved = await iconCheckOf({
      packages: [{data: {...glyphsData(), module: '@acme/not-installed'}}],
      config: {experimental: {iconSet: '@acme/glyphs/glyphs'}},
    });
    expect(unresolved).toMatchObject({status: 'fail'});
    expect(unresolved?.message).toMatch(
      /installed but withdrawn: .*does not resolve from the project/,
    );
  });

  it('an invalid data file of an unlisted set warns with the reason', async () => {
    const check = await iconCheckOf({
      packages: [{}, {name: '@acme/lines', data: '{nope'}],
      config: {experimental: {iconSet: 'glyphs'}},
    });
    expect(check).toMatchObject({status: 'warn'});
    expect(check?.message).toMatch(/not valid JSON/);
  });

  it('has no check when the project could not be read', () => {
    const check = checkIconSets(
      /** @type {any} */ ({cwd: tmp, iconSets: null, projectError: 'boom'}),
    );
    expect(check).toBeNull();
  });
});

describe('icon-placeholders check', () => {
  /**
   * @param {Record<string, unknown> | null} config
   * @param {Record<string, string>} files project files by relative path
   */
  async function placeholderCheckOf(config, files) {
    const cwd = writeIconSetProject(tmp, {config});
    const pkgFile = path.join(cwd, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
    pkg.dependencies = {...pkg.dependencies, '@astryxdesign/core': '*'};
    fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2));
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(cwd, rel)), {recursive: true});
      fs.writeFileSync(path.join(cwd, rel), text);
    }
    const report = await runChecks({cwd});
    return report.checks.find(check => check.id === 'icon-placeholders');
  }

  const PAGE = [
    "import {Icon} from '@astryxdesign/core/Icon';",
    '',
    placeholderDeclaration('MissingIcon'),
    '',
    'export const A = () => (',
    '  <>',
    '    <Icon icon={MissingIcon /* missing icon: cut */} />',
    '    <MissingIcon /* missing icon: fire */ className="x" />',
    '  </>',
    ');',
    '',
  ].join('\n');

  it('warns for each placeholder in copied code, naming the file, the meaning and both fixes', async () => {
    const check = await placeholderCheckOf(
      {experimental: {iconSet: 'glyphs'}},
      {'src/page.tsx': PAGE},
    );
    expect(check).toMatchObject({status: 'warn', label: 'Placeholder icons'});
    expect(check?.message).toContain(
      '2 placeholder icons in copied code: no set in your list has "cut", "fire"',
    );
    expect(check?.message).toContain('src/page.tsx (cut, fire)');
    expect(check?.fix).toContain(
      '`astryx experimental icon map cut <icon> --set glyphs`',
    );
    expect(check?.fix).toContain(
      '`astryx experimental icon use glyphs --backup <set>`',
    );
    expect(check?.fix).toContain(
      'replace each use of the placeholder (`MissingIcon`)',
    );
  });

  it('names the same fixes `astryx template` reports for the placeholder it writes', async () => {
    const set = /** @type {any} */ ({
      name: 'glyphs',
      package: '@acme/glyphs',
      license: 'MIT',
      data: {...glyphsData(), module: '@acme/glyphs', map: {close: 'x'}},
    });
    const copied = mapTemplateIcons(
      [
        "import {PencilGlyph} from '@acme/library';",
        'export const A = () => <PencilGlyph />;',
        '',
      ].join('\n'),
      {sets: [set], choice: {status: 'selected', set, reason: 'only set'}},
      {PencilGlyph: 'edit'},
    );
    const fixes = copied.icons.placeholder.flatMap(each => each.fixes);
    expect(fixes).toHaveLength(2);
    const check = await placeholderCheckOf(
      {experimental: {iconSet: 'glyphs'}},
      {'src/page.tsx': copied.source},
    );
    expect(check).toMatchObject({status: 'warn'});
    for (const fix of fixes) expect(check?.fix).toContain(`\`${fix}\``);
  });

  it('a commented-out or quoted copy of the placeholder is not a use', async () => {
    const commented = [
      placeholderDeclaration('MissingIcon'),
      'const B = () => <MissingIcon /* missing icon: cut */ />;',
    ]
      .join('\n')
      .split('\n')
      .map(line => `// ${line}`)
      .concat(['export const A = 1;', ''])
      .join('\n');
    const quoted = [
      `export const SAMPLE = ${JSON.stringify(
        `${placeholderDeclaration('MissingIcon')}\n<MissingIcon /* missing icon: cut */ />`,
      )};`,
      '',
    ].join('\n');
    const check = await placeholderCheckOf(
      {experimental: {iconSet: 'glyphs'}},
      {'src/commented.tsx': commented, 'src/quoted.tsx': quoted},
    );
    expect(check).toMatchObject({status: 'pass'});
  });

  it('a declaration with no uses left is not a warning', async () => {
    const check = await placeholderCheckOf(
      {experimental: {iconSet: 'glyphs'}},
      {
        'src/page.tsx': `${placeholderDeclaration('MissingIcon')}\nexport const A = 1;\n`,
      },
    );
    expect(check).toMatchObject({status: 'pass'});
  });

  it('passes when no copied code uses the placeholder', async () => {
    const check = await placeholderCheckOf(
      {experimental: {iconSet: 'glyphs'}},
      {'src/page.tsx': 'export const A = 1;\n'},
    );
    expect(check).toMatchObject({status: 'pass'});
  });

  it('a project without experimental.iconSet has no check, placeholder or not', async () => {
    expect(
      await placeholderCheckOf(null, {'src/page.tsx': PAGE}),
    ).toBeUndefined();
  });
});
