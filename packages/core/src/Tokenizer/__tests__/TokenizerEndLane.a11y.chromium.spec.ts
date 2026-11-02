// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file TokenizerEndLane.a11y.chromium.spec.ts
 * @input `Core/Tokenizer` and `Core/PowerSearch` stories in a built Storybook.
 * @output Real-engine proof that tokens, the overflow count and the input's
 *   text box never paint under the end lane (clear-all and busy indicator),
 *   across field widths, both writing directions and both overflow modes.
 * @position Run with `pnpm test:a11y-contract`. The lane is absolutely
 *   positioned, so whether a token reaches it depends on how rows wrap at a
 *   given width, which only a shipping layout engine can show.
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

type Direction = 'ltr' | 'rtl';

async function open(
  page: Page,
  id: string,
  direction: Direction,
  args = '',
): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${id}&viewMode=story&globals=direction:${direction}${args ? `&args=${args}` : ''}`,
    {waitUntil: 'load'},
  );
  await page
    .locator('button[aria-label="Clear all"]')
    .first()
    .waitFor({state: 'attached'});
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

/**
 * Sizes the story to `width` (a pixel width, or `max-content` for a
 * content-sized field) and waits for the layout to settle.
 *
 * The sizing box is the story decorator's: the outermost element in the story
 * whose own inline style sizes it, by a width or by a grid column, and that
 * holds the fields. An inline size inside a field never counts: the end
 * lane's reserved Spinner sets its own width inline, and resizing it instead
 * of the story would widen the lane across the token rows. A grid decorator
 * sizes its fields through its column, so the column follows the width. The
 * layer mode's popover takes its width from the in-flow field inside the box.
 */
async function sizeStory(page: Page, width: string): Promise<void> {
  const box = await page
    .locator(
      '#storybook-root [style*="width"], #storybook-root [style*="grid-template-columns"]',
    )
    .filter({has: page.locator('.astryx-tokenizer')})
    .first()
    .elementHandle({timeout: 5_000});
  if (box == null) {
    throw new Error('No sizing container in the story');
  }
  await box.evaluate(async (host, width) => {
    host.style.width = width;
    if (host.style.gridTemplateColumns !== '') {
      host.style.gridTemplateColumns =
        width === 'max-content' ? 'max-content' : `minmax(0, ${width})`;
    }
    for (let frame = 0; frame < 4; frame++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    // The fields sit inside the box, so a pixel width bounds every one of
    // them; no field inside, or one wider than the box, means the box sized
    // something else.
    const fields = host.querySelectorAll('.astryx-tokenizer');
    if (fields.length === 0) {
      throw new Error('The sizing box holds no field');
    }
    if (width !== 'max-content') {
      for (const field of fields) {
        const fieldWidth = field.getBoundingClientRect().width;
        if (fieldWidth > parseFloat(width) + 0.5) {
          throw new Error(
            `Sized the story to ${width}, but a field is ${fieldWidth}px wide`,
          );
        }
      }
    }
  }, width);
}

/**
 * Sizes the story to `width` and, for every field with a visible clear-all
 * lane, returns each visible box that intersects the lane: tokens, the "+N
 * more" count, and the input's content box (where its text and caret paint).
 */
async function overlapsAt(page: Page, width: number): Promise<string[]> {
  await sizeStory(page, `${width}px`);
  return page.evaluate(width => {
    const isShown = (el: Element) =>
      el.checkVisibility({visibilityProperty: true}) &&
      !el.closest('[aria-hidden="true"]');
    const lanes = [
      ...document.querySelectorAll('button[aria-label="Clear all"]'),
    ]
      .filter(isShown)
      .map(clear => clear.parentElement)
      .filter(lane => lane?.parentElement != null) as HTMLElement[];
    if (lanes.length === 0) {
      throw new Error('No clear-all lane is visible');
    }

    return lanes.flatMap((lane, fieldIndex) => {
      const field = lane.parentElement as HTMLElement;
      const boxes: {name: string; rect: DOMRect}[] = [];
      field.querySelectorAll('.astryx-token').forEach((token, index) => {
        if (isShown(token)) {
          boxes.push({
            name: `token ${index}`,
            rect: token.getBoundingClientRect(),
          });
        }
      });
      field.querySelectorAll('span').forEach(span => {
        if (/^\+\d+ more$/.test(span.textContent ?? '') && isShown(span)) {
          boxes.push({
            name: 'overflow count',
            rect: span.getBoundingClientRect(),
          });
        }
      });
      const input = field.querySelector<HTMLInputElement>('[role="combobox"]');
      if (input && isShown(input) && getComputedStyle(input).opacity !== '0') {
        const style = getComputedStyle(input);
        const rect = input.getBoundingClientRect();
        const left = rect.left + parseFloat(style.paddingLeft);
        const right = rect.right - parseFloat(style.paddingRight);
        if (right > left) {
          boxes.push({
            name: 'input text box',
            rect: new DOMRect(left, rect.top, right - left, rect.height),
          });
        }
      }

      const laneRect = lane.getBoundingClientRect();
      return boxes.flatMap(({name, rect}) => {
        const x =
          Math.min(rect.right, laneRect.right) -
          Math.max(rect.left, laneRect.left);
        const y =
          Math.min(rect.bottom, laneRect.bottom) -
          Math.max(rect.top, laneRect.top);
        return x > 0.5 && y > 0.5
          ? [
              `${width}px field ${fieldIndex}: ${name} overlaps the end lane by ${x.toFixed(1)}px`,
            ]
          : [];
      });
    });
  }, width);
}

async function sweep(page: Page, from: number, to: number): Promise<string[]> {
  const found: string[] = [];
  for (let width = from; width <= to; width += 4) {
    found.push(...(await overlapsAt(page, width)));
  }
  return found;
}

/**
 * The same sweep with a search in flight at every width. The busy Spinner joins
 * the lane only while a search runs, so each width is measured while the
 * combobox reports `aria-busy`, typing again whenever the last search settled.
 */
async function sweepWhileBusy(
  page: Page,
  from: number,
  to: number,
): Promise<string[]> {
  const search = page.getByRole('combobox');
  const found: string[] = [];
  for (let width = from; width <= to; width += 4) {
    for (;;) {
      if ((await search.getAttribute('aria-busy')) !== 'true') {
        await search.press('a');
        await expect(search).toHaveAttribute('aria-busy', 'true');
      }
      const overlaps = await overlapsAt(page, width);
      if ((await search.getAttribute('aria-busy')) === 'true') {
        found.push(...overlaps);
        break;
      }
    }
  }
  return found;
}

/**
 * Sizes the story (a pixel width, or `max-content` for a content-sized field)
 * and returns the field's border box.
 */
async function fieldBoxAt(
  page: Page,
  width: string,
): Promise<{width: number; height: number}> {
  await sizeStory(page, width);
  return page.evaluate(() => {
    const field = document.querySelector('button[aria-label="Clear all"]')
      ?.parentElement?.parentElement;
    if (!field) {
      throw new Error('Field did not render');
    }
    const {width: w, height: h} = field.getBoundingClientRect();
    return {
      width: Math.round(w * 100) / 100,
      height: Math.round(h * 100) / 100,
    };
  });
}

/** Adds tokens through the menu, as a person would. */
async function addTokens(page: Page, names: string[]): Promise<void> {
  const search = page.getByRole('combobox');
  for (const name of names) {
    await search.fill(name.split(' ')[0]);
    await page.getByRole('option', {name}).click();
    await expect(search).not.toHaveAttribute('aria-busy', 'true');
  }
}

/**
 * The field's box with a search settled and again with one in flight. The
 * query is non-empty both times, so only the busy state differs.
 */
async function settledAndBusy(
  page: Page,
  width: string,
): Promise<string | null> {
  const search = page.getByRole('combobox');
  await search.fill('a');
  await expect(search).not.toHaveAttribute('aria-busy', 'true');
  const settled = await fieldBoxAt(page, width);
  await search.press('b');
  await expect(search).toHaveAttribute('aria-busy', 'true');
  const busy = await fieldBoxAt(page, width);
  const stillBusy = (await search.getAttribute('aria-busy')) === 'true';
  if (!stillBusy) {
    throw new Error(`The search settled before ${width} was measured`);
  }
  return settled.width === busy.width && settled.height === busy.height
    ? null
    : `${width}: settled ${settled.width}x${settled.height}, busy ${busy.width}x${busy.height}`;
}

/**
 * With four tokens on the Loading story, every width from 200px to 400px and a
 * content-sized container where the field's box differs settled vs busy.
 */
async function busyLayoutChanges(page: Page, step: number): Promise<string[]> {
  await addTokens(page, ['Bob Smith', 'Charlie Brown', 'Diana Prince']);
  await expect(page.locator('.astryx-token')).toHaveCount(4);
  const changed: string[] = [];
  for (let width = 200; width <= 400; width += step) {
    const change = await settledAndBusy(page, `${width}px`);
    if (change) {
      changed.push(change);
    }
  }
  // Content-sized: the field may not widen while busy (input-fields FR1).
  const contentSized = await settledAndBusy(page, 'max-content');
  if (contentSized) {
    changed.push(contentSized);
  }
  return changed;
}

/**
 * The blurred, collapsed field at `width`: its border box, how many tokens
 * show, and the "+N more" count.
 */
async function collapsedRowAt(page: Page, width: string): Promise<string> {
  const box = await fieldBoxAt(page, width);
  const row = await page.evaluate(() => {
    const field = document.querySelector('button[aria-label="Clear all"]')
      ?.parentElement?.parentElement;
    if (!field) {
      throw new Error('Field did not render');
    }
    const shown = [...field.querySelectorAll('.astryx-token')].filter(
      token =>
        token.checkVisibility({visibilityProperty: true}) &&
        !token.closest('[aria-hidden="true"]'),
    ).length;
    const count = [...field.querySelectorAll('span')].find(span =>
      /^\+\d+ more$/.test(span.textContent ?? ''),
    );
    return `${shown} tokens, ${count?.textContent ?? 'no count'}`;
  });
  return `${box.width}x${box.height}, ${row}`;
}

for (const direction of ['ltr', 'rtl'] as const) {
  test.describe(direction, () => {
    test('PowerSearch tokens (custom renderToken) wrap before the end lane', async ({
      page,
    }) => {
      await open(page, 'core-powersearch--near-full-token-row', direction);
      expect(await sweep(page, 160, 640)).toEqual([]);
    });

    test('a token wider than the row truncates short of the end lane', async ({
      page,
    }) => {
      await open(page, 'core-tokenizer--long-token-end-lane', direction);
      expect(await sweep(page, 160, 400)).toEqual([]);
    });

    test('default Tokenizer tokens wrap before the end lane', async ({
      page,
    }) => {
      await open(
        page,
        'core-tokenizer--with-preselected',
        direction,
        'hasClear:!true',
      );
      expect(await sweep(page, 160, 400)).toEqual([]);
    });

    test('tokens stay clear of the lane while a search is busy', async ({
      page,
    }) => {
      await open(page, 'core-tokenizer--loading', direction);
      await page.getByRole('combobox').focus();
      expect(await sweepWhileBusy(page, 200, 400)).toEqual([]);
    });

    test('a search starting does not move the field or its token rows', async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await open(page, 'core-tokenizer--loading', direction);
      expect(await busyLayoutChanges(page, 4)).toEqual([]);
    });

    test('the reserved Spinner costs no frames and stays silent while idle', async ({
      page,
    }) => {
      await open(page, 'core-tokenizer--loading', direction);
      const search = page.getByRole('combobox');
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Performance.enable');
      // Style recalculations over a short window: a ticking ring animation
      // recalculates every frame (about 30 in 500ms), an unrendered one does
      // not. The idle allowance absorbs a stray one-off recalculation.
      const recalcsOver = async (ms: number) => {
        const count = async () => {
          const {metrics} = await cdp.send('Performance.getMetrics');
          return metrics.find(m => m.name === 'RecalcStyleCount')?.value ?? 0;
        };
        const before = await count();
        await page.waitForTimeout(ms);
        return (await count()) - before;
      };
      const spinnerState = async () =>
        page.evaluate(() => {
          const spinner = document
            .querySelector('button[aria-label="Clear all"]')
            ?.parentElement?.querySelector('.astryx-spinner');
          if (!spinner) {
            throw new Error('The lane holds no Spinner');
          }
          return {
            hidden: spinner.getAttribute('aria-hidden') === 'true',
            width: spinner.getBoundingClientRect().width,
          };
        });
      const idle = await spinnerState();
      expect(idle.hidden).toBe(true);
      expect(await recalcsOver(500)).toBeLessThanOrEqual(2);
      await search.focus();
      await search.press('a');
      await expect(search).toHaveAttribute('aria-busy', 'true');
      const busy = await spinnerState();
      expect(busy.hidden).toBe(false);
      expect(await recalcsOver(500)).toBeGreaterThanOrEqual(10);
      expect(busy.width).toBe(idle.width);
    });

    test('the idle Spinner paints nothing, even when a theme styles its box', async ({
      page,
    }) => {
      await page.goto(
        `${storybook.origin}/iframe.html?id=core-tokenizer--loading&viewMode=story&globals=direction:${direction};astryxTheme:probe`,
        {waitUntil: 'load'},
      );
      await page
        .locator('button[aria-label="Clear all"]')
        .waitFor({state: 'attached'});
      const search = page.getByRole('combobox');
      const spinnerPaint = async () =>
        page.evaluate(() => {
          const spinner = document
            .querySelector('button[aria-label="Clear all"]')
            ?.parentElement?.querySelector('.astryx-spinner');
          if (!spinner) {
            throw new Error('The lane holds no Spinner');
          }
          const style = getComputedStyle(spinner);
          return {
            visible: spinner.checkVisibility({visibilityProperty: true}),
            visibility: style.visibility,
            background: style.backgroundColor,
          };
        });
      const idle = await spinnerPaint();
      // The probe theme paints the Spinner's own box, so a box that is only
      // content-skipped would still show beside Clear all.
      expect(idle.background).not.toBe('rgba(0, 0, 0, 0)');
      expect(idle.visibility).toBe('hidden');
      expect(idle.visible).toBe(false);
      await search.focus();
      await search.press('a');
      await expect(search).toHaveAttribute('aria-busy', 'true');
      expect((await spinnerPaint()).visible).toBe(true);
    });

    test('a themed, larger Spinner keeps its space too', async ({page}) => {
      test.setTimeout(240_000);
      await open(page, 'core-tokenizer--loading', direction);
      // The public size var a theme sets for a named Spinner size.
      await page.addStyleTag({
        content: '.astryx-spinner { --spinner-diameter: 24px !important; }',
      });
      expect(await busyLayoutChanges(page, 8)).toEqual([]);
    });

    test('a search settling after blur does not change the collapsed row', async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await open(
        page,
        'core-tokenizer--loading',
        direction,
        'tokenOverflowBehavior:unfocusedInline',
      );
      const search = page.getByRole('combobox');
      await search.focus();
      await addTokens(page, ['Bob Smith', 'Charlie Brown', 'Diana Prince']);
      const changed: string[] = [];
      for (let width = 200; width <= 400; width += 8) {
        await search.focus();
        await search.fill('');
        await search.press('a');
        await expect(search).toHaveAttribute('aria-busy', 'true');
        await search.blur();
        const busy = await collapsedRowAt(page, `${width}px`);
        await expect(search).not.toHaveAttribute('aria-busy', 'true');
        const settled = await collapsedRowAt(page, `${width}px`);
        if (busy !== settled) {
          changed.push(`${width}px: busy ${busy}, settled ${settled}`);
        }
      }
      expect(changed).toEqual([]);
    });

    for (const mode of ['overflow-inline', 'overflow-layer']) {
      test(`${mode}: blurred and focused tokens stay clear of the end lane`, async ({
        page,
      }) => {
        await open(page, `core-powersearch--${mode}`, direction);
        // Blurred: only the inline mode keeps its lane on the page.
        if (mode === 'overflow-inline') {
          expect(await sweep(page, 320, 640)).toEqual([]);
        }
        // The field's own corner, clear of every token: the click a person
        // makes to start typing, which expands both modes.
        await page
          .locator('.astryx-tokenizer')
          .first()
          .click({position: {x: 1, y: 1}});
        await expect(page.getByRole('combobox')).toBeFocused();
        expect(await sweep(page, 320, 640)).toEqual([]);
      });
    }
  });
}
