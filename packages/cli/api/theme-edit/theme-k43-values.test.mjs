// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file theme build warns a misspelled field that reaches the theme input
 * through a spread; warns a [light, dark] pair whose half is empty or a
 * number (light-dark() takes colors only); and writes a boxed primitive in
 * a part as its primitive, judged as that.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

/** @type {string} */
let cwd;
const BIN = path.resolve(
  import.meta.dirname,
  '../../clients/cli/bin/astryx.mjs',
);
const T = 240_000;

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-k43-values-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string[]} args */
const json = args => {
  const r = spawnSync(process.execPath, [BIN, '--json', ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 120_000,
  });
  return {status: r.status, env: JSON.parse(r.stdout)};
};
/** @param {string} file @param {string[]} [more] */
const compile = (file, more = []) =>
  json(['experimental', 'theme', 'compile', file, ...more]);
/** @param {string} rel @param {string} text */
const write = (rel, text) => {
  fs.mkdirSync(path.dirname(path.join(cwd, rel)), {recursive: true});
  fs.writeFileSync(path.join(cwd, rel), text);
};
/** A plain theme whose defineTheme input holds `fields` on line 4. @param {string} fields */
const plain = fields =>
  write(
    'plain/p.ts',
    `import {defineTheme} from '@astryxdesign/core/theme';\nexport const pTheme = defineTheme({\n  name: 'p',\n  ${fields},\n});\n`,
  );
/** An editor theme's own source, its fields on line 7. @param {string} slug @param {string} fields @param {string} [imports] */
const own = (slug, fields, imports = '') =>
  write(
    `themes/${slug}/${slug}.theme.ts`,
    `import {defineTheme} from '@astryxdesign/core/theme';\nimport {${slug}Settings} from './${slug}.settings';\n${imports}\nexport const ${slug}Theme = defineTheme({\n  extends: ${slug}Settings,\n  name: '${slug}',\n  ${fields},\n});\n`,
  );
/** @param {string} slug */
const compileOwn = slug => compile(`themes/${slug}/${slug}.theme.ts`);

const CORE = "import {defineTheme} from '@astryxdesign/core/theme';";
/** @param {string} rel */
const build = rel => json(['theme', 'build', rel]);
/** @param {{env: any}} p */
const warned = p => JSON.stringify(p.env.data?.warnings ?? []);

describe('a misspelled field in a spread', () => {
  it(
    'is warned at its line where the spread object is written',
    () => {
      write(
        'g/a.ts',
        `${CORE}\nconst shared = {\n  component: {button: {base: {color: 'red'}}},\n};\nexport default defineTheme({name: 'a', ...shared});\n`,
      );
      expect(warned(build('g/a.ts'))).toContain(
        'component (line 3): component is no field defineTheme takes, so the build reads nothing from it; did you mean components?',
      );
      write(
        'g/b.ts',
        `${CORE}\nconst dark = {\n  tokenz: {'--color-accent': '#f00'},\n};\nexport default defineTheme({name: 'b', onDark: {...dark}});\n`,
      );
      expect(warned(build('g/b.ts'))).toContain(
        'onDark.tokenz (line 3): tokenz is no field onDark takes',
      );
      write(
        'g/c.ts',
        `${CORE}\nexport default defineTheme({\n  name: 'c',\n  ...{component: {button: {base: {color: 'red'}}}},\n});\n`,
      );
      expect(warned(build('g/c.ts'))).toContain('component (line 4): ');
      write('g/shared.ts', `export const shared = {\n  tokenz: {},\n};\n`);
      write(
        'g/d.ts',
        `${CORE}\nimport {shared} from './shared';\nexport default defineTheme({name: 'd', ...shared});\n`,
      );
      expect(warned(build('g/d.ts'))).toContain(
        'tokenz (in g/shared.ts, line 2): tokenz is no field defineTheme takes',
      );
    },
    T,
  );
});

describe('a [light, dark] pair with an empty or a number half', () => {
  it('is warned: light-dark() takes colors only', () => {
    for (const [pair, why] of [
      ["['#fff', '']", 'gives an empty dark half'],
      ["['  ', '#000']", 'gives an empty light half'],
      ["['#fff', 5]", 'gives the number 5 as its dark half'],
      ["[0, '#000']", 'gives the number 0 as its light half'],
    ]) {
      plain(`tokens: {'--color-accent': ${pair} as any}`);
      const p = build('plain/p.ts');
      expect(p.status, pair).toBe(0);
      expect(warned(p), pair).toContain(
        `tokens.--color-accent (line 4): --color-accent ${why}`,
      );
    }
    plain("tokens: {'--color-accent': ['#fff', '#000']}");
    expect(build('plain/p.ts').env.data.warnings).toEqual([]);
  });
});

describe('a boxed primitive in a part', () => {
  it(
    'is written as its primitive and judged as that',
    () => {
      plain(
        "components: {button: {base: {padding: new String('4px') as any, color: new Boolean(true) as any}}}",
      );
      const p = build('plain/p.ts');
      expect(p.status).toBe(0);
      const warnings = p.env.data.warnings;
      expect(warnings).toEqual([
        expect.stringContaining(
          'color holds true, which the build writes as it is',
        ),
      ]);
      const css = fs.readFileSync(path.join(cwd, 'plain/p.css'), 'utf8');
      expect(css).toContain('padding: 4px');
      expect(css).not.toContain('"4px"');
    },
    T,
  );
});
