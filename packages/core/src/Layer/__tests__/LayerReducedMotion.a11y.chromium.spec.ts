// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y always

/**
 * @file LayerReducedMotion.a11y.chromium.spec.ts
 * @input The Tooltip and HoverCard Touch Triggers stories in a built
 *   Storybook, Chromium with Reduce Motion emulated, under a finger (phone
 *   profile, coarse pointer) and under a mouse (desktop profile)
 * @output Real-engine proof of the layer entrance under Reduce Motion: under
 *   a finger the tooltip and the hover card fade in with no travel and no
 *   scale, in 200 ms or less (design:reduced-motion DR2); under a mouse they
 *   still appear at once (DR3); without Reduce Motion the entrance is
 *   unchanged
 * @position Run with `pnpm test:a11y-contract`. Media queries only resolve
 *   in a real engine; the entrance itself is layerAnimations.stylex.ts.
 *   Reduce Motion is emulated per page (`page.emulateMedia`): the project's
 *   `use.reducedMotion` does not reach `matchMedia` (playwright.config.ts)
 */

import {expect, test, type Page} from '@playwright/test';
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

const phone = {
  hasTouch: true,
  isMobile: true,
  viewport: {width: 390, height: 844},
} as const;

const cases = [
  {
    name: 'Tooltip',
    story: 'core-tooltip--touch-triggers',
    trigger: 'hover-able term',
    layer: '.astryx-tooltip',
  },
  {
    name: 'HoverCard',
    story: 'core-hovercard--touch-triggers',
    trigger: 'Jane Doe',
    layer: '.astryx-hover-card',
  },
];

/**
 * The open layer's entrance: its animation name and the properties its
 * keyframes animate (read from the page's style sheets).
 */
async function entranceOf(page: Page, selector: string) {
  await expect(page.locator(`${selector}:popover-open`)).toHaveCount(1);
  return page.evaluate(sel => {
    const layer = document.querySelector<HTMLElement>(`${sel}:popover-open`);
    if (layer == null) {
      return {name: 'missing', properties: [], duration: NaN};
    }
    const computed = getComputedStyle(layer);
    const name = computed.animationName;
    // Seconds; the first animation's duration.
    const duration = parseFloat(computed.animationDuration.split(',')[0]);
    const properties = new Set<string>();
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      const visit = (list: CSSRuleList) => {
        for (const rule of Array.from(list)) {
          if (rule instanceof CSSKeyframesRule && rule.name === name) {
            for (const frame of Array.from(rule.cssRules)) {
              const style = (frame as CSSKeyframeRule).style;
              for (let i = 0; i < style.length; i += 1) {
                properties.add(style.item(i));
              }
            }
          } else if ('cssRules' in rule) {
            visit((rule as CSSGroupingRule).cssRules);
          }
        }
      };
      visit(rules);
    }
    return {name, properties: Array.from(properties).sort(), duration};
  }, selector);
}

async function tapOpen(page: Page, text: string) {
  const box = await page.getByText(text, {exact: true}).boundingBox();
  if (box == null) {
    throw new Error(`no trigger reading ${text}`);
  }
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

for (const {name, story, trigger, layer} of cases) {
  test.describe(`${name} under a finger with Reduce Motion`, () => {
    test.use(phone);

    test('fades in, with no travel and no scale, in 200 ms or less', async ({
      page,
    }) => {
      await page.emulateMedia({reducedMotion: 'reduce'});
      await page.goto(
        `${storybook.origin}/iframe.html?id=${story}&viewMode=story`,
      );
      await tapOpen(page, trigger);
      const entrance = await entranceOf(page, layer);
      expect(entrance.name).not.toBe('none');
      expect(entrance.properties).toEqual(['opacity']);
      // design:reduced-motion DR2: a cross-fade of 200 ms or less.
      expect(entrance.duration).toBeGreaterThan(0);
      expect(entrance.duration).toBeLessThanOrEqual(0.2);
    });
  });

  test.describe(`${name} under a finger with Reduce Motion and a slow theme`, () => {
    test.use(phone);

    test('still cross-fades in 200 ms or less', async ({page}) => {
      await page.emulateMedia({reducedMotion: 'reduce'});
      await page.goto(
        `${storybook.origin}/iframe.html?id=${story}&viewMode=story`,
      );
      // A theme whose fast duration is longer than the cap (DR2, DR4: no
      // theme value keeps a longer fade under Reduce Motion).
      await page.addStyleTag({
        content: ':root, [popover] { --duration-fast-max: 400ms !important; }',
      });
      await tapOpen(page, trigger);
      const entrance = await entranceOf(page, layer);
      expect(entrance.properties).toEqual(['opacity']);
      expect(entrance.duration).toBeGreaterThan(0);
      expect(entrance.duration).toBeLessThanOrEqual(0.2);
    });
  });

  test.describe(`${name} under a finger without Reduce Motion`, () => {
    test.use(phone);

    test('keeps its entrance', async ({page}) => {
      await page.emulateMedia({reducedMotion: 'no-preference'});
      await page.goto(
        `${storybook.origin}/iframe.html?id=${story}&viewMode=story`,
      );
      await tapOpen(page, trigger);
      const entrance = await entranceOf(page, layer);
      expect(entrance.properties).toEqual(['opacity', 'transform']);
    });
  });

  test.describe(`${name} under a mouse with Reduce Motion`, () => {
    test('still appears at once', async ({page}) => {
      await page.emulateMedia({reducedMotion: 'reduce'});
      await page.goto(
        `${storybook.origin}/iframe.html?id=${story}&viewMode=story`,
      );
      await page.getByText(trigger, {exact: true}).hover();
      const entrance = await entranceOf(page, layer);
      expect(entrance.name).toBe('none');
    });
  });
}
