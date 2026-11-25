// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file font-loading.spec.ts
 * @input Production docsite: the home page at a desktop size and at a phone
 *   size, the community page, and the playground's preview frame
 * @output Proof that the hero reel loads ahead of time each font weight that
 *   the cards of a slide ask for, and no other; that the themes card draws
 *   its "Aa" with no text, so that no text of the home page asks for the
 *   display font of a theme; and that the home page asks for Playwrite US
 *   Trad at weight 400 only, and the preview frame for the range after it
 * @position Docsite browser tests. hero-theme-content.test.ts pins the list
 *   of fonts; only a browser computes the font that card text asks for.
 *   Each check reads what a page asks the browser for, and not which font
 *   files arrive, so no check needs the font host.
 */

import {expect, test, type Page} from '@playwright/test';
import {expectTooltipsLive} from './liveTooltips';

const SLIDE_COUNT = 5;

const FONT_STYLESHEETS =
  'link[rel="stylesheet"][href^="https://fonts.googleapis.com/"]';

/** The weights that each font stylesheet of the page asks Playwrite for. */
function playwriteWeights(page: Page) {
  return page
    .locator(FONT_STYLESHEETS)
    .evaluateAll((links: HTMLLinkElement[]) =>
      links.map(link =>
        new URL(link.href).searchParams
          .getAll('family')
          .filter(family => family.startsWith('Playwrite US Trad'))
          .join(),
      ),
    );
}

// The display fonts of the reel's themes. The site's font stylesheet has
// them for other pages. The home page draws no text in them.
const DISPLAY_FONTS = ['Sarina', 'Manufacturing Consent', 'Crimson Text'];

/**
 * Records each `document.fonts.load()` call of the page. Returns a function
 * that reads the specifiers of the calls so far.
 */
async function recordFontLoads(page: Page) {
  await page.addInitScript(() => {
    const loads: string[] = [];
    Object.assign(window, {recordedFontLoads: loads});
    const load = document.fonts.load.bind(document.fonts);
    document.fonts.load = (font: string, text?: string) => {
      loads.push(font);
      return load(font, text);
    };
  });
  return () =>
    page.evaluate(
      () =>
        (window as unknown as {recordedFontLoads: string[]}).recordedFontLoads,
    );
}

/**
 * The fonts that drawn text asks for, as `document.fonts.load()` specifiers:
 * the first family and the weight of each piece of text that has a box.
 * With `inHeroCards`, only the text of the hero cards layer that shows.
 */
