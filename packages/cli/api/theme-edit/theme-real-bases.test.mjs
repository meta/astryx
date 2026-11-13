// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Padding against real bundled base themes and a theme source of the
 * person's own: the editor's padding must win over the base theme's,
 * whichever sides it sets, and a side the own source sets must hold under a
 * narrower padding's nested reset.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {execFileSync} from 'node:child_process';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

/** Why a bundled theme could not be built here, when it could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-real-bases-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['butter', 'neutral', 'matcha']);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug @param {string} selector */
const ruleOf = (slug, selector) => {
  const css = fs.readFileSync(
    path.join(cwd, 'themes', slug, `${slug}.css`),
    'utf8',
  );
  const i = css.indexOf(`${selector} {`);
  return i < 0 ? '' : css.slice(i, css.indexOf('}', i));
};

describe('padding on real base themes', () => {
  it("replaces butter's number-input and card padding, side padding included", async ctx => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      return ctx.skip();
    }
    await themeEditNew('b', {cwd, like: 'butter'});
    const before = ruleOf('b', '.astryx-number-input');
    // Butter gives the number input a block and an inline padding.
    expect(before).toMatch(/--astryx-number-input-padding-block-start:/);
    await themeEditSet('b', 'padding', '20px', {cwd, on: 'number-input'});
    const input = ruleOf('b', '.astryx-number-input');
    expect(input).toMatch(/--astryx-number-input-padding:\s*20px/);
    expect(input).not.toMatch(/--astryx-number-input-padding-(block|inline)/);
    await themeEditSet('b', 'padding', '20px', {cwd, on: 'card'});
    const card = ruleOf('b', '.astryx-card');
    expect(card).toMatch(/--astryx-card-padding:\s*20px/);
    expect(card).not.toMatch(/--astryx-card-padding:\s*var\(/);
  }, 240_000);

  it("replaces neutral's card padding", async ctx => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      return ctx.skip();
    }
    await themeEditNew('n', {cwd, like: 'neutral'});
    await themeEditSet('n', 'padding', '20px', {cwd, on: 'card'});
    const card = ruleOf('n', '.astryx-card');
    expect(card).toMatch(/--astryx-card-padding:\s*20px/);
    expect(card).not.toMatch(/--astryx-card-padding:\s*var\(/);
  }, 240_000);

  it('keeps an own-source card side under a clickable card hover padding', async ctx => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      return ctx.skip();
    }
    await themeEditNew('o', {cwd, like: 'neutral'});
    const ts = path.join(cwd, 'themes/o/o.theme.ts');
    const src = fs.readFileSync(ts, 'utf8');
    const own = src.includes('components:')
      ? src.replace(
          'components: {',
          "components: {\n    card: {base: {paddingInlineStart: '3px'}},",
        )
      : src.replace(
          /defineTheme\(\{/,
          "defineTheme({\n  components: {card: {base: {paddingInlineStart: '3px'}}},",
        );
    expect(own).not.toBe(src);
    fs.writeFileSync(ts, own);
    await themeEditShow('o', {cwd});
    await themeEditSet('o', 'padding', '9px', {
      cwd,
      on: 'clickable-card',
      state: 'hover',
    });
    expect(ruleOf('o', '.astryx-card')).toMatch(
      /--astryx-card-padding-inline-start:\s*3px/,
    );
    const reset = ruleOf(
      'o',
      '.astryx-card:where(.astryx-clickable-card:hover *)',
    );
    expect(reset).not.toMatch(/--astryx-card-padding-inline-start/);
  }, 240_000);

  it("lets the own source's padding on a part win over an editor padding there, base and variant", async ctx => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      return ctx.skip();
    }
    await themeEditNew('w', {cwd, like: 'neutral'});
    const ts = path.join(cwd, 'themes/w/w.theme.ts');
    const src = fs.readFileSync(ts, 'utf8');
    const mine =
      "card: {base: {padding: '6px'}, 'variant:muted': {padding: '5px'}}, section: {base: {padding: '6px'}},";
    const own = src.includes('components:')
      ? src.replace('components: {', `components: {\n    ${mine}`)
      : src.replace(
          /defineTheme\(\{/,
          `defineTheme({\n  components: {${mine}},`,
        );
    expect(own).not.toBe(src);
    fs.writeFileSync(ts, own);
    await themeEditShow('w', {cwd});
    const card = await themeEditSet('w', 'padding', '20px', {cwd, on: 'card'});
    expect(card.data.notes.join(' ')).toMatch(
      /w\.theme\.ts sets padding on card itself/,
    );
    expect(ruleOf('w', '.astryx-card')).toMatch(/--astryx-card-padding:\s*6px/);
    await themeEditSet('w', 'padding-left', '30px', {cwd, on: 'section'});
    expect(ruleOf('w', '.astryx-section')).toMatch(
      /--astryx-section-padding:\s*6px/,
    );
    expect(
      fs.readFileSync(path.join(cwd, 'themes/w/w.css'), 'utf8'),
    ).not.toContain('.astryx-section:where(:dir(ltr))');
    // An unequal editor padding on a part's plain rule keeps the plain
    // rule's weight in each direction, so the own variant out-ranks it.
    await themeEditNew('v', {cwd, like: 'neutral'});
    const vts = path.join(cwd, 'themes/v/v.theme.ts');
    const vsrc = fs.readFileSync(vts, 'utf8');
    const vmine = "card: {'variant:muted': {padding: '5px'}},";
    fs.writeFileSync(
      vts,
      vsrc.includes('components:')
        ? vsrc.replace('components: {', `components: {\n    ${vmine}`)
        : vsrc.replace(
            /defineTheme\(\{/,
            `defineTheme({\n  components: {${vmine}},`,
          ),
    );
    await themeEditShow('v', {cwd});
    await themeEditSet('v', 'padding-left', '30px', {cwd, on: 'card'});
    const css = fs.readFileSync(path.join(cwd, 'themes/v/v.css'), 'utf8');
    expect(css).toContain('.astryx-card:where(:dir(ltr)) {');
    expect(css).not.toMatch(/\.astryx-card:dir\(ltr\) \{/);
    expect(ruleOf('v', '.astryx-card[data-variant="muted"]')).toMatch(
      /--astryx-card-padding:\s*5px/,
    );
  }, 240_000);

  it('keeps control sizes apart and in order at every spacing step, the plain scale unless two would meet', async ctx => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      return ctx.skip();
    }
    // Neutral takes Core's 28/32/36px; Matcha sets 36/40/44px. Only tight on
    // Neutral would make two sizes meet (21px under the 24px floor, 24px).
    const want = {
      neutral: {
        tight: [24, 27, 30],
        compact: [25, 28, 32],
        roomy: [32, 36, 41],
        spacious: [35, 40, 45],
      },
      matcha: {
        tight: [27, 30, 33],
        compact: [32, 35, 39],
        roomy: [41, 45, 50],
        spacious: [45, 50, 55],
      },
    };
    for (const [like, steps] of Object.entries(want)) {
      const slug = `sp-${like}`;
      await themeEditNew(slug, {cwd, like});
      for (const [step, sizes] of Object.entries(steps)) {
        await themeEditSet(slug, 'spacing', step, {cwd});
        const css = fs.readFileSync(
          path.join(cwd, 'themes', slug, `${slug}.css`),
          'utf8',
        );
        const got = ['sm', 'md', 'lg'].map(n =>
          Number(new RegExp(`--size-element-${n}:\\s*(\\d+)px`).exec(css)?.[1]),
        );
        expect(got, `${like} ${step}`).toEqual(sizes);
      }
    }
  }, 240_000);

  it('reads an own-source padding edited since the last build, so the set and its note agree', async ctx => {
    if (unbuilt) {
      console.warn(`skipped: ${unbuilt}`);
      return ctx.skip();
    }
    await themeEditNew('ed', {cwd, like: 'neutral'});
    const ts = path.join(cwd, 'themes/ed/ed.theme.ts');
    const src = fs.readFileSync(ts, 'utf8');
    const mine = "card: {base: {padding: '6px'}},";
    fs.writeFileSync(
      ts,
      src.includes('components:')
        ? src.replace('components: {', `components: {\n    ${mine}`)
        : src.replace(
            /defineTheme\(\{/,
            `defineTheme({\n  components: {${mine}},`,
          ),
    );
    // No build between the edit and the set.
    const r = await themeEditSet('ed', 'padding', '20px', {cwd, on: 'card'});
    expect(r.data.notes.join(' ')).toMatch(
      /ed\.theme\.ts sets padding on card itself/,
    );
    expect(ruleOf('ed', '.astryx-card')).toMatch(
      /--astryx-card-padding:\s*6px/,
    );
    expect(ruleOf('ed', '.astryx-card')).not.toMatch(/20px/);
  }, 240_000);

  describe('one-mode colors, kept sizes and own padding sides', () => {
    /** @param {string} slug @param {string} mine */
    const ownEdit = (slug, mine) => {
      const ts = path.join(cwd, 'themes', slug, `${slug}.theme.ts`);
      const src = fs.readFileSync(ts, 'utf8');
      fs.writeFileSync(
        ts,
        src.includes('components:')
          ? src.replace('components: {', `components: {\n    ${mine}`)
          : src.replace(
              /defineTheme\(\{/,
              `defineTheme({\n  components: {${mine}},`,
            ),
      );
    };
    /** @param {string} slug */
    const cssOf = slug =>
      fs.readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8');

    it("fills only its mode's half with a color set in a one-mode theme, and keeps a saved --mode half", async ctx => {
      if (unbuilt) return ctx.skip();
      await themeEditNew('om1', {cwd, like: 'neutral'});
      await themeEditSet('om1', 'background', '#eeeeee', {
        cwd,
        on: 'button',
        when: 'variant:secondary',
        mode: 'light',
      });
      await themeEditSet('om1', 'mode', 'light-only', {cwd});
      expect(ruleOf('om1', '.astryx-button[data-variant="secondary"]')).toMatch(
        /background(-color)?:\s*light-dark\(#eeeeee,/,
      );
      await themeEditSet('om1', 'background', '#f4f4f4', {cwd, on: 'card'});
      // Each card variant reads its own background: each keeps exactly its
      // own other half (parts43).
      expect(ruleOf('om1', '.astryx-card[data-variant="default"]')).toMatch(
        /background-color:\s*light-dark\(#f4f4f4, var\(--color-background-card\)\)/,
      );
      await themeEditSet('om1', '--color-background-card', '#fafafa', {cwd});
      expect(cssOf('om1')).toMatch(
        /--color-background-card:\s*light-dark\(#fafafa,/,
      );
      const both = await themeEditSet('om1', 'mode', 'both', {cwd});
      expect(both.data.notes.join(' ')).toMatch(/mode="light".*take it out/);
    }, 240_000);

    it('keeps control sizes in order around an exact size the theme keeps', async ctx => {
      if (unbuilt) return ctx.skip();
      await themeEditNew('ks', {cwd, like: 'neutral'});
      await themeEditSet('ks', '--size-element-md', '34px', {cwd});
      for (const step of ['tight', 'spacious']) {
        await themeEditSet('ks', 'spacing', step, {cwd});
        const css = cssOf('ks');
        const [sm, md, lg] = ['sm', 'md', 'lg'].map(n =>
          Number(new RegExp(`--size-element-${n}:\\s*(\\d+)px`).exec(css)?.[1]),
        );
        expect(md, step).toBe(34);
        expect(sm, step).toBeLessThan(md);
        expect(lg, step).toBeGreaterThan(md);
      }
    }, 240_000);

    it("lets own sides win and the editor's other sides apply, on a plain part and a card (butter)", async ctx => {
      if (unbuilt) return ctx.skip();
      await themeEditNew('ob', {cwd, like: 'butter'});
      ownEdit(
        'ob',
        "button: {base: {paddingInline: '30px'}}, card: {base: {paddingInline: '6px'}},",
      );
      const r = await themeEditSet('ob', 'padding', '2px', {cwd, on: 'button'});
      expect(r.data.notes.join(' ')).toMatch(/other sides take this setting/);
      const button = ruleOf('ob', '.astryx-button');
      expect(button).toMatch(/padding-inline:\s*30px/);
      expect(button).not.toMatch(/(^|[;{\s])padding:\s*2px/);
      expect(button).toMatch(/padding-(block-start|top):\s*2px/);
      await themeEditSet('ob', 'padding', '20px', {cwd, on: 'card'});
      const card = ruleOf('ob', '.astryx-card');
      expect(card).toMatch(/--astryx-card-padding-block-start:\s*20px/);
      expect(card).toMatch(/--astryx-card-padding-inline(-start)?:\s*6px/);
    }, 240_000);

    it('keeps physical sides physical next to own sides, in each text direction (butter)', async ctx => {
      if (unbuilt) return ctx.skip();
      // Own physical left: the editor's left is never written (in either
      // direction), its right stays a physical right.
      await themeEditNew('pr', {cwd, like: 'butter'});
      ownEdit('pr', "button: {base: {paddingLeft: '30px'}},");
      await themeEditSet('pr', 'padding', '2px 4px 6px 8px', {
        cwd,
        on: 'button',
      });
      const button = ruleOf('pr', '.astryx-button');
      expect(button).toMatch(/padding-left:\s*30px/);
      expect(button).toMatch(/padding-right:\s*4px/);
      expect(button).toMatch(/padding-top:\s*2px/);
      expect(button).toMatch(/padding-bottom:\s*6px/);
      // (Butter's own padding-inline comes first in the rule; the editor
      // writes no logical side.)
      expect(button).not.toMatch(/padding-inline-(start|end)/);
      expect(button).not.toMatch(/padding-left:\s*8px/);
      expect(button.indexOf('padding-right')).toBeGreaterThan(
        button.indexOf('padding-inline'),
      );
      // Own logical start: the editor's left shows only right-to-left (where
      // the start is the right), its right only left-to-right.
      await themeEditNew('pl', {cwd, like: 'butter'});
      ownEdit('pl', "button: {base: {paddingInlineStart: '30px'}},");
      await themeEditSet('pl', 'padding-left', '8px', {cwd, on: 'button'});
      await themeEditSet('pl', 'padding-right', '4px', {cwd, on: 'button'});
      expect(ruleOf('pl', '.astryx-button')).not.toMatch(
        /padding-(left|right):/,
      );
      expect(ruleOf('pl', '.astryx-button:where(:dir(rtl))')).toMatch(
        /padding-left:\s*8px/,
      );
      expect(ruleOf('pl', '.astryx-button:where(:dir(ltr))')).toMatch(
        /padding-right:\s*4px/,
      );
      expect(ruleOf('pl', '.astryx-button:where(:dir(ltr))')).not.toMatch(
        /padding-left/,
      );
      expect(ruleOf('pl', '.astryx-button:where(:dir(rtl))')).not.toMatch(
        /padding-right/,
      );
      // In a page under each direction (a dir="rtl" ancestor), the own start
      // side holds and the editor's sides land on the other side.
      const chromium = ['chromium-browser', 'chromium', 'google-chrome'].find(
        bin => {
          try {
            execFileSync('which', [bin], {stdio: 'ignore'});
            return true;
          } catch {
            return false;
          }
        },
      );
      if (!chromium) {
        console.warn('no headless Chromium here: the render check did not run');
        return;
      }
      const css = fs.readFileSync(path.join(cwd, 'themes/pl/pl.css'), 'utf8');
      /** @param {'ltr' | 'rtl'} dir */
      const padding = dir => {
        const page = path.join(path.dirname(cwd), `pl-${dir}.html`);
        fs.writeFileSync(
          page,
          `<!doctype html><html><head><style>${css}</style></head><body>` +
            `<div data-astryx-theme="pl" dir="${dir}"><button class="astryx-button" id="b">x</button></div>` +
            '<pre id="r"></pre><script>const c=getComputedStyle(document.getElementById("b"));' +
            'document.getElementById("r").textContent=c.paddingLeft+" "+c.paddingRight</script></body></html>',
        );
        const dom = execFileSync(
          chromium,
          [
            '--headless=new',
            '--no-sandbox',
            '--disable-gpu',
            '--dump-dom',
            `file://${page}`,
          ],
          {
            encoding: 'utf8',
            timeout: 60_000,
            stdio: ['ignore', 'pipe', 'ignore'],
          },
        );
        return /<pre id="r">([^<]*)<\/pre>/.exec(dom)?.[1];
      };
      expect(padding('ltr')).toBe('30px 4px');
      expect(padding('rtl')).toBe('8px 30px');
    }, 240_000);

    it('lets an own variant padding win over an unequal editor padding on the plain rule', async ctx => {
      if (unbuilt) return ctx.skip();
      await themeEditNew('ov', {cwd, like: 'neutral'});
      ownEdit('ov', "card: {'variant:muted': {padding: '5px'}},");
      await themeEditSet('ov', 'padding', '4px 8px', {cwd, on: 'card'});
      const muted = ruleOf('ov', '.astryx-card[data-variant="muted"]');
      expect(muted).toMatch(/--astryx-card-padding:\s*5px/);
      for (const x of [
        'block-start',
        'block-end',
        'inline-start',
        'inline-end',
      ])
        expect(muted, x).toMatch(
          new RegExp(`--astryx-card-padding-${x}:\\s*initial`),
        );
    }, 240_000);
  });
});
