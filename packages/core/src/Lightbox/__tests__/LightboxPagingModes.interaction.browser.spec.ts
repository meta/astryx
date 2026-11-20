// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LightboxPagingModes.interaction.browser.spec.ts
 * @input The built "Gallery with zoom" Lightbox story on the phone project,
 *   real touch input, the mouse and the interaction harness
 * @output Proofs for Lightbox's pager outside plain touch. Under Reduce
 *   Motion, a swipe and the Next button on a touch screen page by a fade of
 *   200 ms or less, with no slide. The Next button with a mouse pages at
 *   once, and a drag the owner refuses springs back over frames
 * @position Interaction tests for Lightbox (browser), beside
 *   LightboxPaging.interaction.browser.spec.ts
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  drag,
  frames,
  openStory,
  requireFrames,
  touchDriver,
  waitForRest,
  watchAnimations,
  withStorybook,
  type TouchDriver,
  type TouchScript,
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
  forest: '#d22',
  lake: '#2a2',
  beach: '#22d',
  city: '#d80',
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
    mouse = false,
    story = 'core-lightbox--gallery-with-zoom',
    trigger: triggerName = 'Open gallery with zoom',
  } = {},
): Promise<Gallery> {
  await page.route(/\/sample-[a-z]+-\d+x\d+[^/]*\.svg/, async route => {
    const id =
      /\/sample-([a-z]+)-/.exec(route.request().url())?.[1] ?? 'forest';
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
  const trigger = page.getByRole('button', {name: triggerName});
  // A desktop has no touch input: its cases use the mouse alone.
  const driver = mouse
    ? (new Proxy(
        {},
        {
          get: () => {
            throw new Error('no touch on a desktop');
          },
        },
      ) as TouchDriver)
    : await touchDriver(page);
  if (mouse) {
    await trigger.click();
  } else {
    const t = await trigger.boundingBox();
    if (t == null) {
      throw new Error('no trigger');
    }
    await driver.tap({x: t.x + t.width / 2, y: t.y + t.height / 2});
  }
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

/** A slow drag by dx, held still before the lift (no release velocity). */
function slowDrag(from: {x: number; y: number}, dx: number): TouchScript {
  return drag(
    from,
    {x: from.x + dx, y: from.y},
    {durationMs: 600, restMs: 150},
  );
}

/**
 * What an action starts on the track under Reduce Motion. A watch taken
 * before the action catches its animations, since a 200 ms fade can end
 * before the test looks. It returns their longest length, whether any of them
 * moves the track, and the track's place every frame until rest.
 */
async function trackMotion(
  page: Page,
  track: Locator,
  act: () => Promise<unknown>,
) {
  const watch = await watchAnimations(track);
  await act();
  // Installed before anything is awaited further (an awaited evaluate): the
  // landing comes while the track is faded out, after this.
  await track.evaluate(el => {
    const places: number[] = [];
    let running = true;
    const tick = () => {
      const value = getComputedStyle(el).translate;
      places.push(value === 'none' ? 0 : parseFloat(value));
      if (running) {
        requestAnimationFrame(tick);
      }
    };
    tick();
    (
      window as unknown as {__trackPlaces: {places: number[]; stop(): void}}
    ).__trackPlaces = {
      places,
      stop: () => {
        running = false;
      },
    };
  });
  const started = await watch.started();
  await waitForRest(track);
  const xs = await page.evaluate(() => {
    const record = (
      window as unknown as {__trackPlaces: {places: number[]; stop(): void}}
    ).__trackPlaces;
    record.stop();
    return record.places;
  });
  return {
    // Each curve's own length: a held end value is not part of it.
    duration: Math.max(...started.map(a => a.to - a.from)),
    travels: started.some(a =>
      a.keyframes.some(k => 'translate' in k || 'transform' in k),
    ),
    xs,
  };
}

test('under Reduce Motion a swipe pages by a fade of 200 ms or less: the track never slides', async ({
  page,
}) => {
  // Under Reduce Motion, what a touch release starts fades in place; it never
  // moves.
  await page.emulateMedia({reducedMotion: 'reduce'});
  const g = await openGallery(page);
  const mid = {x: g.box.x + g.box.width * 0.8, y: g.box.y + g.box.height / 2};
  const {duration, travels, xs} = await trackMotion(page, g.track, async () => {
    await g.driver.play(slowDrag(mid, -g.box.width * 0.6));
  });
  const page2 = -(g.box.width + GAP);
  expect(duration).toBeLessThanOrEqual(205);
  // The track lands with a style write while it is faded out. No animation
  // moves it, and every frame shows where the finger left it or the next
  // page, nothing between.
  expect(travels).toBe(false);
  for (const x of xs) {
    expect(Math.min(Math.abs(x - xs[0]), Math.abs(x - page2))).toBeLessThan(
      0.5,
    );
  }
  expect(await g.counter()).toBe('2 / 4');
  expect(await g.trackX()).toBeCloseTo(page2, 0);
});

test('under Reduce Motion the Next button pages by a fade on a touch screen, never a slide', async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  const g = await openGallery(page);
  const next = await g.dialog.getByRole('button', {name: 'Next'}).boundingBox();
  if (next == null) {
    throw new Error('no Next');
  }
  const {duration, travels, xs} = await trackMotion(page, g.track, async () => {
    await g.driver.tap({
      x: next.x + next.width / 2,
      y: next.y + next.height / 2,
    });
  });
  const page2 = -(g.box.width + GAP);
  expect(duration).toBeLessThanOrEqual(205);
  expect(travels).toBe(false);
  for (const x of xs) {
    expect(Math.min(Math.abs(x), Math.abs(x - page2))).toBeLessThan(0.5);
  }
  await waitForRest(g.track);
  expect(await g.counter()).toBe('2 / 4');
});

test('under Reduce Motion the Next button pages at once with a mouse', async ({
  browser,
}) => {
  // Under Reduce Motion, any pointer but a coarse one pages at once.
  const context = await browser.newContext({
    viewport: {width: 1280, height: 800},
    hasTouch: false,
    isMobile: false,
    reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    // A fine primary pointer in this context (the interaction config can report
    // a coarse one without touch).
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    const g = await openGallery(page, {mouse: true});
    await g.dialog.getByRole('button', {name: 'Next'}).click();
    await frames(page, 1);
    expect(await g.counter()).toBe('2 / 4');
    expect(
      await g.track.evaluate(
        el => el.getAnimations().filter(a => a.playState === 'running').length,
      ),
    ).toBe(0);
  } finally {
    await context.close();
  }
});

test('with a mouse the Next button shows the next photo at once', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: {width: 1280, height: 800},
    hasTouch: false,
    isMobile: false,
  });
  try {
    const page = await context.newPage();
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    const g = await openGallery(page, {mouse: true});
    await g.dialog.getByRole('button', {name: 'Next'}).click();
    await frames(page, 1);
    expect(await g.counter()).toBe('2 / 4');
    expect(
      await g.track.evaluate(
        el => el.getAnimations().filter(a => a.playState === 'running').length,
      ),
    ).toBe(0);
  } finally {
    await context.close();
  }
});

