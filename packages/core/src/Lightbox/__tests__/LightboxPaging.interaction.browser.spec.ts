// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LightboxPaging.interaction.browser.spec.ts
 * @input The built "Gallery with zoom" Lightbox story on the phone project,
 *   real touch input and the interaction harness
 * @output Proofs for Lightbox's pager under a finger, in Chromium and WebKit.
 *   They cover paging with Photos' 40 pt gap, a zoomed photo's edge, RTL, the
 *   Next button and a pinch that never pages. They also cover a settle
 *   through a blocked main thread, focus, a refused swipe, rotation and a
 *   storyboard. usePager's own spec proves the physics.
 * @position Interaction tests for Lightbox (browser), beside
 *   LightboxZoom.interaction.browser.spec.ts
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  blockMainThread,
  busyWindowProof,
  castStoryboard,
  CONTROL_RGB,
  drag,
  frames,
  markElement,
  openStory,
  pinch,
  startBusyControl,
  startScreencast,
  touchDriver,
  type TouchDriver,
  type TouchScript,
  touchStoryboard,
  trackMarker,
  waitForAnimation,
  waitForRest,
  withStorybook,
  writeEvidence,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

// Photos' gap between pages (motion/uikit/zoomMedia.ts), restated.
const GAP = 40;

/** A checkerboard photo with a disc whose colour tells the photos apart. */
function photoSvg(color: string): string {
  let squares = '';
  for (let y = 0; y < 2000; y += 50) {
    for (let x = 0; x < 3000; x += 50) {
      if ((x + y) % 100 === 0) {
        squares += `<rect x="${x}" y="${y}" width="50" height="50"/>`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="2000" viewBox="0 0 3000 2000" shape-rendering="crispEdges"><rect width="3000" height="2000" fill="#fff"/><g fill="#000">${squares}</g><circle cx="1500" cy="1000" r="250" fill="${color}"/></svg>`;
}

const COLORS: Record<string, string> = {
  '10': '#d22',
  '15': '#2a2',
  '20': '#22d',
  '25': '#d80',
};

interface Gallery {
  driver: TouchDriver;
  dialog: Locator;
  /** The pager's viewport (the stage), and the track it translates. */
  viewport: Locator;
  track: Locator;
  /** The viewport's box on the page. */
  box: {x: number; y: number; width: number; height: number};
  counter: () => Promise<string>;
  trackX: () => Promise<number>;
  /** The current photo's zoom transform. */
  photo: () => Promise<{x: number; scale: number}>;
}

async function openGallery(
  page: Page,
  {
    rtl = false,
    story = 'core-lightbox--gallery-with-zoom',
    trigger: triggerName = 'Open gallery with zoom',
  } = {},
): Promise<Gallery> {
  await page.route('https://picsum.photos/**', async route => {
    const id = /\/id\/(\d+)\//.exec(route.request().url())?.[1] ?? '10';
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: photoSvg(COLORS[id] ?? '#888'),
    });
  });
  if (rtl) {
    // Storybook's direction global sets the story's `dir` (and its
    // providers'); openStory has no globals.
    await page.goto(
      `${storybook()}/iframe.html?id=core-lightbox--gallery-with-zoom&viewMode=story&globals=direction:rtl`,
    );
    await page.locator('#storybook-root > *').first().waitFor();
    await frames(page, 2);
  } else {
    await openStory(page, storybook(), story);
  }
  const driver = await touchDriver(page);
  const trigger = page.getByRole('button', {name: triggerName});
  const t = await trigger.boundingBox();
  if (t == null) {
    throw new Error('no trigger');
  }
  await driver.tap({x: t.x + t.width / 2, y: t.y + t.height / 2});
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // The pager's viewport. In a gallery the keyboard's zoom button is the
  // current page's photo box inside it.
  const viewport = dialog.locator('[data-lightbox-viewport]');
  const track = viewport.locator(':scope > div').first();
  await expect
    .poll(async () =>
      viewport.evaluate(el =>
        [...el.querySelectorAll('img')].every(img => img.naturalWidth === 3000),
      ),
    )
    .toBe(true);
  await frames(page, 2);
  const box = await viewport.evaluate(el => {
    const r = el.getBoundingClientRect();
    return {
      x: r.left,
      y: r.top,
      width: el.clientWidth,
      height: el.clientHeight,
    };
  });
  return {
    driver,
    dialog,
    viewport,
    track,
    box,
    counter: async () =>
      (await dialog.getByText(/^\d+ \/ \d+$/).textContent()) ?? '',
    trackX: async () =>
      track.evaluate(el => {
        const value = getComputedStyle(el).translate;
        return value === 'none' ? 0 : parseFloat(value);
      }),
    photo: async () =>
      viewport.evaluate(el => {
        const img = el.querySelector<HTMLElement>('[data-current] img');
        if (img == null) {
          return {x: 0, scale: 1};
        }
        const style = getComputedStyle(img);
        return {
          x: style.translate === 'none' ? 0 : parseFloat(style.translate),
          scale: style.scale === 'none' ? 1 : parseFloat(style.scale),
        };
      }),
  };
}

function doubleTap(at: {x: number; y: number}): TouchScript {
  return [
    {t: 0, fingers: [{id: 0, ...at}]},
    {t: 50, fingers: []},
    {t: 170, fingers: [{id: 0, ...at}]},
    {t: 220, fingers: []},
  ];
}

/** A slow drag by dx, held still before the lift (no release velocity). */
function slowDrag(from: {x: number; y: number}, dx: number): TouchScript {
  return drag(
    from,
    {x: from.x + dx, y: from.y},
    {durationMs: 600, restMs: 150},
  );
}

/** Two fingers spreading while their centroid drifts sideways. */
function driftingPinch(
  centre: {x: number; y: number},
  driftX: number,
): TouchScript {
  const script: TouchScript[number][] = [];
  for (let i = 0; i <= 24; i++) {
    const p = i / 24;
    const half = 50 + 50 * p;
    const x = centre.x + driftX * p;
    script.push({
      t: i * 16,
      fingers: [
        {id: 0, x: x - half, y: centre.y},
        {id: 1, x: x + half, y: centre.y},
      ],
    });
  }
  script.push({t: 25 * 16 + 100, fingers: []});
  return script;
}

test("a drag past half a photo pages to the next one, Photos' 40 pt gap between them", async ({
  page,
}) => {
  const g = await openGallery(page);
  expect(await g.counter()).toBe('1 / 4');
  const mid = {x: g.box.x + g.box.width * 0.8, y: g.box.y + g.box.height / 2};
  // Mid-drag: the next page sits one page width plus the gap away.
  let gap = Number.NaN;
  await g.driver.play(slowDrag(mid, -g.box.width * 0.6), {
    onEvent: async step => {
      if (step.type === 'touchMove' && Number.isNaN(gap)) {
        gap = await g.track.evaluate(el => {
          const pages = [...el.children] as HTMLElement[];
          const current = pages.find(p => p.hasAttribute('data-current'));
          const next = current?.nextElementSibling as HTMLElement | null;
          if (current == null || next == null) {
            return Number.NaN;
          }
          return (
            next.getBoundingClientRect().left -
            current.getBoundingClientRect().right
          );
        });
      }
    },
  });
  expect(gap).toBeCloseTo(GAP, 0);
  await waitForRest(g.track);
  expect(await g.counter()).toBe('2 / 4');
  expect(await g.trackX()).toBeCloseTo(-(g.box.width + GAP), 0);
  await expect(g.dialog).toHaveAccessibleName('Mountain lake');
});

test('every page centres its photo on the same box, with or without a caption', async ({
  page,
}) => {
  // The story's first photo has a caption and the second none. The pages
  // share one caption row, so the photos line up mid-swipe and the next
  // photo rests where the first one did.
  const g = await openGallery(page);
  const centres = async () =>
    g.track.evaluate(el =>
      ([...el.children] as HTMLElement[]).map(p => {
        const img = p.querySelector('img');
        const r = img?.getBoundingClientRect();
        return {
          current: p.hasAttribute('data-current'),
          y: r == null ? Number.NaN : r.top + r.height / 2,
        };
      }),
    );
  const before = await centres();
  expect(before.length).toBeGreaterThan(1);
  const first = before.find(c => c.current)?.y ?? Number.NaN;
  for (const c of before) {
    expect(Math.abs(c.y - first)).toBeLessThan(1);
  }
  const mid = {x: g.box.x + g.box.width * 0.8, y: g.box.y + g.box.height / 2};
  let spread = Number.NaN;
  await g.driver.play(slowDrag(mid, -g.box.width * 0.6), {
    onEvent: async step => {
      if (step.type === 'touchMove' && Number.isNaN(spread)) {
        const ys = (await centres()).map(c => c.y);
        spread = Math.max(...ys) - Math.min(...ys);
      }
    },
  });
  expect(spread).toBeLessThan(1);
  await waitForRest(g.track);
  expect(await g.counter()).toBe('2 / 4');
  const after = (await centres()).find(c => c.current)?.y ?? Number.NaN;
  expect(Math.abs(after - first)).toBeLessThan(1);
});

test('every page keeps a two-line caption band, so the photo keeps its box', async ({
  page,
}) => {
  // The story's captions run long, about two lines, none and short. Each
  // page's band under its photo is two caption lines tall, so the photo box
  // neither grows nor moves from page to page.
  const g = await openGallery(page, {
    story: 'core-lightbox--gallery-with-captions',
    trigger: 'Open gallery with captions',
  });
  const shown = async () =>
    g.track.evaluate(el => {
      const current = el.querySelector(':scope > [data-current]');
      const media = current?.querySelector('[data-lightbox-page-media]');
      const band = media?.nextElementSibling;
      if (media == null || band == null) {
        return null;
      }
      const r = media.getBoundingClientRect();
      // The band's lines, above the padding that clears the screen's edge.
      const pad = parseFloat(getComputedStyle(band).paddingBottom);
      return {top: r.top, height: r.height, band: band.clientHeight - pad};
    });
  // Two lines of the caption's text, under its top padding.
  const twoLines = await g.track.evaluate(el => {
    const caption = el.querySelector(
      ':scope > [data-current] [data-lightbox-caption]',
    );
    const text = caption?.querySelector('.astryx-text') ?? caption;
    if (text == null) {
      throw new Error('no caption');
    }
    const style = getComputedStyle(text);
    return 2 * parseFloat(style.lineHeight) + parseFloat(style.paddingTop);
  });
  const more = g.dialog.getByRole('button', {name: 'more'});
  const first = await shown();
  expect(first).not.toBeNull();
  expect(Math.abs((first?.band ?? 0) - twoLines)).toBeLessThan(1);
  await expect(more).toHaveCount(1);
  const mid = {x: g.box.x + g.box.width * 0.8, y: g.box.y + g.box.height / 2};
  for (const counter of ['2 / 4', '3 / 4', '4 / 4']) {
    await g.driver.play(slowDrag(mid, -g.box.width * 0.6));
    await waitForRest(g.track);
    expect(await g.counter()).toBe(counter);
    const now = await shown();
    expect(Math.abs((now?.band ?? 0) - twoLines)).toBeLessThan(1);
    expect(Math.abs((now?.top ?? Number.NaN) - (first?.top ?? 0))).toBeLessThan(
      0.5,
    );
    expect(
      Math.abs((now?.height ?? Number.NaN) - (first?.height ?? 0)),
    ).toBeLessThan(0.5);
  }
  // The last caption fits its band, so it has no "more".
  await expect(more).toHaveCount(0);
});

test('the caption is body Text on the media surface: its lines start at one edge, and "more" is a ghost Button that ends the last', async ({
  page,
}) => {
  const g = await openGallery(page, {
    story: 'core-lightbox--gallery-with-captions',
    trigger: 'Open gallery with captions',
  });
  const caption = await g.track.evaluate(el => {
    const text = el.querySelector<HTMLElement>(
      ':scope > [data-current] [data-lightbox-caption] .astryx-text',
    );
    if (text == null) {
      return null;
    }
    // Each line's start: the leftmost fragment on each line, top to bottom,
    // from the caption's text nodes only.
    const fragments: DOMRect[] = [];
    const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node != null; node = walker.nextNode()) {
      const range = document.createRange();
      range.selectNodeContents(node);
      fragments.push(...range.getClientRects());
    }
    const starts = new Map<number, number>();
    for (const r of fragments) {
      if (r.width > 1) {
        const top = Math.round(r.top);
        starts.set(top, Math.min(starts.get(top) ?? Infinity, r.left));
      }
    }
    const lines = [...starts.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, left]) => left);
    const box = text.getBoundingClientRect();
    return {
      lines,
      right: box.right - parseFloat(getComputedStyle(text).paddingRight),
      bottom: box.bottom,
      lineHeight: parseFloat(getComputedStyle(text).lineHeight),
      isText: text.classList.contains('astryx-text'),
      type: text.getAttribute('data-type'),
      isOnMedia: text.closest('[data-astryx-media="dark"]') != null,
    };
  });
  expect(caption).not.toBeNull();
  expect(caption?.isText).toBe(true);
  expect(caption?.type).toBe('body');
  expect(caption?.isOnMedia).toBe(true);
  // Present first: two lines or more, then the shared start edge.
  expect(caption?.lines.length ?? 0).toBeGreaterThanOrEqual(2);
  const [first = Number.NaN, second = Number.NaN] = caption?.lines ?? [];
  expect(Math.abs(second - first)).toBeLessThan(1);
  const more = g.dialog.getByRole('button', {name: 'more'});
  await expect(more).toHaveClass(/astryx-button/);
  await expect(more).toHaveAttribute('data-variant', 'ghost');
  const m = await more.boundingBox();
  expect(m).not.toBeNull();
  // It ends the last line: inside the text's end, centred on that line.
  expect((m?.x ?? 0) + (m?.width ?? 0)).toBeLessThanOrEqual(
    (caption?.right ?? 0) + 0.5,
  );
  expect(
    Math.abs(
      (m?.y ?? 0) +
        (m?.height ?? 0) / 2 -
        ((caption?.bottom ?? 0) - (caption?.lineHeight ?? 0) / 2),
    ),
  ).toBeLessThan(1);
});

test("the caption band clears the screen's bottom edge", async ({page}) => {
  const g = await openGallery(page, {
    story: 'core-lightbox--gallery-with-captions',
    trigger: 'Open gallery with captions',
  });
  const placed = await g.track.evaluate(el => {
    const band = el.querySelector(
      ':scope > [data-current] [data-lightbox-page-media]',
    )?.nextElementSibling;
    const dialog = el.closest('dialog');
    if (band == null || dialog == null) {
      return null;
    }
    return {
      pad: parseFloat(getComputedStyle(band).paddingBottom),
      gap:
        dialog.getBoundingClientRect().bottom -
        band.getBoundingClientRect().bottom,
    };
  });
  expect(placed).not.toBeNull();
  // At least the theme's 12 px spacing under the lines, inside the viewer.
  expect(placed?.pad ?? 0).toBeGreaterThanOrEqual(12);
  expect(placed?.gap ?? -1).toBeGreaterThanOrEqual(0);
});

test("a tap that opens the viewer paints no ring on its first control; a key's opening does", async ({
  page,
}) => {
  const g = await openGallery(page);
  const focused = async () =>
    page.evaluate(() => {
      const active = document.activeElement;
      return {
        isInViewer: active?.closest('dialog') != null,
        hasRing: active?.matches(':focus-visible') ?? false,
      };
    });
  expect(await focused()).toEqual({isInViewer: true, hasRing: false});
  await page.keyboard.press('Escape');
  await expect(g.dialog).toBeHidden();
  const trigger = page.getByRole('button', {name: 'Open gallery with zoom'});
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(g.dialog).toBeVisible();
  expect(await focused()).toEqual({isInViewer: true, hasRing: true});
});

test('"more" opens a long caption in full over the photo, on a scrim, and "less" closes it', async ({
  page,
}) => {
  const g = await openGallery(page, {
    story: 'core-lightbox--gallery-with-captions',
    trigger: 'Open gallery with captions',
  });
  // The viewer's description is the whole caption, clamped or not.
  await expect(g.dialog).toHaveAccessibleDescription(
    /^A winding path through the forest.*the last hill home\.$/,
  );
  const clamp = await g.track.evaluate(el => {
    const text = el.querySelector(
      ':scope > [data-current] [data-lightbox-caption] .astryx-text',
    );
    return text == null
      ? null
      : {scroll: text.scrollHeight, client: text.clientHeight};
  });
  expect(clamp?.scroll ?? 0).toBeGreaterThan((clamp?.client ?? 0) + 1);
  const more = g.dialog.getByRole('button', {name: 'more'});
  const m = await more.boundingBox();
  if (m == null) {
    throw new Error('no more button');
  }
  // A finger's tap just below the label still lands on the toggle, which
  // takes taps out toward 44 px, short of the line above.
  await g.driver.tap({x: m.x + m.width / 2, y: m.y + m.height + 6});
  const less = g.dialog.getByRole('button', {name: 'less'});
  await expect(less).toHaveAttribute('aria-expanded', 'true');
  const id = await less.getAttribute('aria-controls');
  const full = page.locator(`[id="${id}"]`);
  await expect(full).toBeVisible();
  const placed = await full.evaluate(panel => {
    const media = panel
      .closest('[data-current]')
      ?.querySelector('[data-lightbox-page-media]');
    const text = panel.querySelector('.astryx-text');
    const r = panel.getBoundingClientRect();
    const dialog = panel.closest('dialog');
    const described = dialog?.getAttribute('aria-describedby');
    return {
      top: r.top,
      photoBottom: media?.getBoundingClientRect().bottom ?? Number.NaN,
      fits: text != null && text.scrollHeight <= text.clientHeight + 1,
      backing: getComputedStyle(panel).backgroundColor,
      text: text?.textContent ?? '',
      // The caption renders once: one caption on the page, and the
      // description is that caption.
      captions:
        panel
          .closest('[data-current]')
          ?.querySelectorAll('[data-lightbox-caption]').length ?? 0,
      isDescription:
        described != null &&
        text?.id === described &&
        dialog?.querySelectorAll(`[id="${described}"]`).length === 1,
    };
  });
  // Over the photo's bottom, all of it shown, on a backing.
  expect(placed.top).toBeLessThan(placed.photoBottom);
  expect(placed.fits).toBe(true);
  expect(placed.backing).not.toBe('rgba(0, 0, 0, 0)');
  expect(placed.text).toMatch(/the last hill home\.$/);
  expect(placed.captions).toBe(1);
  expect(placed.isDescription).toBe(true);
  await expect(g.dialog).toBeVisible();
  expect(await g.counter()).toBe('1 / 4');
  const l = await less.boundingBox();
  if (l == null) {
    throw new Error('no less button');
  }
  await g.driver.tap({x: l.x + l.width / 2, y: l.y + l.height + 6});
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  // Back in the band: clamped again, with no backing.
  await expect
    .poll(async () =>
      full.evaluate(panel => getComputedStyle(panel).backgroundColor),
    )
    .toBe('rgba(0, 0, 0, 0)');
  const reclamped = await full.evaluate(panel => {
    const text = panel.querySelector('.astryx-text');
    return text != null && text.scrollHeight > text.clientHeight + 1;
  });
  expect(reclamped).toBe(true);
  await expect(g.dialog).toBeVisible();
});

test('a swipe that pages from a focused "more" keeps focus in the viewer', async ({
  page,
}) => {
  const g = await openGallery(page, {
    story: 'core-lightbox--gallery-with-captions',
    trigger: 'Open gallery with captions',
  });
  // A tap leaves focus on a button in Chromium and on Android.
  const more = g.dialog.getByRole('button', {name: 'more'});
  await more.focus();
  await expect(more).toBeFocused();
  const mid = {x: g.box.x + g.box.width * 0.8, y: g.box.y + g.box.height / 2};
  await g.driver.play(slowDrag(mid, -g.box.width * 0.6));
  await waitForRest(g.track);
  expect(await g.counter()).toBe('2 / 4');
  const isFocusInViewer = await g.dialog.evaluate(
    element =>
      element.ownerDocument.activeElement !== element.ownerDocument.body &&
      element.contains(element.ownerDocument.activeElement),
  );
  expect(isFocusInViewer).toBe(true);
});

test('a finger scrolls an open caption too long for its panel, and the gallery stays put', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'needs native scrolling from injected touches (Mobile Safari on the simulator)',
  );
  const g = await openGallery(page, {
    story: 'core-lightbox--gallery-with-captions',
    trigger: 'Open gallery with captions',
  });
  // A short viewport, so the long caption overflows its panel (60 % of the
  // viewport's height) at the body type's size.
  await page.setViewportSize({width: 402, height: 200});
  await frames(page, 2);
  const more = g.dialog.getByRole('button', {name: 'more'});
  const m = await more.boundingBox();
  if (m == null) {
    throw new Error('no more button');
  }
  await g.driver.tap({x: m.x + m.width / 2, y: m.y + m.height / 2});
  const less = g.dialog.getByRole('button', {name: 'less'});
  await expect(less).toHaveAttribute('aria-expanded', 'true');
  const full = page.locator(
    `[id="${await less.getAttribute('aria-controls')}"]`,
  );
  // The open caption's text scrolls; the toggle stays at its end.
  const text = full.locator('.astryx-text').first();
  const overflow = await text.evaluate(
    element => element.scrollHeight - element.clientHeight,
  );
  expect(overflow).toBeGreaterThan(20);
  const r = await text.boundingBox();
  if (r == null) {
    throw new Error('no caption text');
  }
  const from = {x: r.x + r.width / 2, y: r.y + r.height * 0.7};
  await g.driver.play(
    drag(from, {x: from.x, y: from.y - 80}, {durationMs: 600, restMs: 150}),
  );
  await expect
    .poll(async () => text.evaluate(element => element.scrollTop))
    .toBeGreaterThan(10);
  expect(await g.counter()).toBe('1 / 4');
  await expect(full).toBeVisible();
  await expect(g.dialog).toBeVisible();
});

test('a zoomed photo keeps the drag until its edge; the next drag from the edge pages', async ({
  page,
}) => {
  const g = await openGallery(page);
  const centre = {x: g.box.x + g.box.width / 2, y: g.box.y + g.box.height / 2};
  const current = g.viewport.locator('[data-current] img');
  await g.driver.play(doubleTap(centre));
  await waitForAnimation(current);
  await waitForRest(current);
  const zoomed = await g.photo();
  expect(zoomed.scale).toBeGreaterThan(1.5);
  // A drag left pans the photo 1:1 once past the pan's 10 px threshold; the
  // track stays.
  await g.driver.play(slowDrag(centre, -100));
  await waitForRest(current);
  const panned = await g.photo();
  expect(panned.x).toBeCloseTo(zoomed.x - 90, 0);
  expect(await g.trackX()).toBe(0);
  expect(await g.counter()).toBe('1 / 4');
  // Further left than the photo's right edge: it stops there (the drag
  // started inside the photo, so the pager never takes it).
  await g.driver.play(slowDrag(centre, -g.box.width));
  await waitForAnimation(current);
  await waitForRest(current);
  const atEdge = await g.photo();
  expect(await g.trackX()).toBe(0);
  expect(await g.counter()).toBe('1 / 4');
  // From the edge, the next drag left goes to the pager.
  await g.driver.play(slowDrag(centre, -g.box.width * 0.6));
  await waitForRest(g.track);
  expect(await g.counter()).toBe('2 / 4');
  expect((await g.photo()).scale).toBe(1);
  // The photo left behind is back at the fitted size (Photos resets it).
  const leftBehind = await g.track.evaluate(el => {
    const img = el.querySelector<HTMLElement>(
      '[data-lightbox-page]:not([data-current]) img',
    );
    return img == null ? null : getComputedStyle(img).scale;
  });
  expect(['none', '1']).toContain(leftBehind);
  expect(atEdge.scale).toBeCloseTo(zoomed.scale, 3);
});

test('right to left, a drag to the right pages to the next photo', async ({
  page,
}) => {
  const g = await openGallery(page, {rtl: true});
  expect(await g.dialog.evaluate(el => getComputedStyle(el).direction)).toBe(
    'rtl',
  );
  const from = {x: g.box.x + g.box.width * 0.2, y: g.box.y + g.box.height / 2};
  await g.driver.play(slowDrag(from, g.box.width * 0.6));
  await waitForRest(g.track);
  expect(await g.counter()).toBe('2 / 4');
  expect(await g.trackX()).toBeCloseTo(g.box.width + GAP, 0);
});

test('the Next button pages on setContentOffset(animated:)', async ({page}) => {
  const g = await openGallery(page);
  const next = g.dialog.getByRole('button', {name: 'Next'});
  const b = await next.boundingBox();
  if (b == null) {
    throw new Error('no Next button');
  }
  await g.driver.tap({x: b.x + b.width / 2, y: b.y + b.height / 2});
  const [move] = await waitForAnimation(g.track);
  expect(move.to - move.from).toBeGreaterThan(250);
  expect(move.to - move.from).toBeLessThan(350);
  await waitForRest(g.track);
  expect(await g.counter()).toBe('2 / 4');
  expect(await g.trackX()).toBeCloseTo(-(g.box.width + GAP), 0);
});

/** A grey WebM, 0.2 s at 320 × 180 (VP8), as base64. */
const SHORT_WEBM =
  'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAJtEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggEkTbuMU6uEHFO7a1OsggJX7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjIuMy4xMDNXQYxMYXZmNjIuMy4xMDNEiYhAaQAAAAAAABZUrmvJrgEAAAAAAABA14EBc8WIWwKS0fV89mOcgQAitZyDdW5kiIEAhoVWX1ZQOIOBASPjg4QF9eEA4JGwggFAuoG0moECVbCEVbmBARJUw2f7c3OfY8CAZ8iZRaOHRU5DT0RFUkSHjExhdmY2Mi4zLjEwM3Nz1mPAi2PFiFsCktH1fPZjZ8ihRaOHRU5DT0RFUkSHlExhdmM2Mi4xMS4xMDMgbGlidnB4Z8ihRaOIRFVSQVRJT05Eh5MwMDowMDowMC4yMDAwMDAwMDAAH0O2dUCt54EAo0CIgQAAgPAOAJ0BKkABtAAARwiFhYiFhIgCAgAGFgYde3Nk5w9k5w9k5w9k5w9k5w9k5w9k5w9k5w9k5w9k5w9k5w9k5w9k5w9k5w9k5w9k5w9k5w9k5w9k5w9k5w9k5w9k5w9k5w9k5w9k5w9k5w9k5w9k5w9k5w9k5w9k5w9k5w9k5w9egP5oAKOdgQBkALECAAEQEAAYABhYL/QACIAEM1+tck+VgAAcU7trkbuPs4EAt4r3gQHxggGk8IED';

/**
 * Opens the story's video gallery and pages to the video (2 / 3). A video
 * that failed to load gives Chromium's controls every touch on it, so the
 * story's video is served SHORT_WEBM, which loads.
 */
async function openVideoGallery(page: Page) {
  await page.route(
    'https://interactive-examples.mdn.mozilla.net/**',
    async route =>
      route.fulfill({
        contentType: 'video/webm',
        body: Buffer.from(SHORT_WEBM, 'base64'),
      }),
  );
  await page.route('https://picsum.photos/**', async route =>
    route.fulfill({contentType: 'image/svg+xml', body: photoSvg('#888')}),
  );
  // Without zoom the gallery's viewport is no Zoom button, so this opens the
  // story itself rather than through openGallery.
  await openStory(page, storybook(), 'core-lightbox--gallery-with-video');
  const driver = await touchDriver(page);
  const trigger = await page
    .getByRole('button', {name: 'Open gallery with video'})
    .boundingBox();
  if (trigger == null) {
    throw new Error('no trigger');
  }
  await driver.tap({
    x: trigger.x + trigger.width / 2,
    y: trigger.y + trigger.height / 2,
  });
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const track = dialog.locator('[data-lightbox-page]').first().locator('..');
  const counter = async () =>
    (await dialog.getByText(/^\d+ \/ \d+$/).textContent()) ?? '';
  const next = await dialog.getByRole('button', {name: 'Next'}).boundingBox();
  if (next == null) {
    throw new Error('no Next button');
  }
  await driver.tap({x: next.x + next.width / 2, y: next.y + next.height / 2});
  await waitForRest(track);
  expect(await counter()).toBe('2 / 3');
  const video = dialog.locator('[data-current] video');
  const box = await video.boundingBox();
  if (box == null) {
    throw new Error('no video');
  }
  return {driver, track, counter, video, box};
}

test("a drag that starts on a video's controls stays the video's; a drag on its frame pages", async ({
  page,
}) => {
  const {driver, track, counter, box: v} = await openVideoGallery(page);
  const width = page.viewportSize()?.width ?? 0;
  // In the 48 px band at its bottom edge, where its controls are taken to be.
  await driver.play(
    slowDrag({x: v.x + v.width * 0.8, y: v.y + v.height - 20}, -width * 0.6),
  );
  await waitForRest(track);
  expect(await counter()).toBe('2 / 3');
  // On its frame, the drag pages.
  await driver.play(
    slowDrag({x: v.x + v.width * 0.8, y: v.y + v.height / 2}, -width * 0.6),
  );
  await waitForRest(track);
  expect(await counter()).toBe('3 / 3');
});

test('a video that ends during a drag on its frame leaves the drag to page', async ({
  page,
}) => {
  const {driver, track, counter, video, box: v} = await openVideoGallery(page);
  const width = page.viewportSize()?.width ?? 0;
  // The 0.2 s video starts at the press, so it ends early in the 600 ms drag.
  await video.evaluate((el: HTMLVideoElement) => {
    const at: Record<string, number> = {};
    (window as unknown as {__at: Record<string, number>}).__at = at;
    el.muted = true;
    el.loop = false;
    el.addEventListener('ended', () => {
      at.ended = performance.now();
    });
    window.addEventListener(
      'pointerdown',
      () => {
        at.down = performance.now();
        void el.play();
      },
      {capture: true, once: true},
    );
    for (const type of ['pointerup', 'pointercancel']) {
      window.addEventListener(
        type,
        () => {
          at[type] = performance.now();
        },
        {capture: true, once: true},
      );
    }
  });
  await driver.play(
    slowDrag({x: v.x + v.width * 0.8, y: v.y + v.height / 2}, -width * 0.6),
  );
  await waitForRest(track);
  const at = await page.evaluate(
    () => (window as unknown as {__at: Record<string, number>}).__at,
  );
  expect(at.ended).toBeGreaterThan(at.down);
  expect(at.ended).toBeLessThan(at.pointerup);
  expect(at.pointercancel).toBeUndefined();
  expect(await counter()).toBe('3 / 3');
});

/** The centre of the current page's caption, in client px. */
async function captionCentre(g: Gallery): Promise<{x: number; y: number}> {
  return g.dialog.locator('[data-current]').evaluate(page => {
    const caption = page.querySelector('[data-lightbox-caption]');
    if (caption == null) {
      throw new Error('no caption');
    }
    const r = caption.getBoundingClientRect();
    return {x: r.left + r.width / 2, y: r.top + r.height / 2};
  });
}

test("a pinch on a zoomable gallery's caption still zooms the page", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'native pinch-zoom from scripted touches is Chromium-only',
  );
  const g = await openGallery(page, {
    story: 'core-lightbox--gallery-with-captions',
    trigger: 'Open gallery with captions',
  });
  await g.driver.play(
    pinch({
      center: await captionCentre(g),
      fromDistance: 30,
      toDistance: 200,
      durationMs: 400,
    }),
  );
  await expect
    .poll(async () => page.evaluate(() => window.visualViewport?.scale ?? 1))
    .toBeGreaterThan(1.5);
  expect((await g.photo()).scale).toBe(1);
});

test('a swipe that starts on a caption pages', async ({page}) => {
  const g = await openGallery(page, {
    story: 'core-lightbox--gallery-with-captions',
    trigger: 'Open gallery with captions',
  });
  const from = await captionCentre(g);
  await g.driver.play(slowDrag(from, -g.box.width * 0.6));
  await waitForRest(g.track);
  expect(await g.counter()).toMatch(/^2 \/ \d+$/);
});

test('a pinch zooms the photo and never pages', async ({page}) => {
  const g = await openGallery(page);
  const centre = {x: g.box.x + g.box.width / 2, y: g.box.y + g.box.height / 2};
  await g.driver.play(driftingPinch(centre, -60));
  await frames(page, 30);
  expect((await g.photo()).scale).toBeGreaterThan(1.5);
  expect(await g.trackX()).toBe(0);
  expect(await g.counter()).toBe('1 / 4');
});

test('the page settle keeps advancing every frame while the main thread is blocked', async ({
  page,
}, testInfo) => {
  const g = await openGallery(page);
  // The next photo, which slides in from the right as the page settles. The
  // track itself is wider than the screen, so its tracked box stays pinned to
  // the screen's edge and reads as settled at once.
  const nextPhoto = g.dialog
    .locator('[data-lightbox-page]')
    .nth(1)
    .locator('img');
  await markElement(nextPhoto, {mode: 'outline'});
  // A compositor-only control animation in the same window: what the
  // compositor presented while the main thread spun, on this machine.
  await startBusyControl(page);
  const cast = await startScreencast(page);
  const from = {x: g.box.x + g.box.width * 0.8, y: g.box.y + g.box.height / 2};
  await g.driver.play(slowDrag(from, -g.box.width * 0.6));
  const [settle] = await waitForAnimation(g.track, {minProgressMs: 16});
  const block = await blockMainThread(page, 400);
  // A few frames after the block, so the screencast holds its end.
  await frames(page, 6);
  const castFrames = await cast.stop();
  const tracked = await trackMarker(page, castFrames);
  const control = await trackMarker(page, castFrames, {rgb: CONTROL_RGB});
  const proof = busyWindowProof(
    tracked,
    {from: block.from, to: Math.min(block.to, settle.to)},
    {axis: 'x', settledWithin: 1, control},
  );
  await writeEvidence(
    'busy-main-thread/lightbox-page-settle',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {block, settle, proof, control},
        null,
        1,
      ),
    },
    testInfo,
  );
  const film = await castStoryboard(page, castFrames, {
    name: 'lightbox-page-settle-busy-main-thread',
    zero: block.from,
    from: block.from - 40,
    to: Math.min(block.to, settle.to) + 40,
    columns: 8,
    cellScale: 0.35,
    data: t => ({x: tracked.find(f => f.t === t)?.box?.x ?? -1}),
  });
  await film.write(testInfo, {block, settle});
  // Judged against the control. A two-core runner's software compositor and
  // the screencast share the core the block spins on. So every compositor
  // animation presents fewer frames there, the control's too. The photo keeps
  // pace with the control, and a main-thread animation would not. A window
  // too short to judge fails too.
  expect(proof.verdict.failures).toEqual([]);
  expect(proof.monotonic).toBe(true);
});

test(
  'storyboard: a page swipe in the gallery',
  {tag: '@storyboard'},
  async ({page}, testInfo) => {
    const g = await openGallery(page);
    const from = {
      x: g.box.x + g.box.width * 0.8,
      y: g.box.y + g.box.height / 2,
    };
    const board = await touchStoryboard(
      page,
      g.driver,
      drag(
        from,
        {x: from.x - g.box.width * 0.6, y: from.y},
        {
          durationMs: 300,
          hz: 20,
          restMs: 100,
        },
      ),
      {
        name: 'lightbox-page-swipe',
        measure: async () => ({x: +(await g.trackX()).toFixed(1)}),
        columns: 4,
        cellScale: 0.35,
      },
    );
    await board.write(testInfo);
    await waitForRest(g.track);
    expect(await g.counter()).toBe('2 / 4');
  },
);

test('only the current page takes focus and is in the accessibility tree', async ({
  page,
}) => {
  const g = await openGallery(page);
  const next = g.dialog.getByRole('button', {name: 'Next'});
  const b = await next.boundingBox();
  if (b == null) {
    throw new Error('no Next button');
  }
  await g.driver.tap({x: b.x + b.width / 2, y: b.y + b.height / 2});
  await waitForRest(g.track);
  expect(await g.counter()).toBe('2 / 4');
  const pages = await g.track.evaluate(el =>
    ([...el.children] as HTMLElement[]).map(p => ({
      current: p.hasAttribute('data-current'),
      inert: p.inert,
      hidden: p.getAttribute('aria-hidden'),
    })),
  );
  expect(pages.length).toBe(3);
  for (const p of pages) {
    expect(p.inert).toBe(!p.current);
    expect(p.hidden).toBe(p.current ? null : 'true');
  }
  // Tab through the dialog: focus never enters a page off screen, and the
  // stage never scrolls to show one.
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    const where = await page.evaluate(() => {
      const page = document.activeElement?.closest('[data-lightbox-page]');
      if (page == null) {
        return 'outside';
      }
      return page.hasAttribute('data-current') ? 'current' : 'off screen';
    });
    expect(where).not.toBe('off screen');
  }
  expect(await g.viewport.evaluate(el => el.scrollLeft)).toBe(0);
});

test('a controlled parent that keeps its index brings a swiped photo back', async ({
  page,
}) => {
  const g = await openGallery(page, {
    story: 'core-lightbox--gallery-keeps-index',
    trigger: 'Open gallery that keeps its photo',
  });
  expect(await g.counter()).toBe('1 / 4');
  const mid = {x: g.box.x + g.box.width * 0.8, y: g.box.y + g.box.height / 2};
  await g.driver.play(slowDrag(mid, -g.box.width * 0.6));
  await waitForRest(g.track);
  await frames(page, 2);
  await waitForRest(g.track);
  expect(await g.counter()).toBe('1 / 4');
  expect(await g.trackX()).toBeCloseTo(0, 0);
  await expect(g.dialog).toHaveAccessibleName('Forest path');
});

test("two pages on, a rotation keeps a zoomed photo's centre point", async ({
  page,
}) => {
  const g = await openGallery(page);
  const next = g.dialog.getByRole('button', {name: 'Next'});
  for (const expected of ['2 / 4', '3 / 4']) {
    const b = await next.boundingBox();
    if (b == null) {
      throw new Error('no Next button');
    }
    await g.driver.tap({x: b.x + b.width / 2, y: b.y + b.height / 2});
    await waitForRest(g.track);
    expect(await g.counter()).toBe(expected);
  }
  const img = g.dialog.locator('[data-current] img');
  const fitted = await img.boundingBox();
  if (fitted == null) {
    throw new Error('no photo');
  }
  await g.driver.play(
    doubleTap({
      x: fitted.x + fitted.width * 0.4,
      y: fitted.y + fitted.height / 2,
    }),
  );
  await waitForAnimation(img);
  await waitForRest(img);
  // Where the stage's centre falls on the photo, as a fraction of it.
  const centreOnPhoto = async () => {
    const photo = await img.boundingBox();
    const stage = await g.viewport.boundingBox();
    if (photo == null || stage == null) {
      throw new Error('no photo');
    }
    return {
      u: (stage.x + stage.width / 2 - photo.x) / photo.width,
      v: (stage.y + stage.height / 2 - photo.y) / photo.height,
    };
  };
  const before = await centreOnPhoto();
  const size = page.viewportSize() ?? {width: 402, height: 714};
  await page.setViewportSize({width: size.height, height: size.width});
  await frames(page, 6);
  await waitForRest(img);
  const after = await centreOnPhoto();
  expect(Math.abs(after.u - before.u)).toBeLessThan(0.02);
  expect(Math.abs(after.v - before.v)).toBeLessThan(0.02);
});
