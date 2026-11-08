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

test.describe('under a finger', () => {
  test.use({hasTouch: true});

  test(`"more" takes a finger's taps toward 44 px below it and beside it, never from the line above`, async ({
    page,
  }) => {
    const dialog = await openCaptionGallery(page, {width: 402, height: 874});
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(true);
    const more = dialog.getByRole('button', {name: 'more'});
    await expect(more).toBeVisible();
    // The shared hit area writes the toggle's insets once it measures it.
    await expect
      .poll(async () =>
        more.evaluate(
          element =>
            parseFloat(
              element.style.getPropertyValue('--astryx-hit-inset-bottom'),
            ) || 0,
        ),
      )
      .toBeGreaterThan(0);
    const facts = await more.evaluate(element => {
      const box = element.getBoundingClientRect();
      const inset = (side: string) =>
        parseFloat(
          element.style.getPropertyValue(`--astryx-hit-inset-${side}`) || '0',
        );
      const middle = box.left + box.width / 2;
      const takes = (x: number, y: number) => {
        const hit = element.ownerDocument.elementFromPoint(x, y);
        return hit != null && element.contains(hit);
      };
      const right = inset('right');
      const bottom = inset('bottom');
      return {
        top: inset('top'),
        right,
        bottom,
        above: takes(middle, box.top - 4),
        below: takes(middle, box.bottom + bottom / 2),
        beside: takes(box.right + right / 2, box.top + box.height / 2),
      };
    });
    // The line above is the caption's own text: a tap there is not "more".
    expect(facts.above).toBe(false);
    expect(facts.top).toBe(0);
    // Below and beside, a tap within the grown target is "more".
    expect(facts.bottom).toBeGreaterThan(0);
    expect(facts.right).toBeGreaterThan(0);
    expect(facts.below).toBe(true);
    expect(facts.beside).toBe(true);
  });
});