test('with a mouse a Next the owner refuses never moves the photo', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: {width: 1280, height: 800},
    hasTouch: false,
    isMobile: false,
  });
  try {
    const page = await context.newPage();
    const g = await openGallery(page, {
      mouse: true,
      story: 'core-lightbox--gallery-keeps-index',
      trigger: 'Open gallery that keeps its photo',
    });
    // Reads the track's offset on every frame from the press on, for 40
    // frames or 5 s, whichever comes first.
    await g.track.evaluate(track => {
      const offsets: {t: number; x: number}[] = [];
      (
        window as unknown as {__offsets: Promise<{t: number; x: number}[]>}
      ).__offsets = new Promise(resolve => {
        const start = performance.now();
        setTimeout(() => resolve(offsets), 5_000);
        const tick = (t: number) => {
          const value = getComputedStyle(track).translate;
          offsets.push({t, x: value === 'none' ? 0 : parseFloat(value)});
          if (offsets.length < 40 && t - start < 5_000) {
            requestAnimationFrame(tick);
          } else {
            resolve(offsets);
          }
        };
        requestAnimationFrame(tick);
      });
    });
    await g.dialog.getByRole('button', {name: 'Next'}).click();
    // A page starved of frames reads too few of them to prove the photo
    // stayed: that fails by name.
    const offsets = requireFrames(
      await page.evaluate(
        async () =>
          (
            window as unknown as {
              __offsets: Promise<{t: number; x: number}[]>;
            }
          ).__offsets,
      ),
      {min: 40, during: 'the page read the track after a refused Next'},
    );
    expect(offsets.every(({x}) => Math.abs(x) < 0.5)).toBe(true);
    expect(await g.counter()).toBe('1 / 4');
  } finally {
    await context.close();
  }
});

