// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Stable `theme build` warns a typography value Core builds into
 * something no browser uses, at its line, as the editor refuses it: a font
 * stack with a space in one family, a quoted name with a space, a role
 * weight with no type scale, a weights entry that is no heading level. A
 * quoted name without a space and a list without one build as written and
 * are not warned.
 */

import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import {logger} from '../../logger.mjs';
import {themeBuild} from './build.mjs';
import {ensureCoreBuilt} from '../../../clients/cli/commands/ensure-core-built.mjs';

vi.setConfig({testTimeout: 120_000});

const CLI_ROOT = path.resolve(import.meta.dirname, '../../..');
const require = createRequire(import.meta.url);
const FIXTURE_LINKS = {
  '@astryxdesign': path.join(CLI_ROOT, 'node_modules/@astryxdesign'),
  react: path.dirname(require.resolve('react/package.json')),
};

/** @type {string} */
let dir;
beforeAll(() => ensureCoreBuilt(), 200_000);
beforeEach(() => {
  dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-build-typography-')),
  );
  fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}\n');
  for (const [name, target] of Object.entries(FIXTURE_LINKS)) {
    const link = path.join(dir, 'node_modules', name);
    fs.mkdirSync(path.dirname(link), {recursive: true});
    fs.symlinkSync(target, link, 'dir');
  }
});
afterEach(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

/** @param {string} typography the typography block's source */
const build = async typography => {
  fs.mkdirSync(path.join(dir, 'p'), {recursive: true});
  fs.writeFileSync(
    path.join(dir, 'p/p.ts'),
    `import {defineTheme} from '@astryxdesign/core/theme';\nexport default defineTheme({\n  name: 'p',\n  typography: ${typography},\n});\n`,
  );
  return captured(() => themeBuild('p/p.ts', {}, {cwd: dir}));
};

/** Build a theme source given whole. @param {string} source */
const buildSource = async source => {
  fs.mkdirSync(path.join(dir, 'p'), {recursive: true});
  fs.writeFileSync(path.join(dir, 'p/p.ts'), source);
  return captured(() => themeBuild('p/p.ts', {}, {cwd: dir}));
};

async function captured(run) {
  /** @type {string[]} */
  const lines = [];
  const silent = logger.silent;
  const {warn, log, error} = logger;
  logger.setSilent(false);
  logger.warn = (/** @type {string} */ l) => lines.push(l);
  logger.log = (/** @type {string} */ l) => lines.push(l);
  logger.error = (/** @type {string} */ l) => lines.push(l);
  try {
    let result;
    let err;
    try {
      result = await run();
    } catch (e) {
      err = e;
    }
    return {
      result: /** @type {any} */ (result),
      err: /** @type {any} */ (err),
      lines,
    };
  } finally {
    Object.assign(logger, {warn, log, error});
    logger.setSilent(silent);
  }
}

/** The build's warning lines that name a typography field. @param {{lines: string[]}} r */
const typographyWarnings = r => r.lines.filter(l => /typography\./.test(l));

describe('stable build typography values', () => {
  it('warns a font stack with a space in one family, at its line', async () => {
    const r = await build("{body: {family: 'Inter, Arial'}}");
    expect(r.err).toBeUndefined();
    expect(typographyWarnings(r).join('\n')).toMatch(
      /typography\.body\.family \(line 4\): .*Core quotes whole.*family: 'Inter', fallbacks: 'Arial'/,
    );
  });

  it('warns a quoted family name with a space', async () => {
    const r = await build(`{body: {family: '"Open Sans"'}}`);
    expect(typographyWarnings(r).join('\n')).toMatch(
      /typography\.body\.family .*family: 'Open Sans'/,
    );
  });

  it('builds a quoted name and a list without a space with no warning', async () => {
    for (const family of [`'"Lato"'`, `"'Lato'"`, `'Lato,serif'`]) {
      const r = await build(`{body: {family: ${family}}}`);
      expect(r.err, family).toBeUndefined();
      expect(typographyWarnings(r), family).toEqual([]);
    }
  });

  it('warns a role weight with no type scale, and a weights entry that is no level', async () => {
    const weight = await build("{body: {family: 'Lato', weight: '600'}}");
    expect(typographyWarnings(weight).join('\n')).toMatch(
      /typography\.body\.weight .*only from a type scale.*--text-body-weight/,
    );
    const level = await build(
      "{scale: {base: 16, ratio: 1.25}, heading: {weights: {h1: '800'}}}",
    );
    expect(typographyWarnings(level).join('\n')).toMatch(
      /typography\.heading\.weights\.h1 .*no heading level/,
    );
  });

  it('warns a family wherever the theme writes it: a const, a role const, a computed value', async () => {
    const head = "import {defineTheme} from '@astryxdesign/core/theme';\n";
    for (const [body, line] of [
      [
        "const TYPO = {body: {family: 'Inter, Arial'}};\nexport default defineTheme({name: 'p', typography: TYPO});\n",
        2,
      ],
      [
        "const body = {family: 'Inter, Arial'};\nexport default defineTheme({name: 'p', typography: {body}});\n",
        2,
      ],
      [
        "const fams = ['Inter', 'Arial'];\nexport default defineTheme({name: 'p', typography: {body: {family: fams.join(', ')}}});\n",
        3,
      ],
    ]) {
      const r = await buildSource(head + body);
      expect(typographyWarnings(r).join('\n'), String(body)).toMatch(
        new RegExp(
          `typography\\.body\\.family \\(line ${line}\\): .*one family name`,
        ),
      );
    }
  });

  it('warns a role weight that is no font weight, and takes one a browser reads', async () => {
    for (const weight of ['semi-bold', '1200']) {
      const r = await build(
        `{scale: {base: 16, ratio: 1.25}, body: {family: 'Lato', weight: '${weight}'}}`,
      );
      expect(typographyWarnings(r).join('\n'), weight).toMatch(
        /typography\.body\.weight .*is no font weight/,
      );
    }
    for (const weight of [
      'semibold',
      'Bold',
      '450',
      'var(--font-weight-bold)',
    ]) {
      const r = await build(
        `{scale: {base: 16, ratio: 1.25}, body: {family: 'Lato', weight: '${weight}'}}`,
      );
      expect(typographyWarnings(r), weight).toEqual([]);
    }
  });

  it('reads a heading level as Core does, a number key included', async () => {
    for (const key of ["'01'", "'1.0'", "'+1'"]) {
      const r = await build(
        `{scale: {base: 16, ratio: 1.25}, heading: {weights: {${key}: '800'}}}`,
      );
      expect(typographyWarnings(r), key).toEqual([]);
    }
    for (const key of ['7', '0']) {
      const r = await build(
        `{scale: {base: 16, ratio: 1.25}, heading: {weights: {${key}: '800'}}}`,
      );
      expect(typographyWarnings(r).join('\n'), key).toMatch(
        new RegExp(
          `typography\\.heading\\.weights\\.${key} .*no heading level`,
        ),
      );
    }
  });

  it('names a weight given as a number as a type mismatch, not a weight no browser reads', async () => {
    const r = await build(
      "{scale: {base: 16, ratio: 1.25}, body: {family: 'Lato', weight: 600}}",
    );
    const line = typographyWarnings(r).join('\n');
    expect(line).toMatch(
      /typography\.body\.weight .*a typography weight is text, and 600 is a number: a type mismatch.*write '600'/,
    );
    expect(line).not.toMatch(/no weight the browser reads/);
    const off = await build(
      "{scale: {base: 16, ratio: 1.25}, body: {family: 'Lato', weight: 1200}}",
    );
    expect(typographyWarnings(off).join('\n')).toMatch(
      /1200 is a number that is no weight .*a type mismatch.*write '600'/,
    );
  });

  it('warns a type scale with no base or ratio, or one that is no block', async () => {
    for (const [scale, missing] of [
      ['{ratio: 1.2}', /given no base.*NaNrem/],
      ['{base: 16}', /given no ratio.*NaNrem/],
      ['{}', /given no base/],
      ['1.25', /typography\.scale is a block of a base and a ratio/],
    ]) {
      const r = await build(`{scale: ${scale}}`);
      expect(typographyWarnings(r).join('\n'), String(scale)).toMatch(missing);
    }
  });

  it('warns a weights that is no block of levels, once, by what Core reads', async () => {
    for (const [weights, reads] of [
      ["'bold'", /reads "bold" by its letters as levels/],
      ['600', /finds no levels in 600, so it builds nothing/],
      ["['800', '700']", /by its places as levels/],
    ]) {
      const r = await build(
        `{scale: {base: 16, ratio: 1.25}, heading: {weights: ${weights}}}`,
      );
      const lines = typographyWarnings(r);
      expect(lines, String(weights)).toHaveLength(1);
      expect(lines[0], String(weights)).toMatch(reads);
      expect(lines[0]).toMatch(/use heading\.weight/);
    }
  });

  it('gives the no-scale reason for any weight without a scale, and the empty reason for an empty one', async () => {
    const off = await build("{body: {weight: 'semi-bold'}}");
    expect(typographyWarnings(off)).toHaveLength(1);
    expect(typographyWarnings(off)[0]).toMatch(/only from a type scale/);
    for (const weight of ["''", '0']) {
      const r = await build(
        `{scale: {base: 16, ratio: 1.25}, body: {weight: ${weight}}}`,
      );
      expect(typographyWarnings(r).join('\n'), weight).toMatch(
        /is empty, and Core skips an empty weight and keeps its default, so it builds nothing/,
      );
    }
  });

  it('warns the key of a heading level written twice that builds nothing', async () => {
    const r = await build(
      "{scale: {base: 16, ratio: 1.25}, heading: {weights: {'01': '300', 1: '800'}}}",
    );
    expect(typographyWarnings(r).join('\n')).toMatch(
      /typography\.heading\.weights\.1 .*1 and 01 are both heading level 1, and Core keeps the one it reads last \(01\)/,
    );
  });

  it('judges a boxed value as its primitive, and a role or typography that is no block', async () => {
    const boxed = await build(
      "{scale: {base: new Number(16), ratio: new Number(1.25)}, body: {weight: new String('600'), family: new String('Lato')}}",
    );
    expect(typographyWarnings(boxed)).toEqual([]);
    const role = await build("{body: 'Inter'}");
    expect(typographyWarnings(role).join('\n')).toMatch(
      /typography\.body is a block of fields/,
    );
    const whole = await buildSource(
      "import {defineTheme} from '@astryxdesign/core/theme';\nexport default defineTheme({name: 'p', typography: 'Inter' as any});\n",
    );
    expect(whole.lines.join('\n')).toMatch(
      /typography \(line 2\): typography is a block of roles/,
    );
  });

  it('judges a plain-object theme on the values it loads', async () => {
    const r = await buildSource(
      "const fams = ['Inter', 'Arial'];\nexport default {name: 'p', typography: {body: {family: fams.join(', ')}}};\n",
    );
    expect(typographyWarnings(r).join('\n')).toMatch(
      /typography\.body\.family .*one family name/,
    );
  });

  it('reads a signed number weight as written', async () => {
    const minus = await build(
      '{scale: {base: 16, ratio: 1.25}, body: {weight: -100 as any}}',
    );
    expect(typographyWarnings(minus).join('\n')).toMatch(
      /-100 is a number that is no weight/,
    );
    const plus = await build(
      '{scale: {base: 16, ratio: 1.25}, body: {weight: +500 as any}}',
    );
    expect(typographyWarnings(plus).join('\n')).toMatch(
      /500 is a number: a type mismatch/,
    );
  });

  it('warns a radius scale with no base or multiplier, or one that is no number', async () => {
    for (const [radius, why] of [
      [
        '{base: 8}',
        /radius \(line 4\): the radius scale is given no multiplier.*NaNpx/,
      ],
      ['{multiplier: 2}', /given no base/],
      ["{base: 'x', multiplier: 1}", /radius\.base .*is a number/],
      // A falsy radius Core skips: the base's corners stay.
      [
        '0',
        /Core skips a radius of 0 .*keeps its base theme's corners.*radius: \{base: 0, multiplier: 1\}/,
      ],
      ["''", /Core skips a radius of "" .*keeps its base theme's corners/],
    ]) {
      const r = await buildSource(
        `import {defineTheme} from '@astryxdesign/core/theme';\nexport default defineTheme({\n  name: 'p',\n  radius: ${radius},\n});\n`,
      );
      expect(r.lines.join('\n'), String(radius)).toMatch(why);
    }
    // A whole scale, and one whose base Core multiplies as a number (a
    // boolean counts as 1 or 0), warn nothing.
    for (const radius of [
      '{base: 8, multiplier: 1}',
      '{base: true, multiplier: 1}',
      '{base: 4, multiplier: false}',
    ]) {
      const whole = await buildSource(
        `import {defineTheme} from '@astryxdesign/core/theme';\nexport default defineTheme({name: 'p', radius: ${radius}});\n`,
      );
      expect(whole.lines.join('\n'), radius).not.toMatch(/radius/);
    }
  });
});
