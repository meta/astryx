// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file AlertDialog.interaction.browser.spec.ts
 * @input The built "Delete" AlertDialog story on the phone profile, real
 *   touch input (Chromium CDP / WebKit's input command) and the interaction
 *   harness
 * @output Proofs that a finger or a mouse is tracked across the alert's two
 *   actions: the highlight follows it, the lift runs the action under it once,
 *   only the actions are tracked, one action looks pressed at a time, and a
 *   held finger refuses a text selection only while it holds
 * @position Touch lane of AlertDialog, beside the accessibility bindings in
 *   this folder. Run with `pnpm test:interaction AlertDialog`.
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {
  drag,
  frames,
  openStory,
  tap,
  touchDriver,
  waitForRest,
  withStorybook,
  type Point,
  type TouchDriver,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

interface OpenAlert {
  driver: TouchDriver;
  dialog: Locator;
  cancel: Locator;
  del: Locator;
  centers: {cancel: Point; del: Point; message: Point};
  /** Bottom edge of the alert surface, CSS px. */
  bottom: number;
}

const centerOf = async (locator: Locator): Promise<Point> => {
  const box = await locator.boundingBox();
  if (box == null) {
    throw new Error('no box');
  }
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
};

/**
 * Opens the story's alert with a tap on its trigger, waits for the entrance
 * to rest, and starts a page-side log: every click an action receives, and
 * every write of the press attribute with the animation frame it landed in.
 */
async function openAlert(
  page: Page,
  story = 'core-alertdialog--delete',
): Promise<OpenAlert> {
  await openStory(page, storybook(), story);
  const driver = await touchDriver(page);
  await driver.tap(
    await centerOf(page.getByRole('button', {name: 'Delete item'})),
  );
  const dialog = page.getByRole('alertdialog', {name: 'Delete item?'});
  await expect(dialog).toBeVisible();
  await waitForRest(dialog);
  const cancel = dialog.getByRole('button', {name: 'Cancel'});
  const del = dialog.getByRole('button', {name: 'Delete'});
  const message = dialog.getByText('This action cannot be undone', {
    exact: false,
  });
  await page.evaluate(() => {
    const log = {
      clicks: [] as string[],
      paints: [] as string[],
      touchFrames: [] as number[],
      frame: 0,
    };
    (window as unknown as {__alertLog: typeof log}).__alertLog = log;
    const tick = () => {
      log.frame += 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    document.addEventListener(
      'click',
      event => {
        const button = (event.target as Element).closest('button');
        if (button != null) {
          log.clicks.push(button.textContent ?? '');
        }
      },
      true,
    );
    document.addEventListener(
      'touchstart',
      () => log.touchFrames.push(log.frame),
      true,
    );
    new MutationObserver(records => {
      for (const record of records) {
        const target = record.target as Element;
        log.paints.push(
          `${target.textContent}=${target.getAttribute('data-astryx-press') ?? '-'}@${log.frame}`,
        );
      }
    }).observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-astryx-press'],
    });
  });
  const box = await dialog.boundingBox();
  if (box == null) {
    throw new Error('no dialog box');
  }
  return {
    driver,
    dialog,
    cancel,
    del,
    centers: {
      cancel: await centerOf(cancel),
      del: await centerOf(del),
      message: await centerOf(message),
    },
    bottom: box.y + box.height,
  };
}

const readLog = async (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __alertLog: {
            clicks: string[];
            paints: string[];
            touchFrames: number[];
          };
        }
      ).__alertLog,
  );

const paintOf = async (locator: Locator) =>
  locator.evaluate(el => el.getAttribute('data-astryx-press'));

/** A slow slide that rests before the lift, as a finger reconsidering. */
const slide = (from: Point, to: Point) =>
  drag(from, to, {durationMs: 240, hz: 60, holdMs: 60, restMs: 120});

test('a finger that lands on Delete and lifts on Cancel cancels, in every engine', async ({
  page,
}) => {
  const {driver, dialog, centers} = await openAlert(page);
  expect(
    await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
  ).toBe(true);
  await driver.play(slide(centers.del, centers.cancel));
  await expect(dialog).toBeHidden();
  expect((await readLog(page)).clicks).toEqual(['Cancel']);
});

test('reopened, the alert tracks again: a slide from Delete to Cancel runs Cancel', async ({
  page,
}) => {
  const {driver, dialog, centers} = await openAlert(page);
  await driver.play(tap(centers.cancel, {holdMs: 80}));
  await expect(dialog).toBeHidden();
  await driver.tap(
    await centerOf(page.getByRole('button', {name: 'Delete item'})),
  );
  await expect(dialog).toBeVisible();
  await waitForRest(dialog);
  await driver.play(slide(centers.del, centers.cancel));
  await expect(dialog).toBeHidden();
  // The log holds every button's click, the opener's included.
  expect((await readLog(page)).clicks).toEqual([
    'Cancel',
    'Delete item',
    'Cancel',
  ]);
});