test('a drag the owner refuses springs back over frames', async ({page}) => {
  const g = await openGallery(page, {
    story: 'core-lightbox--gallery-keeps-index',
    trigger: 'Open gallery that keeps its photo',
  });
  const mid = {x: g.box.x + g.box.width * 0.8, y: g.box.y + g.box.height / 2};
  // Records the positions of every animation the track starts from here on.
  await g.track.evaluate(track => {
    const runs: string[][] = [];
    (window as unknown as {__trackRuns: string[][]}).__trackRuns = runs;
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      const animation = animate.call(this, keyframes, options);
      if (this === track && animation.effect instanceof KeyframeEffect) {
        runs.push(
          animation.effect
            .getKeyframes()
            .map(frame =>
              typeof frame.translate === 'string' ? frame.translate : '',
            ),
        );
      }
      return animation;
    };
  });
  // Past half a page: the release pages, and the owner keeps its photo.
  await g.driver.play(
    drag(
      mid,
      {x: mid.x - g.box.width * 0.6, y: mid.y},
      {durationMs: 400, restMs: 100},
    ),
  );
  await waitForRest(g.track);
  expect(Math.abs(await g.trackX())).toBeLessThan(0.5);
  expect(await g.counter()).toBe('1 / 4');
  // It springs back over frames. The track's last animation brought the
  // photo back, from more than half a page away to rest, through positions
  // in between. They are read from its keyframes, which a loaded runner's
  // slow main thread does not thin out.
  const runs = await page.evaluate(
    () => (window as unknown as {__trackRuns: string[][]}).__trackRuns,
  );
  const xs = (runs.at(-1) ?? []).map(x => parseFloat(x) || 0);
  const detail = JSON.stringify(runs);
  expect(Math.abs(xs[0] ?? 0), detail).toBeGreaterThan(g.box.width / 2);
  expect(Math.abs(xs.at(-1) ?? Number.NaN), detail).toBeLessThan(0.5);
  const between = xs.filter(
    x => Math.abs(x) >= 0.5 && Math.abs(x) <= Math.abs(xs[0] ?? 0) - 0.5,
  );
  expect(between.length, detail).toBeGreaterThanOrEqual(4);
});

test('with a mouse (a fine pointer) a click beside the photo closes the gallery, one on it does not', async ({
  browser,
}) => {
  // A tall viewport leaves stage below the photo: the stage fills the viewer,
  // the photo keeps its 3:2 aspect.
  const context = await browser.newContext({
    viewport: {width: 1280, height: 1400},
    hasTouch: false,
    isMobile: false,
  });
  try {
    const page = await context.newPage();
    // A fine primary pointer in this context (the interaction config can report
    // a coarse one without touch).
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    const g = await openGallery(page, {mouse: true});
    const photo = await g.dialog.locator('[data-current] img').boundingBox();
    if (photo == null) {
      throw new Error('no photo');
    }
    const below = {
      x: photo.x + photo.width / 2,
      y: (photo.y + photo.height + g.box.y + g.box.height) / 2,
    };
    // The point is on the stage beside the photo, not on a control.
    expect(
      await page.evaluate(({x, y}) => {
        const el = document.elementFromPoint(x, y);
        return (
          el != null &&
          el.closest('[data-lightbox-chrome]') == null &&
          el.tagName !== 'IMG'
        );
      }, below),
    ).toBe(true);
    // A click on the photo itself leaves the viewer open.
    await page.mouse.click(
      photo.x + photo.width / 2,
      photo.y + photo.height / 2,
    );
    // A single tap waits out the double tap's 300 ms. Forty frames pass that
    // at up to 120 Hz.
    await frames(page, 40);
    await expect(g.dialog).toBeVisible();
    await page.mouse.click(below.x, below.y);
    await expect(g.dialog).toBeHidden();
  } finally {
    await context.close();
  }
});

