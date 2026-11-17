// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file storybook.interaction.browser.spec.ts
 * @input The built Storybook (`withStorybook`) and one of its stories
 * @output `openStory` turns Storybook's highlight module off, so an insertion
 *   in a story carries no `getComputedStyle` scan of the page; with the module
 *   on (the control), every insertion carries one. Both engines; Chromium's
 *   trace also counts the style recalculations the scan forces. `openStory`
 *   returns once Storybook has finished the story's render, so no listener
 *   Storybook adds to the document or the window lands after it. A WebKit
 *   touch driver created after `openStory` tells a page task's wait from the
 *   page's listeners
 * @position Self-test for story.ts; it needs the built Storybook, as every
 *   component proof does
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {drag} from './scripts';
import {openStory, withStorybook} from './story';
import {touchDriver, TouchPacingError} from './touch';
import {countBetween, traceRendering} from './trace';

const storybook = withStorybook(test);

/** Counts the page's `getComputedStyle` calls, from before Storybook loads. */
function countStyleReads(): void {
  const w = window as unknown as {__styleReads: number};
  w.__styleReads = 0;
  const read = window.getComputedStyle.bind(window);
  window.getComputedStyle = ((element: Element, pseudo?: string | null) => {
    w.__styleReads += 1;
    return read(element, pseudo);
  }) as typeof window.getComputedStyle;
}

/**
 * Inserts an exit copy of the story's first element into `#storybook-root`,
 * as an exit animation's copy is, lets the insertion's mutation microtasks run,
 * and reports what ran between its marks.
 */
async function insertCopy(page: Page) {
  return page.evaluate(async () => {
    const w = window as unknown as {__styleReads: number};
    const root = document.getElementById('storybook-root') as HTMLElement;
    const reads = w.__styleReads;
    const from =
      performance.timeOrigin + performance.mark('copy:start').startTime;
    const copy = (root.firstElementChild as HTMLElement).cloneNode(
      true,
    ) as HTMLElement;
    copy.setAttribute('aria-hidden', 'true');
    root.appendChild(copy);
    // A MutationObserver's callback is a microtask the insertion queued:
    // these run after it.
    await Promise.resolve();
    await Promise.resolve();
    const to = performance.timeOrigin + performance.mark('copy:end').startTime;
    const scanned = w.__styleReads - reads;
    const elements = document.body.querySelectorAll('*').length;
    copy.remove();
    return {from, to, scanned, elements};
  });
}

/**
 * Records every listener added to the document or the window, and when, from
 * before Storybook loads.
 */
function recordListeners(): void {
  const w = window as unknown as {
    __listeners: {type: string; target: string; at: number}[];
  };
  w.__listeners = [];
  const add = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (
    this: EventTarget,
    ...args: Parameters<EventTarget['addEventListener']>
  ) {
    if (this === document || this === window) {
      w.__listeners.push({
        type: args[0],
        target: this === document ? 'document' : 'window',
        at: performance.now(),
      });
    }
    return add.apply(this, args);
  };
}

test("openStory returns once Storybook has finished the story's render: no listener Storybook adds lands after it", async ({
  page,
}) => {
  await page.addInitScript(recordListeners);
  await openStory(page, storybook(), 'core-button--primary');
  const returned = await page.evaluate(() => ({
    at: performance.now(),
    phase: (
      window as unknown as {
        __STORYBOOK_PREVIEW__?: {currentRender?: {phase?: string}};
      }
    ).__STORYBOOK_PREVIEW__?.currentRender?.phase,
  }));
  // Two frames and 300 ms more, longer than Storybook's post-render tail
  // (about 150 ms): a listener a render still in flight adds lands by then;
  // a finished render adds none.
  await page.evaluate(
    () =>
      new Promise<void>(resolve =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => setTimeout(resolve, 300)),
        ),
      ),
  );
  const late = await page.evaluate(
    at =>
      (
        window as unknown as {
          __listeners: {type: string; target: string; at: number}[];
        }
      ).__listeners
        .filter(listener => listener.at > at)
        .map(({type, target}) => `${target} ${type}`),
    returned.at,
  );
  expect({phase: returned.phase, late}).toEqual({phase: 'finished', late: []});
});

test("openStory turns Storybook's highlight module off: an insertion in a story carries no getComputedStyle scan of the page", async ({
  page,
  browserName,
}) => {
  // The insertion's reads in every engine, and in Chromium (whose trace the
  // harness reads) the style recalculations between its marks.
  const measure = async (p: Page) => {
    if (browserName !== 'chromium') {
      return {copy: await insertCopy(p), styleRecalc: null};
    }
    let copy = {from: 0, to: 0, scanned: 0, elements: 0};
    const trace = await traceRendering(p, async () => {
      copy = await insertCopy(p);
    });
    return {
      copy,
      styleRecalc:
        countBetween(trace, copy.from, copy.to).UpdateLayoutTree ?? 0,
    };
  };
  // The harness default.
  await page.addInitScript(countStyleReads);
  await openStory(page, storybook(), 'core-button--primary');
  expect(await page.locator('#storybook-highlights-root').count()).toBe(0);
  const off = await measure(page);
  expect(off.copy.scanned).toBe(0);
  if (off.styleRecalc != null) {
    expect(off.styleRecalc).toBe(0);
  }

  // Control: Storybook's module kept on reads the style of every element on
  // the page inside the inserting task.
  const control = await page.context().newPage();
  await control.addInitScript(countStyleReads);
  await openStory(control, storybook(), 'core-button--primary', undefined, {
    storybookHighlight: true,
  });
  expect(await control.locator('#storybook-highlights-root').count()).toBe(1);
  const on = await measure(control);
  expect(on.copy.scanned).toBeGreaterThanOrEqual(on.copy.elements);
  if (on.styleRecalc != null) {
    expect(on.styleRecalc).toBeGreaterThan(0);
  }
  await control.close();
});

test("a WebKit touch driver created after openStory tells a page task's wait from the page's listeners", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'webkit',
    'only WebKit stamps a touch when it arrives; Chromium carries the scripted times',
  );
  // Each pointer move queues a 60 ms task, as a component's timer can. The
  // listener itself returns at once, so the next move waits for the task
  // before the page's listeners begin. The driver comes after the story
  // loads, as in most proofs.
  await page.addInitScript(
    'addEventListener("pointermove",()=>{setTimeout(()=>{const end=performance.now()+60;while(performance.now()<end){}},0)});',
  );
  await openStory(page, storybook(), 'core-button--primary');
  await page.addStyleTag({
    content: 'html, body { margin: 0; height: 3000px; touch-action: none; }',
  });
  const driver = await touchDriver(page);
  const outcome = await driver
    .play(drag({x: 200, y: 400}, {x: 200, y: 300}, {durationMs: 100, hz: 60}), {
      pacing: 'spacing',
    })
    .then(
      () => 'resolved',
      (error: unknown) => error,
    );
  expect(outcome).toBeInstanceOf(TouchPacingError);
  expect(String(outcome)).toMatch(
    /an event waited \d+ ms for the main thread before the page's listeners began/,
  );
});
