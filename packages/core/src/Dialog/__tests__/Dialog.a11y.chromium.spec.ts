// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file Dialog.a11y.chromium.spec.ts
 * @input Uses the modal-dialog contract, Chromium harness, static Storybook,
 *   dedicated Dialog stories, state inventory, and exact known failures
 * @output Browser-owned Dialog binding evidence for native modality,
 *   accessibility-tree exposure, focus entry and return, and background inertness
 * @position High-fidelity lane; jsdom binds only DOM semantics.
 */

import {
  expect,
  test,
  type CDPSession,
  type Locator,
  type Page,
} from '@playwright/test';
import {
  MissingBindingCapability,
  MODAL_DIALOG_PATTERN,
  blockingResults,
  checkAccessibilitySpec,
  formatFailures,
  formatReport,
  neverExercised,
  summarize,
  unmatchedKnownFailures,
  type BindingResult,
} from '@astryxdesign/a11y-spec';
import {
  createChromiumHarness,
  holdMotionStill,
} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';
import {DIALOG_MODAL_KNOWN_FAILURES} from './Dialog.a11y.known-failures';
import {
  DIALOG_CONTRACT_BACKGROUND_LABEL,
  DIALOG_CONTRACT_CLOSE_LABEL,
  DIALOG_CONTRACT_OPEN_LABEL,
  DIALOG_MODAL_BINDING_STATES,
  type DialogModalBindingState,
} from './Dialog.a11y.states';

let storybook: StaticServer;

type ModalFocusEntryGlobal = typeof globalThis & {
  __astryxModalFocusEntryRecorderInstalled?: boolean;
  __astryxModalFocusEntryWasModal?: boolean;
};

async function installModalFocusEntryRecorder(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const runtime = globalThis as ModalFocusEntryGlobal;
    if (runtime.__astryxModalFocusEntryRecorderInstalled === true) {
      return;
    }
    runtime.__astryxModalFocusEntryRecorderInstalled = true;
    runtime.__astryxModalFocusEntryWasModal = undefined;
    document.addEventListener(
      'focusin',
      event => {
        if (runtime.__astryxModalFocusEntryWasModal !== undefined) {
          return;
        }
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        const dialog = target.closest('dialog');
        if (dialog instanceof HTMLDialogElement) {
          runtime.__astryxModalFocusEntryWasModal = dialog.matches(':modal');
        }
      },
      true,
    );
  });
}

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => {
  await storybook?.close();
});

async function mountState(
  page: Page,
  state: DialogModalBindingState,
): Promise<{
  readonly root: Locator;
  readonly subject: Locator;
  readonly focusEntryWasModal: boolean | undefined;
}> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${state.storyId}&viewMode=story`,
    {waitUntil: 'load'},
  );
  await holdMotionStill(page);
  const root = page.locator('#storybook-root');
  const subject = root.locator('dialog');
  await root.getByRole('button', {name: DIALOG_CONTRACT_OPEN_LABEL}).click();
  await expect
    .poll(async () => subject.evaluate(element => element.matches(':modal')))
    .toBe(true);
  const focusEntryWasModal = await page.evaluate(() => {
    const runtime = globalThis as ModalFocusEntryGlobal;
    return runtime.__astryxModalFocusEntryWasModal;
  });
  return {root, subject, focusEntryWasModal};
}

function initialTarget(
  root: Locator,
  subject: Locator,
  state: DialogModalBindingState,
): Locator {
  switch (state.initialTarget.kind) {
    case 'dialog':
      return subject;
    case 'heading':
      return root.getByRole('heading', {name: state.initialTarget.name});
    case 'textbox':
      return root.getByRole('textbox', {name: state.initialTarget.name});
  }
}

async function runState(
  page: Page,
  cdp: CDPSession,
  state: DialogModalBindingState,
): Promise<BindingResult> {
  await installModalFocusEntryRecorder(page);
  let focusEntryWasModal: boolean | undefined;
  return checkAccessibilitySpec({
    spec: MODAL_DIALOG_PATTERN,
    binding: 'Dialog',
    state: state.id,
    facts: state.facts,
    knownFailures: DIALOG_MODAL_KNOWN_FAILURES,
    mount: async () => {
      const mounted = await mountState(page, state);
      const {root, subject} = mounted;
      focusEntryWasModal = mounted.focusEntryWasModal;
      return createChromiumHarness({
        page,
        subject,
        visibleLabel:
          state.visibleTitle == null
            ? null
            : root.getByRole('heading', {name: state.visibleTitle}),
        cdp,
        related: {
          initial: initialTarget(root, subject, state),
          close: root.getByRole('button', {name: DIALOG_CONTRACT_CLOSE_LABEL}),
          invoker: root.getByRole('button', {
            name: DIALOG_CONTRACT_OPEN_LABEL,
          }),
          background: root.getByRole('button', {
            name: DIALOG_CONTRACT_BACKGROUND_LABEL,
          }),
        },
      });
    },
    initialFocusEntry: async () => {
      if (focusEntryWasModal === undefined) {
        throw new MissingBindingCapability(
          'Dialog binding supplies no focus-entry observation',
        );
      }
      return {subjectWasModal: focusEntryWasModal};
    },
  });
}

// Each state's result, recorded by its own test below so the whole-suite check
// at the end reads it instead of measuring every state a second time. A state
// whose test did not run in this worker (a filtered run, or a worker restarted
// after a failure) is measured by the whole-suite check itself.
const recorded = new Map<string, BindingResult>();

for (const state of DIALOG_MODAL_BINDING_STATES) {
  test(`Dialog [${state.id}] — ${state.summary}`, async ({page}) => {
    const cdp = await page.context().newCDPSession(page);
    const result = await runState(page, cdp, state);
    recorded.set(state.id, result);
    const report = summarize(MODAL_DIALOG_PATTERN, [result]);
    // eslint-disable-next-line no-console -- the report is this run's artifact
    console.log(formatReport(report));

    expect(formatFailures(blockingResults([result]))).toBe('');
    expect(report.unrunLayers).toEqual([]);
    expect(report.counts.unexpectedPass).toBe(0);
  });
}

test('every expectation is exercised and every known failure matches once', async ({
  page,
}) => {
  test.setTimeout(5 * 60 * 1000);
  const cdp = await page.context().newCDPSession(page);
  const results: BindingResult[] = [];
  for (const state of DIALOG_MODAL_BINDING_STATES) {
    results.push(recorded.get(state.id) ?? (await runState(page, cdp, state)));
  }
  expect(neverExercised(results)).toEqual([]);
  expect(unmatchedKnownFailures(DIALOG_MODAL_KNOWN_FAILURES, results)).toEqual(
    [],
  );
});
