// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `experimental theme check` finds what a person would see as broken
 * in a theme file, in light and dark, and its --fix repairs it with normal
 * lines in the file: a second check finds nothing, and the backgrounds the
 * theme sets stay as they were.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditCheck} from './theme-edit.mjs';
import {hexToOklch} from '../theme/palette/generate/color.mjs';
import {hex as hexOf, ratio as contrastRatio} from './_color.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';

const T = 400_000;
/** @type {string} */
let cwd;
beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-check-', FIXTURE_PACKAGES);
  fs.writeFileSync(
    path.join(cwd, 'package.json'),
    `${JSON.stringify({name: 'app', type: 'module', dependencies: {'@astryxdesign/core': '*'}}, null, 2)}\n`,
  );
});
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** One token line as the file writes it. @param {string} k @param {unknown} v */
const tokenLine = (k, v) => `'${k}': ${JSON.stringify(v)},`;

/**
 * A theme file in its own folder, with the tokens and part styles given.
 * @param {string} name
 * @param {Record<string, string | [string, string]>} tokens
 * @param {Record<string, unknown>} [components]
 * @returns {string} the file, from the fixture
 */
function themeFile(name, tokens, components) {
  const dir = path.join(cwd, name);
  fs.mkdirSync(dir, {recursive: true});
  const file = path.join(dir, `${name}Theme.ts`);
  fs.writeFileSync(
    file,
    `import {defineTheme} from '@astryxdesign/core/theme';

// The ${name} look.
export const ${name}Theme = defineTheme({
  name: '${name}',
  tokens: {
${Object.entries(tokens)
  .map(([k, v]) => `    ${tokenLine(k, v)}`)
  .join('\n')}
  },${
    components
      ? `\n  components: ${JSON.stringify(components, null, 2).replace(/\n/g, '\n  ')},`
      : ''
  }
});
`,
  );
  return path.relative(cwd, file);
}

/**
 * An app below the fixture that renders the theme.
 * @param {string} name
 * @param {{pinned?: string, painted?: boolean}} [options]
 */
function app(name, {pinned, painted = false} = {}) {
  const root = path.join(cwd, `${name}-app`);
  fs.mkdirSync(path.join(root, 'src'), {recursive: true});
  fs.writeFileSync(
    path.join(root, 'package.json'),
    `${JSON.stringify({name: `${name}-app`, type: 'module', dependencies: {'@astryxdesign/core': '*'}})}\n`,
  );
  fs.writeFileSync(
    path.join(root, 'src', 'main.tsx'),
    `import '@astryxdesign/core/astryx.css';
import {Theme} from '@astryxdesign/core/theme';
import {${name}Theme} from './${name}Theme';

export const App = () => <Theme theme={${name}Theme}${pinned ? ` mode="${pinned}"` : ''}><main /></Theme>;
`,
  );
  if (painted)
    fs.writeFileSync(
      path.join(root, 'src', 'index.css'),
      'body { background: var(--color-background-body); }\n',
    );
  return root;
}

/** @param {string} file @param {object} [options] */
const check = (file, options = {}) =>
  themeEditCheck(file, {cwd, ...options}).then(r => r.data);

/** The kinds of problems found. @param {{problems: Array<{kind: string}>}} d */
const kinds = d => [...new Set(d.problems.map(p => p.kind))].sort();

const READABLE = {
  '--color-background-body': ['#ffffff', '#16181d'],
  '--color-text-primary': ['#15171a', '#f2f3f5'],
  '--color-accent': ['#2457d6', '#7aa2ff'],
};

