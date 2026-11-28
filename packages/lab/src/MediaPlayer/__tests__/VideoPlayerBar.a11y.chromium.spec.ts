// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file VideoPlayerBar.a11y.chromium.spec.ts
 * @input The built Lab/MediaPlayer stories in real Chromium: a 240px video
 *   player, a 720px one, an audio player, and a video with comment markers
 * @output Measured proof of the video control bar's inset, height, button
 *   size, and hide distance in a compact and a wide player, of the size a
 *   tooltip from the compact bar keeps, of the timeline's track color on the
 *   bar and in the audio player, that the bar stays dark under its icons on
 *   a palette of plain values, and that the bar stays drawn before playback
 *   while a marker popover opened from the keyboard is open
 * @position Run with `pnpm test:a11y-contract`. jsdom lays out nothing and
 *   matches no container query, so only a browser can measure the bar.
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
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

const PLAYER = '#storybook-root [role="group"]';
const BAR = '#storybook-root [data-visible]';

/**
 * Opens a Lab/MediaPlayer story. The remote sample media stays pending. Thus
 * no media error replaces the state before playback, and the bar stays hidden
 * until keyboard focus enters it.
 */
async function open(page: Page, story: string): Promise<void> {
  await page.route('https://interactive-examples.mdn.mozilla.net/**', () => {});
  await page.setViewportSize({width: 900, height: 700});
  await page.goto(
    `${storybook.origin}/iframe.html?id=lab-mediaplayer--${story}&viewMode=story`,
    {waitUntil: 'domcontentloaded'},
  );
  await expect(page.locator(PLAYER)).toBeVisible();
}

interface BarGeometry {
  playerWidth: number;
  insetStart: number;
  insetEnd: number;
  insetBottom: number;
  height: number;
  buttons: {name: string; width: number; height: number}[];
  hiddenTranslate: string;
}

function readBar(page: Page): Promise<BarGeometry> {
  return page.locator(BAR).evaluate(bar => {
    const element = bar as HTMLElement;
    const player = element.closest('[role="group"]') as HTMLElement;
    // Layout offsets ignore the translate that hides the bar.
    return {
      playerWidth: player.clientWidth,
      insetStart: element.offsetLeft,
      insetEnd: player.clientWidth - element.offsetLeft - element.offsetWidth,
      insetBottom:
        player.clientHeight - element.offsetTop - element.offsetHeight,
      height: element.offsetHeight,
      buttons: Array.from(
        element.querySelectorAll<HTMLElement>('.astryx-button'),
      )
        .filter(button => button.getClientRects().length > 0)
        .map(button => ({
          name: button.getAttribute('aria-label') ?? '',
          width: button.offsetWidth,
          height: button.offsetHeight,
        })),
      hiddenTranslate: getComputedStyle(element).translate,
    };
  });
}

/**
 * The painted color of the empty track of the first timeline in `scope`, and
 * the color that `expected` computes to at the same element.
 */
function readTrack(
  page: Page,
  scope: string,
  expected: string,
): Promise<{painted: string; expected: string}> {
  return page.locator(scope).evaluate((root, expectedColor) => {
    const timeline = root.querySelector('[role="slider"]')?.closest('[dir]');
    const layer = timeline?.querySelector(':scope > [aria-hidden="true"]');
    // A track segment holds its buffered and played ranges.
    const segment = Array.from(layer?.children ?? []).find(
      child => child.children.length === 2,
    );
    if (segment == null) {
      throw new Error('the timeline drew no track segment');
    }
    const probe = document.createElement('span');
    probe.style.backgroundColor = expectedColor;
    segment.append(probe);
    const resolved = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return {
      painted: getComputedStyle(segment).backgroundColor,
      expected: resolved,
    };
  }, expected);
}

test('a player 360px wide or narrower gets a compact bar: 4px inset, 32px bar, 28px buttons', async ({
  page,
}) => {
  await open(page, 'small-player');
  const bar = await readBar(page);
  expect(bar.playerWidth).toBeLessThanOrEqual(360);
  expect(bar.insetStart).toBe(4);
  expect(bar.insetEnd).toBe(4);
  expect(bar.insetBottom).toBe(4);
  expect(bar.height).toBe(32);
  expect(bar.buttons.map(button => button.name)).toEqual([
    'Play',
    'Captions',
    'Full screen',
  ]);
  for (const button of bar.buttons) {
    expect(button, button.name).toMatchObject({width: 28, height: 28});
  }
  // Before playback the bar waits one inset below its place.
  expect(bar.hiddenTranslate).toBe('0px 4px');
});

