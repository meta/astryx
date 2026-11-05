// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file modal-dialog.fixtures.ts
 * @input Uses ./modal-dialog (ModalDialogStateFacts)
 * @output Plain-HTML fixtures and mutation mapping for the modal-dialog contract
 * @position Contract proof only. These fixtures contain no Astryx components.
 */

import type {ModalDialogStateFacts} from './modal-dialog';

export const MODAL_DIALOG_SUBJECT_SELECTOR = '[data-a11y-subject]';

export interface ModalDialogFixture {
  readonly id: string;
  readonly summary: string;
  readonly facts: ModalDialogStateFacts;
  readonly html: string;
  readonly presentation?: 'modal' | 'nonmodal';
  readonly focusBeforeModalPresentation?: boolean;
  readonly moveFocusOutsideAfterOpen?: boolean;
}

const LABELLED_FACTS: ModalDialogStateFacts = {
  labelledBy: true,
  hasDescriptionReference: false,
  hasDeclaredInitialTarget: false,
  usesNativeFocusFallback: false,
  exercisesFocusRestoration: false,
  makesBackgroundInert: false,
};

const INTERACTIVE_FACTS: ModalDialogStateFacts = {
  ...LABELLED_FACTS,
  hasDeclaredInitialTarget: true,
  exercisesFocusRestoration: true,
  makesBackgroundInert: true,
};

export const MODAL_DIALOG_FIXTURES: readonly ModalDialogFixture[] = [
  {
    id: 'conforming-labelled',
    summary: 'a dialog labelled by an existing heading',
    facts: LABELLED_FACTS,
    html: '<dialog data-a11y-subject aria-labelledby="title"><h2 id="title" data-a11y-visible-label>Review changes</h2></dialog>',
  },
  {
    id: 'conforming-described',
    summary: 'a labelled dialog with attached supporting text',
    facts: {...LABELLED_FACTS, hasDescriptionReference: true},
    html: '<dialog data-a11y-subject aria-labelledby="title" aria-describedby="details"><h2 id="title" data-a11y-visible-label>Review changes</h2><p id="details">Confirm the changes before saving.</p></dialog>',
  },
  {
    id: 'conforming-interactive',
    summary:
      'a labelled modal with an explicit initial target and two controls',
    facts: INTERACTIVE_FACTS,
    html: '<dialog data-a11y-subject aria-labelledby="title"><h2 id="title" data-a11y-visible-label>Review changes</h2><button type="button" data-a11y-relation="initial close" autofocus onclick="this.closest(\'dialog\').close()">Confirm</button><button type="button">Cancel</button></dialog>',
  },
  {
    id: 'conforming-no-focusable-content',
    summary: 'a named modal with no focusable descendants',
    facts: {
      ...LABELLED_FACTS,
      labelledBy: false,
      usesNativeFocusFallback: true,
      exercisesFocusRestoration: false,
      makesBackgroundInert: true,
    },
    html: '<dialog data-a11y-subject aria-label="Read terms"><p>There are no controls in this task.</p></dialog>',
  },
  {
    id: 'violating-native-fallback-outside',
    summary: 'a non-modal dialog with no descendant focus target',
    facts: {
      ...LABELLED_FACTS,
      labelledBy: false,
      usesNativeFocusFallback: true,
    },
    presentation: 'nonmodal',
    moveFocusOutsideAfterOpen: true,
    html: '<dialog data-a11y-subject aria-label="Read terms"><p>There are no controls in this task.</p></dialog>',
  },
  {
    id: 'violating-modal-unexposed',
    summary: 'a native modal whose accessibility semantics deny modality',
    facts: LABELLED_FACTS,
    html: '<dialog data-a11y-subject aria-modal="false" aria-labelledby="title"><h2 id="title" data-a11y-visible-label>Review changes</h2><button type="button">Continue</button></dialog>',
  },
  {
    id: 'violating-focus-before-modal',
    summary:
      'a dialog whose requested content receives focus before native modal presentation',
    facts: INTERACTIVE_FACTS,
    focusBeforeModalPresentation: true,
    html: '<dialog data-a11y-subject aria-labelledby="title"><h2 id="title" data-a11y-visible-label>Review changes</h2><button type="button" data-a11y-relation="initial close" autofocus onclick="this.closest(\'dialog\').close()">Confirm</button></dialog>',
  },
  {
    id: 'violating-initial-target',
    summary:
      'a modal that focuses another control instead of its declared target',
    facts: INTERACTIVE_FACTS,
    html: '<dialog data-a11y-subject aria-labelledby="title"><h2 id="title" data-a11y-visible-label>Review changes</h2><button type="button" autofocus>Wrong target</button><button type="button" data-a11y-relation="initial">Confirm</button></dialog>',
  },
  {
    id: 'violating-background-active',
    summary: 'a non-modal dialog that leaves the background interactive',
    facts: INTERACTIVE_FACTS,
    presentation: 'nonmodal',
    html: '<dialog data-a11y-subject aria-labelledby="title"><h2 id="title" data-a11y-visible-label>Review changes</h2><button type="button" autofocus>Confirm</button><button type="button">Cancel</button></dialog>',
  },
  {
    id: 'violating-focus-not-restored',
    summary: 'a modal that moves focus away from its invoker after close',
    facts: INTERACTIVE_FACTS,
    html: '<dialog data-a11y-subject aria-labelledby="title"><h2 id="title" data-a11y-visible-label>Review changes</h2><button type="button" data-a11y-relation="initial close" autofocus onclick="this.closest(\'dialog\').close(); queueMicrotask(() => document.querySelector(\'[data-a11y-relation~=background]\').focus())">Confirm</button></dialog>',
  },
  {
    id: 'violating-nonmodal-presentation',
    summary: 'a dialog shown without a native modal boundary',
    facts: LABELLED_FACTS,
    presentation: 'nonmodal',
    html: '<dialog data-a11y-subject aria-labelledby="title"><h2 id="title" data-a11y-visible-label>Review changes</h2><button type="button">Continue</button></dialog>',
  },
  {
    id: 'violating-name-mismatch',
    summary: 'a dialog whose accessible name replaces its visible title',
    facts: {...LABELLED_FACTS, labelledBy: false},
    html: '<dialog data-a11y-subject aria-label="Confirm"><h2 data-a11y-visible-label>Review changes</h2><button type="button">Continue</button></dialog>',
  },
  {
    id: 'violating-unnamed',
    summary: 'a dialog with no accessible name',
    facts: {...LABELLED_FACTS, labelledBy: false},
    html: '<dialog data-a11y-subject><button type="button">Continue</button></dialog>',
  },
  {
    id: 'violating-generic-role',
    summary: 'a modal-like surface with no dialog role',
    facts: LABELLED_FACTS,
    html: '<div data-a11y-subject aria-labelledby="title"><h2 id="title" data-a11y-visible-label>Review changes</h2></div>',
  },
  {
    id: 'violating-dangling-label',
    summary: 'a dialog labelled by an id that resolves to nothing',
    facts: LABELLED_FACTS,
    html: '<dialog data-a11y-subject aria-labelledby="missing"></dialog>',
  },
  {
    id: 'violating-dangling-description',
    summary: 'a dialog described by an id that resolves to nothing',
    facts: {...LABELLED_FACTS, hasDescriptionReference: true},
    html: '<dialog data-a11y-subject aria-labelledby="title" aria-describedby="missing"><h2 id="title" data-a11y-visible-label>Review changes</h2></dialog>',
  },
];