describe('experimental theme check', () => {
  it(
    'lists text that does not read, with the JSON shape the command prints',
    async () => {
      const file = themeFile('faint', {
        ...READABLE,
        '--color-text-secondary': ['#d4d4d4', '#3a3a3a'],
      });
      const d = await check(file);
      expect(Object.keys(d).sort()).toEqual(
        [
          'file',
          'files',
          'fixed',
          'modes',
          'notes',
          'problems',
          'accepted',
          'protectedFiles',
        ].sort(),
      );
      expect(d.modes).toEqual(['light', 'dark']);
      const p = d.problems.find(
        x => x.kind === 'text' && x.token === '--color-text-secondary',
      );
      expect(p).toMatchObject({mode: expect.any(String), needs: 4.5});
      expect(p?.ratio).toBeLessThan(4.5);
      expect(p?.parts?.length).toBeGreaterThan(0);
      expect(d.fixed).toEqual([]);
      const r = await runCli(
        ['--json', 'experimental', 'theme', 'check', file],
        {cwd},
      );
      expect(r.status).toBe(1);
      const env = JSON.parse(r.stdout);
      expect(env.type).toBe('themeEdit.check');
      expect(env.data.problems.length).toBe(d.problems.length);
    },
    T,
  );

  it(
    'finds see-through menus, blending menus, faint edges and a half-painted page',
    async () => {
      const see = await check(
        themeFile('glass', {
          ...READABLE,
          '--color-background-popover': 'rgba(255, 255, 255, 0.5)',
        }),
      );
      expect(kinds(see)).toContain('see-through');
      const flat = await check(
        themeFile('flat', {
          ...READABLE,
          '--color-background-popover': ['#ffffff', '#16181d'],
          '--color-background-card': ['#ffffff', '#16181d'],
          '--shadow-high': 'none',
          '--shadow-med': 'none',
          '--shadow-low': 'none',
        }),
      );
      expect(kinds(flat)).toContain('blend');
      const edges = await check(
        themeFile('edges', {
          ...READABLE,
          '--color-border-emphasized': ['#fbfbfb', '#18191e'],
        }),
      );
      // One edge rule for check and the look gate: --color-border-emphasized
      // on each of the page, surface, card and menu fill passes at 95% of
      // Core's own edge contrast on Core's same ground, and 3:1 always
      // passes.
      const edge = edges.problems.find(
        p =>
          p.kind === 'edge' &&
          p.token === '--color-border-emphasized' &&
          p.on === '--color-background-body' &&
          p.mode === 'light',
      );
      if (!edge?.needs) throw new Error('no edge problem on the light page');
      const core = Number(
        /Core's own edge there is ([\d.]+):1/.exec(edge.message)?.[1],
      );
      expect(edge.needs).toBeCloseTo(Math.min(3, 0.95 * core), 2);
      // A gray edge on the white page at 0.9 of Core's contrast fails; at
      // 0.97 it passes.
      /** @param {number} share */
      const grayAt = share => {
        for (let v = 255; v >= 0; v--) {
          const c = /** @type {[number, number, number]} */ ([v, v, v]);
          if (contrastRatio(c, [255, 255, 255]) >= share * core)
            return hexOf(c);
        }
        return '#000000';
      };
      /** @param {string} name @param {number} share */
      const bodyEdge = async (name, share) =>
        (
          await check(
            themeFile(name, {
              ...READABLE,
              '--color-border-emphasized': [grayAt(share), '#5b5f68'],
            }),
          )
        ).problems.some(
          p =>
            p.kind === 'edge' &&
            p.on === '--color-background-body' &&
            p.mode === 'light',
        );
      expect(await bodyEdge('edge90', 0.9)).toBe(true);
      expect(await bodyEdge('edge97', 0.97)).toBe(false);
      const half = await check(
        themeFile('half', {
          ...READABLE,
          '--color-background-surface': ['#111111', '#16181d'],
        }),
      );
      expect(
        half.problems.some(
          p =>
            p.kind === 'half-painted' &&
            p.token === '--color-background-surface' &&
            p.mode === 'light',
        ),
      ).toBe(true);
    },
    T,
  );

  it(
    "finds a part fill whose text does not read, and a bar's text inside its menus",
    async () => {
      const fill = await check(
        themeFile('fill', READABLE, {
          button: {base: {backgroundColor: '#1a1a1a', color: '#2a2a2a'}},
        }),
      );
      expect(
        fill.problems.some(p => p.kind === 'part-text' && p.part === 'button'),
      ).toBe(true);
      // A dark panel that sets white text for what it holds: the field
      // inside it draws that text on its own white fill.
      const bar = await check(
        themeFile('bar', READABLE, {
          card: {
            base: {
              '--color-text-primary': '#ffffff',
              backgroundColor: '#101010',
            },
          },
        }),
      );
      const leak = bar.problems.find(p => p.kind === 'bar-text');
      expect(leak).toMatchObject({
        part: 'card',
        token: '--color-text-primary',
      });
      expect(leak?.parts).toContain('text-input');
      // A see-through fill inside it (a secondary button's) shows the
      // panel, where the white text reads: not a problem.
      expect(leak?.parts).not.toContain('button');
      expect(leak?.message).toMatch(
        /sets the theme's own --color-text-primary again on inputs/,
      );
      const barFixed = await check('bar/barTheme.ts', {fix: true});
      expect(barFixed.problems.some(p => p.kind === 'bar-text')).toBe(false);
      expect(barFixed.fixed.filter(x => x.group === 'inputs')).toHaveLength(1);
      expect(barFixed.fixed.every(x => !x.part)).toBe(true);
      const text = fs.readFileSync(
        path.join(cwd, 'bar', 'barTheme.ts'),
        'utf8',
      );
      // One shared const holds the text; only the failing field's block
      // spreads it: buttons and toasts elsewhere keep their own text.
      expect(text).toMatch(
        /^const cardInsideText = \{\n {2}'--color-text-primary': '[^']+',\n\};$/m,
      );
      expect(text).toMatch(
        /'text-input': \{\n\s+base: \{\n\s+\.\.\.cardInsideText,/,
      );
      expect(text).not.toMatch(/\bbutton: \{|toast/);
      // The panel's own line stays as written.
      expect(text).toContain('"--color-text-primary": "#ffffff"');
    },
    T,
  );

  it(
    'finds a one-look theme the app does not pin and a page the app does not paint, and --fix pins and paints',
    async () => {
      const root = app('dusk');
      const one = {
        '--color-background-body': '#14161a',
        '--color-text-primary': '#eceef2',
        '--color-background-surface': '#1b1e23',
        '--color-accent': '#7aa2ff',
      };
      const dir = path.join(root, 'src');
      const src = themeFile('dusk', one);
      fs.renameSync(path.join(cwd, src), path.join(dir, 'duskTheme.ts'));
      const d = (await themeEditCheck('src/duskTheme.ts', {cwd: root})).data;
      expect(kinds(d)).toEqual(expect.arrayContaining(['one-look', 'page']));
      const f = (
        await themeEditCheck('src/duskTheme.ts', {cwd: root, fix: true})
      ).data;
      expect(kinds(f)).not.toContain('one-look');
      expect(kinds(f)).not.toContain('page');
      expect(fs.readFileSync(path.join(dir, 'main.tsx'), 'utf8')).toMatch(
        /<Theme\b[^>]*\bmode="dark"[^>]*>/,
      );
      expect(fs.readFileSync(path.join(dir, 'main.tsx'), 'utf8')).toMatch(
        /import '\.\/astryx-page\.css';/,
      );
      expect(fs.existsSync(path.join(dir, 'astryx-page.css'))).toBe(true);
      // A painted, pinned app has neither problem.
      const ok = app('noon', {pinned: 'light', painted: true});
      fs.writeFileSync(
        path.join(ok, 'src', 'noonTheme.ts'),
        fs
          .readFileSync(path.join(dir, 'duskTheme.ts'), 'utf8')
          .replace(/dusk/g, 'noon'),
      );
      const n = (await themeEditCheck('src/noonTheme.ts', {cwd: ok})).data;
      expect(n.modes).toEqual(['light']);
      expect(kinds(n)).not.toContain('one-look');
      expect(kinds(n)).not.toContain('page');
    },
    T,
  );

  it(
    'with --fix writes normal lines, leaves the page, surface and accent as set, and a second check is clean',
    async () => {
      const set = {
        ...READABLE,
        '--color-background-surface': ['#fbfbfc', '#1b1d22'],
        '--color-text-secondary': ['#cfcfcf', '#34363a'],
        '--color-text-accent': ['#a9c1f7', '#22356b'],
      };
      const file = themeFile('repair', set);
      const before = await check(file);
      expect(before.problems.length).toBeGreaterThan(0);
      const fixed = await check(file, {fix: true});
      expect(fixed.problems).toEqual([]);
      expect(fixed.files).toEqual([file]);
      expect(fixed.fixed.length).toBeGreaterThan(0);
      expect(
        fixed.fixed.find(x => x.token === '--color-text-secondary'),
      ).toBeTruthy();
      const text = fs.readFileSync(path.join(cwd, file), 'utf8');
      // The file keeps its own lines and comment, and is still one theme.
      expect(text).toMatch(/^\/\/ The repair look\.$/m);
      expect(text).toMatch(/'--color-text-secondary': \[/);
      expect(text).not.toMatch(/'#cfcfcf'|"#cfcfcf"/);
      for (const t of [
        '--color-background-body',
        '--color-background-surface',
        '--color-accent',
      ])
        expect(text).toContain(tokenLine(t, set[t]));
      expect(
        fixed.fixed.some(
          x =>
            x.token === '--color-background-body' ||
            x.token === '--color-background-surface' ||
            x.token === '--color-accent',
        ),
      ).toBe(false);
      // Text the theme sets moves in lightness only: a blue stays blue.
      const accent = fixed.fixed.find(x => x.token === '--color-text-accent');
      if (!accent) throw new Error('the accent text was not repaired');
      expect(Array.isArray(accent.value)).toBe(true);
      const hues = /** @type {[string, string]} */ (accent.value).map(
        v => hexToOklch(v).H,
      );
      const was = set['--color-text-accent'].map(v => hexToOklch(v).H);
      for (const [i, h] of hues.entries())
        expect(Math.abs(h - was[i])).toBeLessThan(8);
      const again = await check(file);
      expect(again.problems).toEqual([]);
      const r = await runCli(['experimental', 'theme', 'check', file], {cwd});
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/nothing broken/);
    },
    T,
  );
  it(
    'with --fix never moves a fill the theme sets, even where text is drawn in it',
    async () => {
      const set = {
        '--color-background-body': '#ffffff',
        '--color-background-surface': '#fcfcfd',
        '--color-text-primary': '#16181c',
        '--color-accent': '#b9d4ff',
      };
      const file = themeFile('pale', set);
      const fixed = await check(file, {fix: true});
      const text = fs.readFileSync(path.join(cwd, file), 'utf8');
      for (const t of Object.keys(set))
        expect(text).toContain(tokenLine(t, set[t]));
      expect(
        fixed.fixed.some(
          x => x.token && x.token in set && x.token !== '--color-text-primary',
        ),
      ).toBe(false);
    },
    T,
  );

  it(
    'paints a page whose stylesheet loads Core, and leaves a protected app file alone',
    async () => {
      const root = app('tide');
      const dir = path.join(root, 'src');
      // The entry loads Core's stylesheet from CSS, as the setup guide does.
      fs.writeFileSync(
        path.join(dir, 'main.tsx'),
        fs
          .readFileSync(path.join(dir, 'main.tsx'), 'utf8')
          .replace(
            "import '@astryxdesign/core/astryx.css';\n",
            "import './index.css';\n",
          ),
      );
      fs.writeFileSync(
        path.join(dir, 'index.css'),
        "@import '@astryxdesign/core/astryx.css';\n",
      );
      fs.renameSync(
        path.join(cwd, themeFile('tide', {...READABLE})),
        path.join(dir, 'tideTheme.ts'),
      );
      const f = (
        await themeEditCheck('src/tideTheme.ts', {cwd: root, fix: true})
      ).data;
      expect(kinds(f)).not.toContain('page');
      expect(fs.readFileSync(path.join(dir, 'index.css'), 'utf8')).toMatch(
        /html,\s*body \{\s*background: var\(--color-background-body\)/,
      );
      // A one-look theme in an app whose <Theme> file is ignored: not pinned, and said.
      const kept = app('mist');
      fs.writeFileSync(path.join(kept, '.gitignore'), 'src/main.tsx\n');
      fs.renameSync(
        path.join(
          cwd,
          themeFile('mist', {
            '--color-background-body': '#14161a',
            '--color-text-primary': '#eceef2',
            '--color-background-surface': '#1b1e23',
          }),
        ),
        path.join(kept, 'src', 'mistTheme.ts'),
      );
      const before = fs.readFileSync(
        path.join(kept, 'src', 'main.tsx'),
        'utf8',
      );
      const m = (
        await themeEditCheck('src/mistTheme.ts', {cwd: kept, fix: true})
      ).data;
      expect(fs.readFileSync(path.join(kept, 'src', 'main.tsx'), 'utf8')).toBe(
        before,
      );
      expect(kinds(m)).toContain('one-look');
      expect(m.notes.some(n => /main\.tsx is protected/.test(n))).toBe(true);
      expect(m.protectedFiles).toEqual([
        {
          file: 'src/main.tsx',
          declaration: expect.stringContaining('.gitignore'),
        },
      ]);
      expect(m.code).toBe('ERR_CODEMOD_PROTECTED');
      // A pinned app keeps both halves of a [light, dark] value: the half
      // it does not show stays as the theme wrote it.
      const pinned = app('dawn', {pinned: 'light', painted: true});
      fs.renameSync(
        path.join(
          cwd,
          themeFile('dawn', {
            ...READABLE,
            '--color-text-secondary': ['#d8d8d8', '#b0b0b0'],
          }),
        ),
        path.join(pinned, 'src', 'dawnTheme.ts'),
      );
      const p = (
        await themeEditCheck('src/dawnTheme.ts', {cwd: pinned, fix: true})
      ).data;
      expect(p.modes).toEqual(['light']);
      const secondary = p.fixed.find(x => x.token === '--color-text-secondary');
      if (!secondary) throw new Error('the secondary text was not repaired');
      expect(Array.isArray(secondary.value)).toBe(true);
      expect(secondary.value[1]).toBe('#b0b0b0');
    },
    T,
  );

  it(
    'keeps a color the author set as designed when an accepted record covers it, and names that record when it moves one',
    async () => {
      const set = {
        ...READABLE,
        '--color-text-secondary': ['#bdbdbd', '#4a4a4a'],
      };
      // The repair moves the author's color in the open: its old value and
      // the records that would keep it.
      const moved = await check(themeFile('kept', set), {fix: true});
      const line = moved.fixed.find(x => x.token === '--color-text-secondary');
      if (!line?.accept) throw new Error('the move names no accept record');
      expect(line.from).toEqual(set['--color-text-secondary']);
      expect(line.accept.length).toBeGreaterThan(0);
      // The same theme with those records, a reason each: kept, counted,
      // and no problem.
      const file = themeFile('designed', set);
      fs.writeFileSync(
        path.join(cwd, 'designed', 'designed.accepted.json'),
        `${JSON.stringify({accepted: line.accept.map(r => ({...r, reason: 'brand gray kept as designed'}))}, null, 2)}\n`,
      );
      // (The records describe the theme as the repair leaves it, its unset
      // colors filled: the repair keeps the author's color there.)
      const d = await check(file, {fix: true});
      expect(d.accepted).toBeGreaterThan(0);
      expect(d.fixed.some(x => x.token === '--color-text-secondary')).toBe(
        false,
      );
      expect(
        d.problems.some(
          p => p.kind === 'text' && p.token === '--color-text-secondary',
        ),
      ).toBe(false);
      // A file that is not one accepted list is refused, naming it.
      fs.writeFileSync(
        path.join(cwd, 'designed', 'designed.accepted.json'),
        '{"accepted": [{"part": "text"}]}\n',
      );
      await expect(check(file)).rejects.toMatchObject({
        code: 'ERR_THEME_INVALID',
        message: expect.stringContaining('designed.accepted.json'),
      });
    },
    T,
  );

  it(
    "finds a menu a part style flattens, a hover that shows nothing, and a font with no fallback; --fix gives the font Core's generic",
    async () => {
      const flat = await check(
        themeFile(
          'menuflat',
          {
            ...READABLE,
            '--color-background-popover': ['#ffffff', '#16181d'],
            '--color-background-card': ['#ffffff', '#16181d'],
          },
          {'dropdown-menu': {base: {boxShadow: 'none'}}},
        ),
      );
      expect(
        flat.problems.some(
          p => p.kind === 'blend' && p.part === 'dropdown-menu',
        ),
      ).toBe(true);
      const still = await check(
        themeFile('still', {
          ...READABLE,
          '--color-overlay-hover': 'transparent',
        }),
      );
      expect(still.problems.some(p => p.kind === 'hover')).toBe(true);
      const font = themeFile('fontless', {
        ...READABLE,
        '--font-family-body': 'Figtree',
      });
      const before = await check(font);
      expect(
        before.problems.some(
          p => p.kind === 'font' && p.token === '--font-family-body',
        ),
      ).toBe(true);
      const fixed = await check(font, {fix: true});
      expect(fixed.problems.some(p => p.kind === 'font')).toBe(false);
      expect(fs.readFileSync(path.join(cwd, font), 'utf8')).toMatch(
        /'--font-family-body': 'Figtree, (sans-serif|system-ui|serif|monospace)'/,
      );
    },
    T,
  );

  it(
    "passes the official Neutral theme's control edges",
    async test => {
      const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
      if (unbuilt) {
        console.warn(`skipped: ${unbuilt}`);
        return test.skip();
      }
      fs.mkdirSync(path.join(cwd, 'official'), {recursive: true});
      fs.writeFileSync(
        path.join(cwd, 'official', 'officialTheme.ts'),
        `import {defineTheme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral/built';

export const officialTheme = defineTheme({name: 'official', extends: neutralTheme});
`,
      );
      const d = await check('official/officialTheme.ts');
      expect(d.problems.filter(p => p.kind === 'edge')).toEqual([]);
    },
    T,
  );

  it(
    'refuses what it cannot check, with the documented codes, and changes nothing',
    async () => {
      /** @param {Promise<unknown>} p */
      const code = p =>
        p.then(
          () => 'ok',
          (/** @type {any} */ e) => e.code,
        );
      expect(await code(themeEditCheck('', {cwd}))).toBe(
        'ERR_MISSING_ARGUMENT',
      );
      expect(await code(themeEditCheck('nope', {cwd}))).toBe(
        'ERR_UNKNOWN_THEME',
      );
      const outside = path.join(path.dirname(cwd), 'outsideTheme.ts');
      fs.copyFileSync(path.join(cwd, themeFile('outer', READABLE)), outside);
      expect(await code(themeEditCheck(outside, {cwd}))).toBe(
        'ERR_PATH_TRAVERSAL',
      );
      const broken = themeFile('broken', READABLE);
      fs.appendFileSync(path.join(cwd, broken), "throw new Error('no');\n");
      expect(await code(themeEditCheck(broken, {cwd}))).toBe('ERR_THEME_LOAD');
      const taken = themeFile('taken', READABLE);
      fs.writeFileSync(path.join(cwd, 'taken', 'taken.css'), '/* my own */\n');
      expect(await code(themeEditCheck(taken, {cwd}))).toBe('ERR_FILE_EXISTS');
      // Tokens that spread another object: the repair goes after the
      // spread, so it wins, and the file still builds.
      const spread = themeFile('spread', {
        '--color-background-body': '#ffffff',
        '--color-text-secondary': '#dddddd',
      });
      const spreadPath = path.join(cwd, spread);
      fs.writeFileSync(
        spreadPath,
        fs
          .readFileSync(spreadPath, 'utf8')
          .replace('  tokens: {', '  tokens: {\n    ...{},'),
      );
      expect(await code(themeEditCheck(spread, {cwd, fix: true}))).toBe('ok');
      expect(fs.readFileSync(spreadPath, 'utf8')).toMatch(
        /'--color-text-secondary': \[?'#/,
      );
      // A computed key: a value written beside it could be replaced, so
      // nothing is written.
      const computed = themeFile('computed', {
        '--color-background-body': '#ffffff',
        '--color-text-secondary': '#dddddd',
      });
      const computedPath = path.join(cwd, computed);
      fs.writeFileSync(
        computedPath,
        fs
          .readFileSync(computedPath, 'utf8')
          .replace(
            '  tokens: {',
            "  tokens: {\n    ['--color-border']: '#eeeeee',",
          ),
      );
      const was = fs.readFileSync(computedPath, 'utf8');
      expect(await code(themeEditCheck(computed, {cwd, fix: true}))).toBe(
        'ERR_THEME_INVALID',
      );
      expect(fs.readFileSync(computedPath, 'utf8')).toBe(was);
      // A protected theme file is refused before anything is written.
      const ignored = themeFile('ignored', {
        '--color-background-body': '#ffffff',
        '--color-text-secondary': '#dddddd',
      });
      fs.writeFileSync(path.join(cwd, '.gitignore'), 'ignored/\n');
      const kept = fs.readFileSync(path.join(cwd, ignored), 'utf8');
      expect(await code(themeEditCheck(ignored, {cwd, fix: true}))).toBe(
        'ERR_CODEMOD_PROTECTED',
      );
      expect(fs.readFileSync(path.join(cwd, ignored), 'utf8')).toBe(kept);
      // A protection file it cannot read: refused too (a root user reads
      // every file, so there it is not checked).
      if (process.getuid?.() !== 0) {
        fs.writeFileSync(path.join(cwd, '.gitignore'), 'nothing/\n');
        fs.chmodSync(path.join(cwd, '.gitignore'), 0o000);
        expect(await code(themeEditCheck(ignored, {cwd, fix: true}))).toBe(
          'ERR_CODEMOD_PROTECTION_SOURCE',
        );
        fs.chmodSync(path.join(cwd, '.gitignore'), 0o644);
      }
      fs.rmSync(path.join(cwd, '.gitignore'));
      // An editor theme is the editor's: its show lists the problems.
      fs.mkdirSync(path.join(cwd, 'themes', 'made'), {recursive: true});
      fs.writeFileSync(
        path.join(cwd, 'themes', 'made', 'made.settings.json'),
        '{}\n',
      );
      fs.writeFileSync(path.join(cwd, 'themes', 'made', 'made.theme.ts'), '\n');
      expect(await code(themeEditCheck('made', {cwd}))).toBe(
        'ERR_INVALID_ARGUMENT',
      );
      fs.rmSync(path.join(cwd, 'themes'), {recursive: true});
      const bare = fs.mkdtempSync(path.join(path.dirname(cwd), 'bare-'));
      expect(await code(themeEditCheck('x.ts', {cwd: bare}))).toBe(
        'ERR_PROJECT_REQUIRED',
      );
    },
    T,
  );
});