function fontsOfText(page: Page, {inHeroCards}: {inHeroCards: boolean}) {
  return page.evaluate(heroOnly => {
    const reelPhoto = Array.from(document.images).find(
      img =>
        img.getClientRects().length > 0 &&
        /\/landing\/hero\/(?!avatar-)/u.test(
          decodeURIComponent(img.currentSrc),
        ),
    );
    const root = heroOnly ? reelPhoto?.closest('[inert]') : document.body;
    if (root == null) {
      return [];
    }
    const fonts = new Set<string>();
    const add = (element: Element) => {
      const style = getComputedStyle(element);
      const family = style.fontFamily
        .split(',')[0]
        .trim()
        .replace(/^["']|["']$/gu, '');
      fonts.add(`${style.fontWeight} 1rem "${family}"`);
    };
    const range = document.createRange();
    const texts = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let text = texts.nextNode(); text != null; text = texts.nextNode()) {
      range.selectNodeContents(text);
      if (
        text.nodeValue?.trim() !== '' &&
        text.parentElement != null &&
        range.getClientRects().length > 0
      ) {
        add(text.parentElement);
      }
    }
    // A field draws its placeholder in its own font.
    for (const field of root.querySelectorAll('input, textarea')) {
      if (field.getClientRects().length > 0) {
        add(field);
      }
    }
    return Array.from(fonts).sort();
  }, inHeroCards);
}

/** The reel's dot for the slide at `position`, from 1. */
function dot(page: Page, position: number) {
  return page
    .getByRole('navigation', {name: 'Preview Astryx themes'})
    .getByRole('radio', {name: `Page ${position}`});
}

/**
 * Moves keyboard focus to the reel's dot at `position`, which shows its
 * slide. The reel can become live after the shell, so the focus repeats.
 */
async function showSlide(page: Page, position: number) {
  await expect(async () => {
    await dot(page, position).focus();
    await expect(dot(page, position)).toBeChecked({timeout: 1000});
  }).toPass();
}

/** Waits until the page's shell is live, and the page has been idle. */
async function settle(page: Page) {
  await expectTooltipsLive(
    page,
    page
      .getByRole('navigation', {name: 'Astryx navigation'})
      .getByRole('button', {name: 'Search'})
      .filter({visible: true})
      .first(),
  );
  await page.waitForLoadState('networkidle');
  await page.evaluate(
    () =>
      new Promise(resolve => {
        requestIdleCallback(() => resolve(null), {timeout: 5000});
      }),
  );
}

test.describe('at a desktop size', () => {
  // With reduced motion the reel does not advance by itself while a test
  // goes through the slides. It loads the same fonts ahead of time.
  test.use({
    viewport: {width: 1440, height: 900},
    contextOptions: {reducedMotion: 'reduce'},
  });

  test('the reel loads ahead of time each font weight that a hero card asks for, once, and no other', async ({
    page,
  }) => {
    const fontLoads = await recordFontLoads(page);
    await page.goto('/');
    await settle(page);

    const asked = new Set<string>();
    for (let position = 1; position <= SLIDE_COUNT; position++) {
      await showSlide(page, position);
      const fonts = await fontsOfText(page, {inHeroCards: true});
      expect(fonts.length, `slide ${position}`).toBeGreaterThan(0);
      fonts.forEach(font => asked.add(font));
    }
    await expect
      .poll(async () => (await fontLoads()).sort())
      .toEqual(Array.from(asked).sort());
  });

  test('no text of the page asks for the display font of a theme', async ({
    page,
  }) => {
    await page.goto('/');
    await settle(page);
    for (let position = 1; position <= SLIDE_COUNT; position++) {
      await showSlide(page, position);
      const fonts = await fontsOfText(page, {inHeroCards: false});
      expect(
        fonts.filter(font =>
          DISPLAY_FONTS.some(family => font.includes(`"${family}"`)),
        ),
        `slide ${position}`,
      ).toEqual([]);
    }
  });

  test('the font stylesheet of the home page asks for Playwrite US Trad at weight 400 only', async ({
    page,
  }) => {
    await page.goto('/');
    expect(await playwriteWeights(page)).toEqual([
      'Playwrite US Trad:wght@400',
    ]);
  });

  test("the playground's preview frame asks for the weight range of Playwrite US Trad, after weight 400", async ({
    page,
  }) => {
    // The frame's document. A browser gives each weight to the later of two
    // faces that have it.
    await page.goto('/playground/preview');
    expect(await playwriteWeights(page)).toEqual([
      'Playwrite US Trad:wght@400',
      'Playwrite US Trad:wght@100..400',
    ]);
  });

  for (const path of ['/', '/community']) {
    for (const colorScheme of ['light', 'dark'] as const) {
      test(`on ${path} in ${colorScheme} mode, the themes card draws its "Aa" in the place of the text, in the color of the first swatch`, async ({
        page,
      }) => {
        await page.emulateMedia({colorScheme});
        await page.goto(path);
        await settle(page);

        // Two ems of a 2048-unit font wide, one em high.
        const drawing = page.locator('svg[viewBox$=" 4096 2048"]');
        await expect(drawing).toHaveCount(1);
        await expect(drawing).toHaveAttribute('aria-hidden', 'true');
        await drawing.scrollIntoViewIfNeeded();
        expect(await drawing.boundingBox()).toMatchObject({
          width: 48,
          height: 24,
        });

        const {ink, color, swatch, text} = await drawing.evaluate(
          (svg: SVGSVGElement) => {
            const box = svg.getBoundingClientRect();
            const letters = svg.querySelector('path')?.getBoundingClientRect();
            const firstSwatch = svg.parentElement?.firstElementChild;
            return {
              // In px from the left and from the top of the drawing's box.
              ink:
                letters == null
                  ? []
                  : [
                      letters.left - box.left,
                      letters.top - box.top,
                      letters.right - box.left,
                      letters.bottom - box.top,
                    ],
              color: getComputedStyle(svg).color,
              swatch:
                firstSwatch == null
                  ? null
                  : getComputedStyle(firstSwatch).backgroundColor,
              text: svg.parentElement?.textContent,
            };
          },
        );
        // The extent of the glyphs "A" and "a" of Sarina at 24px, with the
        // "a" 30px after the start of the "A" and the baseline 19px below
        // the top of the box.
        const extent = [-0.129, 2.957, 50.73, 19.785];
        expect(ink).toHaveLength(extent.length);
        ink.forEach((edge, index) =>
          expect(edge).toBeCloseTo(extent[index], 1),
        );
        expect(color).toBe(swatch);
        expect(text).toBe('');
      });
    }
  }
});

test.describe('at a phone size', () => {
  test.use({
    viewport: {width: 390, height: 844},
    hasTouch: true,
    isMobile: true,
  });

  test('the reel loads for each slide that it does not show first the font weights that the cards of that slide ask for', async ({
    page,
  }) => {
    const fontLoads = await recordFontLoads(page);
    await page.goto('/');
    await settle(page);
    expect(await fontLoads()).toEqual([]);

    // The last link of the hero text, which is before the dots. Keyboard
    // focus on the dots loads the slides next to the first one.
    await page.getByRole('link', {name: 'StyleX', exact: true}).focus();
    await page.keyboard.press('Tab');
    await expect(dot(page, 1)).toBeFocused();

    const asked = new Set<string>();
    for (let position = 2; position <= SLIDE_COUNT; position++) {
      await page.keyboard.press('ArrowRight');
      await expect(dot(page, position)).toBeChecked();
      const fonts = await fontsOfText(page, {inHeroCards: true});
      expect(fonts.length, `slide ${position}`).toBeGreaterThan(0);
      fonts.forEach(font => asked.add(font));
    }
    expect((await fontLoads()).sort()).toEqual(Array.from(asked).sort());
  });
});
