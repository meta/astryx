// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What a real theming round found in `astryx experimental theme`:
 * which dial wins and saying so, small text under a steep type scale, gray
 * seeds, the page background under a neutral, tokens a dial writes, `how`
 * answers that follow the question, the preview page picker, and the
 * Overview and Components pages.
 */

import {execFile} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {promisify} from 'node:util';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
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

import {withRealRenders} from '../../test-utils/theme-render-stub.mjs';
import {
  appPackages,
  projectFiles,
  refusal,
} from '../../test-utils/theme-edit-fixture.mjs';
// The page renders cost seconds and these tests read settings, builds and
// files: a stand-in renders unless a test asks for the real thing.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

const APP_PACKAGES = appPackages();

/** @type {string} */
let cwd;
const {read} = projectFiles(() => cwd);

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-stress-', [
    ...FIXTURE_PACKAGES,
    '@types/react',
    '@types/react-dom',
    // The template pages' packages are installed, not only named.
    '@heroicons/react',
    'lucide-react',
    'recharts',
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
      'type still sets the heading sizes and line heights; heading weight comes from headings',
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
    /** @type {any} */ ((await themeEditHow(q, {cwd, theme: 's'})).data);

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
      'set s border-radius 6px --on button --when size:sm',
    );
    expect(commands).toContain('set s corners pill --on button --when size:lg');
    expect(r.understood.parts).not.toContain('badge');
  });

  it('answers a question about another aspect for that aspect, not as a color question', async () => {
    const text = await ask('make the text red');
    expect(text.understood.aspects).toEqual(['text']);
    expect(text.results[0].text).toContain('--color-text-primary');
    const corners = await ask('override the corner radius');
    expect(corners.understood.aspects).toEqual(['corners']);
    expect(JSON.stringify(corners.results)).not.toContain('--color-');
    for (const q of ['make the background red', 'a yellow background']) {
      const bg = await ask(q);
      expect(bg.understood.aspects, q).toEqual(['background']);
      expect(JSON.stringify(bg.results), q).not.toContain('Status colors');
    }
    expect((await ask('error red')).understood.aspects).toEqual(['colors']);
    const statusBg = await ask('make the error background red');
    expect(statusBg.understood.aspects).toEqual(['colors']);
    expect(statusBg.results[0].commands[0]).toContain('set s danger');
  });

  it('takes each color from the word it belongs to', async () => {
    const r = await ask('secondary button white with accent text');
    const commands = r.results
      .flatMap((/** @type {any} */ x) => x.commands)
      .join('\n');
    expect(commands).toContain(
      "color 'var(--color-text-accent)' --on button --when variant:secondary",
    );
    expect(commands).toContain(
      "background '#ffffff' --on button --when variant:secondary",
    );
    expect(commands).not.toContain("color '#ffffff'");
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
    expect(r.data.matched[0].why).toContain('the closest page');
    expect(r.data.matched[0].why).toMatch(/it covers \w+/);
    expect(r.data.notes.join(' ')).toContain('app frames, not pages');
  }, 240_000);

  it('writes an Overview built to stress the theme and a Components page with one command per cell', async () => {
    await themeEditPreviewAdd(undefined, {cwd, theme: 's'});
    const overview = read('src/app/theme-preview/_pages/overview.tsx');
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
    const components = read('src/app/theme-preview/_pages/components.tsx');
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
    const page = 'src/app/custom-preview/_pages/colors.tsx';
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
    expect(r.message).toContain('No page template relates');
    expect(r.run[0]).toMatch(/preview add --template \S+ --theme s$/);
    expect(
      fs.readFileSync(
        path.join(cwd, 'src/app/theme-preview/theme-preview.json'),
        'utf8',
      ),
    ).toBe(before);
  }, 120_000);
});

