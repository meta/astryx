// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file AlertDialog.layout.interaction.browser.spec.ts
 * @input The built AlertDialog stories on the phone profile: a compact
 *   viewport under a coarse pointer, with real fonts. Story args are set
 *   through Storybook's channel
 * @output Layout proofs for the alert's actions under a finger on a compact
 *   window. Two actions share a row in equal halves, Cancel leading, when each
 *   label fits its half on one line. A label too long for its half stacks
 *   them, the action above Cancel. DOM order is the visual order, and right to
 *   left mirrors the row. Long and German labels, large text, a 200% zoom and
 *   a 320 px screen follow the same rule. So do every action variant, a
 *   loading action and a label change while the alert is shown. The first
 *   frame paints the decision, and no resize observer loop is reported. A
 *   mouse keeps today's layout: stacked at 640px and below, a row above
 * @position Layout lane of AlertDialog, beside the touch-tracking and motion
 *   specs. Run with `pnpm test:interaction AlertDialog`.
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  frames,
  openStory,
  touchDriver,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

/** The inline alert story whose args the cases set. */
const INLINE_STORY = 'core-alertdialog--desktop-fine-pointer';

interface ActionBox {
  label: string;
  x: number;
  y: number;
  width: number;
  /** Whether the label shows whole, with no ellipsis. */
  fits: boolean;
}

/** The alert's actions in DOM order, with their boxes. */
async function actions(page: Page): Promise<ActionBox[]> {
  await frames(page, 2);
  return page.evaluate(() =>
    [...document.querySelectorAll('#storybook-root button')].map(element => {
      const box = element.getBoundingClientRect();
      const label = [...element.querySelectorAll('*')].find(
        child =>
          child.children.length === 0 &&
          child.textContent?.trim() === element.textContent?.trim(),
      );
      return {
        label: element.textContent?.trim() ?? '',
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        fits: label == null || label.scrollWidth <= label.clientWidth + 0.5,
      };
    }),
  );
}

/**
 * Sets the inline story's args through Storybook's channel, which takes any
 * string (a URL arg takes only ASCII), and waits for the labels to show.
 */
async function setArgs(
  page: Page,
  args: Readonly<Record<string, string | boolean>>,
): Promise<void> {
  await page.evaluate(
    ({storyId, updatedArgs}) => {
      const channel = (
        window as unknown as {
          __STORYBOOK_ADDONS_CHANNEL__: {
            emit: (event: string, payload: unknown) => void;
          };
        }
      ).__STORYBOOK_ADDONS_CHANNEL__;
      channel.emit('updateStoryArgs', {storyId, updatedArgs});
    },
    {storyId: INLINE_STORY, updatedArgs: args},
  );
  for (const key of ['cancelLabel', 'actionLabel'] as const) {
    const label = args[key];
    if (typeof label === 'string') {
      await expect(
        page.getByRole('button', {name: label, exact: true}),
      ).toBeVisible();
    }
  }
}

/** Opens the inline alert with the given labels. */
async function openAlert(
  page: Page,
  args: Readonly<Record<string, string | boolean>> = {},
): Promise<void> {
  await openStory(page, storybook(), INLINE_STORY);
  await setArgs(page, args);
}

/** Two actions share one row, `first` leading, in equal halves. */
function expectRow([first, second]: ActionBox[], labels: [string, string]) {
  expect([first.label, second.label]).toEqual(labels);
  expect(first.y).toBe(second.y);
  expect(Math.abs(first.width - second.width)).toBeLessThanOrEqual(1);
  expect(first.fits && second.fits).toBe(true);
}

/** Two actions stack, `top` above, both as wide as the row. */
function expectStack([top, bottom]: ActionBox[], labels: [string, string]) {
  expect([top.label, bottom.label]).toEqual(labels);
  expect(top.y).toBeLessThan(bottom.y);
  expect(top.x).toBe(bottom.x);
  expect(top.width).toBe(bottom.width);
}

