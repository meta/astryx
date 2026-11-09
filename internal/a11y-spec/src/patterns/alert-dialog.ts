// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file alert-dialog.ts
 * @input WCAG 2.2 A/AA success criteria and the APG Alert Dialog pattern's role, name, description, modality, focus, and dismissal requirements
 * @output ALERT_DIALOG_PATTERN — the reusable contract a confirmation surface binds to when it adopts the pattern (AlertDialog under component:AlertDialog AR1, `spec:AST-020/FR15`)
 * @position Pattern contract; bound by AlertDialog. Modal mechanics (top layer, inert page, focus restoration) stay with the modal-dialog contract the composed Dialog binds
 */

import {
  definePattern,
  type ApgRequirement,
  type PatternContract,
  type WcagCriterion,
} from '../contract';

const APG_URL = 'https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/';
const APG_DIALOG_URL = 'https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/';
const UNDERSTANDING = 'https://www.w3.org/WAI/WCAG22/Understanding';

const WCAG_1_3_1: WcagCriterion = {
  standard: 'wcag',
  id: '1.3.1',
  name: 'Info and Relationships',
  level: 'A',
  url: `${UNDERSTANDING}/info-and-relationships.html`,
};
const WCAG_2_1_1: WcagCriterion = {
  standard: 'wcag',
  id: '2.1.1',
  name: 'Keyboard',
  level: 'A',
  url: `${UNDERSTANDING}/keyboard.html`,
};
const WCAG_4_1_2: WcagCriterion = {
  standard: 'wcag',
  id: '4.1.2',
  name: 'Name, Role, Value',
  level: 'A',
  url: `${UNDERSTANDING}/name-role-value.html`,
};

const apgReq = (requirement: string, anchor: string): ApgRequirement => ({
  standard: 'apg',
  pattern: 'alertdialog',
  requirement,
  url: `${APG_URL}#${anchor}`,
});
// The Alert Dialog page defers keyboard behaviour to the Dialog (Modal)
// pattern; its focus note and Escape row are quoted from that page.
const apgDialogReq = (requirement: string, anchor: string): ApgRequirement => ({
  standard: 'apg',
  pattern: 'dialog-modal',
  requirement,
  url: `${APG_DIALOG_URL}#${anchor}`,
});
const A = 'wai-ariaroles,states,andproperties';
const K = 'keyboardinteraction';
const APG_ROLE = apgReq(
  'The element that contains all elements of the dialog, including the alert message and any dialog buttons, has role alertdialog.',
  A,
);
const APG_NAME = apgReq(
  'The element with role alertdialog has either a value for aria-labelledby that refers to the element containing the title of the dialog if the dialog has a visible label, or a value for aria-label if the dialog does not have a visible label.',
  A,
);
const APG_DESCRIPTION = apgReq(
  'The element with role alertdialog has a value set for aria-describedby that refers to the element containing the alert message.',
  A,
);
const APG_MODAL = apgReq(
  "An alert dialog is a modal dialog that interrupts the user's workflow to communicate an important message and acquire a response.",
  'about-this-pattern',
);
const APG_FOCUS = apgDialogReq(
  'When a dialog opens, focus moves to an element contained in the dialog. Generally, focus is initially set on the first focusable element. However, the most appropriate focus placement will depend on the nature and size of the content. [...] it may be advisable to set focus on the least destructive action.',
  K,
);
const APG_ESCAPE = apgDialogReq('Escape: Closes the dialog.', K);

/**
 * What a binding knows about one alert dialog (the subject). The binding also
 * designates two related subjects: `message`, the element the surface is
 * described by, and `cancel`, the least destructive action.
 */
export interface AlertDialogStateFacts {
  /** Whether the surface is presented as a modal dialog (an inline preview is not). */
  readonly modal: boolean;
  /** Whether Escape is meant to close it. */
  readonly dismissesOnEscape: boolean;
  /** Whether a click beside it (on the dimmed page) is meant to close it. */
  readonly dismissesOnBackdrop: boolean;
}

const MODAL_ONLY = {
  condition: 'the binding presents the surface as a modal alert dialog',
  test: (facts: AlertDialogStateFacts) => facts.modal,
};