describe('round 3', () => {
  it('skips a page the app cannot show and takes the next match', async () => {
    const r = await themeEditPreviewAdd(
      'a work item detail page with title, description, activity feed and a properties panel',
      {cwd, theme: 's', path: 'src/app/r3'},
    );
    expect(r.data.skipped.map(x => x.page)).toContain('work-item-detail');
    expect(r.data.added).toHaveLength(1);
    expect(r.data.added[0]).not.toBe('work-item-detail');
    expect(r.data.notes.join(' ')).toContain('in its place');
  }, 240_000);

  it('labels a page by its template name, however it was added', async () => {
    await themeEditPreviewAdd(undefined, {
      cwd,
      theme: 's',
      template: 'centered-hero',
      path: 'src/app/r3',
    });
    expect(read('src/app/r3/page.tsx')).toContain(
      '{id: "centered-hero", label: "Centered Hero"',
    );
  }, 240_000);

  it('keeps the exact accent in dark when text on it reads', async () => {
    await themeEditSet('s', 'accent', '#5e6ad2', {cwd});
    const show = await themeEditShow('s', {cwd});
    expect(show.data.resolved['--color-accent']).toEqual({
      light: '#5e6ad2',
      dark: '#5e6ad2',
    });
    expect(show.data.colors[0].tokens['--color-accent']).toContain(
      '(your exact color)',
    );
    expect(show.data.resolved['--radius-element']).toMatch(/px$/);
  }, 120_000);

  it('says which colors keep the base theme at any vibrancy, with the commands', async () => {
    const r = await themeEditSet('s', 'vibrancy', '0', {cwd});
    const note = r.data.notes.join(' ');
    expect(note).toContain('keep the base theme');
    expect(note).toContain('colored cards');
    expect(note).toMatch(/set s info '#[0-9a-fA-F]{6}'/);
    await themeEditUndo('s', {cwd, thing: 'vibrancy'});
    await themeEditUndo('s', {cwd, thing: 'accent'});
  }, 120_000);

  it('names parts inside the part a token is set on', async () => {
    const r = await themeEditSet('s', '--color-text-primary', '#ffffff', {
      cwd,
      on: 'toast',
    });
    expect(r.data.notes.join(' ')).toContain('on button inside toast');
    await themeEditUndo('s', {
      cwd,
      thing: '--color-text-primary',
      on: 'toast',
    });
  }, 120_000);

  it('answers the resting border, and a fill and text together', async () => {
    const border = /** @type {any} */ (
      (
        await themeEditHow(
          'secondary button with accent colored text and thin border',
          {cwd, theme: 's'},
        )
      ).data
    );
    const b = border.results.map((/** @type {any} */ x) => x.commands).flat();
    expect(b.join('\n')).toContain(
      'set s border-width 1px --on button --when variant:secondary',
    );
    expect(b.join('\n')).toContain("color 'var(--color-text-accent)'");
    const fill = /** @type {any} */ (
      (
        await themeEditHow(
          'make the primary button light gray with dark text',
          {
            cwd,
          },
        )
      ).data
    );
    expect([...fill.understood.aspects].sort()).toEqual(['background', 'text']);
    const f = fill.results.map((/** @type {any} */ x) => x.commands).flat();
    expect(f.join('\n')).toContain("background '#e5e7eb' --on button");
    expect(f.join('\n')).toContain("color '#111827' --on button");
  });

  it('gives every controlled sample a change handler, so a click never throws', () => {
    for (const page of ['overview', 'components']) {
      const source = read(`src/app/theme-preview/_pages/${page}.tsx`);
      const tags =
        source.match(/<C\.(TabList|SegmentedControl)\b[^\n]*/g) ?? [];
      expect(tags.length, page).toBeGreaterThan(0);
      for (const tag of tags) expect(tag, page).toContain('onChange={() =>');
    }
  });
});

