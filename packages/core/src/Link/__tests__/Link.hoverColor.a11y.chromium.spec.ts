// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Link/|packages/core/src/Text/Text\.tsx|apps/storybook/stories/Link\.stories)

/**
 * @file Link.hoverColor.a11y.chromium.spec.ts
 * @input Built Link stories and a real Chromium mouse hover
 * @output Evidence that a hovered Link paints its label in the same color as
 *   its root, which the underline and the external icon take, that the
 *   resting color does not change, and that an accent link's hover takes a
 *   container's --link-hover-color and otherwise the default mix
 * @position Real-engine proof for component:Link FR7 and FR11; jsdom cannot match
 *   :hover or a (hover: hover) media query
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

async function colors(page: Page) {
  return page
    .locator('#storybook-root a')
    .first()
    .evaluate(anchor => {
      const label = anchor.firstElementChild as HTMLElement;
      const icon = anchor.querySelector('svg');
      return {
        root: getComputedStyle(anchor).color,
        label: getComputedStyle(label).color,
        icon: icon == null ? null : getComputedStyle(icon).color,
      };
    });
}

for (const story of [
  'core-link--default',
  'core-link--primary',
  'core-link--secondary',
  'core-link--external-link',
]) {
  test(`${story}: the hovered label matches the root, and the resting color holds`, async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=${story}&viewMode=story`,
    );
    const anchor = page.locator('#storybook-root a').first();
    await expect(anchor).toBeVisible();
    await page.mouse.move(0, 0);
    const rest = await colors(page);
    expect(rest.label).toBe(rest.root);

    await anchor.hover();
    // Let the root's color transition, if any, settle.
    await page.waitForTimeout(300);
    const hovered = await colors(page);
    expect(hovered.root).not.toBe(rest.root);
    expect(hovered.label).toBe(hovered.root);
    if (hovered.icon != null) {
      expect(hovered.icon).toBe(hovered.root);
    }

    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    expect(await colors(page)).toEqual(rest);
  });
}

/**
 * The hover color an accent link paints with no `--link-hover-color` set:
 * the accent text color mixed 15% with the hover tint, read off a probe in
 * the same root so it resolves the same tokens.
 */
async function defaultAccentHover(page: Page): Promise<string> {
  return page.locator('#storybook-root').evaluate(root => {
    const probe = document.createElement('span');
    probe.style.color =
      'color-mix(in srgb, var(--color-text-accent), var(--color-tint-hover) 15%)';
    root.appendChild(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
}

test('an accent link hovers in the default mix when no hover color is set', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-link--default&viewMode=story`,
  );
  const anchor = page.locator('#storybook-root a').first();
  await expect(anchor).toBeVisible();
  const expected = await defaultAccentHover(page);
  await anchor.hover();
  await page.waitForTimeout(300);
  expect((await colors(page)).root).toBe(expected);
});

for (const [story, takesIt] of [
  ['core-link--default', true],
  ['core-link--primary', false],
] as const) {
  test(`${story}: a container's --link-hover-color ${takesIt ? 'sets' : 'leaves'} its hover color`, async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=${story}&viewMode=story`,
    );
    const anchor = page.locator('#storybook-root a').first();
    await expect(anchor).toBeVisible();
    await page.mouse.move(0, 0);
    const rest = await colors(page);
    await page
      .locator('#storybook-root')
      .evaluate(root =>
        (root as HTMLElement).style.setProperty(
          '--link-hover-color',
          'rgb(1, 2, 3)',
        ),
      );
    // The resting color never reads the hover variable.
    expect(await colors(page)).toEqual(rest);
    await anchor.hover();
    await page.waitForTimeout(300);
    const hovered = (await colors(page)).root;
    if (takesIt) {
      expect(hovered).toBe('rgb(1, 2, 3)');
    } else {
      expect(hovered).not.toBe('rgb(1, 2, 3)');
    }
  });
}
