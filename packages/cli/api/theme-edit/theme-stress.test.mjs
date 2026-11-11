// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What a real theming round found in `astryx experimental theme`:
 * which dial wins and saying so, small text under a steep type scale, gray
 * seeds, the page background under a neutral, tokens a dial writes, `how`
 * answers that follow the question, the preview page picker, and the
 * Overview and Components pages.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  themeEditHow,
  themeEditNew,
  themeEditPreviewAdd,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
} from './theme-edit.mjs';
import {parseColor} from './_color.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

/** The packages the template pages import, so ranked pages can be added. */
const APP_PACKAGES = {
  name: 'app',
  private: true,
  type: 'module',
  dependencies: {
    '@heroicons/react': '*',
    'lucide-react': '*',
    recharts: '*',
  },
};

/** @type {string} */
let cwd;

/** @param {string} rel */
const read = rel => fs.readFileSync(path.join(cwd, rel), 'utf8');

/** @param {() => Promise<unknown>} fn */
async function refusal(fn) {
  try {
    await fn();
  } catch (e) {
    const err = /** @type {any} */ (e);
    return {
      code: err.code,
      message: String(err.message),
      run: (err.suggestions ?? []).map((/** @type {any} */ s) => s.name),
    };
  }
  throw new Error('expected a refusal');
}

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-stress-', [
    ...FIXTURE_PACKAGES,
    '@types/react',
    '@types/react-dom',
  ]);
  writeFixtureBaseTheme(cwd, 'neutral');
  fs.writeFileSync(
    path.join(cwd, 'package.json'),
    `${JSON.stringify(APP_PACKAGES)}\n`,
  );
  await themeEditNew('s', {cwd, like: 'neutral'});
}, 120_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('dial precedence', () => {
  it('headings keeps its weight whatever the order, and type says what it lost', async () => {
    await themeEditSet('s', 'headings', 'light', {cwd});
    const r = await themeEditSet('s', 'type', 'display', {cwd});
    expect(r.data.notes.join(' ')).toContain(
      'heading weight comes from headings, not type',
    );
    expect(read('themes/s/s.settings.ts')).toMatch(
      /"--text-heading-1-weight": "300"/,
    );
    const show = await themeEditShow('s', {cwd});
    const type = show.data.settings.find(x => x.thing === 'type');
    expect(type?.masked).toContain('from headings');
    expect(
      show.data.settings.find(x => x.thing === 'headings')?.masked,
    ).toBeUndefined();
  }, 120_000);

  it('a steep type scale keeps small text at its standard sizes', () => {
    const source = read('themes/s/s.settings.ts');
    expect(source).toContain('"--font-size-4xs": "0.375rem"');
    expect(source).toContain('"--font-size-xs": "0.625rem"');
    expect(source).toContain('"ratio": 1.4');
  });

  it('an exact font size wins over the standard small sizes', async () => {
    await themeEditSet('s', '--font-size-xs', '0.8rem', {cwd});
    await themeEditSet('s', 'type', 'display', {cwd});
    const source = read('themes/s/s.settings.ts');
    expect(source).toContain('"--font-size-xs": "0.8rem"');
    expect(source).toContain('"--font-size-4xs": "0.375rem"');
    await themeEditUndo('s', {cwd, thing: '--font-size-xs'});
  }, 120_000);

  it('show keeps the whole scope of a part setting', async () => {
    await themeEditSet('s', 'background-color', '#ffffff', {
      cwd,
      on: 'button',
      when: 'variant:secondary',
      state: 'hover',
    });
    const show = await themeEditShow('s', {cwd});
    expect(
      show.data.settings.find(x => x.thing === 'background-color'),
    ).toMatchObject({on: 'button', when: 'variant:secondary', state: 'hover'});
    await themeEditUndo('s', {
      cwd,
      thing: 'background-color',
      on: 'button',
      when: 'variant:secondary',
      state: 'hover',
    });
    await themeEditUndo('s', {cwd, thing: 'type'});
    await themeEditUndo('s', {cwd, thing: 'headings'});
  }, 120_000);
});