test('the touched action is highlighted in the frame of the touch, and the highlight follows the finger', async ({
  page,
}) => {
  const {driver, dialog, cancel, del, centers} = await openAlert(page);
  await driver.play(slide(centers.del, centers.cancel), {
    onEvent: async (step, index) => {
      if (index !== 0) {
        return;
      }
      // Read synchronously after the touch-down was dispatched.
      expect(step.type).toBe('touchStart');
      expect(await paintOf(del)).toBe('on');
      expect(await paintOf(cancel)).toBeNull();
    },
  });
  await expect(dialog).toBeHidden();
  const {paints, clicks, touchFrames} = await readLog(page);
  // The first write is Delete's, in the animation frame of the touchstart.
  expect(touchFrames).toHaveLength(1);
  expect(paints[0]).toBe(`Delete=on@${touchFrames[0]}`);
  // Delete is cut (no fade) when the finger leaves it; Cancel lights when it
  // enters; the lift fades Cancel, and the alert closing (here at once, with
  // no exit) ends that fade with the tracking.
  const sequence = paints.map(entry => entry.split('@')[0]);
  expect(sequence).toEqual([
    'Delete=on',
    'Delete=-',
    'Cancel=on',
    'Cancel=fading',
    'Cancel=-',
  ]);
  expect(clicks).toEqual(['Cancel']);
});

test('a lift off both actions runs nothing and leaves the alert open', async ({
  page,
}) => {
  const {driver, dialog, del, centers, bottom} = await openAlert(page);
  await driver.play(slide(centers.del, {x: centers.del.x, y: bottom + 60}));
  expect(await paintOf(del)).toBeNull();
  await expect(dialog).toBeVisible();
  expect((await readLog(page)).clicks).toEqual([]);
});

test('a held finger on the actions refuses a text selection only while it holds; at rest nothing about selection changes (spec:AST-094 FR41)', async ({
  page,
}) => {
  const {driver, dialog, del, centers, bottom} = await openAlert(page);
  const userSelect = async (locator: Locator) =>
    locator.evaluate(element => {
      const style = getComputedStyle(element);
      return (
        style.getPropertyValue('user-select') ||
        style.getPropertyValue('-webkit-user-select')
      );
    });
  // Whether a selection that starts on Delete's label is refused.
  const refusesSelection = async () =>
    del.evaluate(element => {
      const event = new Event('selectstart', {bubbles: true, cancelable: true});
      element.dispatchEvent(event);
      return event.defaultPrevented;
    });
  // At rest: no style refuses a selection, on the actions or around them.
  expect(await userSelect(del.locator('..'))).not.toBe('none');
  expect(await userSelect(dialog.getByRole('heading'))).not.toBe('none');
  expect(await refusesSelection()).toBe(false);
  // While a finger holds the actions, a selection there is refused.
  let refusedWhileHeld: boolean | null = null;
  await driver.play(slide(centers.del, {x: centers.del.x, y: bottom + 60}), {
    onEvent: async (step, index) => {
      if (index !== 1) {
        return;
      }
      expect(step.type).toBe('touchMove');
      refusedWhileHeld = await refusesSelection();
    },
  });
  expect(refusedWhileHeld).toBe(true);
  // After the lift, nothing is refused again.
  expect(await refusesSelection()).toBe(false);
  await expect(dialog).toBeVisible();
});

test("no pan can take the group's press: the actions allow only pinch-zoom, and the rest of the alert keeps its pan", async ({
  page,
}) => {
  // Chrome on Android cancels a pointer it pans (pointercancel), which ends
  // the long press that tracks the group: where the group owns a press, the
  // browser may pinch-zoom but not pan. Only the actions are the group.
  const {dialog, cancel} = await openAlert(page);
  const touchAction = async (locator: Locator) =>
    locator.evaluate(element => getComputedStyle(element).touchAction);
  // The actions' row, the group's element.
  expect(await touchAction(cancel.locator('..'))).toBe('pinch-zoom');
  expect(await touchAction(dialog)).toBe('auto');
  const message = dialog.getByText('This action cannot be undone', {
    exact: false,
  });
  expect(await touchAction(message.locator('..'))).toBe('auto');
});

test('only the actions are tracked: a touch that lands on the message and slides onto Cancel runs nothing', async ({
  page,
}) => {
  const {driver, dialog, centers} = await openAlert(page);
  await driver.play(slide(centers.message, centers.cancel));
  await frames(page, 4);
  await expect(dialog).toBeVisible();
  expect((await readLog(page)).clicks).toEqual([]);
});

test('a tap runs its action exactly once', async ({page}) => {
  const {driver, dialog, centers} = await openAlert(page);
  await driver.play(tap(centers.cancel, {holdMs: 80}));
  await expect(dialog).toBeHidden();
  // Let any click the browser might still synthesize arrive.
  await frames(page, 4);
  expect((await readLog(page)).clicks).toEqual(['Cancel']);
});