export const ALERT_DIALOG_PATTERN: PatternContract<AlertDialogStateFacts> =
  definePattern<AlertDialogStateFacts>({
    pattern: 'alertdialog',
    url: APG_URL,
    scope:
      "A confirmation surface's alertdialog role, its title and message references, its modality, where focus lands when it opens, and whether Escape and a click beside it dismiss it. Top-layer, inert-page and focus-restoration mechanics belong to the modal-dialog contract the composed Dialog binds.",
    expectations: [
      {
        id: 'alertdialog.role.exposed',
        outcome:
          'The browser exposes the surface as an alert dialog, so a screen reader announces it as an interruption that needs an answer.',
        sources: [WCAG_4_1_2, APG_ROLE],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: MODAL_ONLY,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {role} = await subject.computed();
          if (role !== 'alertdialog') {
            throw new Error(
              role == null
                ? 'the browser exposes no role for this surface'
                : `the browser reports this surface as "${role}", not as an alert dialog`,
            );
          }
        },
      },
      {
        id: 'alertdialog.name.exposed',
        outcome:
          'The surface is named by its title, so a user hears what they are being asked.',
        sources: [WCAG_4_1_2, APG_NAME],
        covers: [
          '4.1.2-name-role-value',
          '2.4.6-headings-and-labels',
          'apg-interaction',
        ],
        appliesWhen: MODAL_ONLY,
        evidenceLayer: 'accessibility-tree',
        enforcement: 'required',
        run: async ({subject}) => {
          const {name} = await subject.computed();
          if (!name || name.trim() === '') {
            throw new Error(
              'the browser computes no accessible name for this surface',
            );
          }
        },
      },
      {
        id: 'alertdialog.description.references-message',
        outcome:
          'The surface is described by its message, so a screen reader reads the consequence with the title.',
        sources: [WCAG_1_3_1, APG_DESCRIPTION],
        covers: ['1.3.1-info-and-relationships', 'apg-interaction'],
        appliesWhen: MODAL_ONLY,
        evidenceLayer: 'dom',
        enforcement: 'required',
        run: async ({harness, subject}) => {
          const describedBy = await subject.attribute('aria-describedby');
          if (describedBy == null || describedBy.trim() === '') {
            throw new Error('the surface carries no aria-describedby');
          }
          const message = await harness.related('message');
          if (
            !(await harness.references(subject, 'aria-describedby', message))
          ) {
            throw new Error(
              `aria-describedby points at "${describedBy}", not at the message the binding designates`,
            );
          }
          const text = (await message.textContent()).trim();
          if (text === '') {
            throw new Error('the referenced message is empty');
          }
        },
      },
      {
        id: 'alertdialog.modal.exposed',
        outcome:
          'The surface is modal, so the page behind it is out of reach until the user answers.',
        sources: [WCAG_4_1_2, APG_MODAL],
        covers: ['4.1.2-name-role-value', 'apg-interaction'],
        appliesWhen: MODAL_ONLY,
        evidenceLayer: 'real-browser',
        enforcement: 'required',
        run: async ({subject}) => {
          if (!(await subject.isModal())) {
            throw new Error(
              'the surface is not an active modal in the top layer',
            );
          }
        },
      },
      {
        id: 'alertdialog.focus.least-destructive-first',
        outcome:
          'Focus opens on the least destructive action, so Enter never confirms the irreversible step by accident.',
        sources: [APG_FOCUS],
        wcagOutcome:
          'Supports WCAG 2.2 2.4.3 by putting focus on the safe choice first; the APG guides which control, so this row is advisory until the binding record is current (AST-020 FR9).',
        covers: ['2.4.3-focus-order', 'apg-interaction'],
        appliesWhen: MODAL_ONLY,
        evidenceLayer: 'real-browser',
        enforcement: 'advisory',
        advisoryBecause:
          "Which control takes initial focus is APG guidance, adopted by the binding's draft record; required once that record is current (AST-020 FR9).",
        run: async ({harness}) => {
          const cancel = await harness.related('cancel');
          if (!(await cancel.isFocused())) {
            throw new Error(
              'the least destructive action does not hold focus when the surface opens',
            );
          }
        },
      },
      {
        id: 'alertdialog.keys.escape',
        outcome:
          'Escape closes the surface when the binding allows it, so a keyboard user can back out without finding Cancel.',
        sources: [WCAG_2_1_1, APG_ESCAPE],
        covers: ['2.1.1-keyboard', 'apg-interaction'],
        appliesWhen: {
          condition: 'the surface is modal and Escape is meant to close it',
          test: facts => facts.modal && facts.dismissesOnEscape,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'required',
        run: async ({harness, subject}) => {
          const cancel = await harness.related('cancel');
          await cancel.focus();
          await harness.press('Escape');
          if (await subject.isVisible()) {
            throw new Error('Escape left the surface open');
          }
        },
      },
      {
        id: 'alertdialog.dismissal.click-beside-is-inert',
        outcome:
          'A click on the dimmed page beside the surface does not dismiss it, so an accidental click never discards the decision.',
        sources: [APG_MODAL],
        wcagOutcome:
          "Keeps the question on screen until the user answers it, so a stray click cannot discard an irreversible choice unanswered (APG Alert Dialog: a modal that interrupts the workflow to acquire a response). No WCAG success criterion maps to it — 3.2.2 covers changing a control's setting, which a click beside the dialog is not; the binding record states the rule, so this row is advisory until it is current (AST-020 FR9).",
        covers: ['apg-interaction'],
        appliesWhen: {
          condition:
            'the surface is modal and a click beside it is not meant to close it',
          test: facts => facts.modal && !facts.dismissesOnBackdrop,
        },
        evidenceLayer: 'real-browser',
        alsoNeeds: ['dom'],
        enforcement: 'advisory',
        advisoryBecause:
          "The no-backdrop-dismissal rule is the binding record's, not an APG requirement; required once that record is current (AST-020 FR9).",
        run: async ({harness, subject}) => {
          await harness.clickBeside(subject);
          if (!(await subject.isVisible())) {
            throw new Error('a click beside the surface dismissed it');
          }
        },
      },
    ],
    exemptions: {
      '1.1.1-non-text-content': {
        owner: 'the binding component',
        verifiedBy:
          "the component's decorative-icon tests and the repository axe audit, `pnpm a11y:audit`",
        reason:
          "This contract owns the surface's semantics and dismissal. Any icon the binding paints beside the title is decorative composition.",
      },
      '1.3.1-info-and-relationships': {
        owner: 'the binding component',
        verifiedBy: "the component's title and description association tests",
        reason:
          'This contract proves the surface is described by its message; the title relationship is proven through the computed name.',
        coversRemainderOnly: true,
      },
      '1.3.2-meaningful-sequence': {
        owner: 'the binding component',
        verifiedBy: "the component's anatomy order tests",
        reason:
          "Title, message, then buttons is the binding's anatomy, proven by its own tests; the button order is a layout rule of the binding record.",
      },
      '1.3.5-identify-input-purpose': {
        owner: 'not applicable',
        verifiedBy: 'none needed',
        reason:
          'An alert dialog collects a yes or no, not information about the user.',
      },
      '1.4.1-use-of-color': {
        owner: 'the binding component and theme',
        verifiedBy: "the component's action-variant tests plus rendered review",
        reason:
          "The destructive action's colour is a paint result owned by the binding and theme; its label carries the meaning.",
      },
      '1.4.3-contrast-minimum': {
        owner: 'the binding component and theme',
        verifiedBy: 'the repository axe audit plus rendered contrast review',
        reason:
          'Title, message and button text contrast is a paint outcome owned by the binding and theme.',
      },
      '1.4.11-non-text-contrast': {
        owner: 'the binding component and theme',
        verifiedBy:
          'the repository axe audit plus rendered review of the surface edge and focus indicator',
        reason:
          'Surface edge and focus indicator contrast are paint outcomes owned by the binding and theme.',
      },
      '2.1.1-keyboard': {
        owner:
          'the modal-dialog contract through the composed Dialog, and the button pattern',
        verifiedBy:
          "MODAL_DIALOG_PATTERN bound by Dialog, BUTTON_PATTERN for the buttons, plus this contract's Escape row",
        reason:
          "This contract encodes Escape. Tab containment inside the surface is the modal-dialog contract's, and the buttons' own activation is the button pattern's.",
        coversRemainderOnly: true,
      },
      '2.1.2-no-keyboard-trap': {
        owner: 'the modal-dialog contract through the composed Dialog',
        verifiedBy:
          "MODAL_DIALOG_PATTERN bound by Dialog, plus this contract's Escape row",
        reason:
          'A modal surface may contain Tab by design; leaving it is Escape or a button, which this contract and the modal-dialog contract prove.',
      },
      '2.4.2-page-titled': {
        owner: 'the page',
        verifiedBy: 'page-level review',
        reason: 'An alert dialog rendered in isolation owns no document title.',
      },
      '2.4.3-focus-order': {
        owner: 'the modal-dialog contract through the composed Dialog',
        verifiedBy:
          'MODAL_DIALOG_PATTERN bound by Dialog (focus enters after modal presentation and returns to the opener on close)',
        reason:
          "This contract proves where focus lands first; entering and restoring focus are the modal-dialog contract's.",
        coversRemainderOnly: true,
      },
      '2.4.4-link-purpose': {
        owner: 'not applicable',
        verifiedBy: 'none needed',
        reason: 'An alert dialog renders no link.',
      },
      '2.4.6-headings-and-labels': {
        owner: 'the binding component and caller content',
        verifiedBy: "the component's name tests and caller content review",
        reason:
          'This contract proves the surface is named by its title; whether that title is descriptive is caller content.',
        coversRemainderOnly: true,
      },
      '2.4.7-focus-visible': {
        owner: 'the Button binding and theme',
        verifiedBy: "Button's focus-outline tests and rendered focus review",
        reason:
          "The focused button's indicator is a paint result owned by the Button binding and theme.",
      },
      '2.4.11-focus-not-obscured': {
        owner: 'the binding component',
        verifiedBy: "the component's top-layer rendering through Dialog",
        reason:
          'A modal surface sits in the top layer; nothing in the page can cover it.',
      },
      '2.5.2-pointer-cancellation': {
        owner: 'the button pattern',
        verifiedBy: 'BUTTON_PATTERN for the Cancel and action controls',
        reason: "The buttons' press cancellation is the button pattern's.",
      },
      '2.5.3-label-in-name': {
        owner: 'the binding component',
        verifiedBy: "the component's accessible-name tests",
        reason:
          "The surface's name is its visible title through aria-labelledby, proven by the computed name.",
      },
      '2.5.8-target-size': {
        owner: 'the Button binding and theme',
        verifiedBy:
          "the repository axe audit's target-size rule over the buttons",
        reason:
          "The buttons' hit areas are geometry owned by the Button binding and theme.",
      },
      '3.1.1-language-of-page': {
        owner: 'the page',
        verifiedBy: 'page-level review',
        reason: 'An alert dialog owns no document language.',
      },
      '3.2.2-on-input': {
        owner: 'the caller and composing page',
        verifiedBy:
          'integration review of what a caller does with onAction and in response to the dialog closing',
        reason:
          "3.2.2 governs changing the setting of a user interface component; an alert dialog has no setting to change, and a click beside it is not input to a control. What the confirmed action does, and whether closing the dialog changes context, is the caller's and the composing page's.",
      },
      '3.2.4-consistent-identification': {
        owner: 'the composing page',
        verifiedBy:
          'this shared contract across bindings plus content review of repeated confirmation wording',
        reason:
          'Consistency is a property of the full set of repeated functions, not one isolated alert dialog.',
      },
      '3.3.1-error-identification': {
        owner: 'not applicable',
        verifiedBy: 'none needed',
        reason: 'An alert dialog collects no input that could be in error.',
      },
      '3.3.2-labels-or-instructions': {
        owner: 'not applicable',
        verifiedBy: 'none needed',
        reason:
          'An alert dialog collects no user input that needs form instructions.',
      },
      '4.1.2-name-role-value': {
        owner: 'the binding component and the button pattern',
        verifiedBy:
          "the component's inline-preview (role group) and loading-action tests, BUTTON_PATTERN for the buttons",
        reason:
          "This contract encodes the surface's role, name and modality. The inline preview's group role and the buttons' states are the binding's and the button pattern's.",
        coversRemainderOnly: true,
      },
      '4.1.3-status-messages': {
        owner:
          'the caller and the assistive-technology verification record, spec:AST-009',
        verifiedBy:
          'the status-message pattern and real-AT evidence under AST-009 when a change claims spoken or braille output',
        reason:
          'An alert dialog takes focus; it is not a live-region status message and makes no announcement claim.',
      },
      'apg-interaction': {
        owner: "the binding component's record",
        verifiedBy:
          'component:AlertDialog AR1, which adopts the pattern and delegates modal mechanics to component:Dialog',
        reason:
          "This contract encodes the alert dialog's role, references, modality, initial focus and dismissal. Top layer, inert page and focus restoration are the modal-dialog contract's.",
        coversRemainderOnly: true,
      },
      'forced-colors': {
        owner: 'the binding component and theme',
        verifiedBy:
          "the component's forced-colors tests plus rendered Windows High Contrast review",
        reason:
          'Forced-colors output is a paint result owned by the binding and theme.',
      },
      'reduced-motion': {
        owner: 'the binding component and theme',
        verifiedBy:
          "the component's reduced-motion source tests and rendered motion review",
        reason:
          'Open and close motion is binding-specific paint over time and is not part of alert-dialog semantics.',
      },
      'at-facing-strings': {
        owner: 'the caller',
        verifiedBy:
          'content review of authored titles, messages and button labels',
        reason:
          'The alert-dialog contract introduces no string; title, message and button labels come from the caller.',
      },
    },
  });