describe('colors', () => {
  /** @param {string} hex */
  const chroma = hex => {
    const [r, g, b] = /** @type {number[]} */ (parseColor(hex));
    return Math.max(r, g, b) - Math.min(r, g, b);
  };

  it('a gray accent makes gray shades in both modes, with no invented hue', async () => {
    for (const seed of ['#171717', '#e6e6e6']) {
      await themeEditSet('s', 'accent', seed, {cwd});
      const config = JSON.parse(read('themes/s/palette.config.json'));
      expect(config.families[0]).toMatchObject({id: 'accent', kind: 'neutral'});
      const show = await themeEditShow('s', {cwd});
      for (const shades of Object.values(show.data.colors[0].tokens))
        for (const hex of shades.match(/#[0-9a-f]{6}/g) ?? [])
          expect(chroma(hex), `${seed}: ${shades}`).toBeLessThan(0.03);
    }
    // A colored accent afterwards is chromatic again.
    await themeEditSet('s', 'accent', '#7c3aed', {cwd});
    expect(
      JSON.parse(read('themes/s/palette.config.json')).families[0].kind,
    ).toBeUndefined();
  }, 180_000);

  it('neutral leaves the page background to the base theme', async () => {
    await themeEditSet('s', 'neutral', '#425466', {cwd});
    const source = read('themes/s/s.settings.ts');
    expect(source).toMatch(
      /"--color-background-surface": \[\s*palette\.neutral/,
    );
    expect(source).not.toContain('"--color-background-body"');
    await themeEditUndo('s', {cwd, thing: 'neutral'});
  }, 120_000);

  it('set accepts every token a color dial names in its notes', async () => {
    const r = await themeEditSet('s', '--color-icon-accent', '#171717', {cwd});
    expect(r.data.setting.thing).toBe('--color-icon-accent');
    await themeEditUndo('s', {cwd, thing: '--color-icon-accent'});
    await themeEditUndo('s', {cwd, thing: 'accent'});
  }, 120_000);
});

describe('how', () => {
  /** @param {string} q */
  const ask = async q =>
    /** @type {any} */ ((await themeEditHow(q, {cwd})).data);

  it('lists the kinds of list when none is named', async () => {
    const r = /** @type {any} */ (
      (await themeEditHow('', {cwd, list: ''})).data
    );
    expect(r.items.map((/** @type {any} */ x) => x.name)).toEqual([
      'dials',
      'tokens',
      'parts',
      'groups',
      'properties',
    ]);
  });

  it('answers weight and letter spacing once each', async () => {
    const r = await ask('heading weight and letter spacing');
    const texts = r.results.map((/** @type {any} */ x) => x.text);
    expect(new Set(texts).size).toBe(texts.length);
    const commands = r.results.flatMap((/** @type {any} */ x) => x.commands);
    expect(commands.join('\n')).toContain('font-weight');
    expect(commands.join('\n')).toContain('letter-spacing');
  });

  it('turns sizes in the question into --when conditions', async () => {
    const r = await ask('small buttons 6px, large stay pill');
    const commands = r.results
      .flatMap((/** @type {any} */ x) => x.commands)
      .join('\n');
    expect(commands).toContain(
      'set <theme> border-radius 6px --on button --when size:sm',
    );
    expect(commands).toContain(
      'set <theme> corners pill --on button --when size:lg',
    );
    expect(r.understood.parts).not.toContain('badge');
  });

  it('answers a question about another aspect for that aspect, not as a color question', async () => {
    const text = await ask('make the text red');
    expect(text.understood.aspects).toEqual(['text']);
    expect(text.results[0].text).toContain('whole-theme tokens for text');
    const corners = await ask('override the corner radius');
    expect(corners.understood.aspects).toEqual(['corners']);
    expect(JSON.stringify(corners.results)).not.toContain('--color-');
    for (const q of ['make the background red', 'a yellow background']) {
      const bg = await ask(q);
      expect(bg.understood.aspects, q).toEqual(['background']);
      expect(JSON.stringify(bg.results), q).not.toContain('Status colors');
    }
    expect((await ask('error red')).understood.aspects).toEqual(['colors']);
  });

  it('takes each color from the word it belongs to', async () => {
    const r = await ask('secondary button white with accent text');
    const commands = r.results
      .flatMap((/** @type {any} */ x) => x.commands)
      .join('\n');
    expect(commands).toContain(
      'color "var(--color-text-accent)" --on button --when variant:secondary',
    );
    expect(commands).toContain(
      'background "#ffffff" --on button --when variant:secondary',
    );
    expect(commands).not.toContain('color "#ffffff"');
  });
});

describe('preview pages', () => {
  it('leaves app frames out of a description and says what it matched', async () => {
    fs.mkdirSync(path.join(cwd, 'src', 'app'), {recursive: true});
    const r = await themeEditPreviewAdd(
      'a light fintech landing page: announcement bar, nav with sign-in buttons, big two-tone headline, two CTA buttons, and a customer logo strip',
      {cwd, theme: 's'},
    );
    expect(r.data.added).toHaveLength(1);
    expect(r.data.added[0]).not.toMatch(/^shell-/);
    expect(r.data.matched[0].page).toBe(r.data.added[0]);
    expect(r.data.matched[0].why).toContain('app frames');
    expect(r.data.notes.join(' ')).toContain('app frames, not pages');
  }, 240_000);

  it('writes an Overview built to stress the theme and a Components page with one command per cell', async () => {
    await themeEditPreviewAdd(undefined, {cwd, theme: 's'});
    const overview = read('src/app/theme-preview/pages/overview.tsx');
    expect(overview).toContain('s at a glance');
    for (const part of [
      'C.Banner',
      'C.TextInput',
      'C.Table',
      'C.Popover',
      'isLoading',
      'isDisabled',
    ])
      expect(overview).toContain(part);
    expect(overview).not.toContain('AppShell');
    // Open layers come first, so they open below their anchors into free space.
    expect(overview.indexOf('Open layers')).toBeLessThan(
      overview.indexOf('>Type<'),
    );
    const components = read('src/app/theme-preview/pages/components.tsx');
    expect(components).toContain(
      'astryx experimental theme editor set s background',
    );
    expect(components).toContain('function Cell(');
    expect(components).toContain('data display');
    const route = read('src/app/theme-preview/page.tsx');
    expect(route).toContain("position: 'fixed'");
    expect(route).toContain("background: 'var(--color-background-body)'");
  }, 240_000);

  it('keeps a Colors page added with --path in step, so it never imports a deleted file', async () => {
    await themeEditSet('s', 'accent', '#7c3aed', {cwd});
    const r = await themeEditPreviewAdd(undefined, {
      cwd,
      theme: 's',
      path: 'src/app/custom-preview',
    });
    expect(r.data.pages).toContain('colors');
    const page = 'src/app/custom-preview/pages/colors.tsx';
    expect(read(page)).toContain('import {palette}');
    await themeEditUndo('s', {cwd, thing: 'accent'});
    expect(fs.existsSync(path.join(cwd, 'themes/s/tokens/s.palette.ts'))).toBe(
      false,
    );
    expect(read(page)).not.toContain('import {palette}');
    expect(read(page)).toContain('This theme sets no color yet');
  }, 240_000);
});

describe('preview picker refusals', () => {
  it('adds nothing unrelated when no page matches, and names the closest pages', async () => {
    const before = fs.readFileSync(
      path.join(cwd, 'src/app/theme-preview/theme-preview.json'),
      'utf8',
    );
    const r = await refusal(() =>
      themeEditPreviewAdd('a weather widget', {cwd, theme: 's'}),
    );
    expect(r.code).toBe('ERR_NOT_FOUND');
    expect(r.message).toContain('Nothing was written');
    expect(r.run[0]).toMatch(/preview add --template \S+/);
    expect(
      fs.readFileSync(
        path.join(cwd, 'src/app/theme-preview/theme-preview.json'),
        'utf8',
      ),
    ).toBe(before);
  }, 120_000);
});