export function modalDialogFixture(id: string): ModalDialogFixture {
  const found = MODAL_DIALOG_FIXTURES.find(candidate => candidate.id === id);
  if (found == null) {
    throw new Error(`unknown modal-dialog fixture "${id}"`);
  }
  return found;
}

export const MODAL_DIALOG_CONFORMING_FIXTURES: readonly string[] = [
  'conforming-labelled',
  'conforming-described',
  'conforming-interactive',
  'conforming-no-focusable-content',
];

export const MODAL_DIALOG_MUTATIONS: Readonly<
  Record<string, readonly string[]>
> = {
  'modal-dialog.modal.in-top-layer': ['violating-nonmodal-presentation'],
  'modal-dialog.modal.exposed': ['violating-modal-unexposed'],
  'modal-dialog.focus.enters-after-modal': ['violating-focus-before-modal'],
  'modal-dialog.focus.initial-target': ['violating-initial-target'],
  'modal-dialog.focus.native-fallback': ['violating-native-fallback-outside'],
  'modal-dialog.focus.restored': ['violating-focus-not-restored'],
  'modal-dialog.background.inert': ['violating-background-active'],
  'modal-dialog.role.exposed': ['violating-generic-role'],
  'modal-dialog.name.exposed': ['violating-unnamed'],
  'modal-dialog.name.matches-visible-label': ['violating-name-mismatch'],
  'modal-dialog.name.references-resolve': ['violating-dangling-label'],
  'modal-dialog.description.references-resolve': [
    'violating-dangling-description',
  ],
};
