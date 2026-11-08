// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ToastViewport.hostMove.interaction.browser.spec.ts
 * @input The AppToastOverDialog, AppToastOverDialogClosedAfterSave and
 *   AppToastOverDrawer stories, recorded frame by frame
 * @output Tests that a toast plays its entrance once. A Dialog or a modal
 *   Drawer that opens or closes over it moves the viewport. The toast does not
 *   enter again: its row and card start no transition. A Dialog that closes
 *   after a save does not hide the toast for a frame. A move before anything
 *   has seen the entrance start shows one entrance
 * @position Testing; validates ToastViewport.tsx and Toast.tsx in a real
 *   browser
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  openStory,
  waitForRest,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

const STORY = 'core-toast--app-toast-over-dialog';
const DRAWER_STORY = 'core-toast--app-toast-over-drawer';
const SAVE_STORY = 'core-toast--app-toast-over-dialog-closed-after-save';
const MESSAGE = 'Toast from inside the dialog!';

/** The toast's card on one frame. */
interface Frame {
  opacity: number;
  /** Whether the card was inside a dialog, the viewport's modal outlet. */
  isInDialog: boolean;
  /** Whether the card had a box. A dialog that no longer displays has none. */
  hasBox: boolean;
}

/** What the recorder saw of the toast's card. */
interface Recording {
  /** The card on each frame it was in the page. */
  frames: Frame[];
  /** The opacity transitions the card ran: one for each entrance. */
  entrances: number;
  /**
   * Each CSS transition or animation that started on the toast's row or card,
   * as `part property`: `card transform`.
   */
  starts: string[];
}

interface Recorder {
  frames: Frame[];
  transitions: Set<Animation>;
  starts: string[];
  isRecording: boolean;
}

/** Records the toast card's opacity and its opacity transitions on each frame. */
async function startRecording(page: Page): Promise<void> {
  await page.evaluate(() => {
    const recorder: Recorder = {
      frames: [],
      transitions: new Set(),
      starts: [],
      isRecording: true,
    };
    (window as unknown as {__toastRecorder: Recorder}).__toastRecorder =
      recorder;
    // A move that renders the toast again from its starting style starts a
    // transition, even toward the values it already shows.
    const onStart = (event: Event) => {
      const {target} = event;
      if (!recorder.isRecording || !(target instanceof Element)) {
        return;
      }
      const part = target.matches('[data-toast-id]')
        ? 'row'
        : target.matches('[data-toast-id] .astryx-toast')
          ? 'card'
          : null;
      if (part == null) {
        return;
      }
      const property =
        event instanceof TransitionEvent
          ? event.propertyName
          : (event as AnimationEvent).animationName;
      recorder.starts.push(`${part} ${property}`);
    };
    document.addEventListener('transitionrun', onStart, true);
    document.addEventListener('animationstart', onStart, true);
    const record = () => {
      const card = document.querySelector('[data-toast-id] .astryx-toast');
      if (card != null) {
        recorder.frames.push({
          opacity: Number(getComputedStyle(card).opacity),
          isInDialog: card.closest('dialog') != null,
          hasBox: card.getClientRects().length > 0,
        });
        for (const animation of card.getAnimations()) {
          if (
            animation instanceof CSSTransition &&
            animation.transitionProperty === 'opacity'
          ) {
            recorder.transitions.add(animation);
          }
        }
      }
      if (recorder.isRecording) {
        requestAnimationFrame(record);
      }
    };
    requestAnimationFrame(record);
  });
}

async function stopRecording(page: Page): Promise<Recording> {
  return page.evaluate(() => {
    const recorder = (window as unknown as {__toastRecorder: Recorder})
      .__toastRecorder;
    recorder.isRecording = false;
    return {
      frames: recorder.frames,
      entrances: recorder.transitions.size,
      starts: recorder.starts,
    };
  });
}

/**
 * The starts the recorder has seen so far, such as `card opacity` and
 * `row grid-template-rows`.
 */
async function startsSoFar(page: Page): Promise<string[]> {
  return page.evaluate(() => [
    ...(window as unknown as {__toastRecorder: Recorder}).__toastRecorder
      .starts,
  ]);
}

/**
 * Closes the Dialog in the frame of the new toast's first style computation,
 * which starts its entrance. A resize observer runs after that frame's layout.
 * In Chromium, the row's `transitionrun` comes a frame later, so nothing has
 * seen the entrance start when the Dialog closes. It records the recorder's
 * starts then.
 */
