// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y always

/**
 * @file LightboxViewport.a11y.browser.spec.ts
 * @input The built Lightbox default story and the stylesheet rules the open
 *   viewer matches, in Chromium and WebKit
 * @output Browser evidence that the viewer is as tall as the dynamic viewport,
 *   so a mobile browser's toolbar never covers its bottom
 * @position Cross-browser proof for Lightbox's full-screen sizing
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

test('the viewer is as tall as the dynamic viewport, so a toolbar never covers its bottom', async ({
  page,
}) => {
  // The story's photo is remote; the sizing does not need it to load.
  await page.route(/picsum\.photos/, async route => route.abort());
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-lightbox--default&viewMode=story`,
  );
  await page.getByRole('button', {name: 'Open lightbox'}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // Mobile Safari's 100vh is the large viewport, measured with its toolbars
  // retracted, so a viewer that tall runs under the bottom toolbar and hides a
  // gallery's caption (iOS 26.2, iPhone 17 Pro: 714 pt visible, the caption
  // at 718–754). The dynamic viewport is the visible height. No desktop or
  // emulated engine shrinks it, so this reads the height the viewer declares.
  const declared = await dialog.evaluate(element => {
    const heights: string[] = [];
    const walk = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSStyleRule) {
          if (rule.style.height !== '' && element.matches(rule.selectorText)) {
            heights.push(rule.style.height);
          }
        } else if ('cssRules' in rule) {
          walk((rule as CSSGroupingRule).cssRules);
        }
      }
    };
    for (const sheet of Array.from(document.styleSheets)) {
      // A cross-origin stylesheet's rules are unreadable, and not ours: skip
      // only such a sheet, so any other error still fails the proof.
      if (
        sheet.href != null &&
        new URL(sheet.href, document.baseURI).origin !== location.origin
      ) {
        continue;
      }
      walk(sheet.cssRules);
    }
    return {heights, supported: CSS.supports('height', '100dvh')};
  });
  expect(declared.supported).toBe(true);
  expect(declared.heights).toContain('100dvh');
});

/** A 3:2 photo for every item, so no size waits on the network. */
const PHOTO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#7a8a99"/></svg>';

/** Opens "Gallery with captions": long, medium, no and short captions. */
async function openCaptionGallery(
  page: Page,
  viewport: {width: number; height: number},
): Promise<Locator> {
  await page.setViewportSize(viewport);
  await page.route(/picsum\.photos/, async route =>
    route.fulfill({contentType: 'image/svg+xml', body: PHOTO_SVG}),
  );
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-lightbox--gallery-with-captions&viewMode=story`,
  );
  await page.getByRole('button', {name: 'Open gallery with captions'}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

interface PageFacts {
  mediaTop: number;
  mediaHeight: number;
  bandHeight: number;
  bandBackground: string;
  hasCaption: boolean;
}

/** The current page's photo box and caption band. */
async function readPage(dialog: Locator): Promise<PageFacts> {
  return dialog.evaluate(element => {
    const current = element.querySelector('[data-current]') as HTMLElement;
    const media = current.querySelector(
      '[data-lightbox-page-media]',
    ) as HTMLElement;
    const band = media.nextElementSibling as HTMLElement;
    const mediaBox = media.getBoundingClientRect();
    return {
      mediaTop: mediaBox.top,
      mediaHeight: mediaBox.height,
      bandHeight: band.getBoundingClientRect().height,
      bandBackground: getComputedStyle(band).backgroundColor,
      hasCaption: band.querySelector('[data-lightbox-caption]') != null,
    };
  });
}

/** The clamped caption's text, its last shown line and its toggle. */
async function readToggle(dialog: Locator) {
  return dialog.evaluate(element => {
    const caption = element.querySelector(
      '[data-current] [data-lightbox-caption]',
    ) as HTMLElement;
    const text = caption.querySelector('.astryx-text') as HTMLElement;
    const toggle = caption.querySelector('button') as HTMLElement;
    const textBox = text.getBoundingClientRect();
    const toggleBox = toggle.getBoundingClientRect();
    const style = getComputedStyle(text);
    const lineHeight = parseFloat(style.lineHeight);
    // The rendered words of the text's last shown line, from its text
    // nodes only.
    const words: DOMRect[] = [];
    const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node != null; node = walker.nextNode()) {
      const range = document.createRange();
      range.selectNodeContents(node);
      words.push(...range.getClientRects());
    }
    const lastLine = words.filter(
      rect =>
        rect.width > 0 &&
        rect.bottom <= textBox.bottom + 0.5 &&
        rect.top >= textBox.bottom - lineHeight - 0.5,
    );
    return {
      textLeft: textBox.left,
      textRight: textBox.right,
      textWidth: textBox.width,
      textBottom: textBox.bottom,
      paddingEnd: parseFloat(style.paddingRight),
      captionWidth: caption.getBoundingClientRect().width,
      toggleLeft: toggleBox.left,
      toggleRight: toggleBox.right,
      toggleMiddle: (toggleBox.top + toggleBox.bottom) / 2,
      toggleWidth: toggleBox.width,
      lineHeight,
      lastLineWords: lastLine.length,
      lastLineEnd: Math.max(...lastLine.map(rect => rect.right)),
      isClamped: text.scrollHeight > text.clientHeight + 1,
    };
  });
}

function expectToggleEndsLastLine(
  facts: Awaited<ReturnType<typeof readToggle>>,
): void {
  const detail = JSON.stringify(facts);
  // The caption, its last line and its toggle are there.
  expect(facts.textWidth, detail).toBeGreaterThan(100);
  expect(facts.toggleWidth, detail).toBeGreaterThan(0);
  expect(facts.lastLineWords, detail).toBeGreaterThan(0);
  expect(facts.isClamped, detail).toBe(true);
  // The text runs the caption's whole width: no column beside it.
  expect(facts.textWidth, detail).toBeGreaterThanOrEqual(
    facts.captionWidth - 0.5,
  );
  // The toggle ends the last line, inside the text's padding.
  expect(facts.toggleRight, detail).toBeLessThanOrEqual(
    facts.textRight - facts.paddingEnd + 0.5,
  );
  expect(facts.lastLineEnd, detail).toBeLessThanOrEqual(facts.toggleLeft + 0.5);
  expect(
    Math.abs(facts.toggleMiddle - (facts.textBottom - facts.lineHeight / 2)),
    detail,
  ).toBeLessThanOrEqual(1);
}

for (const viewport of [
  {width: 402, height: 874},
  {width: 1440, height: 900},
]) {
  const size = `${viewport.width}×${viewport.height}`;

  test(`a gallery page without a caption shows no caption backing, and every page's photo keeps its top (${size})`, async ({
    page,
  }) => {
    const dialog = await openCaptionGallery(page, viewport);
    const pages: PageFacts[] = [];
    for (let shown = 1; shown <= 4; shown++) {
      if (shown > 1) {
        await dialog.getByRole('button', {name: 'Next'}).click();
      }
      await expect(dialog.getByText(`${shown} / 4`)).toBeVisible();
      pages.push(await readPage(dialog));
    }
    const detail = JSON.stringify(pages);
    // Every page has its photo box and its band.
    for (const facts of pages) {
      expect(facts.mediaHeight, detail).toBeGreaterThan(100);
      expect(facts.bandHeight, detail).toBeGreaterThan(20);
    }
    expect(
      pages.map(facts => facts.hasCaption),
      detail,
    ).toEqual([true, true, false, true]);
    for (const facts of pages) {
      expect(
        Math.abs(facts.mediaTop - pages[0].mediaTop),
        detail,
      ).toBeLessThanOrEqual(0.5);
    }
    expect(pages[2].bandBackground, detail).toBe('rgba(0, 0, 0, 0)');
    expect(pages[0].bandBackground, detail).not.toBe('rgba(0, 0, 0, 0)');
  });

  test(`a clamped caption's "more" ends its second line, with no column of its own (${size})`, async ({
    page,
  }) => {
    const dialog = await openCaptionGallery(page, viewport);
    await expect(dialog.getByRole('button', {name: 'more'})).toBeVisible();
    const facts = await readToggle(dialog);
    expectToggleEndsLastLine(facts);
  });
}

