// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file modal-dialog.chromium.spec.ts
 * @input Uses the modal-dialog contract, its plain-HTML fixtures, the Chromium
 *   harness, and checkAccessibilitySpec
 * @output Positive and negative proof for browser-owned modal-dialog outcomes
 * @position Real-browser self-test of the contract, not a component binding.
 */

import {expect, test, type CDPSession, type Page} from '@playwright/test';
import {
  MissingBindingCapability,
  checkAccessibilitySpec,
  type ExpectationResult,
} from '../check';
import {describeExpectation, requiredLayers} from '../contract';
import {
  CHROMIUM_OBSERVES,
  createChromiumHarness,
  holdMotionStill,
} from '../harness/chromium';
import {MODAL_DIALOG_PATTERN} from './modal-dialog';
import {
  MODAL_DIALOG_CONFORMING_FIXTURES,
  MODAL_DIALOG_MUTATIONS,
  MODAL_DIALOG_SUBJECT_SELECTOR,
  modalDialogFixture,
  type ModalDialogFixture,
} from './modal-dialog.fixtures';

function fixturePage(target: ModalDialogFixture): string {
  const method = target.presentation === 'nonmodal' ? 'show' : 'showModal';
  const present = target.focusBeforeModalPresentation
    ? `subject.show(); const initial = subject.querySelector('[data-a11y-relation~=initial]'); if (initial instanceof HTMLElement) initial.focus(); subject.close(); subject.showModal();`
    : `subject.${method}();`;
  return `<!doctype html><html lang="en"><body><button type="button" data-a11y-relation="invoker" onclick="const subject = document.querySelector('${MODAL_DIALOG_SUBJECT_SELECTOR}'); if (subject instanceof HTMLDialogElement && !subject.open) { ${present} }">Open dialog</button>${target.html}<button type="button" data-a11y-relation="background">Background action</button></body></html>`;
}

async function results(
  page: Page,
  cdp: CDPSession,
  target: ModalDialogFixture,
  only?: readonly string[],
): Promise<readonly ExpectationResult[]> {
  let focusEntryWasModal: boolean | undefined;
  const run = await checkAccessibilitySpec({
    spec: MODAL_DIALOG_PATTERN,
    binding: 'fixture',
    state: target.id,
    facts: target.facts,
    only,
    mount: async () => {
      await page.setContent(fixturePage(target));
      await holdMotionStill(page);
      const subject = page.locator(MODAL_DIALOG_SUBJECT_SELECTOR);
      await subject.evaluate(dialog => {
        dialog.setAttribute('data-a11y-focus-entry-modal', 'unobserved');
        const recordFirstEntry = (event: FocusEvent) => {
          if (event.target instanceof Node && dialog.contains(event.target)) {
            dialog.setAttribute(
              'data-a11y-focus-entry-modal',
              String(dialog.matches(':modal')),
            );
            document.removeEventListener('focusin', recordFirstEntry, true);
          }
        };
        document.addEventListener('focusin', recordFirstEntry, true);
      });
      await page.locator('[data-a11y-relation="invoker"]').click();
      const recordedFocusEntry = await subject.getAttribute(
        'data-a11y-focus-entry-modal',
      );
      focusEntryWasModal =
        recordedFocusEntry === 'true'
          ? true
          : recordedFocusEntry === 'false'
            ? false
            : undefined;
      if (target.moveFocusOutsideAfterOpen === true) {
        await page.locator('[data-a11y-relation="background"]').focus();
      }
      const visibleLabel = page.locator('[data-a11y-visible-label]');
      return createChromiumHarness({
        page,
        subject,
        visibleLabel: (await visibleLabel.count()) === 0 ? null : visibleLabel,
        cdp,
        related: {
          initial: page.locator('[data-a11y-relation~="initial"]'),
          close: page.locator('[data-a11y-relation~="close"]'),
          invoker: page.locator('[data-a11y-relation~="invoker"]'),
          background: page.locator('[data-a11y-relation~="background"]'),
        },
      });
    },
    initialFocusEntry: async () => {
      if (focusEntryWasModal === undefined) {
        throw new MissingBindingCapability(
          'modal-dialog fixture supplies no focus-entry observation',
        );
      }
      return {subjectWasModal: focusEntryWasModal};
    },
  });
  return run.results;
}

test.describe('modal-dialog contract — conforming fixtures', () => {
  for (const id of MODAL_DIALOG_CONFORMING_FIXTURES) {
    test(`${id}: every applicable expectation passes`, async ({page}) => {
      const cdp = await page.context().newCDPSession(page);
      const observed = await results(page, cdp, modalDialogFixture(id));
      const notPassing = observed.filter(
        result =>
          result.status !== 'pass' && result.status !== 'not-applicable',
      );
      expect(
        notPassing.map(
          result => `${result.expectation}: ${result.detail ?? ''}`,
        ),
      ).toEqual([]);
    });
  }
});

test.describe('modal-dialog contract — deliberately violating fixtures', () => {
  for (const expectation of MODAL_DIALOG_PATTERN.expectations) {
    if (
      !requiredLayers(expectation).every(layer =>
        CHROMIUM_OBSERVES.includes(layer),
      )
    ) {
      continue;
    }
    for (const fixtureId of MODAL_DIALOG_MUTATIONS[expectation.id] ?? []) {
      test(`${describeExpectation(expectation)} — fails against ${fixtureId}`, async ({
        page,
      }) => {
        const cdp = await page.context().newCDPSession(page);
        const [result] = await results(
          page,
          cdp,
          modalDialogFixture(fixtureId),
          [expectation.id],
        );
        expect(result?.status, result?.detail ?? 'no result').toBe('fail');
      });
    }
  }
});
