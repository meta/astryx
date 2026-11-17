// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file BottomSheetDrag.a11y.chromium.spec.ts
 * @input Built BottomSheet stories and real Chromium touch input (CDP)
 * @output Browser evidence that a drag follows the finger without rendering,
 *   and that the release animates from where the finger left the sheet
 * @position Chromium proof for useSheetGestures' live transform path
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
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

test.use({hasTouch: true, viewport: {width: 390, height: 844}});

// A React commit counter: DevTools' hook is called once per committed root.
const COMMIT_COUNTER = `(() => {
  const hook = {
    renderers: new Map(), supportsFiber: true, commits: 0,
    inject() { return 1; },
    onCommitFiberRoot() { hook.commits += 1; },
    onCommitFiberUnmount() {}, onPostCommitFiberRoot() {},
  };
  Object.defineProperty(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', {value: hook});
})()`;

async function openSheet(page: Page) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-bottomsheet--snap-points&viewMode=story`,
  );
  // The entrance ends when the panel's transform transition ends, which is
  // the signal the panel itself waits on. Listen before the click, so that
  // no entrance ends unseen.
  await page.evaluate(() => {
    const entrance = window as unknown as {sheetEntered: boolean};
    entrance.sheetEntered = false;
    document.addEventListener(
      'transitionend',
      event => {
        if (
          event.propertyName === 'transform' &&
          event.target instanceof Element &&
          event.target.classList.contains('astryx-bottom-sheet')
        ) {
          entrance.sheetEntered = true;
        }
      },
      {capture: true},
    );
  });
  await page.getByRole('button', {name: 'Open nearby places'}).click();
  const dialog = page.getByRole('dialog', {name: 'Nearby places'});
  await expect(dialog).toBeVisible();
  // The sheet panel carries the component class and the transform.
  const sheet = dialog.locator('.astryx-bottom-sheet').first();
  await expect(sheet).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(
        () => (window as unknown as {sheetEntered: boolean}).sheetEntered,
      ),
    )
    .toBe(true);
  return {dialog, sheet};
}

function tyOf(transform: string): number {
  const match = /translateY\((-?[\d.]+)px\)/.exec(transform);
  return match ? Number(match[1]) : 0;
}

test('a drag writes the transform per move and renders nothing between', async ({
  page,
}) => {
  await page.addInitScript(COMMIT_COUNTER);
  const {sheet} = await openSheet(page);
  const box = await sheet.boundingBox();
  if (box == null) {
    throw new Error('no sheet box');
  }
  const x = box.x + box.width / 2;
  const handleY = box.y + 12;
  const commitsBefore = await page.evaluate(
    () =>
      (window as unknown as {__REACT_DEVTOOLS_GLOBAL_HOOK__: {commits: number}})
        .__REACT_DEVTOOLS_GLOBAL_HOOK__.commits,
  );
  const cdp = await page.context().newCDPSession(page);
  const steps = 24;
  const trail: number[] = [];
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{x, y: handleY}],
  });
  for (let i = 1; i <= steps; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{x, y: handleY + i * 5}],
    });
    trail.push(
      tyOf(await sheet.evaluate(el => (el as HTMLElement).style.transform)),
    );
    await page.waitForTimeout(16);
  }
  const commitsDuring = await page.evaluate(
    () =>
      (
        window as unknown as {
          __REACT_DEVTOOLS_GLOBAL_HOOK__: {commits: number};
        }
      ).__REACT_DEVTOOLS_GLOBAL_HOOK__.commits,
  );
  // The transform followed the finger (inline, written per move; the first
  // samples ease out of the magnet around the resting detent) ...
  expect(trail[trail.length - 1]).toBeGreaterThanOrEqual(100);
  expect(trail.filter((ty, i) => i === 0 || ty >= trail[i - 1]).length).toBe(
    trail.length,
  );
  // ... and the moves cost a handful of commits (the drag beginning, the
  // sheet traveling), not one per move.
  expect(commitsDuring - commitsBefore).toBeLessThanOrEqual(4);
  // The settle's transition starts from where it is as it begins, whatever
  // the clock reads when the page gets to it. So record its first keyframe.
  await sheet.evaluate(element => {
    const el = element as HTMLElement;
    const record = window as unknown as {settleFrom: string | null};
    record.settleFrom = null;
    el.addEventListener('transitionrun', event => {
      if (event.target !== el || event.propertyName !== 'transform') {
        return;
      }
      for (const animation of el.getAnimations()) {
        if (
          animation instanceof CSSTransition &&
          animation.transitionProperty === 'transform' &&
          animation.effect instanceof KeyframeEffect
        ) {
          record.settleFrom = String(
            animation.effect.getKeyframes()[0]?.transform ?? '',
          );
        }
      }
    });
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  // The release animates back from where the finger left the sheet, and the
  // sheet is at rest after the transition.
  await expect
    .poll(async () =>
      page.evaluate(
        () => (window as unknown as {settleFrom: string | null}).settleFrom,
      ),
    )
    .not.toBeNull();
  const settleFrom = await page.evaluate(
    () => (window as unknown as {settleFrom: string}).settleFrom,
  );
  const fromTy =
    /matrix\(1, 0, 0, 1, 0, (-?[\d.]+)\)/.exec(settleFrom)?.[1] ??
    /translateY\((-?[\d.]+)px\)/.exec(settleFrom)?.[1];
  expect(fromTy, settleFrom).toBeDefined();
  expect(Number(fromTy)).toBeGreaterThan(5);
  await expect
    .poll(async () => sheet.evaluate(el => getComputedStyle(el).transform), {
      timeout: 2_000,
    })
    .toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  await expect(page.getByRole('dialog', {name: 'Nearby places'})).toBeVisible();
});

async function openStory(
  page: Page,
  story: string,
  opener: string,
  label: string,
) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-bottomsheet--${story}&viewMode=story`,
  );
  await page.getByRole('button', {name: opener}).click();
  const dialog = page.getByRole('dialog', {name: label});
  await expect(dialog).toBeVisible();
  const sheet = dialog.locator('.astryx-bottom-sheet').first();
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(600); // the entrance
  return {dialog, sheet, rest: await topOf(sheet)};
}

