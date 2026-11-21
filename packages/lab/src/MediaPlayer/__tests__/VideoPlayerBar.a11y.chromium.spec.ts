// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file VideoPlayerBar.a11y.chromium.spec.ts
 * @input The built Lab/MediaPlayer stories in real Chromium: a 240px video
 *   player, a 720px one, and an audio player
 * @output Measured proof of the video control bar's inset, height, button
 *   size, and hide distance in a compact and a wide player, of the size a
 *   tooltip from the compact bar keeps, and of the timeline's track color on
 *   the bar and in the audio player
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
  test(`the empty track on the video bar is the bar's accent at 24 percent (${story})`, async ({
    page,
  }) => {
    await open(page, story);
    const track = await readTrack(
      page,
      BAR,
      'color-mix(in srgb, var(--color-accent) 24%, transparent)',
    );
    expect(track.painted).toBe(track.expected);
    expect(track.painted).toMatch(/\/ 0\.24\)$/);
  });
}

test("the audio player's empty track keeps the theme's track color", async ({
  page,
}) => {
  await open(page, 'audio');
  const track = await readTrack(page, PLAYER, 'var(--color-track)');
  expect(track.painted).toBe(track.expected);
});
