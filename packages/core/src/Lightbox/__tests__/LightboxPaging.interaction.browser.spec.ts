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
  type BlockedWindow,
  blockMainThread,
  type BusyRun,
  BusyWindowTooLateError,
  castStoryboard,
  CONTROL_RGB,
  countBetween,
  drag,
  frames,
  markElement,
  MARKER_RGB,
  openStory,
  pinch,
  pooledBusyProof,
  startBusyControl,
  startScreencast,
  touchDriver,
  type TouchDriver,
  type TouchScript,
  touchStoryboard,
  traceRendering,
  trackMarkers,
  waitForAnimation,
  waitForRest,
  withStorybook,
  writeEvidence,
} from '@astryxdesign/interaction-harness';
import {UIKIT_TAP} from '../../motion/uikit/gestures';
import {slowViewer} from './viewerTempo';

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
  const viewport = dialog.locator('[data-lightbox-media] > :first-child');
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

// A double tap whose second touch reaches the page past UIKit's interval
// between taps is two taps there: the play fails by name.
const DOUBLE_TAP = {
  boundaries: {tapIntervalMs: UIKIT_TAP.maximumIntervalBetweenTaps.value},
};

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

test('the caption is body Text on the media surface: its lines start at one edge, and "more" is a link in its type that ends the last line', async ({
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
      fontSize: getComputedStyle(text).fontSize,
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
  // Link's button form: a native button in the caption's own type.
  await expect(more).toHaveClass(/astryx-link/);
  await expect(more).toHaveAttribute('type', 'button');
  const moreType = await more.evaluate(el => ({
    fontSize: getComputedStyle(el).fontSize,
    lineHeight: parseFloat(getComputedStyle(el).lineHeight),
    underline: getComputedStyle(el).textDecorationLine,
  }));
  // Underlined, so it reads as a link beside the caption's own text.
  expect(moreType.underline).toBe('underline');
  expect(moreType.fontSize).toBe(caption?.fontSize);
  expect(moreType.lineHeight).toBeCloseTo(caption?.lineHeight ?? 0, 1);
  const m = await more.boundingBox();
  expect(m).not.toBeNull();
  // It ends the last line: inside the text's end, one line tall, centred on
  // that line.
  expect((m?.x ?? 0) + (m?.width ?? 0)).toBeLessThanOrEqual(
    (caption?.right ?? 0) + 0.5,
  );
  expect(Math.abs((m?.height ?? 0) - (caption?.lineHeight ?? 0))).toBeLessThan(
    1,
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
  // takes taps across 44 × 44 px.
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
  await g.driver.play(doubleTap(centre), DOUBLE_TAP);
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

test('a short caption after a page with its caption open shows whole, with no "more"', async ({
  page,
}) => {
  await page.setViewportSize({width: 390, height: 844});
  const g = await openGallery(page, {
    story: 'core-lightbox--gallery-with-captions',
    trigger: 'Open gallery with captions',
  });
  const more = g.dialog.getByRole('button', {name: 'more'});
  const m = await more.boundingBox();
  if (m == null) {
    throw new Error('no more button');
  }
  await g.driver.tap({x: m.x + m.width / 2, y: m.y + m.height / 2});
  await expect(g.dialog.getByRole('button', {name: 'less'})).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  const mid = {x: g.box.x + g.box.width * 0.8, y: g.box.y + g.box.height / 3};
  await g.driver.play(slowDrag(mid, -g.box.width * 0.6));
  await waitForRest(g.track);
  expect(await g.counter()).toBe('2 / 4');
  await frames(page, 4);
  // The second caption fits its two lines, so it has no toggle and no
  // ellipsis.
  await expect(more).toHaveCount(0);
  const cut = await g.dialog
    .locator('[data-current] [data-lightbox-caption] .astryx-text')
    .first()
    .evaluate(el => el.scrollHeight > el.clientHeight + 1);
  expect(cut).toBe(false);
});

test("a pinch on a gallery's open caption still zooms the page", async ({
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
  const more = g.dialog.getByRole('button', {name: 'more'});
  const m = await more.boundingBox();
  if (m == null) {
    throw new Error('no more button');
  }
  await g.driver.tap({x: m.x + m.width / 2, y: m.y + m.height / 2});
  const less = g.dialog.getByRole('button', {name: 'less'});
  await expect(less).toHaveAttribute('aria-expanded', 'true');
  // The open caption's text, the scroll container over the photo.
  const text = page
    .locator(`[id="${await less.getAttribute('aria-controls')}"]`)
    .locator('.astryx-text')
    .first();
  const r = await text.boundingBox();
  if (r == null) {
    throw new Error('no caption text');
  }
  await g.driver.play(
    pinch({
      center: {x: r.x + r.width / 2, y: r.y + r.height / 2},
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

/**
 * A drag by 60 % of a page. It holds still 300 ms before the lift, so the
 * settle starts at rest on a loaded runner too.
 */
function swipeAtRest(
  g: Gallery,
  toward: 'next' | 'previous' = 'next',
): TouchScript {
  const sign = toward === 'next' ? 1 : -1;
  const from = {
    x: g.box.x + g.box.width * (0.5 + sign * 0.3),
    y: g.box.y + g.box.height / 2,
  };
  return drag(
    from,
    {x: from.x - sign * g.box.width * 0.6, y: from.y},
    {durationMs: 600, restMs: 300},
  );
}

/** A run of the track's, on the page clock: its start and its curve's length. */
interface TrackRun {
  readonly from: number;
  readonly curveMs: number;
}

/**
 * Records every animation the track starts from here on. Lightbox retires a
 * curve once it ends, and a block can outlast a curve at tempo 1. So a run
 * is read from this record, which keeps it. Resolves with the reader.
 */
async function recordTrackRuns(
  track: Locator,
): Promise<() => Promise<TrackRun[]>> {
  await track.evaluate(element => {
    const runs: {animation: Animation; from: number}[] = [];
    (window as unknown as {__trackRuns: typeof runs}).__trackRuns = runs;
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      const animation = animate.call(this, keyframes, options);
      if (this === element) {
        const run = {animation, from: Number.NaN};
        runs.push(run);
        // A retired run loses its start time, so it is kept as it starts.
        void animation.ready.then(
          () => {
            run.from = performance.timeOrigin + Number(animation.startTime);
          },
          // Cancelled before it started: it has no start to keep.
          () => undefined,
        );
      }
      return animation;
    };
  });
  return async () =>
    track.page().evaluate(() =>
      (
        window as unknown as {
          __trackRuns: {animation: Animation; from: number}[];
        }
      ).__trackRuns.map(({animation, from}) => {
        const effect = animation.effect as KeyframeEffect;
        const frames = effect.getKeyframes();
        const xs = frames.map(frame =>
          typeof frame.translate === 'string' ? parseFloat(frame.translate) : 0,
        );
        const end = xs[xs.length - 1];
        // The curve ends where its hold of the end value begins.
        let hold = xs.length - 1;
        while (hold > 0 && Math.abs(xs[hold - 1] - end) < 0.01) {
          hold -= 1;
        }
        const duration = Number(effect.getComputedTiming().duration);
        return {
          from,
          curveMs: (frames[hold].computedOffset ?? 1) * duration,
        };
      }),
    );
}

/** The slowed tempo the busy page-settle proofs play the viewer at. */
const SETTLE_TEMPO = 5;

/**
 * The part of a busy page-settle test's time its pool leaves free, ms. It
 * covers the browser's setup before the test's own code and the work after
 * the pool. It also covers a settle a little slower than the ones before it.
 */
const POOL_RESERVE_MS = 12_000;

/** The middle value, or the mean of the two middle ones. */
function median(values: ReadonlyArray<number>): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Where a run's judgment starts. It is the block's start, or just after the
 * block's first presented frame when that frame shows the photo unmoved. A
 * compositor can present a frame it began before the block. Only that one
 * frame is skipped, so a settle that stays still for two frames or more
 * still fails.
 */
function afterInFlightFrame(
  tracked: BusyRun['tracked'],
  blockFrom: number,
): number {
  const before = tracked.filter(f => f.box != null && f.t <= blockFrom).at(-1);
  const first = tracked.find(f => f.box != null && f.t > blockFrom);
  if (before?.box == null || first?.box == null) {
    return blockFrom;
  }
  return Math.abs(first.box.x - before.box.x) < 1 ? first.t + 1 : blockFrom;
}

/**
 * Blocks the main thread for `ms` once the track's settle shows on screen.
 * The rendering update that first sees the settle hands it to the
 * compositor. A starved compositor can draw a frame or two before it applies
 * it. WebKit runs the next rendering update only once its compositor has
 * drawn the last one. So the block starts after that update, with the settle
 * already moving on screen.
 */
async function blockOnceShown(
  track: Locator,
  ms: number,
): Promise<BlockedWindow> {
  return track.evaluate(
    async (element, {duration}) =>
      new Promise<BlockedWindow>((resolve, reject) => {
        const deadline = performance.now() + 5_000;
        const spin = () => {
          const start = performance.now();
          let now = start;
          while (now - start < duration) {
            now = performance.now();
          }
          resolve({
            from: performance.timeOrigin + start,
            to: performance.timeOrigin + now,
            spanMs: now - start,
          });
        };
        const tick = () => {
          const isRunning = element
            .getAnimations()
            .some(
              a =>
                a.playState === 'running' &&
                !a.pending &&
                Number(a.currentTime ?? 0) >= 16,
            );
          if (!isRunning) {
            if (performance.now() > deadline) {
              reject(new Error('blockOnceShown: no settle started'));
            } else {
              requestAnimationFrame(tick);
            }
            return;
          }
          // This frame's rendering update hands the settle over. The block
          // starts from a task after the next one.
          requestAnimationFrame(() => {
            setTimeout(spin, 0);
          });
        };
        requestAnimationFrame(tick);
      }),
    {duration: ms},
  );
}

/** The slowed settles a pooled proof judged, and what it read off them. */
interface PooledSettles {
  readonly proof: ReturnType<typeof pooledBusyProof>;
  readonly blocks: ReadonlyArray<BlockedWindow>;
  /** Each settle's run on the track, in order. */
  readonly settles: ReadonlyArray<TrackRun>;
}

/**
 * Plays a page settle toward each of `toward`, with the main thread blocked
 * in each, and judges the runs pooled against the control. `shown` blocks
 * once the settle shows on screen. `after-lift` blocks a moment after the
 * lift, for a settle that never runs on the compositor. `onFirst` gets the
 * first run's cast, for its storyboard.
 */
async function pooledSettleProof(
  page: Page,
  g: Gallery,
  toward: ReadonlyArray<'next' | 'previous'>,
  {
    start = 'shown',
    onFirst,
    deadline,
  }: {
    start?: 'shown' | 'after-lift';
    onFirst?: (
      castFrames: Parameters<typeof castStoryboard>[1],
      tracked: BusyRun['tracked'],
      block: BlockedWindow,
    ) => Promise<void>;
    /**
     * When the pool must be done, epoch ms. A settle that would not fit
     * before it is not started: the pool fails by name.
     */
    deadline?: number;
  } = {},
): Promise<PooledSettles> {
  const trackRuns = await recordTrackRuns(g.track);
  const runs: BusyRun[] = [];
  const blocks: BlockedWindow[] = [];
  const settles: TrackRun[] = [];
  // How long each settle took, its first storyboard left out.
  const settleMs: number[] = [];
  for (const direction of toward) {
    // A settle takes about as long as the ones before it. When the slowest
    // so far no longer fits, the machine is too slow for the pool. The run
    // then fails by name, and the test's timeout never ends it.
    if (deadline != null && settleMs.length > 0) {
      const slowest = Math.max(...settleMs);
      const left = deadline - Date.now();
      if (slowest > left) {
        const seconds = (ms: number) => (ms / 1000).toFixed(1);
        throw new Error(
          `pooledSettleProof: too slow for the pool: ${settleMs.length} of ${toward.length} settles took ${seconds(settleMs.reduce((a, b) => a + b, 0))} s, up to ${seconds(slowest)} s each, and ${seconds(Math.max(0, left))} s of the test's time remain`,
        );
      }
    }
    const settleStarted = Date.now();
    let storyboardMs = 0;
    // The tracked photo keeps its left edge on screen as the page settles.
    // Toward the next page it is the next photo, which slides in from the
    // right. Back, it is the current one, which slides out to the right. A box
    // clipped at the screen's edge reads as settled at once, and so does the
    // track, which is wider than the screen.
    const unmark = await markElement(
      g.dialog.locator(
        direction === 'next'
          ? '[data-current] + [data-lightbox-page] img'
          : '[data-current] img',
      ),
      {mode: 'outline'},
    );
    // A touch on a settle's held end catches it, and the block would start
    // at that touch. So each run starts once the track runs no animation.
    await expect
      .poll(async () =>
        g.track.evaluate(el =>
          el.getAnimations().some(a => a.playState === 'running'),
        ),
      )
      .toBe(false);
    const cast = await startScreencast(page);
    let block: BlockedWindow;
    if (start === 'shown') {
      // The page itself waits for the settle and blocks. A round trip from
      // the test would start the block later still.
      const blocking = blockOnceShown(g.track, 600);
      await g.driver.play(swipeAtRest(g, direction));
      block = await blocking;
    } else {
      await g.driver.play(swipeAtRest(g, direction));
      await page.waitForTimeout(150);
      block = await blockMainThread(page, 750);
    }
    // A few frames after the block, so the screencast holds its end.
    await frames(page, 6);
    const castFrames = await cast.stop();
    const settle = (await trackRuns()).at(-1);
    if (settle == null) {
      throw new Error('no settle recorded');
    }
    // One decode of each frame finds the photo's marker and the control.
    const [tracked, control] = await trackMarkers(page, castFrames, {
      colors: [MARKER_RGB, CONTROL_RGB],
    });
    runs.push({
      tracked,
      control,
      window: {
        from: afterInFlightFrame(tracked, block.from),
        to: Math.min(block.to, settle.from + settle.curveMs),
      },
    });
    blocks.push(block);
    settles.push(settle);
    if (runs.length === 1) {
      const storyboardStarted = Date.now();
      await onFirst?.(castFrames, tracked, block);
      storyboardMs = Date.now() - storyboardStarted;
    }
    await waitForRest(g.track);
    await unmark();
    settleMs.push(Date.now() - settleStarted - storyboardMs);
  }
  // The settle slows at its end. Near the end a 60 Hz frame moves less than
  // one cast step, so the cast shows plateaus there. Judging stops 12 cast
  // steps from the end.
  return {
    proof: pooledBusyProof(runs, {axis: 'x', settledWithinSteps: 12}),
    blocks,
    settles,
  };
}

test('the page settle keeps advancing every frame while the main thread is blocked', async ({
  page,
}, testInfo) => {
  // With no test timeout (0, as under --debug) the pool has no deadline.
  const deadline =
    testInfo.timeout > 0
      ? Date.now() + testInfo.timeout - POOL_RESERVE_MS
      : undefined;
  const g = await openGallery(page);
  // A compositor-only control animation in the same windows: what the
  // compositor presented while the main thread spun, on this machine.
  await startBusyControl(page);
  // While the main thread is blocked, a starved runner's compositor presents
  // a frame only every 100 to 200 ms. At tempo 1 the settle moves for a
  // third of a second, which leaves too few frames to judge. At tempo 5 it
  // moves visibly for about 900 ms. A block of 600 ms that starts once the
  // settle shows then ends well before the settle does. Six settles, to page
  // 4 and back, are judged as one pool. A run whose control presented
  // nothing is left out by name, and the pool needs three judged runs.
  const restoreTempo = await slowViewer(page, SETTLE_TEMPO);
  const {proof, blocks, settles} = await pooledSettleProof(
    page,
    g,
    ['next', 'next', 'next', 'previous', 'previous', 'previous'],
    {
      deadline,
      onFirst: async (castFrames, tracked, block) => {
        const film = await castStoryboard(page, castFrames, {
          name: 'lightbox-page-settle-busy-main-thread',
          zero: block.from,
          from: block.from - 40,
          to: block.to + 40,
          columns: 8,
          cellScale: 0.35,
          data: t => ({x: tracked.find(f => f.t === t)?.box?.x ?? -1}),
        });
        await film.write(testInfo, {block});
      },
    },
  );
  expect(await g.counter()).toBe('1 / 4');
  // The same settle at the default tempo, to compare the slowed ones with.
  await restoreTempo();
  const trackRuns = await recordTrackRuns(g.track);
  await g.driver.play(swipeAtRest(g));
  await waitForRest(g.track);
  expect(await g.counter()).toBe('2 / 4');
  const atTempo1 = (await trackRuns()).at(-1);
  if (atTempo1 == null) {
    throw new Error('no settle recorded at tempo 1');
  }
  const ratios = settles.map(settle => settle.curveMs / atTempo1.curveMs);
  await writeEvidence(
    'busy-main-thread/lightbox-page-settle',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {blocks, settles, atTempo1, ratios, summary: proof.summary},
        null,
        1,
      ),
    },
    testInfo,
  );
  // The pager's own settle at tempo 5: five times as long as at tempo 1,
  // and still running on the compositor when each block ends.
  for (const [index, settle] of settles.entries()) {
    expect(ratios[index], JSON.stringify(settles)).toBeGreaterThan(
      SETTLE_TEMPO - 0.1,
    );
    expect(ratios[index], JSON.stringify(settles)).toBeLessThan(
      SETTLE_TEMPO + 0.1,
    );
    expect(settle.from + settle.curveMs).toBeGreaterThan(blocks[index].to);
  }
  // Judged against the control. A two-core runner's software compositor and
  // the screencast share the core the block spins on. So every compositor
  // animation presents fewer frames there, the control's too. The photo keeps
  // pace with the control, and a main-thread animation would not. A pool too
  // short to judge fails too.
  expect(proof.verdict.failures, proof.summary).toEqual([]);
  for (const [index, run] of proof.runs.entries()) {
    if (proof.judged[index]) {
      expect(run?.monotonic, proof.summary).toBe(true);
    }
  }
});

/**
 * Breaks the page settle for the busy proof's controls. `main-thread` pauses
 * the track's animation and moves its time from frame callbacks, and
 * `frozen` pauses it. `delayed` holds it still on the compositor for
 * `delayMs` before it moves.
 */
async function breakSettle(
  g: Gallery,
  pace: 'main-thread' | 'frozen' | 'delayed',
  delayMs = 0,
): Promise<void> {
  await g.track.evaluate(
    (track, {mode, delay}) => {
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (keyframes, options) {
        if (this === track && mode === 'delayed') {
          const timing =
            typeof options === 'number' ? {duration: options} : {...options};
          return animate.call(this, keyframes, {
            ...timing,
            delay: (timing.delay ?? 0) + delay,
          });
        }
        const animation = animate.call(this, keyframes, options);
        if (this !== track) {
          return animation;
        }
        animation.pause();
        if (mode === 'main-thread') {
          const from = performance.now();
          const start = Number(animation.currentTime ?? 0);
          const step = (now: number) => {
            if (animation.playState !== 'idle') {
              animation.currentTime = start + now - from;
              requestAnimationFrame(step);
            }
          };
          requestAnimationFrame(step);
        }
        return animation;
      };
    },
    {mode: pace, delay: delayMs},
  );
}

for (const pace of ['main-thread', 'frozen'] as const) {
  test(`the busy proof fails a slowed page settle that ${pace === 'frozen' ? 'freezes' : 'the main thread drives'}`, async ({
    page,
  }) => {
    const g = await openGallery(page);
    await startBusyControl(page);
    await slowViewer(page, SETTLE_TEMPO);
    await breakSettle(g, pace);
    let failures: ReadonlyArray<string>;
    try {
      // Neither runs on the compositor, so the block starts after the lift.
      const {proof} = await pooledSettleProof(page, g, ['next', 'next'], {
        start: 'after-lift',
      });
      failures = proof.verdict.failures;
    } catch (error) {
      // A settle that never moved has settled before the window: a red too.
      expect(error).toBeInstanceOf(BusyWindowTooLateError);
      failures = [(error as Error).message];
    }
    expect(failures.length).toBeGreaterThan(0);
  });
}

for (const late of ['two frames', '450 ms'] as const) {
  test(`the busy proof fails a slowed page settle that stays still ${late} into the block`, async ({
    page,
  }) => {
    const g = await openGallery(page);
    await startBusyControl(page);
    await slowViewer(page, SETTLE_TEMPO);
    // Three settles first give this machine's numbers, judged as one pool.
    // Their blocks show how long after a settle starts its block starts, and
    // their casts give the frame interval during a block. One run can hold
    // too few control frames to judge, in WebKit or on a loaded machine.
    // Three runs together hold enough. One settle can start its block late,
    // such as the first in a new gallery. A delay read from it would push the
    // motion past the block. So 450 ms counts from the earliest block, and two
    // frames from the median one. The delayed settle then stays still for
    // that long, then for two frames and a little more or for 450 ms. That is
    // past the one frame the proof skips.
    const calibration = await pooledSettleProof(page, g, [
      'next',
      'next',
      'previous',
    ]);
    const lags = calibration.blocks.map(
      (block, i) => block.from - calibration.settles[i].from,
    );
    const blockAfterMs =
      late === 'two frames' ? median(lags) : Math.min(...lags);
    // Only the runs the pool judged give a frame interval.
    const cadences = calibration.proof.runs.flatMap((run, i) =>
      run != null && calibration.proof.judged[i] ? [run.cadenceMs] : [],
    );
    expect(cadences.length, calibration.proof.summary).toBeGreaterThan(0);
    const stillMs = late === 'two frames' ? 2.2 * median(cadences) : 450;
    const delayMs = blockAfterMs + stillMs;
    await breakSettle(g, 'delayed', delayMs);
    const {proof, blocks, settles} = await pooledSettleProof(page, g, [
      'next',
      'next',
    ]);
    // A run whose delayed motion began outside its block tests nothing. When
    // the proof misses the stall, these lines name such a run.
    const missed = settles.flatMap((settle, i) => {
      const moves = settle.from + delayMs;
      if (moves >= blocks[i].to) {
        return [
          `run ${i + 1}: calibration missed: the delayed motion began ${Math.round(moves - blocks[i].to)} ms after the block`,
        ];
      }
      if (moves <= blocks[i].from) {
        return [
          `run ${i + 1}: calibration missed: the delayed motion began ${Math.round(blocks[i].from - moves)} ms before the block`,
        ];
      }
      return [];
    });
    // The photo misses a frame the control moved on, past the in-flight one.
    expect(
      proof.verdict.failures.join('\n'),
      [...missed, proof.summary].join('\n'),
    ).toMatch(/moved on \d+ of the \d+ frames the control moved/);
  });
}

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
    DOUBLE_TAP,
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

/**
 * The layouts inside the task of one input: from the document's capture
 * listener to its bubble listener. React commits a discrete input in a
 * microtask after its root's listener, so that commit falls inside. A layout
 * there is one that script forced, by reading geometry the browser had not laid
 * out yet.
 */
async function taskLayouts(
  page: Page,
  type: 'click' | 'keydown',
  act: () => Promise<unknown>,
): Promise<{layouts: number; events: string[]}> {
  await page.evaluate(eventType => {
    const at = () => performance.timeOrigin + performance.now();
    const marks = {from: 0, to: 0};
    (window as unknown as {__task: typeof marks}).__task = marks;
    document.addEventListener(
      eventType,
      () => {
        marks.from = at();
      },
      {capture: true, once: true},
    );
    document.addEventListener(
      eventType,
      () => {
        marks.to = at();
      },
      {once: true},
    );
  }, type);
  const trace = await traceRendering(page, async () => {
    await act();
    await page.waitForTimeout(100);
  });
  const task = await page.evaluate(
    () => (window as unknown as {__task: {from: number; to: number}}).__task,
  );
  expect(task.to).toBeGreaterThan(task.from);
  return {
    layouts: countBetween(trace, task.from, task.to).Layout ?? 0,
    events: trace.events
      .filter(e => e.t >= task.from && e.t <= task.to)
      .map(e => `${e.name}@${(e.t - task.from).toFixed(1)}`),
  };
}

test('opening a gallery on a clamped caption lays out no more than opening one without captions', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'rendering traces are Chromium-only');
  await page.route('https://picsum.photos/**', async route => {
    const id = /\/id\/(\d+)\//.exec(route.request().url())?.[1] ?? '10';
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: photoSvg(COLORS[id] ?? '#888'),
    });
  });
  // Opens the story's gallery with a click. In the captioned story, the first
  // page's caption is clamped, with its "more".
  const measure = async (story: string, trigger: string) => {
    await openStory(page, storybook(), story);
    const open = await taskLayouts(page, 'click', async () =>
      page.getByRole('button', {name: trigger}).click(),
    );
    await expect(page.getByRole('dialog')).toBeVisible();
    return open;
  };
  const captioned = await measure(
    'core-lightbox--gallery-with-captions',
    'Open gallery with captions',
  );
  await expect(
    page.getByRole('dialog').getByRole('button', {name: 'more'}),
  ).toBeVisible();
  const plain = await measure(
    'core-lightbox--gallery-with-zoom',
    'Open gallery with zoom',
  );
  // The caption's sizes are read after the browser lays the page out, so
  // its band and its "more" force no layout of their own.
  expect(
    captioned.layouts,
    JSON.stringify({captioned, plain}),
  ).toBeLessThanOrEqual(plain.layouts);
});

/**
 * Logs every geometry read of an element inside a caption in the task of the
 * next input of `type`. The task runs from the document's capture listener to
 * its bubble listener, React's commit included. The log is
 * `window.__captionReads`.
 */
async function logCaptionReadsInTask(page: Page, type: 'click' | 'keydown') {
  await page.evaluate(eventType => {
    const reads: string[] = [];
    (window as unknown as {__captionReads: string[]}).__captionReads = reads;
    let isInTask = false;
    document.addEventListener(
      eventType,
      () => {
        isInTask = true;
      },
      {capture: true, once: true},
    );
    document.addEventListener(
      eventType,
      () => {
        isInTask = false;
      },
      {once: true},
    );
    const inCaption = (node: unknown) => {
      const element =
        node instanceof Element
          ? node
          : node instanceof Node
            ? node.parentElement
            : null;
      return element?.closest('[data-lightbox-caption]') != null;
    };
    const note = (name: string, node: unknown) => {
      if (isInTask && inCaption(node)) {
        reads.push(name);
      }
    };
    const getters: [object, string][] = [
      [HTMLElement.prototype, 'offsetWidth'],
      [HTMLElement.prototype, 'offsetHeight'],
      [Element.prototype, 'clientWidth'],
      [Element.prototype, 'clientHeight'],
      [Element.prototype, 'scrollWidth'],
      [Element.prototype, 'scrollHeight'],
    ];
    for (const [proto, name] of getters) {
      const own = Object.getOwnPropertyDescriptor(proto, name);
      if (own?.get == null) {
        continue;
      }
      const get = own.get as (this: Element) => number;
      Object.defineProperty(proto, name, {
        configurable: true,
        get(this: Element): number {
          note(name, this);
          return get.call(this);
        },
      });
    }
    const rect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      note('getBoundingClientRect', this);
      return rect.call(this);
    };
    const rangeRect = Range.prototype.getBoundingClientRect;
    Range.prototype.getBoundingClientRect = function (this: Range) {
      note('Range.getBoundingClientRect', this.commonAncestorContainer);
      return rangeRect.call(this);
    };
    const computed = window.getComputedStyle;
    window.getComputedStyle = function (
      this: Window,
      element: Element,
      pseudo?: string | null,
    ) {
      note('getComputedStyle', element);
      return computed.call(this, element, pseudo);
    };
  }, type);
  return async () =>
    page.evaluate(
      () => (window as unknown as {__captionReads: string[]}).__captionReads,
    );
}

for (const viewport of [
  {width: 402, height: 874},
  {width: 1440, height: 900},
]) {
  test(`the caption is measured after layout, never in the task that opens the gallery or pages it (${viewport.width}×${viewport.height})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    // A delivery that resizes what its observer watches leaves that one for
    // the next frame, and the browser reports the loop as an error.
    await page.addInitScript(() => {
      const errors: string[] = [];
      (window as unknown as {__pageErrors: string[]}).__pageErrors = errors;
      window.addEventListener('error', event => {
        errors.push(event.message);
      });
    });
    await page.route('https://picsum.photos/**', async route => {
      const id = /\/id\/(\d+)\//.exec(route.request().url())?.[1] ?? '10';
      await route.fulfill({
        contentType: 'image/svg+xml',
        body: photoSvg(COLORS[id] ?? '#888'),
      });
    });
    await openStory(page, storybook(), 'core-lightbox--gallery-with-captions');
    // The first page's caption is clamped, with its "more". The second
    // page's fits its two lines.
    const openReads = await logCaptionReadsInTask(page, 'click');
    await page
      .getByRole('button', {name: 'Open gallery with captions'})
      .click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', {name: 'more'})).toBeVisible();
    const opening = await openReads();
    await dialog.getByRole('button', {name: 'Next'}).click();
    await expect(dialog.getByText('2 / 4')).toBeVisible();
    await waitForRest(
      dialog.locator('[data-lightbox-media] > :first-child > div').first(),
    );
    await frames(page, 2);
    const backReads = await logCaptionReadsInTask(page, 'keydown');
    await page.keyboard.press('ArrowLeft');
    await expect(dialog.getByText('1 / 4')).toBeVisible();
    await expect(dialog.getByRole('button', {name: 'more'})).toBeVisible();
    const back = await backReads();
    await frames(page, 2);
    const errors = await page.evaluate(
      () => (window as unknown as {__pageErrors: string[]}).__pageErrors,
    );
    expect({opening, back, errors}).toEqual({
      opening: [],
      back: [],
      errors: [],
    });
  });
}

test("the caption toggle's width comes from its own delivery, never from a read of the toggle", async ({
  page,
}) => {
  // A read of the toggle in a resize delivery can come after another
  // observer's update in the same delivery, which forces a layout. The
  // delivery's own size was measured in the layout before it.
  await page.addInitScript(() => {
    const reads: string[] = [];
    (window as unknown as {__toggleReads: string[]}).__toggleReads = reads;
    let isDelivering = false;
    const Native = window.ResizeObserver;
    window.ResizeObserver = class extends Native {
      constructor(callback: ResizeObserverCallback) {
        super((entries, observer) => {
          isDelivering = true;
          try {
            callback(entries, observer);
          } finally {
            isDelivering = false;
          }
        });
      }
    };
    const own = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'offsetWidth',
    );
    const get = own?.get as ((this: HTMLElement) => number) | undefined;
    if (get == null) {
      return;
    }
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get(this: HTMLElement): number {
        if (
          isDelivering &&
          this.tagName === 'BUTTON' &&
          this.closest('[data-lightbox-caption]') != null
        ) {
          reads.push('offsetWidth');
        }
        return get.call(this);
      },
    });
  });
  await page.route('https://picsum.photos/**', async route => {
    const id = /\/id\/(\d+)\//.exec(route.request().url())?.[1] ?? '10';
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: photoSvg(COLORS[id] ?? '#888'),
    });
  });
  await openStory(page, storybook(), 'core-lightbox--gallery-with-captions');
  await page.getByRole('button', {name: 'Open gallery with captions'}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', {name: 'more'})).toBeVisible();
  await dialog.getByRole('button', {name: 'Next'}).click();
  await expect(dialog.getByText('2 / 4')).toBeVisible();
  await waitForRest(
    dialog.locator('[data-lightbox-media] > :first-child > div').first(),
  );
  await frames(page, 2);
  // Back onto the clamped first caption, whose toggle mounts hidden and is
  // shown by the band's delivery.
  await page.keyboard.press('ArrowLeft');
  await expect(dialog.getByText('1 / 4')).toBeVisible();
  await expect(dialog.getByRole('button', {name: 'more'})).toBeVisible();
  await frames(page, 2);
  const reads = await page.evaluate(
    () => (window as unknown as {__toggleReads: string[]}).__toggleReads,
  );
  expect(reads).toEqual([]);
});

test('no caption read follows a write in the same resize delivery, from opening through "more", "less" and paging', async ({
  page,
}) => {
  // A read after a write in one delivery forces a layout before the
  // browser's own. A delivery lasts until the microtasks it queued have run.
  // A transform or an opacity changes no layout, so it counts as no write.
  // Two limits: a plain style property set by assignment is no write here,
  // and a microtask that a queued microtask queues runs after the window.
  await page.addInitScript(() => {
    const reads: string[] = [];
    (window as unknown as {__lateReads: string[]}).__lateReads = reads;
    let isDelivering = false;
    let hasWritten = false;
    const Native = window.ResizeObserver;
    window.ResizeObserver = class extends Native {
      constructor(callback: ResizeObserverCallback) {
        super((entries, observer) => {
          isDelivering = true;
          hasWritten = false;
          try {
            callback(entries, observer);
          } finally {
            // Microtasks the callback queued run before this one.
            queueMicrotask(() => {
              isDelivering = false;
              hasWritten = false;
            });
          }
        });
      }
    };
    const noteWrite = () => {
      if (isDelivering) {
        hasWritten = true;
      }
    };
    const setters: [object, string][] = [
      [Element.prototype, 'className'],
      [HTMLElement.prototype, 'hidden'],
      [Node.prototype, 'nodeValue'],
      [Node.prototype, 'textContent'],
      [CharacterData.prototype, 'data'],
    ];
    for (const [proto, name] of setters) {
      const own = Object.getOwnPropertyDescriptor(proto, name);
      if (own?.set == null) {
        continue;
      }
      const set = own.set;
      Object.defineProperty(proto, name, {
        ...own,
        set(this: unknown, value: unknown) {
          noteWrite();
          set.call(this, value);
        },
      });
    }
    const methods: [Record<string, unknown>, string][] = [
      [Element.prototype as unknown as Record<string, unknown>, 'setAttribute'],
      [
        Element.prototype as unknown as Record<string, unknown>,
        'removeAttribute',
      ],
      [
        CSSStyleDeclaration.prototype as unknown as Record<string, unknown>,
        'setProperty',
      ],
      [
        CSSStyleDeclaration.prototype as unknown as Record<string, unknown>,
        'removeProperty',
      ],
    ];
    const compositorOnly = new Set([
      'translate',
      'scale',
      'rotate',
      'transform',
      'opacity',
    ]);
    for (const [proto, name] of methods) {
      const method = proto[name] as (...args: unknown[]) => string | undefined;
      proto[name] = function (
        this: unknown,
        ...args: unknown[]
      ): string | undefined {
        if (
          !(this instanceof CSSStyleDeclaration) ||
          !compositorOnly.has(String(args[0]))
        ) {
          noteWrite();
        }
        return method.apply(this, args);
      };
    }
    const inCaption = (node: unknown) => {
      const element =
        node instanceof Element
          ? node
          : node instanceof Node
            ? node.parentElement
            : null;
      return element?.closest('[data-lightbox-caption]') != null;
    };
    const note = (name: string, node: unknown) => {
      if (isDelivering && hasWritten && inCaption(node)) {
        reads.push(name);
      }
    };
    const getters: [object, string][] = [
      [HTMLElement.prototype, 'offsetWidth'],
      [HTMLElement.prototype, 'offsetHeight'],
      [Element.prototype, 'clientWidth'],
      [Element.prototype, 'clientHeight'],
      [Element.prototype, 'scrollWidth'],
      [Element.prototype, 'scrollHeight'],
    ];
    for (const [proto, name] of getters) {
      const own = Object.getOwnPropertyDescriptor(proto, name);
      if (own?.get == null) {
        continue;
      }
      const get = own.get as (this: Element) => number;
      Object.defineProperty(proto, name, {
        configurable: true,
        get(this: Element): number {
          note(name, this);
          return get.call(this);
        },
      });
    }
    const rect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      note('getBoundingClientRect', this);
      return rect.call(this);
    };
    const rangeRect = Range.prototype.getBoundingClientRect;
    Range.prototype.getBoundingClientRect = function (this: Range) {
      note('Range.getBoundingClientRect', this.commonAncestorContainer);
      return rangeRect.call(this);
    };
    const computed = window.getComputedStyle;
    window.getComputedStyle = function (
      this: Window,
      element: Element,
      pseudo?: string | null,
    ) {
      note('getComputedStyle', element);
      return computed.call(this, element, pseudo);
    };
  });
  await page.route('https://picsum.photos/**', async route => {
    const id = /\/id\/(\d+)\//.exec(route.request().url())?.[1] ?? '10';
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: photoSvg(COLORS[id] ?? '#888'),
    });
  });
  await openStory(page, storybook(), 'core-lightbox--gallery-with-captions');
  await page.getByRole('button', {name: 'Open gallery with captions'}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', {name: 'more'})).toBeVisible();
  await frames(page, 2);
  await dialog.getByRole('button', {name: 'more'}).click();
  await expect(dialog.getByRole('button', {name: 'less'})).toBeVisible();
  await frames(page, 2);
  await dialog.getByRole('button', {name: 'less'}).click();
  await expect(dialog.getByRole('button', {name: 'more'})).toBeVisible();
  await frames(page, 2);
  await dialog.getByRole('button', {name: 'Next'}).click();
  await expect(dialog.getByText('2 / 4')).toBeVisible();
  await waitForRest(
    dialog.locator('[data-lightbox-media] > :first-child > div').first(),
  );
  await frames(page, 2);
  await page.keyboard.press('ArrowLeft');
  await expect(dialog.getByText('1 / 4')).toBeVisible();
  await expect(dialog.getByRole('button', {name: 'more'})).toBeVisible();
  await frames(page, 2);
  const reads = await page.evaluate(
    () => (window as unknown as {__lateReads: string[]}).__lateReads,
  );
  expect(reads).toEqual([]);
});