for (const [label, hold] of [
  ['moves 60 px before its release', false],
  ['is held 1.6 s before its release', true],
] as const) {
  test(`without zoom, a mouse press beside the photo that ${label} closes the gallery, as on main`, async ({
    browser,
  }) => {
    // A tall viewport leaves stage above the photo. The tap's movement and
    // time limits are a finger's; a mouse's click closes as on the backdrop.
    const context = await browser.newContext({
      viewport: {width: 1280, height: 1400},
      hasTouch: false,
      isMobile: false,
    });
    try {
      const page = await context.newPage();
      expect(
        await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
      ).toBe(false);
      await page.route(/\/sample-[a-z]+-\d+x\d+[^/]*\.svg/, async route =>
        route.fulfill({contentType: 'image/svg+xml', body: photoSvg('#888')}),
      );
      await openStory(page, storybook(), 'core-lightbox--gallery');
      await page.locator('#storybook-root img').first().click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      const img = dialog.locator('[data-current] img');
      await expect
        .poll(async () => (await img.boundingBox())?.width ?? 0)
        .toBeGreaterThan(100);
      const photo = await img.boundingBox();
      if (photo == null) {
        throw new Error('no photo');
      }
      const above = {x: photo.x + photo.width / 2, y: photo.y - 40};
      // The point is on the stage beside the photo, not on a control.
      expect(
        await page.evaluate(({x, y}) => {
          const el = document.elementFromPoint(x, y);
          return (
            el != null &&
            el.closest('dialog') != null &&
            el.closest('[data-lightbox-chrome]') == null &&
            el.closest('[data-lightbox-caption]') == null &&
            el.tagName !== 'IMG'
          );
        }, above),
      ).toBe(true);
      await page.mouse.move(above.x, above.y);
      await page.mouse.down();
      if (hold) {
        await page.waitForTimeout(1600);
      } else {
        await page.mouse.move(above.x + 60, above.y, {steps: 6});
      }
      await page.mouse.up();
      await expect(dialog).toBeHidden();
    } finally {
      await context.close();
    }
  });
}

test('without zoom, a mouse press beside the photo that is released on it closes the gallery, as on main', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: {width: 1280, height: 1400},
    hasTouch: false,
    isMobile: false,
  });
  try {
    const page = await context.newPage();
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    await page.route(/\/sample-[a-z]+-\d+x\d+[^/]*\.svg/, async route =>
      route.fulfill({contentType: 'image/svg+xml', body: photoSvg('#888')}),
    );
    await openStory(page, storybook(), 'core-lightbox--gallery');
    await page.locator('#storybook-root img').first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const img = dialog.locator('[data-current] img');
    await expect
      .poll(async () => (await img.boundingBox())?.width ?? 0)
      .toBeGreaterThan(100);
    const photo = await img.boundingBox();
    if (photo == null) {
      throw new Error('no photo');
    }
    const above = {x: photo.x + photo.width / 2, y: photo.y - 40};
    expect(
      await page.evaluate(({x, y}) => {
        const el = document.elementFromPoint(x, y);
        return (
          el != null &&
          el.closest('dialog') != null &&
          el.closest('[data-lightbox-chrome]') == null &&
          el.closest('[data-lightbox-caption]') == null &&
          el.tagName !== 'IMG'
        );
      }, above),
    ).toBe(true);
    // The press starts on the dark area and ends on the photo.
    await page.mouse.move(above.x, above.y);
    await page.mouse.down();
    await page.mouse.move(above.x, photo.y + photo.height / 2, {steps: 6});
    await page.mouse.up();
    await expect(dialog).toBeHidden();
  } finally {
    await context.close();
  }
});

