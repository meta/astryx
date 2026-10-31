// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file animatedLayoutAdopters.interaction.browser.spec.ts
 * @input The built Storybook's `Core/Animated layout` story: a TreeList and a
 *   Collapsible that take the handle `useAnimatedLayout` returns for a
 *   ScrollableArea's ref
 * @output The adopters' browser proofs `spec:AST-105` Verification asks for:
 *   with a handle, through a ScrollableArea ref, opening glides the content
 *   after the component while the revealed content enters, and closing
 *   glides it while the closing content exits, inert, until it hides
 * @position Testing; `component:Collapsible` FR10 and `component:TreeList`
 *   FR9. The module's own proofs are animatedLayout.interaction.browser.spec.ts
 *
 * SYNC: When modified, update the Verification rows in Collapsible.spec.md
 *   and TreeList.spec.md.
 */

import {expect, test, type Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

let storybook: StaticServer | undefined;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

const STORY = 'core-animated-layout--animated-layout';

/** Loads the story and waits for its first render and two frames. */
async function openStory(page: Page): Promise<void> {
  await page.goto(
    `${storybook?.origin ?? ''}/iframe.html?id=${STORY}&viewMode=story`,
  );
  await page
    .locator('#storybook-root > *')
    .first()
    .waitFor({state: 'attached'});
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
}

/** The translate an element's running animation starts from, in px (y). */
async function glideOf(page: Page, selector: string): Promise<number | null> {
  return page.evaluate(sel => {
    const element = document.querySelector(sel);
    for (const animation of element?.getAnimations() ?? []) {
      const frames = (animation.effect as KeyframeEffect).getKeyframes();
      const first = frames[0]?.translate;
      if (typeof first === 'string') {
        const match = /^(-?[\d.e+-]+)px(?:\s+(-?[\d.e+-]+)px)?/.exec(first);
        return match == null ? 0 : Number(match[2] ?? 0);
      }
    }
    return null;
  }, selector);
}

/** Marks the first element whose own text starts with `text`. */
async function mark(page: Page, text: string, id: string): Promise<void> {
  await page.evaluate(
    ({t, i}) => {
      const element = [...document.querySelectorAll('div')].find(el =>
        el.firstChild?.textContent?.trim().startsWith(t),
      );
      element?.setAttribute('data-test-id', i);
    },
    {t: text, i: id},
  );
}

async function viewportScroll(page: Page): Promise<number> {
  return page.evaluate(() => {
    const viewport = [...document.querySelectorAll<HTMLElement>('*')].find(
      el => el.scrollHeight > el.clientHeight + 1 && el.clientHeight > 300,
    );
    return viewport?.scrollTop ?? -1;
  });
}

test.describe('component:Collapsible FR10 and component:TreeList FR9 (spec:AST-105)', () => {
  test('a Collapsible in a ScrollableArea glides the content after it as it opens and closes, and the closing content exits inert until it hides', async ({
    page,
  }) => {
    await openStory(page);
    await mark(page, 'A plain app div', 'after');
    const scrollBefore = await viewportScroll(page);
    const trigger = page.getByRole('button', {name: 'Shipping details'});
    const contentId = await trigger.getAttribute('aria-controls');
    const content = `[id="${contentId}"]`;

    await trigger.click();
    // The content after it glides down from where it was; the content enters.
    expect(await glideOf(page, '[data-test-id="after"]')).toBeLessThan(-20);
    expect(
      await page.evaluate(
        sel => document.querySelector(sel)?.getAnimations().length ?? 0,
        content,
      ),
    ).toBeGreaterThan(0);
    await page.waitForTimeout(1200);

    await trigger.click();
    const closing = await page.evaluate(sel => {
      const element = document.querySelector(sel) as HTMLElement;
      return {
        shown: getComputedStyle(element).display !== 'none',
        inert: element.hasAttribute('inert'),
        exits: element.getAnimations().length,
      };
    }, content);
    expect(closing).toEqual({shown: true, inert: true, exits: 1});
    expect(await glideOf(page, '[data-test-id="after"]')).toBeGreaterThan(20);
    // Once its exit ends it hides, and nothing jumps the area's scroll.
    await expect
      .poll(async () =>
        page.evaluate(
          sel =>
            getComputedStyle(document.querySelector(sel) as HTMLElement)
              .display,
          content,
        ),
      )
      .toBe('none');
    expect(await viewportScroll(page)).toBe(scrollBefore);
  });

  test('a TreeList row glides the rows after it as it expands and collapses, and the collapsing group exits inert until it unmounts', async ({
    page,
  }) => {
    await openStory(page);
    const documents = page.getByRole('treeitem', {name: 'Documents'});
    const notes = '[data-tree-id="notes"]';
    await documents.locator('[data-tree-toggle]').click();
    // Notes.txt glides down while Documents' rows enter.
    expect(await glideOf(page, notes)).toBeLessThan(-20);
    expect(
      await page.evaluate(
        () =>
          document
            .querySelector('[data-tree-id="docs"] > [role="group"]')
            ?.getAnimations().length ?? 0,
      ),
    ).toBeGreaterThan(0);
    await page.waitForTimeout(1200);

    await documents.locator('[data-tree-toggle]').click();
    const closing = await page.evaluate(() => {
      const group = document.querySelector(
        '[data-tree-id="docs"] > [role="group"]',
      );
      return {kept: group != null, inert: group?.hasAttribute('inert')};
    });
    expect(closing).toEqual({kept: true, inert: true});
    expect(await glideOf(page, notes)).toBeGreaterThan(20);
    await expect
      .poll(async () =>
        page.evaluate(
          () =>
            document.querySelector('[data-tree-id="docs"] > [role="group"]') ==
            null,
        ),
      )
      .toBe(true);
  });

  test('collapsing a row with an expanded child moves the rows after it once, with no jump when the exit ends (spec:AST-105 FR3)', async ({
    page,
  }) => {
    await openStory(page);
    const photos = page.getByRole('treeitem', {name: 'Photos'});
    await photos.locator('[data-tree-toggle]').first().click();
    await page.waitForTimeout(1200);
    await page
      .getByRole('treeitem', {name: 'Trips'})
      .locator('[data-tree-toggle]')
      .first()
      .click();
    await page.waitForTimeout(1200);
    const documents = '[data-tree-id="docs"]';
    const openTop = await page.evaluate(
      sel => document.querySelector(sel)?.getBoundingClientRect().top ?? 0,
      documents,
    );
    await photos.locator('[data-tree-toggle]').first().click();
    // It glides from where it was: its offset is the whole distance it moves.
    const offset = await glideOf(page, documents);
    await expect
      .poll(async () =>
        page.evaluate(
          () =>
            document.querySelector(
              '[data-tree-id="photos"] > [role="group"]',
            ) == null,
        ),
      )
      .toBe(true);
    const closedTop = await page.evaluate(
      sel => document.querySelector(sel)?.getBoundingClientRect().top ?? 0,
      documents,
    );
    expect(offset).not.toBeNull();
    expect(Math.abs((offset ?? 0) - (openTop - closedTop))).toBeLessThan(2);
  });
});