async function topOf(sheet: Locator): Promise<number> {
  return sheet.evaluate(el => el.getBoundingClientRect().top);
}

/**
 * One finger pull of `distance` px up from `from`, held still before it lifts.
 * Returns how far above `rest` the sheet's top was during the hold, after the
 * sheet has come back to rest.
 */
async function pullUp(
  page: Page,
  sheet: Locator,
  rest: number,
  from: {x: number; y: number},
  distance: number,
): Promise<number> {
  const cdp = await page.context().newCDPSession(page);
  const steps = 12;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [from],
  });
  for (let i = 1; i <= steps; i += 1) {
    await page.waitForTimeout(16);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{x: from.x, y: from.y - (distance * i) / steps}],
    });
  }
  await page.waitForTimeout(120);
  const stretch = rest - (await topOf(sheet));
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await expect
    .poll(async () => Math.abs((await topOf(sheet)) - rest), {timeout: 2_000})
    .toBeLessThan(0.5);
  await cdp.detach();
  return stretch;
}

test('a pull up on the body of a sheet whose content fits stretches it on every pull', async ({
  page,
}) => {
  const {dialog, sheet, rest} = await openStory(
    page,
    'showcase',
    'Open sheet',
    'Filters',
  );
  const box = async (name: string) => {
    const found = await dialog
      .getByText(name, {exact: true})
      .first()
      .boundingBox();
    if (found == null) {
      throw new Error(`no box for ${name}`);
    }
    return found;
  };
  // Five places on the content, none on the grabber.
  const heading = await box('Filters');
  const inStock = await box('In stock');
  const onSale = await box('On sale');
  const freeShipping = await box('Free shipping');
  const points = [
    {x: heading.x + 10, y: heading.y + heading.height / 2},
    {x: inStock.x + inStock.width / 2, y: inStock.y + inStock.height / 2},
    {x: 300, y: onSale.y + onSale.height / 2},
    {x: freeShipping.x + 4, y: freeShipping.y + freeShipping.height / 2},
    {x: 195, y: freeShipping.y + freeShipping.height + 12},
  ];
  for (const point of points) {
    // The content does not scroll, so every pull stretches the sheet.
    expect(await pullUp(page, sheet, rest, point, 100)).toBeGreaterThan(20);
  }
  await expect(dialog).toBeVisible();
});

test('a long list scrolls to its end, then the sheet stretches with the rest of the pull', async ({
  page,
}) => {
  const {sheet, rest} = await openStory(
    page,
    'snap-points',
    'Open nearby places',
    'Nearby places',
  );
  // The list rests 40 px short of its end.
  const max = await sheet.evaluate(el => {
    const list = [...el.querySelectorAll<HTMLElement>('*')].find(
      node =>
        node.scrollHeight > node.clientHeight + 1 &&
        /(auto|scroll)/.test(getComputedStyle(node).overflowY),
    );
    if (list == null) {
      throw new Error('no scrolling list');
    }
    list.dataset.sheetList = '';
    list.scrollTop = list.scrollHeight - list.clientHeight - 40;
    return list.scrollHeight - list.clientHeight;
  });
  const list = sheet.locator('[data-sheet-list]');
  const listBox = await list.boundingBox();
  if (listBox == null) {
    throw new Error('no list box');
  }
  const stretch = await pullUp(
    page,
    sheet,
    rest,
    {x: listBox.x + listBox.width / 2, y: listBox.y + listBox.height * 0.75},
    200,
  );
  expect(await list.evaluate(el => el.scrollTop)).toBeGreaterThanOrEqual(
    max - 1,
  );
  expect(stretch).toBeGreaterThan(10);
});