test('a wider player keeps the 8px inset, the 40px bar, and 32px buttons', async ({
  page,
}) => {
  await open(page, 'video');
  const bar = await readBar(page);
  expect(bar.playerWidth).toBeGreaterThan(360);
  expect(bar.insetStart).toBe(8);
  expect(bar.insetEnd).toBe(8);
  expect(bar.insetBottom).toBe(8);
  expect(bar.height).toBe(40);
  expect(bar.buttons.map(button => button.name)).toEqual([
    'Play',
    'Mute',
    'Full screen',
  ]);
  for (const button of bar.buttons) {
    expect(button, button.name).toMatchObject({width: 32, height: 32});
  }
  expect(bar.hiddenTranslate).toBe('0px 8px');
});

test('a tooltip from the compact bar keeps the size of the page around the player', async ({
  page,
}) => {
  await open(page, 'small-player');
  await page.keyboard.press('Tab');
  await expect(page.locator(PLAYER)).toBeFocused();
  await page.keyboard.press('Tab');
  const play = page.locator(BAR).getByRole('button', {name: 'Play'});
  await expect(play).toBeFocused();
  const tooltip = page.locator(`${BAR} :popover-open`);
  await expect(tooltip).toHaveText('Play');
  const sizes = await play.evaluate(button => {
    const read = (element: Element, name: string) =>
      getComputedStyle(element).getPropertyValue(name).trim();
    const barElement = button.closest('[data-visible]');
    const layer = barElement?.querySelector(':popover-open');
    if (barElement == null || layer == null) {
      throw new Error('the tooltip did not open inside the control bar');
    }
    return {
      button: read(button, '--size-element-md'),
      small: read(barElement, '--size-element-sm'),
      bar: read(barElement, '--size-element-md'),
      tooltip: read(layer, '--size-element-md'),
    };
  });
  expect(sizes.button).toBe(sizes.small);
  expect(sizes.tooltip).toBe(sizes.bar);
  expect(sizes.tooltip).not.toBe(sizes.small);
});

for (const story of ['small-player', 'video']) {
  test(`the empty track on the video bar is the bar's accent at 45 percent (${story})`, async ({
    page,
  }) => {
    await open(page, story);
    const track = await readTrack(
      page,
      BAR,
      'color-mix(in srgb, var(--color-accent) 45%, transparent)',
    );
    expect(track.painted).toBe(track.expected);
    expect(track.painted).toMatch(/\/ 0\.45\)$/);
  });
}

test("the audio player's empty track keeps the theme's track color", async ({
  page,
}) => {
  await open(page, 'audio');
  const track = await readTrack(page, PLAYER, 'var(--color-track)');
  expect(track.painted).toBe(track.expected);
});

test('before playback, the bar stays drawn while a marker popover opened from the keyboard is open', async ({
  page,
}) => {
  await open(page, 'comment-markers');
  // The sample media stays pending, so give the element a duration: the
  // timeline draws its marker buttons once the media can seek.
  await page.locator('#storybook-root video').evaluate(video => {
    Object.defineProperty(video, 'duration', {configurable: true, value: 60});
    video.dispatchEvent(new Event('durationchange'));
  });
  const marker = page.locator('#storybook-root [data-media-marker]').first();
  await expect(marker).toBeAttached();
  // Keyboard focus inside the bar shows it before playback.
  await page.keyboard.press('Tab');
  await marker.focus();
  await expect(page.locator(BAR)).toHaveCSS('opacity', '1');
  await page.keyboard.press('Enter');
  await expect(marker).toHaveAttribute('aria-expanded', 'true');
  const content = page.locator('[data-media-marker-content]').first();
  await expect(content).toBeVisible();
  // Focus moves into the popover, which the browser draws in its top layer.
  await content.locator('button, input, textarea, [tabindex]').first().focus();
  await page.waitForTimeout(400);
  await expect(page.locator(BAR)).toHaveCSS('opacity', '1');
});