async function closeBeforeEntranceIsSeen(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = window as unknown as {
      __toastRecorder: Recorder;
      __startsAtClose: string[] | null;
    };
    target.__startsAtClose = null;
    const resizeObserver = new ResizeObserver(() => {
      resizeObserver.disconnect();
      target.__startsAtClose = [...target.__toastRecorder.starts];
      const button = [...document.querySelectorAll('dialog button')].find(
        candidate => candidate.textContent === 'Close',
      );
      if (button instanceof HTMLElement) {
        button.click();
      }
    });
    const observer = new MutationObserver(() => {
      const row = document.querySelector('[data-toast-id]');
      if (row == null) {
        return;
      }
      observer.disconnect();
      resizeObserver.observe(row);
    });
    observer.observe(document.body, {subtree: true, childList: true});
  });
}

/** The starts the recorder had seen when the Dialog closed, or null. */
async function startsAtClose(page: Page): Promise<string[] | null> {
  return page.evaluate(
    () =>
      (window as unknown as {__startsAtClose: string[] | null}).__startsAtClose,
  );
}

/** How many frames the recorder has seen the card in a dialog so far. */
async function framesInDialog(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (
        window as unknown as {__toastRecorder: Recorder}
      ).__toastRecorder.frames.filter(frame => frame.isInDialog).length,
  );
}

/** How many frames the recorder has seen the card so far. */
async function frameCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window as unknown as {__toastRecorder: Recorder}).__toastRecorder.frames
        .length,
  );
}

/** The card's places in frame order, each run once: `['dialog', 'page']`. */
function placesOf(frames: Frame[]): string[] {
  const places: string[] = [];
  for (const {isInDialog} of frames) {
    const place = isInDialog ? 'dialog' : 'page';
    if (places.at(-1) !== place) {
      places.push(place);
    }
  }
  return places;
}

/** Whether the card faded back out after it had shown: a second entrance. */
function fadesBack(frames: Frame[]): boolean {
  let hasShown = false;
  for (const {opacity} of frames) {
    if (opacity > 0.9) {
      hasShown = true;
    } else if (hasShown && opacity < 0.3) {
      return true;
    }
  }
  return false;
}

/**
 * Counts each DOM change after which the card sits in a dialog that no longer
 * displays. A frame painted then shows no toast.
 */
async function watchHiddenCard(page: Page): Promise<void> {
  await page.evaluate(() => {
    const watch = {count: 0};
    (window as unknown as {__hiddenCard: {count: number}}).__hiddenCard = watch;
    new MutationObserver(() => {
      const dialog = document
        .querySelector('[data-toast-id] .astryx-toast')
        ?.closest('dialog');
      if (dialog != null && getComputedStyle(dialog).display === 'none') {
        watch.count += 1;
      }
    }).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'open'],
    });
  });
}

async function hiddenCardCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window as unknown as {__hiddenCard: {count: number}}).__hiddenCard.count,
  );
}

async function openDialog(page: Page) {
  await page.getByRole('button', {name: 'Open dialog'}).click();
  const dialog = page.getByRole('dialog');
  await waitForRest(dialog);
  return dialog;
}

const toastRow = (page: Page) => page.locator('[data-toast-id]');

/** The message in the toast's row, not in the viewport's live region. */
const toastText = (page: Page) => toastRow(page).getByText(MESSAGE);

/** Whether the toast row's entry transition runs. */
async function isEntering(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const row = document.querySelector('[data-toast-id]');
    return (
      row != null &&
      row
        .getAnimations()
        .some(
          animation =>
            animation instanceof CSSTransition &&
            animation.transitionProperty === 'grid-template-rows' &&
            animation.playState === 'running',
        )
    );
  });
}

/**
 * The overflow of the row's clip. A settled row releases it, so the card's
 * shadow paints.
 */
async function rowOverflow(page: Page): Promise<string> {
  return page.evaluate(() => {
    const clip = document.querySelector('[data-toast-id] > div');
    return clip == null ? '' : getComputedStyle(clip).overflow;
  });
}

/** The row is shown, with a height, after the move. */
async function expectRowShown(page: Page) {
  await expect(toastRow(page)).toBeVisible();
  const box = await toastRow(page).boundingBox();
  expect(box?.height ?? 0).toBeGreaterThan(0);
}

