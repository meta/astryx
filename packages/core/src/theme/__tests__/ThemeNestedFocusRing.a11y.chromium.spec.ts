// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/theme/(Theme|tokens)|^packages/core/src/utils/focusOutline|^apps/storybook/stories/ListInput\.stories

/**
 * @file ThemeNestedFocusRing.a11y.chromium.spec.ts
 * @input The ListInput theme matrix story (a light Theme, a dark Theme, and a
 *   light Theme nested in the dark one) in a built Storybook, in Chromium, with
 *   its stylesheets served as built and as a CSS build that lowers
 *   `light-dark()` serves them
 * @output Real-engine proof that the keyboard focus ring in every Theme takes
 *   that Theme's own accent and contrasts with its surface, also where the
 *   build lowers `light-dark()`; that a theme which sets
 *   `--focus-outline-color` still sets the ring; and that a focus color set on
 *   the page root reaches a region with no theme but not a Theme that applies
 *   one
 * @position Run with `pnpm test:a11y-contract`. Which color mode a custom
 *   property resolves in needs a real engine.
 */

import {createRequire} from 'node:module';
import path from 'node:path';
import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

// lightningcss is the CSS transformer Vite uses. Core does not depend on it;
// @astryxdesign/build does, so it resolves from that package.
interface LightningCss {
  transform(options: {
    filename: string;
    code: Uint8Array;
    targets: Record<string, number>;
    errorRecovery: boolean;
  }): {code: Uint8Array};
}
const lightningcss = createRequire(path.resolve('packages/build/package.json'))(
  'lightningcss',
) as LightningCss;

// Browsers older than these get `light-dark()` lowered into custom-property
// toggles, as a Vite or Lightning CSS build with older targets emits.
const LOWERED_TARGETS = {
  chrome: 100 << 16,
  firefox: 100 << 16,
  safari: 15 << 16,
};

function lower(css: string): string {
  return lightningcss
    .transform({
      filename: 'consumer.css',
      code: Buffer.from(css),
      targets: LOWERED_TARGETS,
      errorRecovery: true,
    })
    .code.toString();
}

const THEME_OVERRIDE = 'rgb(1, 2, 3)';

let storybook: StaticServer;
let storyId: string;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
  // The story's id carries its package, which can change; find it by name.
  const index = (await (
    await fetch(`${storybook.origin}/index.json`)
  ).json()) as {entries: Record<string, unknown>};
  const id = Object.keys(index.entries).find(entry =>
    entry.endsWith('listinput--theme-matrix'),
  );
  if (id == null) {
    throw new Error('No ListInput theme matrix story in the build');
  }
  storyId = id;
});
test.afterAll(async () => {
  await storybook?.close();
});

interface Ring {
  /** The pane: the nearest Theme's mode and how many Themes contain it. */
  readonly pane: string;
  readonly outline: string;
  readonly accent: string;
  readonly surface: string;
}

async function openStory(
  page: Page,
  {
    lowered,
    themeOverride,
    outerTheme = 'neutral',
  }: {lowered: boolean; themeOverride: boolean; outerTheme?: string},
): Promise<void> {
  if (lowered) {
    await page.route('**/*.css', async route => {
      const response = await route.fetch();
      await route.fulfill({response, body: lower(await response.text())});
    });
  }
  await page.goto(
    `${storybook.origin}/iframe.html?id=${storyId}&viewMode=story&globals=colorMode:light;astryxTheme:${outerTheme}`,
  );
  await page.locator('[data-theme="dark"] button').first().waitFor();
  if (lowered) {
    // Themes inject their rules at run time; lower those too, as a build
    // lowers a built theme's stylesheet. The page root's scheme comes from a
    // stylesheet, as in an app.
    const styles = await page.evaluate(() =>
      Array.from(document.querySelectorAll('style'), s => s.textContent ?? ''),
    );
    await page.evaluate(
      texts => {
        Array.from(document.querySelectorAll('style')).forEach((s, i) => {
          if (texts[i] != null && texts[i] !== s.textContent) {
            s.textContent = texts[i];
          }
        });
      },
      styles.map(text => (text.includes('light-dark(') ? lower(text) : text)),
    );
    await page.addStyleTag({content: lower(':root { color-scheme: light; }')});
  }
  if (themeOverride) {
    // A theme that sets the focus color, as theme rules declare it.
    const rule = `@layer astryx-theme { @scope ([data-astryx-theme="neutral"]) to ([data-astryx-theme]) { :scope { --focus-outline-color: ${THEME_OVERRIDE}; } } }`;
    await page.addStyleTag({content: lowered ? lower(rule) : rule});
  }
}