test.describe('under a finger on a compact screen', () => {
  for (const width of [320, 390]) {
    test(`two short actions share the row at ${width} px, Cancel leading, in equal halves and DOM order`, async ({
      page,
    }) => {
      await page.setViewportSize({width, height: 714});
      await openAlert(page, {cancelLabel: 'Cancel', actionLabel: 'Delete'});
      const row = await actions(page);
      expectRow(row, ['Cancel', 'Delete']);
      expect(row[0].x).toBeLessThan(row[1].x);
    });
  }

  test('one label too long for its half stacks them, whatever the other one', async ({
    page,
  }) => {
    // The two labels' sum fits the row; the long one alone does not fit its
    // half.
    await openAlert(page, {
      cancelLabel: 'No',
      actionLabel: 'Delete everything forever',
    });
    expectStack(await actions(page), ['Delete everything forever', 'No']);
  });

  test('two long labels stack, the action above Cancel', async ({page}) => {
    await openAlert(page, {
      cancelLabel: 'Keep this workspace',
      actionLabel: 'Permanently delete workspace',
    });
    expectStack(await actions(page), [
      'Permanently delete workspace',
      'Keep this workspace',
    ]);
  });

  test('a label that fits its half only on a wider screen stacks at 300 px and shares the row at 390 px', async ({
    page,
  }) => {
    // At 300 px the screen's gutters clamp the alert. Each half of its row is
    // then about 114 px, and 140 px on a 390 px phone. The label needs about
    // 125 px, with room on both sides.
    await page.setViewportSize({width: 300, height: 714});
    await openAlert(page, {
      cancelLabel: 'Cancel',
      actionLabel: 'Delete forever',
    });
    expectStack(await actions(page), ['Delete forever', 'Cancel']);
    await page.setViewportSize({width: 390, height: 714});
    expectRow(await actions(page), ['Cancel', 'Delete forever']);
  });

  test('German labels follow the same rule: short ones share the row, a long one stacks them', async ({
    page,
  }) => {
    await openAlert(page, {cancelLabel: 'Abbrechen', actionLabel: 'Löschen'});
    expectRow(await actions(page), ['Abbrechen', 'Löschen']);
    await setArgs(page, {actionLabel: 'Endgültig löschen'});
    expectStack(await actions(page), ['Endgültig löschen', 'Abbrechen']);
  });

  test('right to left mirrors the row: Cancel on the right', async ({page}) => {
    await openAlert(page, {cancelLabel: 'Cancel', actionLabel: 'Delete'});
    // The story's provider sets the direction on its own root.
    await page.evaluate(() => {
      document.documentElement.dir = 'rtl';
      for (const element of document.querySelectorAll('[dir]')) {
        element.setAttribute('dir', 'rtl');
      }
    });
    const row = await actions(page);
    expectRow(row, ['Cancel', 'Delete']);
    expect(row[0].x).toBeGreaterThan(row[1].x);
  });

  test('large text lays the actions out again while the alert is shown: at twice the text size they stack', async ({
    page,
  }) => {
    await openAlert(page, {cancelLabel: 'Cancel', actionLabel: 'Delete'});
    expectRow(await actions(page), ['Cancel', 'Delete']);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    expectStack(await actions(page), ['Delete', 'Cancel']);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '';
    });
    expectRow(await actions(page), ['Cancel', 'Delete']);
  });

  test('at 200% zoom, a 390 px phone is 195 CSS px wide: the actions stack', async ({
    page,
  }) => {
    await page.setViewportSize({width: 195, height: 357});
    await openAlert(page, {cancelLabel: 'Cancel', actionLabel: 'Delete'});
    expectStack(await actions(page), ['Delete', 'Cancel']);
  });

  test('every action variant gets the same layout', async ({page}) => {
    await openAlert(page, {cancelLabel: 'Cancel', actionLabel: 'Delete'});
    for (const actionVariant of ['destructive', 'primary', 'secondary']) {
      await setArgs(page, {actionVariant});
      expectRow(await actions(page), ['Cancel', 'Delete']);
    }
  });

  test('a loading action keeps its half: the spinner stays inside it', async ({
    page,
  }) => {
    await openAlert(page, {
      cancelLabel: 'Cancel',
      actionLabel: 'Revoke',
      isActionLoading: true,
    });
    const [cancel, action] = await actions(page);
    // The loading action's text also holds the spinner's label.
    expect(cancel.label).toBe('Cancel');
    expect(action.label.startsWith('Revoke')).toBe(true);
    expect(cancel.y).toBe(action.y);
    expect(Math.abs(cancel.width - action.width)).toBeLessThanOrEqual(1);
    const overflow = await page.evaluate(() => {
      const button = document.querySelectorAll('#storybook-root button')[1];
      return button.scrollWidth - button.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('a label change while the alert is shown lays the actions out again, both ways', async ({
    page,
  }) => {
    await openAlert(page, {cancelLabel: 'Cancel', actionLabel: 'Delete'});
    expectRow(await actions(page), ['Cancel', 'Delete']);
    await setArgs(page, {actionLabel: 'Delete every message'});
    expectStack(await actions(page), ['Delete every message', 'Cancel']);
    await setArgs(page, {actionLabel: 'Delete'});
    expectRow(await actions(page), ['Cancel', 'Delete']);
  });

  test('an alert mounted closed shares the row once it opens', async ({
    page,
  }) => {
    // An inline alert renders nothing while it is closed, so its title mounts
    // only when it opens. The story mounts closed here, so the story root
    // stays empty until then.
    await page.addInitScript(() => {
      (
        globalThis as unknown as {__STORYBOOK_HIGHLIGHT_INITIALIZED?: boolean}
      ).__STORYBOOK_HIGHLIGHT_INITIALIZED = true;
    });
    await page.goto(
      `${storybook()}/iframe.html?id=${INLINE_STORY}&viewMode=story&args=isOpen:!false`,
    );
    await page.waitForFunction(id => {
      const render = (
        globalThis as unknown as {
          __STORYBOOK_PREVIEW__?: {
            currentRender?: {readonly id?: string; readonly phase?: string};
          };
        }
      ).__STORYBOOK_PREVIEW__?.currentRender;
      return render?.id === id && render.phase === 'finished';
    }, INLINE_STORY);
    await expect(page.locator('#storybook-root button')).toHaveCount(0);
    await setArgs(page, {
      isOpen: true,
      cancelLabel: 'Cancel',
      actionLabel: 'Delete',
    });
    expectRow(await actions(page), ['Cancel', 'Delete']);
  });

  test('a viewport that stops being compact keeps the wide row, and the decision follows it back', async ({
    page,
  }) => {
    await openAlert(page, {
      cancelLabel: 'No',
      actionLabel: 'Delete everything forever',
    });
    expectStack(await actions(page), ['Delete everything forever', 'No']);
    await page.setViewportSize({width: 900, height: 714});
    const wide = await actions(page);
    expect(wide.map(action => action.label)).toEqual([
      'No',
      'Delete everything forever',
    ]);
    expect(wide[0].y).toBe(wide[1].y);
    await page.setViewportSize({width: 402, height: 714});
    expectStack(await actions(page), ['Delete everything forever', 'No']);
  });
});

test.describe('the first open, under a finger', () => {
  test('paints the row from its first frame, and reports no resize observer loop', async ({
    page,
  }) => {
    // Errors the page reports from its first script on.
    await page.addInitScript(() => {
      const errors: string[] = [];
      (window as unknown as {__errors: string[]}).__errors = errors;
      window.addEventListener('error', event => {
        errors.push(event.message);
      });
    });
    await openStory(page, storybook(), 'core-alertdialog--delete');
    // A resize observer made after the alert's, on the same title, runs after
    // it in the same rendering update. It runs after layout and before paint,
    // so it reads what the opening frame paints. The title keeps its size
    // when the actions' layout changes.
    await page.evaluate(() => {
      const log: number[][] = [];
      (window as unknown as {__firstFrame: number[][]}).__firstFrame = log;
      const dialog = document.querySelector('dialog') as HTMLDialogElement;
      const title = dialog.querySelector('h2') as HTMLElement;
      const observer = new ResizeObserver(() => {
        if (!dialog.open || log.length > 0) {
          return;
        }
        log.push(
          [...dialog.querySelectorAll('button')].map(button =>
            Math.round(button.getBoundingClientRect().top),
          ),
        );
      });
      observer.observe(title);
    });
    const opener = page.getByRole('button', {name: 'Delete item'});
    const box = await opener.boundingBox();
    if (box == null) {
      throw new Error('no opener');
    }
    const driver = await touchDriver(page);
    await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await frames(page, 4);
    const {first, errors} = await page.evaluate(() => ({
      first: (window as unknown as {__firstFrame: number[][]}).__firstFrame[0],
      errors: (window as unknown as {__errors: string[]}).__errors,
    }));
    expect(first?.length).toBe(2);
    expect(first[0]).toBe(first[1]);
    expect(errors).toEqual([]);
  });
});

test.describe('with a mouse', () => {
  test.use({hasTouch: false, isMobile: false});

  // A fine pointer in each test's context, before anything is checked.
  const expectFinePointer = async (page: Page) =>
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);

  test("keeps today's stack at 640px and below, even when both labels fit", async ({
    page,
  }) => {
    await page.setViewportSize({width: 390, height: 714});
    await openAlert(page, {cancelLabel: 'Cancel', actionLabel: 'Delete'});
    await expectFinePointer(page);
    expectStack(await actions(page), ['Delete', 'Cancel']);
  });

  test("keeps today's trailing row above 640px", async ({page}) => {
    await page.setViewportSize({width: 700, height: 714});
    await openAlert(page, {cancelLabel: 'Cancel', actionLabel: 'Delete'});
    await expectFinePointer(page);
    const [first, second] = await actions(page);
    expect([first.label, second.label]).toEqual(['Cancel', 'Delete']);
    expect(first.y).toBe(second.y);
    expect(first.x).toBeLessThan(second.x);
  });
});