test(`the first frame that shows the clamped caption at open already ends it in "more"`, async ({
  page,
}) => {
  await page.setViewportSize({width: 402, height: 874});
  await page.route(/picsum\.photos/, async route =>
    route.fulfill({contentType: 'image/svg+xml', body: PHOTO_SVG}),
  );
  // A frame's resize observers deliver after its animation-frame callbacks
  // and before it paints, and a delivery may commit an update. So each
  // delivery reads the frame again, after its observer's own callback.
  await page.addInitScript(() => {
    const Native = window.ResizeObserver;
    window.ResizeObserver = class extends Native {
      constructor(callback: ResizeObserverCallback) {
        super((entries, observer) => {
          callback(entries, observer);
          (window as unknown as {__afterResize?: () => void}).__afterResize?.();
        });
      }
    };
  });
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-lightbox--gallery-with-captions&viewMode=story`,
  );
  // Each frame from here on: whether the open viewer shows the current
  // caption, and whether its "more" is there, as the frame paints it.
  await page.evaluate(() => {
    const frames: {isShown: boolean; hasMore: boolean}[] = [];
    (window as unknown as {__captionFrames: typeof frames}).__captionFrames =
      frames;
    const sample = () => {
      const caption = document.querySelector(
        'dialog[open] [data-current] [data-lightbox-caption]',
      );
      const text = caption?.querySelector('.astryx-text');
      const isShown = text != null && text.getBoundingClientRect().height > 0;
      // The toggle stays mounted, hidden until the caption is clamped.
      const toggle = caption?.querySelector('button');
      const hasMore = toggle != null && toggle.getClientRects().length > 0;
      return {isShown, hasMore};
    };
    const read = () => {
      frames.push(sample());
      if (frames.length < 600 && !frames.some(frame => frame.hasMore)) {
        requestAnimationFrame(read);
      }
    };
    (window as unknown as {__afterResize: () => void}).__afterResize = () => {
      if (frames.length > 0) {
        frames[frames.length - 1] = sample();
      }
    };
    requestAnimationFrame(read);
  });
  await page.getByRole('button', {name: 'Open gallery with captions'}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', {name: 'more'})).toBeVisible();
  const frames = await page.evaluate(
    () =>
      (
        window as unknown as {
          __captionFrames: {isShown: boolean; hasMore: boolean}[];
        }
      ).__captionFrames,
  );
  const firstShown = frames.find(frame => frame.isShown);
  expect(firstShown, JSON.stringify(frames.slice(-6))).toEqual({
    isShown: true,
    hasMore: true,
  });
});

test('the caption opens, closes and pages with no ResizeObserver loop error', async ({
  page,
}) => {
  // Storybook's preview observes the document body again for each element a
  // commit adds. An element added in a resize delivery joins that loop late,
  // and the browser reports the loop as an error.
  await page.addInitScript(() => {
    const errors: string[] = [];
    (window as unknown as {__pageErrors: string[]}).__pageErrors = errors;
    window.addEventListener('error', event => {
      errors.push(event.message);
    });
  });
  const dialog = await openCaptionGallery(page, {width: 402, height: 874});
  await expect(dialog.getByRole('button', {name: 'more'})).toBeVisible();
  for (let round = 0; round < 2; round++) {
    await dialog.getByRole('button', {name: 'more'}).click();
    await expect(dialog.getByRole('button', {name: 'less'})).toBeVisible();
    await dialog.getByRole('button', {name: 'less'}).click();
    await expect(dialog.getByRole('button', {name: 'more'})).toBeVisible();
  }
  await dialog.getByRole('button', {name: 'Next'}).click();
  await expect(dialog.getByText('2 / 4')).toBeVisible();
  await dialog.getByRole('button', {name: 'Previous'}).click();
  await expect(dialog.getByText('1 / 4')).toBeVisible();
  // An arrow key pages from the focused "more", which opens the caption.
  await dialog.getByRole('button', {name: 'more'}).click();
  await expect(dialog.getByRole('button', {name: 'less'})).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(dialog.getByText('2 / 4')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(dialog.getByText('1 / 4')).toBeVisible();
  await expect(dialog.getByRole('button', {name: 'more'})).toBeVisible();
  // Two frames, so the last frame's deliveries have run.
  await page.evaluate(
    async () =>
      new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }),
  );
  const errors = await page.evaluate(
    () => (window as unknown as {__pageErrors: string[]}).__pageErrors,
  );
  expect(errors).toEqual([]);
});

test(`a caption whose text grows while its box keeps two lines gets "more" at the end of its second line`, async ({
  page,
}) => {
  const dialog = await openCaptionGallery(page, {width: 402, height: 874});
  await dialog.getByRole('button', {name: 'Next'}).click();
  await expect(dialog.getByText('2 / 4')).toBeVisible();
  // The second page's caption fits its two lines, with no toggle.
  await expect(dialog.getByRole('button', {name: 'more'})).toHaveCount(0);
  const lines = await dialog.evaluate(element => {
    const text = element.querySelector(
      '[data-current] [data-lightbox-caption] .astryx-text',
    ) as HTMLElement;
    const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
    let last: Text | null = null;
    for (let node = walker.nextNode(); node != null; node = walker.nextNode()) {
      last = node as Text;
    }
    const before = text.getBoundingClientRect().height;
    // New text, past two lines, in a box that keeps its height.
    last?.appendData(
      ' The trail climbs past the old mill, crosses the river on stepping stones, and winds back through the beeches to the car park at the top of the hill.',
    );
    return {before, after: text.getBoundingClientRect().height};
  });
  expect(lines.after, JSON.stringify(lines)).toBeCloseTo(lines.before, 0);
  await expect(dialog.getByRole('button', {name: 'more'})).toBeVisible();
  await expect(async () => {
    expectToggleEndsLastLine(await readToggle(dialog));
  }).toPass({timeout: 3_000});
});

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