/** Tab through the story once and read each focused ring. */
async function rings(page: Page): Promise<Ring[]> {
  const found: Ring[] = [];
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Tab');
    const ring = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (element == null || element === document.body) {
        return null;
      }
      if (element.dataset.ringRead != null) {
        return 'done';
      }
      element.dataset.ringRead = '';
      const style = getComputedStyle(element);
      if (!element.matches(':focus-visible') || style.outlineStyle === 'none') {
        return null;
      }
      const probe = document.createElement('span');
      probe.style.color = 'var(--color-accent)';
      element.append(probe);
      const accent = getComputedStyle(probe).color;
      probe.remove();
      let surface = 'rgb(255, 255, 255)';
      for (let node = element.parentElement; node; node = node.parentElement) {
        const background = getComputedStyle(node).backgroundColor;
        if (background !== 'rgba(0, 0, 0, 0)' && background !== 'transparent') {
          surface = background;
          break;
        }
      }
      let depth = 0;
      for (
        let node: Element | null = element;
        node;
        node = node.parentElement
      ) {
        if (node.hasAttribute('data-astryx-theme')) {
          depth++;
        }
      }
      const mode = element.closest('[data-theme]')?.getAttribute('data-theme');
      return {
        pane: `${mode} at depth ${depth}`,
        outline: style.outlineColor,
        accent,
        surface,
      };
    });
    if (ring === 'done') {
      break;
    }
    if (ring != null) {
      found.push(ring);
    }
  }
  return found;
}

function contrast(a: string, b: string): number {
  const luminance = (color: string) => {
    const [r, g, b] = (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const channel = (value: number) => {
      const c = value / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** One row per pane: its rings' colors, and the lowest contrast among them. */
function byPane(found: Ring[]) {
  const panes = new Map<
    string,
    {outline: Set<string>; accent: Set<string>; contrast: number}
  >();
  for (const ring of found) {
    const pane = panes.get(ring.pane) ?? {
      outline: new Set<string>(),
      accent: new Set<string>(),
      contrast: Infinity,
    };
    pane.outline.add(ring.outline);
    pane.accent.add(ring.accent);
    pane.contrast = Math.min(
      pane.contrast,
      contrast(ring.outline, ring.surface),
    );
    panes.set(ring.pane, pane);
  }
  return Object.fromEntries(
    Array.from(panes, ([pane, row]) => [
      pane,
      {
        outline: [...row.outline],
        accent: [...row.accent],
        contrast: Number(row.contrast.toFixed(2)),
      },
    ]),
  );
}

const PANES = ['light at depth 3', 'dark at depth 3', 'light at depth 4'];

for (const lowered of [false, true]) {
  const build = lowered
    ? 'a build that lowers light-dark()'
    : 'the build as shipped';

  test(`in ${build}, each Theme's ring takes its own accent and contrasts with its surface`, async ({
    page,
  }) => {
    await openStory(page, {lowered, themeOverride: false});
    const panes = byPane(await rings(page));
    expect(Object.keys(panes).sort()).toEqual([...PANES].sort());
    for (const pane of PANES) {
      const row = panes[pane];
      expect(row.outline, pane).toEqual(row.accent);
      expect(row.contrast, pane).toBeGreaterThanOrEqual(3);
    }
  });

  test(`in ${build}, a theme that sets the focus color still sets every ring`, async ({
    page,
  }) => {
    await openStory(page, {lowered, themeOverride: true});
    const panes = byPane(await rings(page));
    expect(Object.keys(panes).sort()).toEqual([...PANES].sort());
    for (const pane of PANES) {
      expect(panes[pane].outline, pane).toEqual([THEME_OVERRIDE]);
    }
  });
}

test('a focus color set on the page root reaches a region with no theme, not a themed Theme', async ({
  page,
}) => {
  const ringColor = async (theme: string) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=a11y-chatsendbutton-audit--chat-send-small&viewMode=story&globals=colorMode:light;astryxTheme:${theme}`,
    );
    await page.getByRole('button', {name: 'Send'}).waitFor();
    await page.evaluate(() => {
      document.documentElement.style.setProperty(
        '--focus-outline-color',
        'rgb(4, 5, 6)',
      );
    });
    const found = await rings(page);
    expect(found.length).toBeGreaterThan(0);
    return [...new Set(found.map(ring => ring.outline))];
  };
  expect(await ringColor('none')).toEqual(['rgb(4, 5, 6)']);
  const themed = await ringColor('neutral');
  expect(themed).not.toContain('rgb(4, 5, 6)');
});

test('a Theme nested in a Theme of another theme draws its ring in its own accent', async ({
  page,
}) => {
  // The page root applies butter; the story's panes apply neutral.
  await openStory(page, {
    lowered: false,
    themeOverride: false,
    outerTheme: 'butter',
  });
  const panes = byPane(await rings(page));
  expect(Object.keys(panes).sort()).toEqual([...PANES].sort());
  for (const pane of PANES) {
    const row = panes[pane];
    expect(row.outline, pane).toEqual(row.accent);
    expect(row.contrast, pane).toBeGreaterThanOrEqual(3);
  }
});