test.describe('with a mouse', () => {
  test.use({hasTouch: false, isMobile: false});

  test('a press on Delete slid to Cancel runs Cancel once, and a click on Delete runs Delete once (family:action-groups FR5)', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-alertdialog--delete');
    // A fine pointer in this context, before anything is checked.
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    const open = async () => {
      await page.getByRole('button', {name: 'Delete item'}).click();
      const dialog = page.getByRole('alertdialog', {name: 'Delete item?'});
      await expect(dialog).toBeVisible();
      return dialog;
    };
    const clicks: string[] = [];
    await page.exposeFunction('__alertClick', (label: string) => {
      clicks.push(label);
    });
    await page.evaluate(() => {
      document.addEventListener(
        'click',
        event => {
          const action = (event.target as Element).closest('dialog button');
          if (action != null) {
            (
              window as unknown as {__alertClick: (label: string) => void}
            ).__alertClick(action.textContent ?? '');
          }
        },
        true,
      );
    });
    let dialog = await open();
    const del = await centerOf(dialog.getByRole('button', {name: 'Delete'}));
    const cancel = await centerOf(dialog.getByRole('button', {name: 'Cancel'}));
    await page.mouse.move(del.x, del.y);
    await page.mouse.down();
    await page.mouse.move(cancel.x, cancel.y, {steps: 8});
    await page.mouse.up();
    await expect(dialog).toBeHidden();
    expect(clicks).toEqual(['Cancel']);
    // A plain click: the group's click runs it, and the browser's own click
    // for the same press is swallowed.
    clicks.length = 0;
    dialog = await open();
    await dialog.getByRole('button', {name: 'Delete'}).click();
    await expect.poll(() => clicks.length).toBe(1);
    await frames(page, 4);
    expect(clicks).toEqual(['Delete']);
  });

  test('a press held on Delete and slid onto Cancel lights only Cancel: Delete keeps no pressed look (family:action-groups FR2)', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-alertdialog--delete');
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    await page.getByRole('button', {name: 'Delete item'}).click();
    const dialog = page.getByRole('alertdialog', {name: 'Delete item?'});
    await expect(dialog).toBeVisible();
    await waitForRest(dialog);
    const delButton = dialog.getByRole('button', {name: 'Delete'});
    const cancelButton = dialog.getByRole('button', {name: 'Cancel'});
    // Whether an action looks pressed: its press paint, its press scale, or
    // a pressed overlay image of nonzero size.
    const looksPressed = async (locator: Locator) =>
      locator.evaluate(element => {
        const style = getComputedStyle(element);
        const scale =
          style.transform !== 'none' &&
          !/^matrix\(1, 0, 0, 1, 0, 0\)$/.test(style.transform);
        return {
          paint: element.getAttribute('data-astryx-press'),
          scaled: scale,
          image:
            style.backgroundImage !== 'none' &&
            style.backgroundSize !== '0px 0px',
        };
      });
    // Both painted and at rest before the press.
    await expect(delButton).toBeVisible();
    await expect(cancelButton).toBeVisible();
    expect(await looksPressed(delButton)).toEqual({
      paint: null,
      scaled: false,
      image: false,
    });
    const del = await centerOf(delButton);
    const cancel = await centerOf(cancelButton);
    await page.mouse.move(del.x, del.y);
    await page.mouse.down();
    await expect
      .poll(async () => (await looksPressed(delButton)).paint)
      .toBe('on');
    await page.mouse.move(cancel.x, cancel.y, {steps: 8});
    await expect
      .poll(async () => (await looksPressed(cancelButton)).paint)
      .toBe('on');
    await expect
      .poll(async () => looksPressed(delButton))
      .toEqual({paint: null, scaled: false, image: false});
    const lit = await looksPressed(cancelButton);
    await page.mouse.up();
    expect(lit.paint).toBe('on');
    expect(lit.image).toBe(true);
  });

  test('the dialog keeps its base styles: its text stays selectable', async ({
    page,
  }) => {
    // Only the actions' row, the group, takes no text selection: with a
    // mouse the dialog's title and message stay selectable.
    await openStory(page, storybook(), 'core-alertdialog--delete');
    // A fine pointer in this context, before anything is checked.
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    await page.getByRole('button', {name: 'Delete item'}).click();
    const dialog = page.getByRole('alertdialog', {name: 'Delete item?'});
    await expect(dialog).toBeVisible();
    const styles = await dialog.evaluate(element => {
      const title = element.querySelector('h2') as HTMLElement;
      return {
        dialog: getComputedStyle(element).userSelect,
        title: getComputedStyle(title).userSelect,
      };
    });
    expect(styles.dialog).not.toBe('none');
    expect(styles.title).not.toBe('none');
  });
});

test('on a touch screen a mouse click runs its action once', async ({page}) => {
  const {dialog, centers} = await openAlert(page);
  // A mouse on a touch screen: the primary pointer is coarse, and the group
  // tracks every pointer, so the click runs Cancel through the group, once.
  expect(
    await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
  ).toBe(true);
  await page.mouse.click(centers.cancel.x, centers.cancel.y);
  await expect(dialog).toBeHidden();
  expect((await readLog(page)).clicks).toEqual(['Cancel']);
});