const opacitiesOf = (frames: Frame[]) => frames.map(frame => frame.opacity);

test.describe('a toast in a top-layer viewport', () => {
  test('a new toast plays its entrance once', async ({page}) => {
    await openStory(page, storybook(), STORY);
    // A slow entrance, so the recorder sees its first frames on a busy runner.
    await page.addStyleTag({
      content:
        '[data-toast-id], [data-toast-id] * { --duration-fast: 1500ms !important; }',
    });
    const dialog = await openDialog(page);
    await startRecording(page);
    await dialog.getByRole('button', {name: 'Show toast'}).click();
    await expect(toastText(page)).toBeVisible();
    await waitForRest(toastRow(page));
    const {frames, entrances, starts} = await stopRecording(page);
    await expectRowShown(page);
    expect(placesOf(frames)).toEqual(['dialog']);
    // It fades in from nearly clear to fully shown.
    expect(Math.min(...opacitiesOf(frames))).toBeLessThan(0.5);
    expect(Math.max(...opacitiesOf(frames))).toBeGreaterThan(0.99);
    expect(entrances).toBe(1);
    // The start recorder sees an entrance, so its empty lists below count.
    expect(starts).toEqual(
      expect.arrayContaining(['row grid-template-rows', 'card opacity']),
    );
  });

  test('a toast moved during its entrance finishes it once and settles', async ({
    page,
  }) => {
    await openStory(page, storybook(), STORY);
    // A slow entrance, so the move lands inside it on any runner.
    await page.addStyleTag({
      content:
        '[data-toast-id], [data-toast-id] * { --duration-fast: 1500ms !important; }',
    });
    const dialog = await openDialog(page);
    await startRecording(page);
    await dialog.getByRole('button', {name: 'Show toast'}).click();
    await expect.poll(async () => framesInDialog(page)).toBeGreaterThan(0);
    // The row has seen its entrance start. A close before that is the next
    // test's case.
    await expect
      .poll(async () => startsSoFar(page))
      .toContain('row grid-template-rows');
    expect(await isEntering(page)).toBe(true);
    await dialog.getByRole('button', {name: 'Close'}).click();
    await expect(dialog).toBeHidden();
    await expect(toastText(page)).toBeVisible();
    await expect.poll(async () => rowOverflow(page)).toBe('visible');
    const {frames, entrances} = await stopRecording(page);
    await expectRowShown(page);
    expect(placesOf(frames)).toEqual(['dialog', 'page']);
    expect(fadesBack(frames)).toBe(false);
    expect(entrances).toBe(1);
  });

  test('a toast closed out of its Dialog before its entrance is seen enters once on the page', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      "In WebKit the row's transitionrun has already fired when the first resize observer callback runs, so this close cannot land before it.",
    );
    await openStory(page, storybook(), STORY);
    // A slow entrance, so a second one would show on any runner.
    await page.addStyleTag({
      content:
        '[data-toast-id], [data-toast-id] * { --duration-fast: 1500ms !important; }',
    });
    const dialog = await openDialog(page);
    await closeBeforeEntranceIsSeen(page);
    await startRecording(page);
    await dialog.getByRole('button', {name: 'Show toast'}).click();
    await expect(dialog).toBeHidden();
    // The close came before the row saw its entrance start.
    const startsWhenClosed = await startsAtClose(page);
    expect(startsWhenClosed).not.toBeNull();
    expect(startsWhenClosed).not.toContain('row grid-template-rows');
    await expect(toastText(page)).toBeVisible();
    await expect.poll(async () => rowOverflow(page)).toBe('visible');
    await waitForRest(toastRow(page));
    // The recorder sees the row's start after the close.
    expect(await startsSoFar(page)).toContain('row grid-template-rows');
    const {frames} = await stopRecording(page);
    await expectRowShown(page);
    expect(placesOf(frames)).toEqual(['dialog', 'page']);
    // What a person sees: the card fades in once on the page and stays at
    // full opacity. The frame recorded in the Dialog reads before paint.
    expect(
      Math.min(...opacitiesOf(frames.filter(frame => !frame.isInDialog))),
    ).toBeLessThan(0.5);
    expect(fadesBack(frames)).toBe(false);
    expect(frames.at(-1)?.opacity).toBeGreaterThan(0.99);
  });

  test('a toast already shown stays still when the Dialog that hosts it closes', async ({
    page,
  }) => {
    await openStory(page, storybook(), STORY);
    const dialog = await openDialog(page);
    await dialog.getByRole('button', {name: 'Show toast'}).click();
    await waitForRest(toastRow(page));
    await startRecording(page);
    await expect.poll(async () => framesInDialog(page)).toBeGreaterThan(0);
    await dialog.getByRole('button', {name: 'Close'}).click();
    await expect(dialog).toBeHidden();
    await waitForRest(toastRow(page));
    const {frames, entrances, starts} = await stopRecording(page);
    await expectRowShown(page);
    expect(placesOf(frames)).toEqual(['dialog', 'page']);
    expect(Math.min(...opacitiesOf(frames))).toBeGreaterThan(0.99);
    expect(entrances).toBe(0);
    expect(starts).toEqual([]);
  });

  test('a toast already shown stays still when a Dialog opens over it', async ({
    page,
  }) => {
    await openStory(page, storybook(), STORY);
    const dialog = await openDialog(page);
    await dialog.getByRole('button', {name: 'Show toast'}).click();
    await dialog.getByRole('button', {name: 'Close'}).click();
    await expect(dialog).toBeHidden();
    await waitForRest(toastRow(page));
    await startRecording(page);
    await expect.poll(async () => frameCount(page)).toBeGreaterThan(0);
    await openDialog(page);
    await waitForRest(toastRow(page));
    const {frames, entrances, starts} = await stopRecording(page);
    await expectRowShown(page);
    // The toast moved into the dialog that opened.
    expect(placesOf(frames)).toEqual(['page', 'dialog']);
    expect(Math.min(...opacitiesOf(frames))).toBeGreaterThan(0.99);
    expect(entrances).toBe(0);
    expect(starts).toEqual([]);
  });

  test('a toast already shown stays still when a modal Drawer closes over it and opens again', async ({
    page,
  }) => {
    await openStory(page, storybook(), DRAWER_STORY);
    await page
      .getByRole('button', {name: 'Open candidate', exact: true})
      .click();
    const drawer = page.getByRole('dialog', {name: 'Candidate'});
    await waitForRest(drawer);
    await drawer.getByRole('button', {name: 'Move to Interview'}).click();
    await waitForRest(toastRow(page));
    await startRecording(page);
    await expect.poll(async () => framesInDialog(page)).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await waitForRest(toastRow(page));
    await page
      .getByRole('button', {name: 'Open candidate', exact: true})
      .click();
    await waitForRest(drawer);
    await waitForRest(toastRow(page));
    const {frames, entrances, starts} = await stopRecording(page);
    await expectRowShown(page);
    expect(placesOf(frames)).toEqual(['dialog', 'page', 'dialog']);
    expect(Math.min(...opacitiesOf(frames))).toBeGreaterThan(0.99);
    expect(entrances).toBe(0);
    expect(starts).toEqual([]);
  });

  test('a toast stays painted when the Dialog that hosts it closes after a save', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    // A frame without the toast does not show at every close, so the case
    // closes the Dialog in eight fresh documents.
    for (let session = 0; session < 8; session += 1) {
      await openStory(page, storybook(), SAVE_STORY);
      const dialog = await openDialog(page);
      await watchHiddenCard(page);
      await startRecording(page);
      // Save shows the toast, then closes the dialog when the save finishes.
      // That close is outside a click, so the browser can paint before the
      // passive effects run.
      await dialog.getByRole('button', {name: 'Save'}).click();
      await expect(dialog).toBeHidden();
      await waitForRest(toastRow(page));
      const {frames, starts} = await stopRecording(page);
      await expect(toastRow(page).getByText('Saving the item.')).toBeVisible();
      await expectRowShown(page);
      expect(placesOf(frames)).toEqual(['dialog', 'page']);
      // No DOM change left the card in a dialog that no longer displays.
      expect(await hiddenCardCount(page)).toBe(0);
      expect(frames.every(frame => frame.hasBox)).toBe(true);
      // At 1×, the card's opacity and the row's grid each start once.
      // Transition events arrive however late the frames are.
      expect(starts.filter(start => start === 'card opacity')).toHaveLength(1);
      expect(
        starts.filter(start => start === 'row grid-template-rows'),
      ).toHaveLength(1);
    }
  });
});