describe('round 4', () => {
  it('prefers an app page the description names, a side hero when asked, and notes the nav', async () => {
    const app = await themeEditPreviewAdd(
      'dark product marketing landing page with big hero headline, top nav, and an issue-tracker app screenshot',
      {cwd, theme: 's', path: 'src/app/r4'},
    );
    expect(app.data.added).toEqual(['table-grouped']);
    expect(app.data.matched[0].why).toContain('names issue-tracker');
    expect(app.data.notes.join(' ')).toContain('no page has a top nav');
    const side = await themeEditPreviewAdd(
      'marketing landing page with a left-aligned hero headline and two CTA buttons',
      {cwd, theme: 's', path: 'src/app/r4'},
    );
    expect(side.data.added).toEqual(['side-gallery']);
    const again = await themeEditPreviewAdd(undefined, {
      cwd,
      theme: 's',
      path: 'src/app/r4',
    });
    expect(again.data.added).toEqual(
      expect.arrayContaining(['overview', 'components']),
    );
    const twice = await themeEditPreviewAdd(undefined, {
      cwd,
      theme: 's',
      path: 'src/app/r4',
    });
    expect(twice.data.added).toEqual([]);
    expect(twice.data.refreshed).toEqual(
      expect.arrayContaining(['overview', 'components']),
    );
  }, 300_000);

  it('gives each token a value of its own type, and keeps a named tint', async () => {
    const border = /** @type {any} */ (
      (
        await themeEditHow('border color of cards and dividers', {
          cwd,
          theme: 's',
        })
      ).data
    );
    const commands = border.results
      .flatMap((/** @type {any} */ x) => x.commands)
      .join('\n');
    expect(border.understood.aspects).toEqual(['border']);
    // The text names the token cards read for their border.
    expect(border.results[0].text).toContain('--color-border');
    expect(commands).not.toMatch(/<color>|<value>|--color-border "1px solid/);
    const tint = /** @type {any} */ (
      (
        await themeEditHow('secondary button light blue tint with blue text', {
          cwd,
        })
      ).data
    );
    expect([...tint.understood.aspects].sort()).toEqual(['background', 'text']);
  });

  it('names the removed setting on undo, never as the value in effect', async () => {
    await themeEditSet('s', 'corners', 'large', {cwd, on: 'containers'});
    const show = await themeEditShow('s', {cwd});
    expect(show.data.partValues[0]).toMatch(
      // What the build writes on a container (large, by the container
      // radius), not the element's 12px.
      /^corners = large on containers -> border-radius \d+px.*card.*\(whole theme: --radius-container \d+px\)$/,
    );
    const r = await themeEditUndo('s', {
      cwd,
      thing: 'corners',
      on: 'containers',
    });
    expect(r.data.removed).toMatchObject({thing: 'corners', value: 'large'});
  }, 120_000);

  it('says what type still sets, keeps text-size as the scale base, and names the page background', async () => {
    await themeEditSet('s', 'text-size', 'larger', {cwd});
    await themeEditSet('s', 'headings', 'bold', {cwd});
    const t = await themeEditSet('s', 'type', 'editorial', {cwd});
    expect(t.data.notes.join(' ')).toContain(
      'type still sets the heading sizes and line heights',
    );
    expect(read('themes/s/s.settings.ts')).toMatch(
      /"scale": \{\s*"base": 16,\s*"ratio": 1\.3/,
    );
    for (const thing of ['type', 'headings', 'text-size'])
      await themeEditUndo('s', {cwd, thing});
    const n = await themeEditSet('s', 'neutral', '#64748b', {cwd});
    expect(n.data.notes.join(' ')).toMatch(
      /the page background stays the base theme's \(#[0-9a-fA-F]{6} in light.*--color-background-body '#ffffff' --mode light/,
    );
    await themeEditUndo('s', {cwd, thing: 'neutral'});
  }, 240_000);

  it('says which tokens a token feeds instead of claiming it changes nothing', async () => {
    const r = await themeEditSet('s', '--color-success-muted', '#dcfce7', {
      cwd,
    });
    expect(r.data.notes.join(' ')).toContain('--color-syntax-added');
    await themeEditUndo('s', {cwd, thing: '--color-success-muted'});
  }, 120_000);

  it('a single-mode theme shows only its mode', async () => {
    await themeEditNew('one', {
      cwd,
      like: 'neutral',
      settings: {mode: 'light-only', accent: '#7c3aed'},
    });
    const show = await themeEditShow('one', {cwd});
    for (const shades of Object.values(show.data.colors[0].tokens))
      expect(shades).not.toContain('dark');
    expect(show.data.colorNotes.join(' ')).not.toContain(' dark:');
    fs.rmSync(path.join(cwd, 'themes/one'), {recursive: true, force: true});
  }, 120_000);
});

describe('round 4 follow-ups', () => {
  it('gives token lines a color or width when the resting border reads a token', async () => {
    const r = /** @type {any} */ (
      (await themeEditHow('thin gray border on inputs', {cwd, theme: 's'})).data
    );
    const lines = r.results.flatMap((/** @type {any} */ x) => x.commands);
    // The width and the color the question names, with no comment or
    // placeholder in the command.
    expect(lines.join('\n')).toContain(
      "set s border '1px solid #9ca3af' --on inputs",
    );
    expect(lines.join('\n')).not.toMatch(/#\s|<color>/);
  });

  it('moves the dark fill off an exact color that disappears on the dark page', async () => {
    const r = await themeEditSet('s', 'accent', '#1e3a8a', {cwd});
    expect(r.data.notes.join(' ')).toContain(
      'stands out from the dark page at only',
    );
    const show = await themeEditShow('s', {cwd});
    expect(show.data.resolved['--color-accent']).toMatchObject({
      light: '#1e3a8a',
    });
    expect(
      /** @type {any} */ (show.data.resolved['--color-accent']).dark,
    ).not.toBe('#1e3a8a');
  }, 120_000);

  it('marks an exact dark fill on its own dark shade on the Colors page', async () => {
    await themeEditSet('s', 'accent', '#5e6ad2', {cwd});
    await themeEditPreviewAdd(undefined, {cwd, theme: 's', path: 'src/app/r4'});
    const page = read('src/app/r4/_pages/colors.tsx');
    const dark = JSON.parse(read('themes/s/palette.config.json'))
      .families.find((/** @type {any} */ f) => f.id === 'accent')
      .anchors.find((/** @type {any} */ a) => a.mode === 'dark');
    const uses = JSON.parse(
      /** @type {string} */ (/const USES: [^=]+= (\{.*\});/.exec(page)?.[1]),
    );
    expect(uses.accent.dark[dark.stop]).toContain('--color-accent');
    expect(page).not.toContain('mode too');
    await themeEditUndo('s', {cwd, thing: 'accent'});
  }, 240_000);

  it('quotes the options it repeats in a suggestion', async () => {
    fs.mkdirSync(path.join(cwd, 'src/app/my preview'), {recursive: true});
    const r = await refusal(() =>
      themeEditPreviewAdd('a weather widget', {
        cwd,
        theme: 's',
        path: 'src/app/my preview',
      }),
    );
    expect(r.run[0]).toMatch(/--theme s --path 'src\/app\/my preview'$/);
  }, 120_000);
});

describe('round 5', () => {
  it('matches app phrases, not loose words, and a detail view before its list', async () => {
    const ai = await themeEditPreviewAdd(
      'a landing page for an AI tool with a big hero headline and two CTA buttons',
      {cwd, theme: 's', path: 'src/app/r5'},
    );
    expect(ai.data.added[0]).not.toMatch(/^ai-chat/);
    const event = await refusal(() =>
      themeEditPreviewAdd(
        'an event page for a concert with a date, venue, lineup and a buy tickets button',
        {cwd, theme: 's', path: 'src/app/r5'},
      ),
    );
    expect(event.code).toBe('ERR_NOT_FOUND');
    const detail = await themeEditPreviewAdd(
      'an issue detail page with title, description, comments and a properties panel',
      {cwd, theme: 's', path: 'src/app/r5'},
    );
    // work-item-detail needs StyleX here, so the next detail page is taken.
    expect(detail.data.added).toEqual(['detail-page']);
    expect(detail.data.skipped.map(x => x.page)).toContain('work-item-detail');
  }, 300_000);

  it('keeps the fill when the color word belongs to it', async () => {
    for (const q of [
      'dark card with a thin border',
      'change the card color and its border',
      'colored buttons with a border',
    ]) {
      const r = /** @type {any} */ ((await themeEditHow(q, {cwd})).data);
      expect([...r.understood.aspects].sort(), q).toEqual([
        'background',
        'border',
      ]);
    }
    const border = /** @type {any} */ (
      (await themeEditHow('a gray border on cards', {cwd})).data
    );
    expect(border.understood.aspects).toEqual(['border']);
  });

  it('shows the radius token each part reads, and a dark page offer only where it fits', async () => {
    await themeEditSet('s', 'corners', 'large', {cwd, on: 'menus'});
    const show = await themeEditShow('s', {cwd});
    expect(
      show.data.partValues.find(x => x.startsWith('corners = large on menus')),
    ).toContain('(whole theme: --radius-container');
    await themeEditUndo('s', {cwd, thing: 'corners', on: 'menus'});
    await themeEditNew('dk', {
      cwd,
      like: 'neutral',
      settings: {mode: 'dark-only'},
    });
    const n = await themeEditSet('dk', 'neutral', '#64748b', {cwd});
    const note = n.data.notes.join(' ');
    expect(note).not.toContain('in light');
    expect(note).not.toContain('"#ffffff"');
    fs.rmSync(path.join(cwd, 'themes/dk'), {recursive: true, force: true});
  }, 240_000);

  it('starts a dark fill that cannot keep the exact color at shade 70, as the theme guide does', async () => {
    const r = await themeEditSet('s', 'accent', '#7c3aed', {cwd});
    expect(r.data.notes.join(' ')).toContain(
      'in dark, --color-accent is shade 70',
    );
    await themeEditUndo('s', {cwd, thing: 'accent'});
  }, 120_000);
});

describe('review fixes', () => {
  const bin = path.resolve(
    import.meta.dirname,
    '../../clients/cli/bin/astryx.mjs',
  );
  /** @param {string[]} args */
  const cli = args =>
    promisify(execFile)(process.execPath, [bin, '--json', ...args], {
      cwd,
    }).then(
      r => ({code: 0, out: JSON.parse(r.stdout)}),
      e => ({code: e.code, out: JSON.parse(e.stdout || '{}')}),
    );

  it('checks translucent text over what is under it', async () => {
    for (const v of ['rgba(0,0,0,0.15)', '#11111122']) {
      const r = await themeEditSet('s', '--color-text-primary', v, {
        cwd,
        mode: 'light',
      });
      expect(r.data.problems.join(' '), v).toMatch(/is 1\.\d+:1 in light/);
      await themeEditUndo('s', {
        cwd,
        thing: '--color-text-primary',
        mode: 'light',
      });
    }
  }, 240_000);

  it(
    'lets two commands run at once, and a saved change never exits 1',
    () =>
      withRealRenders(async () => {
        await themeEditNew('cc', {cwd, like: 'neutral'});
        const [a, b] = await Promise.all([
          cli(['experimental', 'theme', 'editor', 'show', 's']),
          cli([
            'experimental',
            'theme',
            'editor',
            'set',
            'cc',
            'corners',
            'small',
          ]),
        ]);
        expect([a.code, b.code]).toEqual([0, 0]);
        expect(
          fs
            .readdirSync(path.join(cwd, 'themes'))
            .filter(f => f.startsWith('.astryx-render')),
        ).toEqual([]);
        fs.rmSync(path.join(cwd, 'themes/cc'), {recursive: true, force: true});
      }),
    240_000,
  );

  it("a one-mode theme leaves the other mode's settings out and names them", async () => {
    await themeEditNew('om', {
      cwd,
      like: 'neutral',
      settings: {accent: '#7c3aed'},
    });
    await themeEditSet('om', '--color-text-primary', '#bbbbbb', {
      cwd,
      mode: 'light',
    });
    const r = await themeEditSet('om', 'mode', 'dark-only', {cwd});
    expect(r.data.notes.join(' ')).toContain(
      'not applied in a dark-only theme',
    );
    expect(r.data.changedTokens.join(' ')).not.toContain('#bbbbbb');
    expect(read('themes/om/om.settings.ts')).toMatch(
      /"--color-accent": palette\.accent\.dark\[\d+\],/,
    );
    const show = await themeEditShow('om', {cwd});
    expect(
      show.data.settings.find(x => x.thing === '--color-text-primary')?.masked,
    ).toContain('does not apply');
    await themeEditPreviewAdd(undefined, {
      cwd,
      theme: 'om',
      path: 'src/app/om',
    });
    const route = read('src/app/om/page.tsx');
    expect(route).toContain('const mode: Mode = "dark";');
    expect(route).not.toContain('SegmentedControlItem value="light"');
    fs.rmSync(path.join(cwd, 'themes/om'), {recursive: true, force: true});
    fs.rmSync(path.join(cwd, 'src/app/om'), {recursive: true, force: true});
  }, 240_000);

  it('starts a new history when it is damaged, and undo says how to fix it', async () => {
    await themeEditNew('hi', {cwd, like: 'neutral'});
    fs.writeFileSync(path.join(cwd, 'themes/hi/hi.history.json'), '{');
    const before = read('themes/hi/hi.settings.json');
    const u = await refusal(() => themeEditUndo('hi', {cwd}));
    expect(u.code).toBe('ERR_THEME_INVALID');
    expect(u.message).toContain('delete themes/hi/hi.history.json');
    expect(read('themes/hi/hi.settings.json')).toBe(before);
    const r = await themeEditSet('hi', 'spacing', 'roomy', {cwd});
    expect(r.data.notes.join(' ')).toContain('a new undo history starts');
    expect(JSON.parse(read('themes/hi/hi.history.json'))).toHaveLength(1);
    fs.rmSync(path.join(cwd, 'themes/hi'), {recursive: true, force: true});
  }, 240_000);

  it('a change that changes nothing builds nothing and adds no undo step', async () => {
    await themeEditNew('nc', {cwd, like: 'neutral'});
    await themeEditSet('nc', 'corners', 'pill', {cwd});
    const steps = JSON.parse(read('themes/nc/nc.history.json')).length;
    const again = await themeEditSet('nc', 'corners', 'pill', {cwd});
    expect(again.data.notes[0]).toContain('no change');
    expect(JSON.parse(read('themes/nc/nc.history.json'))).toHaveLength(steps);
    fs.rmSync(path.join(cwd, 'themes/nc'), {recursive: true, force: true});
  }, 240_000);

  it("picks shades against the theme's own exact page color", async () => {
    await themeEditNew('pg', {
      cwd,
      like: 'neutral',
      settings: {accent: '#7c3aed'},
    });
    await themeEditSet('pg', '--color-background-body', '#7a5fd0', {
      cwd,
      mode: 'light',
    });
    const show = await themeEditShow('pg', {cwd});
    const note = show.data.colorNotes.find(n =>
      n.startsWith('--color-text-accent light'),
    );
    expect(note).toBeDefined();
    expect(note).not.toContain('4.64:1');
    fs.rmSync(path.join(cwd, 'themes/pg'), {recursive: true, force: true});
  }, 240_000);

  it('says what applies once a part setting is removed', async () => {
    await themeEditNew('ua', {cwd, like: 'neutral'});
    await themeEditSet('ua', 'corners', 'large', {cwd});
    await themeEditSet('ua', 'corners', '12px', {cwd, on: 'button'});
    const r = await themeEditUndo('ua', {cwd, thing: 'corners', on: 'button'});
    expect(r.data.now).toBe('corners = large (whole theme)');
    fs.rmSync(path.join(cwd, 'themes/ua'), {recursive: true, force: true});
  }, 240_000);

  it('answers border-only questions without a fill', async () => {
    for (const q of [
      'a light gray border on cards',
      'change the color of the border on cards',
      'make the card border thicker in dark mode',
    ]) {
      const r = /** @type {any} */ ((await themeEditHow(q, {cwd})).data);
      expect(r.understood.aspects, q).toEqual(['border']);
    }
  });

  it('gives an article or blog page for a story or a blog post, never a record page', async () => {
    const news = await themeEditPreviewAdd(
      'a news story page with a headline, byline, hero image and related stories',
      {cwd, theme: 's', path: 'src/app/rv'},
    );
    expect(news.data.added).not.toContain('detail-page');
    const blog = await themeEditPreviewAdd('a blog post page', {
      cwd,
      theme: 's',
      path: 'src/app/rv',
    });
    expect(blog.data.added.length + blog.data.refreshed.length).toBe(1);
    fs.rmSync(path.join(cwd, 'src/app/rv'), {recursive: true, force: true});
  }, 300_000);

  it('names the radius token each part reads, or says it is unknown', async () => {
    await themeEditSet('s', 'corners', 'large', {cwd, on: 'checks'});
    const show = await themeEditShow('s', {cwd});
    const line = show.data.partValues.find(x =>
      x.startsWith('corners = large on checks'),
    );
    expect(line).toContain('--radius-inner 4px for checkbox-indicator');
    // The radio list renders from its doc's playground, so its dot's
    // token is known too.
    expect(line).toContain('--radius-full 9999px for radio-indicator');
    await themeEditUndo('s', {cwd, thing: 'corners', on: 'checks'});
  }, 120_000);

  it('says a preview outside the routes folder is not served', async () => {
    const r = await themeEditPreviewAdd(undefined, {
      cwd,
      theme: 's',
      path: 'elsewhere',
    });
    expect(r.data.open).toContain("outside the app's routes folder");
    fs.rmSync(path.join(cwd, 'elsewhere'), {recursive: true, force: true});
  }, 120_000);
});