test(`a clamped caption's "more" still ends its second line after the viewport narrows (402 → 360)`, async ({
  page,
}) => {
  const dialog = await openCaptionGallery(page, {width: 402, height: 874});
  await expect(dialog.getByRole('button', {name: 'more'})).toBeVisible();
  expectToggleEndsLastLine(await readToggle(dialog));
  await page.setViewportSize({width: 360, height: 874});
  await expect(async () => {
    const facts = await readToggle(dialog);
    expect(facts.textWidth, JSON.stringify(facts)).toBeLessThan(361);
    expectToggleEndsLastLine(facts);
  }).toPass({timeout: 3_000});
});

for (const width of [360, 390]) {
  test(`an open caption scrolled to its end keeps every line beside "less" clear of it (${width}×150)`, async ({
    page,
  }) => {
    // A short viewport: the open caption runs past its panel and scrolls.
    const dialog = await openCaptionGallery(page, {width, height: 150});
    await dialog.getByRole('button', {name: 'more'}).click();
    await expect(dialog.getByRole('button', {name: 'less'})).toBeVisible();
    const facts = await dialog.evaluate(element => {
      const caption = element.querySelector(
        '[data-current] [data-lightbox-caption]',
      ) as HTMLElement;
      const text = caption.querySelector('.astryx-text') as HTMLElement;
      text.scrollTop = text.scrollHeight;
      const textBox = text.getBoundingClientRect();
      const toggle = (
        caption.querySelector('button') as HTMLElement
      ).getBoundingClientRect();
      const words: DOMRect[] = [];
      const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
      for (
        let node = walker.nextNode();
        node != null;
        node = walker.nextNode()
      ) {
        const range = document.createRange();
        range.selectNodeContents(node);
        words.push(...range.getClientRects());
      }
      // The shown words level with the toggle.
      const beside = words.filter(
        rect =>
          rect.width > 0 &&
          rect.bottom > textBox.top + 0.5 &&
          rect.top < textBox.bottom - 0.5 &&
          rect.bottom > toggle.top + 0.5 &&
          rect.top < toggle.bottom - 0.5,
      );
      return {
        overflow: text.scrollHeight - text.clientHeight,
        isAtEnd:
          Math.abs(text.scrollTop + text.clientHeight - text.scrollHeight) <= 1,
        besideCount: beside.length,
        besideEnd: Math.max(...beside.map(rect => rect.right)),
        toggleLeft: toggle.left,
      };
    });
    const detail = JSON.stringify(facts);
    expect(facts.overflow, detail).toBeGreaterThan(20);
    expect(facts.isAtEnd, detail).toBe(true);
    expect(facts.besideCount, detail).toBeGreaterThan(0);
    expect(facts.besideEnd, detail).toBeLessThanOrEqual(facts.toggleLeft + 0.5);
  });
}