test("before playback, the bar stays drawn when a click on a second marker opens its thread over the first one's", async ({
  page,
}) => {
  await open(page, 'comment-markers');
  await page.locator('#storybook-root video').evaluate(video => {
    Object.defineProperty(video, 'duration', {configurable: true, value: 60});
    video.dispatchEvent(new Event('durationchange'));
  });
  const markers = page.locator('#storybook-root [data-media-marker]');
  await expect(markers.nth(1)).toBeAttached();
  await page.keyboard.press('Tab');
  await markers.nth(0).focus();
  await page.keyboard.press('Enter');
  await expect(markers.nth(0)).toHaveAttribute('aria-expanded', 'true');
  await markers.nth(1).click();
  await expect(markers.nth(1)).toHaveAttribute('aria-expanded', 'true');
  await expect(markers.nth(0)).toHaveAttribute('aria-expanded', 'false');
  await page.waitForTimeout(400);
  await expect(page.locator(BAR)).toHaveCSS('opacity', '1');
});

/**
 * A host can write its palette as plain values, not as light-dark pairs.
 * The dark color scheme of the media context then changes none of them.
 */
const PLAIN_LIGHT_PALETTE: Record<string, string> = {
  '--color-background-surface': '#ffffff',
  '--color-background-popover': '#ffffff',
  '--color-text-primary': '#1c1e21',
  '--color-icon-primary': '#1c1e21',
};

type Rgba = [number, number, number, number];

function parseColor(css: string): Rgba {
  const srgb = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/.exec(
    css,
  );
  if (srgb != null) {
    return [
      Number(srgb[1]) * 255,
      Number(srgb[2]) * 255,
      Number(srgb[3]) * 255,
      srgb[4] == null ? 1 : Number(srgb[4]),
    ];
  }
  const rgb =
    /rgba?\(([\d.]+),? ([\d.]+),? ([\d.]+)(?:,? \/? ?([\d.]+))?\)/.exec(css);
  if (rgb == null) {
    throw new Error(`unreadable color ${css}`);
  }
  return [
    Number(rgb[1]),
    Number(rgb[2]),
    Number(rgb[3]),
    rgb[4] == null ? 1 : Number(rgb[4]),
  ];
}

/** The color over a white picture, which is the worst case for light icons. */
function overWhite([r, g, b, a]: Rgba): Rgba {
  return [
    r * a + 255 * (1 - a),
    g * a + 255 * (1 - a),
    b * a + 255 * (1 - a),
    1,
  ];
}

function luminance([r, g, b]: Rgba): number {
  const channel = (value: number) => {
    const s = value / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgba, b: Rgba): number {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

for (const story of ['small-player', 'video']) {
  test(`on a palette of plain light values, the bar stays dark under its on-media icons (${story})`, async ({
    page,
  }) => {
    await open(page, story);
    const paint = await page.locator(PLAYER).evaluate((player, palette) => {
      for (const [name, value] of Object.entries(palette)) {
        (player as HTMLElement).style.setProperty(name, value);
      }
      const bar = player.querySelector('[data-visible]') as HTMLElement;
      const button = bar.querySelector('.astryx-button') as HTMLElement;
      return {
        bar: getComputedStyle(bar).backgroundColor,
        icon: getComputedStyle(button).color,
      };
    }, PLAIN_LIGHT_PALETTE);
    expect(
      contrast(parseColor(paint.icon), overWhite(parseColor(paint.bar))),
    ).toBeGreaterThanOrEqual(4.5);
  });
}

test('the empty track on the video bar keeps 3:1 against the bar over a white or a black picture', async ({
  page,
}) => {
  await open(page, 'video');
  const paint = await page.locator(BAR).evaluate(bar => {
    const timeline = bar.querySelector('[role="slider"]')?.closest('[dir]');
    const layer = timeline?.querySelector(':scope > [aria-hidden="true"]');
    const segment = Array.from(layer?.children ?? []).find(
      child => child.children.length === 2,
    );
    if (segment == null) {
      throw new Error('the timeline drew no track segment');
    }
    return {
      bar: getComputedStyle(bar).backgroundColor,
      track: getComputedStyle(segment).backgroundColor,
    };
  });
  const frost = parseColor(paint.bar);
  const track = parseColor(paint.track);
  for (const picture of [
    [255, 255, 255, 1],
    [0, 0, 0, 1],
  ] as Rgba[]) {
    const ground = over(frost, picture);
    expect(contrast(over(track, ground), ground)).toBeGreaterThanOrEqual(3);
  }
});

function over([r, g, b, a]: Rgba, [ur, ug, ub]: Rgba): Rgba {
  return [r * a + ur * (1 - a), g * a + ug * (1 - a), b * a + ub * (1 - a), 1];
}