test('without zoom, a mouse click beside a photo narrower than its caption, level with it, closes the gallery', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: {width: 1280, height: 800},
    hasTouch: false,
    isMobile: false,
  });
  try {
    const page = await context.newPage();
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    // A tall, narrow photo fits narrower than its caption.
    await page.route(/\/sample-[a-z]+-\d+x\d+[^/]*\.svg/, async route =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="1200"><rect width="200" height="1200" fill="#888"/></svg>',
      }),
    );
    await openStory(page, storybook(), 'core-lightbox--gallery');
    await page.locator('#storybook-root img').first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const img = dialog.locator('[data-current] img');
    const caption = dialog.locator('[data-current] [data-lightbox-caption]');
    await expect
      .poll(async () => (await img.boundingBox())?.height ?? 0)
      .toBeGreaterThan(100);
    const photo = await img.boundingBox();
    const text = await caption.boundingBox();
    if (photo == null || text == null) {
      throw new Error('no photo or caption');
    }
    // The caption is wider than the photo, with room beside the photo.
    expect(text.x + text.width).toBeGreaterThan(photo.x + photo.width + 20);
    const beside = {
      x: (photo.x + photo.width + text.x + text.width) / 2,
      y: photo.y + photo.height / 2,
    };
    expect(
      await page.evaluate(({x, y}) => {
        const el = document.elementFromPoint(x, y);
        return (
          el != null &&
          el.closest('dialog') != null &&
          el.closest('[data-lightbox-chrome]') == null &&
          el.closest('[data-lightbox-caption]') == null &&
          el.tagName !== 'IMG'
        );
      }, beside),
    ).toBe(true);
    // The caption's band sits under the photo, so this point is the
    // backdrop's.
    await page.mouse.click(beside.x, beside.y);
    await expect(dialog).toBeHidden();
  } finally {
    await context.close();
  }
});

test('with a mouse a click on the caption row under a photo with none closes the gallery', async ({
  browser,
}) => {
  // Every page has a two-line caption band. Under the third photo, which has
  // no caption, that band is the backdrop.
  const context = await browser.newContext({
    viewport: {width: 1280, height: 1100},
    hasTouch: false,
    isMobile: false,
  });
  try {
    const page = await context.newPage();
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    const g = await openGallery(page, {
      mouse: true,
      story: 'core-lightbox--gallery-with-captions',
      trigger: 'Open gallery with captions',
    });
    for (const counter of ['2 / 4', '3 / 4']) {
      await g.dialog.getByRole('button', {name: 'Next'}).click();
      await expect(g.dialog.getByText(counter)).toBeVisible();
    }
    await expect(g.dialog.locator('[data-current]')).toHaveCount(1);
    await expect
      .poll(async () =>
        g.dialog.locator('[data-current] [data-lightbox-caption]').count(),
      )
      .toBe(0);
    const band = await g.dialog.locator('[data-current]').evaluate(current => {
      const r = current.getBoundingClientRect();
      const media = current
        .querySelector('[data-lightbox-page-media]')
        ?.getBoundingClientRect();
      return {
        x: r.left + r.width / 2,
        y: ((media?.bottom ?? Number.NaN) + r.bottom) / 2,
        rowHeight: r.bottom - (media?.bottom ?? Number.NaN),
      };
    });
    // The band keeps its two lines' height, and the point is in it.
    expect(band.rowHeight).toBeGreaterThan(20);
    expect(
      await page.evaluate(({x, y}) => {
        const el = document.elementFromPoint(x, y);
        return (
          el?.closest('[data-lightbox-page][data-current]') != null &&
          el.closest('[data-lightbox-page-media]') == null
        );
      }, band),
    ).toBe(true);
    await page.mouse.click(band.x, band.y);
    await expect(g.dialog).toBeHidden();
  } finally {
    await context.close();
  }
});
