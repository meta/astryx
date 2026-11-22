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
          'next',
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
      // A button in the dark panel, whose hover overlay does not show
      // there, looks the same under the pointer.
      expect(
        bar.problems.some(p => p.kind === 'hover' && p.part === 'button'),
      ).toBe(true);
      // The panel's own text, white on its dark fill, reads.
      expect(
        bar.problems.some(
          p => p.kind === 'text' && (p.parts ?? []).includes('card'),
        ),
      ).toBe(false);
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
      const flatMenu = flat.problems.find(
        p => p.kind === 'blend' && p.part === 'dropdown-menu',
      );
      expect(flatMenu?.message).toMatch(
        /In dropdown-menu's style, change boxShadow: 'none' to boxShadow: 'var\(--shadow-[a-z]+\)'/,
      );
      const still = await check(
        themeFile('still', {
          ...READABLE,
          '--color-overlay-hover': 'transparent',
        }),
      );
      expect(still.problems.some(p => p.kind === 'hover')).toBe(true);
      // A fill the part's own style gives at rest, with no hover of its
      // own, stays under the pointer: Core's hover is under the theme's.
      const rowFill = await check(
        themeFile('rowfill', READABLE, {
          'top-nav-item': {base: {backgroundColor: '#f0f0f0'}},
        }),
      );
      expect(
        rowFill.problems.some(
          p =>
            p.kind === 'hover' &&
            p.part === 'top-nav-item' &&
            p.mode === 'light',
        ),
      ).toBe(true);
      // The text answer ends with one plain next step: the fix, then the
      // edit the fix cannot make.
      const stillFile = 'still/stillTheme.ts';
      const ask = await runCli(['experimental', 'theme', 'check', stillFile], {
        cwd,
      });
      expect(ask.stdout.trim().split('\n').at(-1)).toMatch(
        /^next: \S.* experimental theme check still\/stillTheme\.ts --fix$/,
      );
      const left = await runCli(
        ['experimental', 'theme', 'check', stillFile, '--fix'],
        {cwd},
      );
      expect(left.status).toBe(1);
      expect(left.stdout.trim().split('\n').at(-1)).toMatch(
        /^next: in still\/stillTheme\.ts, set --color-overlay-hover to a tint that shows on [a-z]/,
      );
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
    'fills an inverted surface its on-colors read on, so a toast on it reads',
    async () => {
      // A black page with bright green text and accent: the error toast's
      // surface the fill makes must hold Core's white or near-black text.
      const file = themeFile('neon', {
        '--color-background-body': '#000000',
        '--color-text-primary': '#33ff66',
        '--color-accent': '#33ff66',
      });
      const d = await check(file, {fix: true});
      expect(d.problems).toEqual([]);
      expect(
        d.fixed.some(x => x.token === '--color-background-error-inverted'),
      ).toBe(true);
      // Both inverted surfaces are written whole, read or moved, like every
      // other unset color.
      const text = fs.readFileSync(path.join(cwd, file), 'utf8');
      expect(text).toMatch(/'--color-background-inverted': /);
      expect(text).toMatch(/'--color-background-error-inverted': /);
    },
    T,
  );

  it(
    "finds charts left at Core's colors under the theme's own, and --fix derives them from its colors",
    async () => {
      const file = themeFile('charted', {
        ...READABLE,
        '--color-accent': ['#0f7b6c', '#5fd3bf'],
      });
      const before = await check(file);
      expect(before.problems.some(p => p.kind === 'charts')).toBe(true);
      const fixed = await check(file, {fix: true});
      expect(fixed.problems.some(p => p.kind === 'charts')).toBe(false);
      expect(
        fixed.fixed.some(x => (x.token ?? '').startsWith('--color-data-')),
      ).toBe(true);
    },
    T,
  );

  it(
    'finds a named font the app does not load, with the line that installs it',
    async () => {
      const root = app('matcha');
      const dir = path.join(root, 'src');
      const src = themeFile('matcha', {
        ...READABLE,
        '--font-family-body': "'DM Sans', sans-serif",
      });
      fs.renameSync(path.join(cwd, src), path.join(dir, 'matchaTheme.ts'));
      const d = (await themeEditCheck('src/matchaTheme.ts', {cwd: root})).data;
      const lost = d.problems.find(p => p.kind === 'font-unloaded');
      expect(lost?.message).toMatch(
        /(npm install|pnpm add|yarn add|bun add) @fontsource\/dm-sans installs it, and import '@fontsource\/dm-sans'; in src\/main\.tsx/,
      );
      // Once the app loads it, it is not a problem.
      fs.writeFileSync(
        path.join(dir, 'main.tsx'),
        `import '@fontsource/dm-sans';\n${fs.readFileSync(path.join(dir, 'main.tsx'), 'utf8')}`,
      );
      const after = (await themeEditCheck('src/matchaTheme.ts', {cwd: root}))
        .data;
      expect(after.problems.some(p => p.kind === 'font-unloaded')).toBe(false);
    },
    T,
  );

  it(
    "measures text a part draws in the theme's local tokens, and a menu that opens inside a bar",
    async () => {
      // White text, from a local token, on the selected item's pale pill.
      const local = themeFile('localtext', READABLE);
      const localPath = path.join(cwd, local);
      fs.writeFileSync(
        localPath,
        fs
          .readFileSync(localPath, 'utf8')
          .replace(
            '  tokens: {',
            "  localTokens: {'--color-banner-text': '#ffffff'},\n  components: {'top-nav-item': {base: {color: 'var(--color-banner-text)'}}},\n  tokens: {",
          ),
      );
      const d = await check(local);
      expect(
        d.problems.some(
          p => p.kind === 'part-text' && p.part === 'top-nav-item',
        ),
      ).toBe(true);
      // A header that sets white text: a menu opened from it draws that
      // text on its own white fill.
      const header = await check(
        themeFile('header', READABLE, {
          'app-shell-header': {
            base: {
              '--color-text-primary': '#ffffff',
              '--color-overlay-hover': '#ffffff1a',
              backgroundColor: '#101010',
            },
          },
        }),
      );
      expect(
        header.problems.some(
          p =>
            p.kind === 'bar-text' && (p.parts ?? []).includes('dropdown-menu'),
        ),
      ).toBe(true);
      const fixed = await check('header/headerTheme.ts', {fix: true});
      expect(fixed.problems.some(p => p.kind === 'bar-text')).toBe(false);
      // The bar's pointer tint reaches the menu too: the theme's own tint
      // goes back in the same const.
      expect(
        fs.readFileSync(path.join(cwd, 'header', 'headerTheme.ts'), 'utf8'),
      ).toMatch(
        /const appShellHeaderInsideText = \{[^}]*'--color-overlay-hover'/,
      );
    },
    T,
  );

  it(
    "says when the app paints its page with an image, and finds charts a theme copied from Core's",
    async () => {
      const root = app('dither', {painted: true});
      fs.appendFileSync(
        path.join(root, 'src', 'index.css'),
        'body { background-image: radial-gradient(circle, black 25%, transparent 30%); }\n',
      );
      const src = themeFile('dither', READABLE);
      fs.renameSync(
        path.join(cwd, src),
        path.join(root, 'src', 'ditherTheme.ts'),
      );
      // The app picks its theme from a map of the themes it holds.
      fs.writeFileSync(
        path.join(root, 'src', 'astryx-themes.ts'),
        "import {ditherTheme as _theme0} from './ditherTheme';\nexport const themes = {dither: _theme0} as const;\n",
      );
      fs.writeFileSync(
        path.join(root, 'src', 'main.tsx'),
        "import '@astryxdesign/core/astryx.css';\nimport './index.css';\nimport {Theme} from '@astryxdesign/core/theme';\nimport {themes} from './astryx-themes';\n\nexport const App = () => <Theme theme={themes['dither']}><main /></Theme>;\n",
      );
      const d = (await themeEditCheck('src/ditherTheme.ts', {cwd: root})).data;
      expect(d.problems.find(p => p.kind === 'page-image')?.message).toMatch(
        /src\/index\.css paints the page with an image/,
      );
      // Core's own chart blue, copied into the theme: still Core's.
      const copied = await check(
        themeFile('copied', {
          ...READABLE,
          '--color-accent': ['#0f7b6c', '#5fd3bf'],
          '--color-data-categorical-blue': '#0171E3',
        }),
      );
      expect(copied.problems.some(p => p.kind === 'charts')).toBe(true);
    },
    T,
  );

  it(
    "leaves Core's own pairs out, reports a part's own text token on the part, and moves unset status text that no longer reads",
    async () => {
      // An empty theme draws only Core's own look: nothing is its doing.
      const empty = await check(themeFile('empty', {}));
      expect(empty.problems.filter(p => p.kind === 'text')).toEqual([]);
      // A card that sets its own faint text: the card's line, not the token.
      const card = await check(
        themeFile('cardtext', READABLE, {
          card: {base: {'--color-text-primary': '#bbbbbb'}},
        }),
      );
      const own = card.problems.find(
        p => p.kind === 'part-text' && p.part === 'card',
      );
      expect(own).toBeTruthy();
      expect(
        card.problems.some(
          p => p.kind === 'text' && p.token === '--color-text-primary',
        ),
      ).toBe(false);
      // An off-white page: Core's own status text on its muted fills no
      // longer reads, and the repair moves it.
      const offWhite = themeFile('offwhite', {
        ...READABLE,
        '--color-background-body': '#fafafa',
      });
      const fixed = await check(offWhite, {fix: true});
      expect(
        fixed.problems.some(p => p.kind === 'text' && /muted/.test(p.on ?? '')),
      ).toBe(false);
      // A dark card with its own hover tint: the button inside it shows
      // that tint, so its hover changes.
      const tinted = await check(
        themeFile('tinted', READABLE, {
          card: {
            base: {
              backgroundColor: '#101010',
              '--color-text-primary': '#ffffff',
              '--color-overlay-hover': '#ffffff26',
            },
          },
        }),
      );
      expect(
        tinted.problems.some(p => p.kind === 'hover' && p.part === 'button'),
      ).toBe(false);
    },
    T,
  );

  it(
    'reads an app wired through the generated theme module, in the mode it pins',
    async () => {
      const root = app('wired');
      const src = themeFile('wired', {
        '--color-background-body': '#14161a',
        '--color-text-primary': '#eceef2',
        '--color-background-surface': '#1b1e23',
        '--color-accent': '#7aa2ff',
      });
      fs.renameSync(
        path.join(cwd, src),
        path.join(root, 'src', 'wiredTheme.ts'),
      );
      fs.writeFileSync(
        path.join(root, 'src', 'astryx-themes.ts'),
        `/**
 * @generated by \`astryx theme\` — do not edit manually.
 * @astryx-theme-record {"themes":{"wired":"./src/themes"},"defaultThemeSlug":"wired"}
 */

import {wiredTheme as _astryxTheme0} from "./wiredTheme";

export const themes = {
  "wired": _astryxTheme0,
} as const;

export const defaultThemeSlug: keyof typeof themes = "wired";

export const themeModes: Partial<Record<keyof typeof themes, 'light' | 'dark'>> = {
  "wired": "dark",
};
`,
      );
      fs.writeFileSync(
        path.join(root, 'src', 'main.tsx'),
        "import '@astryxdesign/core/astryx.css';\nimport {Theme} from '@astryxdesign/core/theme';\nimport {themes, defaultThemeSlug, themeModes} from './astryx-themes';\n\nexport const App = () => <Theme theme={themes[defaultThemeSlug]} mode={themeModes[defaultThemeSlug]}><main /></Theme>;\n",
      );
      const d = (await themeEditCheck('src/wiredTheme.ts', {cwd: root})).data;
      // It renders the theme (its page is unpainted) in the mode it pins.
      expect(d.modes).toEqual(['dark']);
      expect(d.problems.some(p => p.kind === 'page')).toBe(true);
      expect(d.problems.some(p => p.kind === 'one-look')).toBe(false);
    },
    T,
  );

  it(
    'finds text on a selected row, a part fill that keeps one mode, a fill a bar sets, faint chart colors and a light bar on a dark page',
    async () => {
      const d = await check(
        themeFile(
          'misses',
          {...READABLE, '--color-data-categorical-blue': '#1b1b1b'},
          {
            'table-row': {
              selected: {
                backgroundColor: '#000080',
                '--color-text-primary': '#ffffff',
              },
            },
            button: {'variant:secondary': {backgroundColor: '#f3f5f7'}},
            'layout-header': {base: {'--color-neutral': '#f3eef8'}},
            'app-shell-header': {base: {backgroundColor: '#ffffff'}},
          },
        ),
      );
      const has = (/** @type {(p: any) => boolean} */ f) => d.problems.some(f);
      // A badge in a selected row draws its own text on the navy fill.
      expect(
        has(p => p.part === 'table-row' && (p.parts ?? []).includes('badge')),
      ).toBe(true);
      // The secondary button's white fill stays white in dark.
      expect(
        has(
          p =>
            p.kind === 'part-text' && p.part === 'button' && p.mode === 'dark',
        ),
      ).toBe(true);
      // A pale neutral the header sets for its buttons, under light text.
      expect(
        has(p => p.kind === 'bar-fill' && p.part === 'layout-header'),
      ).toBe(true);
      // A chart color as dark as the card in dark.
      expect(has(p => p.kind === 'chart-ground' && p.mode === 'dark')).toBe(
        true,
      );
      // A white header over the dark page.
      expect(
        has(p => p.kind === 'half-painted' && p.part === 'app-shell-header'),
      ).toBe(true);
    },
    T,
  );

  it(
    'declines a pin it cannot write once: a mode set by an expression, or an element that serves several themes',
    async () => {
      const root = app('shared');
      const src = themeFile('shared', {
        '--color-background-body': '#14161a',
        '--color-text-primary': '#eceef2',
        '--color-background-surface': '#1b1e23',
        '--color-accent': '#7aa2ff',
      });
      fs.renameSync(
        path.join(cwd, src),
        path.join(root, 'src', 'sharedTheme.ts'),
      );
      fs.writeFileSync(
        path.join(root, 'src', 'themes.ts'),
        "import {sharedTheme} from './sharedTheme';\nexport const themes = {shared: sharedTheme} as const;\n",
      );
      const main = path.join(root, 'src', 'main.tsx');
      fs.writeFileSync(
        main,
        "import '@astryxdesign/core/astryx.css';\nimport {Theme} from '@astryxdesign/core/theme';\nimport {themes} from './themes';\n\nexport const App = ({slug}: {slug: 'shared'}) => <Theme theme={themes[slug]}><main /></Theme>;\n",
      );
      const d = (
        await themeEditCheck('src/sharedTheme.ts', {cwd: root, fix: true})
      ).data;
      // (The page paint reads each theme's own page color: it is written.)
      expect(fs.readFileSync(main, 'utf8')).not.toMatch(/mode=/);
      expect(d.notes.join('\n')).toMatch(
        /serves every theme in src\/themes\.ts/,
      );
    },
    T,
  );

  it(
    'writes into a style the theme names (`base: floating`) by spreading it into an object of its own',
    async () => {
      const file = themeFile('named', READABLE, {
        'app-shell-header': {
          base: {'--color-text-primary': '#ffffff', backgroundColor: '#101010'},
        },
      });
      const abs = path.join(cwd, file);
      fs.writeFileSync(
        abs,
        fs
          .readFileSync(abs, 'utf8')
          .replace(
            'export const namedTheme',
            "const floating = {borderStyle: 'solid'};\n\nexport const namedTheme",
          )
          .replace(
            '  components: {',
            "  components: {\n    'dropdown-menu': {base: floating},\n    popover: {base: floating},",
          ),
      );
      const d = await check(file, {fix: true});
      expect(d.problems.some(p => p.kind === 'bar-text')).toBe(false);
      const text = fs.readFileSync(abs, 'utf8');
      expect(text).toMatch(
        /'dropdown-menu': \{\s*base: \{\n\s+\.\.\.floating,\n\s+\.\.\.appShellHeaderInsideText,/,
      );
      expect(text).toContain("const floating = {borderStyle: 'solid'};");
    },
    T,
  );

  it(
    'moves unset chart colors and control edges until they show on every surface, so a grey look comes out clean',
    async () => {
      const file = themeFile('grey', {
        '--color-background-body': '#c0c0c0',
        '--color-background-surface': '#d4d0c8',
        '--color-text-primary': '#000000',
        '--color-accent': '#000080',
      });
      expect(
        (await check(file)).problems.some(p => p.kind === 'chart-ground'),
      ).toBe(true);
      const d = await check(file, {fix: true});
      expect(d.problems).toEqual([]);
    },
    T,
  );

  it(
    'keeps what a named or spread style holds below the key it writes',
    async () => {
      const file = themeFile('deep', READABLE, {
        'app-shell-header': {
          base: {'--color-text-primary': '#ffffff', backgroundColor: '#101010'},
        },
      });
      const abs = path.join(cwd, file);
      fs.writeFileSync(
        abs,
        fs
          .readFileSync(abs, 'utf8')
          .replace(
            'export const deepTheme',
            "const menuSurface = {base: {borderRadius: '2px'}};\n\nexport const deepTheme",
          )
          .replace(
            '  components: {',
            "  components: {\n    'dropdown-menu': menuSurface,\n    popover: {...menuSurface},",
          ),
      );
      const d = await check(file, {fix: true});
      expect(d.problems.some(p => p.kind === 'bar-text')).toBe(false);
      const text = fs.readFileSync(abs, 'utf8');
      // The menu's own base comes first, then the repair.
      expect(text).toMatch(
        /\.\.\.menuSurface\.base,\n\s+\.\.\.appShellHeaderInsideText,/,
      );
      expect(text.match(/\.\.\.menuSurface\.base,/g)).toHaveLength(2);
    },
    T,
  );

  it(
    "measures text on a part's own hover fill and on a gradient a cell paints, and says when a part paints an image",
    async () => {
      const d = await check(
        themeFile('states', READABLE, {
          button: {
            'variant:secondary': {
              backgroundColor: 'var(--color-background-surface)',
              ':hover': {backgroundColor: '#e4e8ec'},
            },
          },
          'table-header-cell': {
            base: {backgroundImage: 'linear-gradient(#f2f2f2, #d2d2d2)'},
          },
          layout: {
            base: {backgroundImage: 'url("data:image/svg+xml,%3Csvg/%3E")'},
          },
        }),
      );
      const has = (/** @type {(p: any) => boolean} */ f) => d.problems.some(f);
      // White text in dark on the light hover fill.
      expect(
        has(
          p =>
            p.part === 'button' &&
            /hover fill/.test(p.message) &&
            p.mode === 'dark',
        ),
      ).toBe(true);
      // The header cell's light gradient under light text in dark.
      expect(
        has(p => p.part === 'table-header-cell' && p.mode === 'dark'),
      ).toBe(true);
      expect(has(p => p.kind === 'page-image' && p.part === 'layout')).toBe(
        true,
      );
    },
    T,
  );

  it(
    "spreads a style's own value only at keys it holds, and says a page painted with the page color and an image",
    async () => {
      const file = themeFile('lacks', READABLE, {
        'app-shell-header': {
          base: {'--color-text-primary': '#ffffff', backgroundColor: '#101010'},
        },
      });
      const abs = path.join(cwd, file);
      fs.writeFileSync(
        abs,
        fs
          .readFileSync(abs, 'utf8')
          .replace(
            'export const lacksTheme',
            "const shared = {button: {base: {borderRadius: '2px'}}};\n\nexport const lacksTheme",
          )
          .replace('  components: {', '  components: {\n    ...shared,'),
      );
      await check(file, {fix: true});
      const text = fs.readFileSync(abs, 'utf8');
      // `shared` holds no menu: nothing spreads a key it does not have.
      expect(text).not.toMatch(/shared\??\.(popover|\[)/);
      expect(text).not.toMatch(/\.\.\.shared\??\.\["dropdown-menu"\]/);
      const root = app('mixed', {painted: true});
      fs.writeFileSync(
        path.join(root, 'src', 'index.css'),
        ":root { background: var(--app-surface); }\nbody { background: var(--color-background-body) url('/noise.png'); }\n",
      );
      const src = themeFile('mixed', READABLE);
      fs.renameSync(
        path.join(cwd, src),
        path.join(root, 'src', 'mixedTheme.ts'),
      );
      const d = (await themeEditCheck('src/mixedTheme.ts', {cwd: root})).data;
      expect(d.problems.find(p => p.kind === 'page-image')?.message).toMatch(
        /noise\.png/,
      );
    },
    T,
  );

  it(
    'counts the controls an app puts in a page bar as inside it',
    async () => {
      const d = await check(
        themeFile('filters', READABLE, {
          'layout-header': {
            base: {
              '--color-text-primary': '#ffffff',
              backgroundColor: '#0050c8',
            },
          },
        }),
      );
      // A filter's selected segment, white text on its white pill.
      expect(
        d.problems.some(
          p =>
            p.kind === 'bar-text' &&
            (p.parts ?? []).includes('segmented-control-item'),
        ),
      ).toBe(true);
      // A dark bar's own see-through track tint is the bar showing
      // through: not a fill of the filter's own, so no bar-fill.
      const sheer = await check(
        themeFile('sheertrack', READABLE, {
          'app-shell-header': {
            base: {
              '--color-text-primary': '#ffffff',
              '--color-neutral': '#ffffff2e',
              backgroundColor: '#1e3a8a',
            },
          },
        }),
      );
      expect(sheer.problems.some(p => p.kind === 'bar-fill')).toBe(false);
      // An opaque light track the bar sets under its white text: the
      // repair gives the filter the theme's own track back.
      const track = themeFile('track', READABLE, {
        'app-shell-header': {
          base: {
            '--color-text-primary': '#ffffff',
            '--color-neutral': '#f0f0f0',
            backgroundColor: '#1e3a8a',
          },
        },
      });
      expect(
        (await check(track)).problems.some(p => p.kind === 'bar-fill'),
      ).toBe(true);
      const fixed = await check(track, {fix: true});
      expect(fixed.problems.some(p => p.kind === 'bar-fill')).toBe(false);
      // The bar's track is named as a fill, with the value the bar sets.
      const line = fixed.fixed.find(f => f.token === '--color-neutral');
      expect(line?.from).toBe('#f0f0f0');
      expect(line?.why).toMatch(/the theme's own --color-neutral on them/);
    },
    T,
  );

  it(
    'measures text in a dark bar that sets no text, writes beside an imported spread, and reads an opaque gradient as a fill',
    async () => {
      const dark = await check(
        themeFile('darkbar', READABLE, {
          'app-shell-header': {base: {backgroundColor: '#101010'}},
        }),
      );
      expect(
        dark.problems.some(
          p => p.kind === 'bar-ground' && p.part === 'app-shell-header',
        ),
      ).toBe(true);
      // Tokens that spread an imported object: a plain line goes after it.
      const file = themeFile('imported', {
        '--color-background-body': '#ffffff',
        '--color-text-secondary': '#dddddd',
      });
      const abs = path.join(cwd, file);
      fs.writeFileSync(
        path.join(cwd, 'imported', 'base.ts'),
        "export const baseTokens = {'--color-border': '#e5e5e5'};\n",
      );
      fs.writeFileSync(
        abs,
        fs
          .readFileSync(abs, 'utf8')
          .replace(
            "import {defineTheme} from '@astryxdesign/core/theme';",
            "import {defineTheme} from '@astryxdesign/core/theme';\nimport {baseTokens} from './base';",
          )
          .replace('  tokens: {', '  tokens: {\n    ...baseTokens,'),
      );
      expect(
        await themeEditCheck(file, {cwd, fix: true}).then(
          () => 'ok',
          (/** @type {any} */ e) => e.code,
        ),
      ).toBe('ok');
      // An opaque gradient that ends in black is a fill, not an image.
      const g = await check(
        themeFile('blackstop', READABLE, {
          card: {
            base: {
              backgroundImage: 'linear-gradient(rgb(40, 40, 40), rgb(0, 0, 0))',
            },
          },
        }),
      );
      expect(
        g.problems.some(p => p.kind === 'page-image' && p.part === 'card'),
      ).toBe(false);
      // A gradient whose variables the theme's tokens do not answer (one
      // set inside the part) over a fill is not read: it is said, never
      // passed as a sheen over the white fallback.
      const over = await check(
        themeFile('varover', READABLE, {
          card: {
            base: {
              '--x-dark': '#111111',
              backgroundColor: '#ffffff',
              backgroundImage: 'linear-gradient(var(--x-dark), var(--x-dark))',
            },
          },
        }),
      );
      expect(
        over.problems.some(p => p.part === 'card' && p.kind === 'page-image'),
      ).toBe(true);
      // The same gradient in the shorthand is no silent pass either.
      const short = await check(
        themeFile('shortvar', READABLE, {
          card: {base: {background: 'linear-gradient(var(--y), var(--y))'}},
        }),
      );
      expect(
        short.problems.some(p => p.part === 'card' && p.kind === 'page-image'),
      ).toBe(true);
      // A positioned shorthand gradient is not a fill: it is said.
      const placed = await check(
        themeFile('placed', READABLE, {
          card: {
            base: {
              background:
                'linear-gradient(135deg, #1e3a8a, #7c3aed) center / cover no-repeat',
            },
          },
        }),
      );
      expect(
        placed.problems.some(p => p.part === 'card' && p.kind === 'page-image'),
      ).toBe(true);
      // A gradient see-through only in dark is said for dark.
      const darkSheer = await check(
        themeFile('darksheer', READABLE, {
          card: {
            base: {
              backgroundImage:
                'linear-gradient(light-dark(#ffffff, #ffffffcc), light-dark(#ffffff, #ffffffcc))',
            },
          },
        }),
      );
      expect(
        darkSheer.problems.some(
          p =>
            p.part === 'card' && p.kind === 'page-image' && p.mode === 'dark',
        ),
      ).toBe(true);
      // A bar painted with an opaque gradient is measured at its stops.
      const gbar = await check(
        themeFile('gradbar', READABLE, {
          'app-shell-header': {
            base: {backgroundImage: 'linear-gradient(#101010, #101010)'},
          },
        }),
      );
      expect(
        gbar.problems.some(
          p => p.kind === 'bar-ground' && p.part === 'app-shell-header',
        ),
      ).toBe(true);
      // Named stops are read too.
      const nbar = await check(
        themeFile('namedbar', READABLE, {
          'app-shell-header': {
            base: {backgroundImage: 'linear-gradient(black, black)'},
          },
        }),
      );
      expect(
        nbar.problems.some(
          p => p.kind === 'bar-ground' && p.part === 'app-shell-header',
        ),
      ).toBe(true);
      // A stop built from a variable, or written as one, may be
      // see-through: not a fill.
      const bare = await check(
        themeFile('barevar', READABLE, {
          card: {
            base: {
              backgroundImage: 'linear-gradient(var(--x-dark), var(--x-dark))',
            },
          },
        }),
      );
      expect(
        bare.problems.some(p => p.kind === 'page-image' && p.part === 'card'),
      ).toBe(true);
      const v = await check(
        themeFile('varstop', READABLE, {
          card: {
            base: {
              backgroundImage:
                'linear-gradient(rgb(var(--brand) / 0.4), rgb(var(--brand) / 0))',
            },
          },
        }),
      );
      expect(
        v.problems.some(p => p.kind === 'page-image' && p.part === 'card'),
      ).toBe(true);
    },
    T,
  );

  it(
    'measures what create-made bars and pages hide: segments, header fields, placed fills, variant images and state fills',
    async () => {
      // Segments in a dark header whose own text token wins over the bar's.
      const own = await check(
        themeFile('segown', READABLE, {
          'app-shell-header': {
            base: {
              backgroundColor: '#142145',
              '--color-text-primary': '#ffffff',
              '--color-text-secondary': '#dddddd',
            },
          },
          'segmented-control-item': {
            base: {'@light': {'--color-text-secondary': '#474747'}},
          },
        }),
      );
      expect(
        own.problems.some(
          p =>
            p.kind === 'bar-ground' &&
            p.mode === 'light' &&
            /segmented-control-item's own style sets --color-text-secondary/.test(
              p.message,
            ),
        ),
      ).toBe(true);
      // A search field in a header that re-points its text to white.
      expect(
        own.problems.some(
          p => p.kind === 'bar-text' && (p.parts ?? []).includes('text-input'),
        ),
      ).toBe(true);
      // Segments in a dark header with no text of the bar's own: the
      // problem names the edit in the bar's own style.
      const plain = await check(
        themeFile('segplain', READABLE, {
          'app-shell-header': {base: {backgroundColor: '#142145'}},
        }),
      );
      expect(
        plain.problems.some(
          p =>
            p.kind === 'bar-ground' &&
            /in app-shell-header's own style/.test(p.message),
        ),
      ).toBe(true);
      // A navy bar with white text: the segmented control's see-through
      // track shows the bar, so --fix spreads no theme text onto it.
      const navy = themeFile('navybar', READABLE, {
        'app-shell-header': {
          base: {
            backgroundColor: '#002244',
            '--color-text-primary': '#ffffff',
            '--color-text-secondary': '#ffffff',
            // The bar's own track tint, as create writes it: see-through
            // over the bar, never a fill of the parts' own.
            '--color-neutral': 'light-dark(#0000005d, #ffffff1a)',
          },
        },
      });
      const navyFixed = await check(navy, {fix: true});
      expect(
        navyFixed.fixed.some(f =>
          (f.parts ?? []).includes('segmented-control'),
        ),
      ).toBe(false);
      expect(
        navyFixed.problems.some(p =>
          (p.parts ?? []).some(q => /^segmented-control/.test(q)),
        ),
      ).toBe(false);
      // A fill placed under a structural selector is the part's fill.
      const placed = await check(
        themeFile('placedfill', READABLE, {
          'layout-content': {
            base: {
              ':not(.astryx-dialog *, .astryx-drawer *)': {
                backgroundColor: '#dddddd',
              },
            },
          },
        }),
      );
      expect(
        placed.problems.some(
          p => p.part === 'layout-content' && p.mode === 'dark',
        ),
      ).toBe(true);
      // A pointer tint that paints a fill of its own over Core's state:
      // light text on a white hover in dark.
      const state = await check(
        themeFile('statefill', {
          ...READABLE,
          '--color-overlay-hover': ['#0000000d', '#ffffff'],
        }),
      );
      expect(
        state.problems.some(
          p => p.kind === 'part-text' && /hover fill/.test(p.message),
        ),
      ).toBe(true);
      // An image a part paints only in one of its variants is said.
      const variant = await check(
        themeFile('variantimage', READABLE, {
          layout: {
            'height:fill': {
              backgroundImage:
                'linear-gradient(#ffffff, #ffffff), linear-gradient(120deg, #ffb547, #e83fc0)',
            },
          },
        }),
      );
      expect(
        variant.problems.some(
          p => p.kind === 'page-image' && p.part === 'layout',
        ),
      ).toBe(true);
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
      // A protection file it cannot read beside an app file the repair
      // would change: refused before the theme file is written.
      if (process.getuid?.() !== 0) {
        const root = app('fold');
        fs.mkdirSync(path.join(root, 'theme'));
        const src = themeFile('fold', {
          '--color-background-body': '#14161a',
          '--color-text-primary': '#eceef2',
        });
        fs.renameSync(
          path.join(cwd, src),
          path.join(root, 'theme', 'foldTheme.ts'),
        );
        const main = path.join(root, 'src', 'main.tsx');
        fs.writeFileSync(
          main,
          fs
            .readFileSync(main, 'utf8')
            .replace("'./foldTheme'", "'../theme/foldTheme'"),
        );
        fs.writeFileSync(path.join(root, 'src', '.gitignore'), 'nothing/\n');
        fs.chmodSync(path.join(root, 'src', '.gitignore'), 0o000);
        const was = fs.readFileSync(
          path.join(root, 'theme', 'foldTheme.ts'),
          'utf8',
        );
        expect(
          await code(
            themeEditCheck('theme/foldTheme.ts', {cwd: root, fix: true}),
          ),
        ).toBe('ERR_CODEMOD_PROTECTION_SOURCE');
        fs.chmodSync(path.join(root, 'src', '.gitignore'), 0o644);
        expect(
          fs.readFileSync(path.join(root, 'theme', 'foldTheme.ts'), 'utf8'),
        ).toBe(was);
      }
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
