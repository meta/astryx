// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file alert-dialog.fixtures.ts
 * @input Plain HTML confirmation surfaces (a native dialog an invoker opens with showModal(); one script implements Escape and the click-beside rule; the DOM lane never runs it), conforming and deliberately violating
 * @output ALERT_DIALOG_FIXTURES, the subject and relation selectors, and the expectation → violating-fixture map
 * @position Contract self-test data for alert-dialog.jsdom.test.ts and alert-dialog.chromium.spec.ts
 */

import type {AlertDialogStateFacts} from './alert-dialog';

const SUBJECT_ATTRIBUTE = 'data-a11y-subject';
export const SUBJECT_SELECTOR = `[${SUBJECT_ATTRIBUTE}]`;
export const RELATION_SELECTORS = {
  message: '[data-a11y-relation~="message"]',
  cancel: '[data-a11y-relation~="cancel"]',
} as const;
export const INVOKER_SELECTOR = '[data-a11y-relation~="invoker"]';

export interface AlertDialogFixture {
  readonly id: string;
  readonly summary: string;
  readonly facts: AlertDialogStateFacts;
  readonly html: string;
}

const SCRIPT = `<script>
(() => {
  const surface = document.querySelector('[${SUBJECT_ATTRIBUTE}]');
  const invoker = document.querySelector('${INVOKER_SELECTOR}');
  invoker.addEventListener('click', () => {
    if (window.__alertNonModal) surface.show(); else surface.showModal();
    const first = surface.querySelector(window.__alertFocusesAction ? '[data-a11y-relation~="action"]' : '[data-a11y-relation~="cancel"]');
    if (first) first.focus();
  });
  // The browser's own close request (Escape) is answered by the fixture's
  // rule, like a component would.
  surface.addEventListener('cancel', e => {
    e.preventDefault();
    if (!window.__alertIgnoresEscape) surface.close();
  });
  // A click on the backdrop targets the dialog element itself.
  surface.addEventListener('click', e => {
    if (e.target === surface && window.__alertClosesOnBackdrop) surface.close();
  });
  surface.querySelector('[data-a11y-relation~="cancel"]').addEventListener('click', () => surface.close());
})();
</script>`;

function surface({
  role = 'alertdialog' as string | null,
  labelledBy = 'title' as string | null,
  describedBy = 'message' as string | null,
  message = 'This permanently deletes the report and its 12 comments.',
}: {
  role?: string | null;
  labelledBy?: string | null;
  describedBy?: string | null;
  message?: string;
} = {}): string {
  return `<button type="button" data-a11y-relation="invoker">Delete report</button><dialog ${SUBJECT_ATTRIBUTE}${role == null ? '' : ` role="${role}"`}${labelledBy == null ? '' : ` aria-labelledby="${labelledBy}"`}${describedBy == null ? '' : ` aria-describedby="${describedBy}"`}><h2 id="title">Delete this report?</h2><p id="message" data-a11y-relation="message">${message}</p><div><button type="button" data-a11y-relation="cancel">Cancel</button><button type="button" data-a11y-relation="action">Delete</button></div></dialog>${SCRIPT}`;
}

const facts = (
  overrides: Partial<AlertDialogStateFacts> = {},
): AlertDialogStateFacts => ({
  modal: true,
  dismissesOnEscape: true,
  dismissesOnBackdrop: false,
  ...overrides,
});

const flag = (name: string, html: string) =>
  html.replace('<script>', `<script>window.${name} = true;</script><script>`);

export const ALERT_DIALOG_FIXTURES: readonly AlertDialogFixture[] = [
  {
    id: 'conforming-confirm',
    summary:
      'a modal confirmation named by its title, described by its message, opening on Cancel, Escape closes, a click beside it does nothing',
    facts: facts(),
    html: surface(),
  },
  {
    id: 'violating-role-dialog',
    summary: 'a confirmation exposed as a plain dialog',
    facts: facts(),
    html: surface({role: null}),
  },
  {
    id: 'violating-no-name',
    summary: 'a confirmation with no accessible name',
    facts: facts(),
    html: surface({labelledBy: null}),
  },
  {
    id: 'violating-no-description',
    summary: 'a confirmation with no aria-describedby',
    facts: facts(),
    html: surface({describedBy: null}),
  },
  {
    id: 'violating-description-dangling',
    summary:
      'a confirmation whose aria-describedby names an element that is not the message',
    facts: facts(),
    html: surface({describedBy: 'title'}),
  },
  {
    id: 'violating-empty-message',
    summary: 'a confirmation whose referenced message is empty',
    facts: facts(),
    html: surface({message: ''}),
  },
  {
    id: 'violating-nonmodal',
    summary: 'a confirmation presented without modality',
    facts: facts(),
    html: flag('__alertNonModal', surface()),
  },
  {
    id: 'violating-focus-on-action',
    summary: 'a confirmation that opens with focus on the destructive action',
    facts: facts(),
    html: flag('__alertFocusesAction', surface()),
  },
  {
    id: 'violating-escape-ignored',
    summary:
      'a confirmation that swallows Escape although it is meant to close',
    facts: facts(),
    html: flag('__alertIgnoresEscape', surface()),
  },
  {
    id: 'violating-backdrop-closes',
    summary: 'a confirmation that a click beside it dismisses',
    facts: facts(),
    html: flag('__alertClosesOnBackdrop', surface()),
  },
];

export function fixture(id: string): AlertDialogFixture {
  const found = ALERT_DIALOG_FIXTURES.find(candidate => candidate.id === id);
  if (found == null) {
    throw new Error(`unknown alert-dialog fixture "${id}"`);
  }
  return found;
}

export const CONFORMING_FIXTURES: readonly string[] =
  ALERT_DIALOG_FIXTURES.filter(candidate =>
    candidate.id.startsWith('conforming-'),
  ).map(candidate => candidate.id);

export const ALERT_DIALOG_MUTATIONS: Readonly<
  Record<string, readonly string[]>
> = {
  'alertdialog.role.exposed': ['violating-role-dialog'],
  'alertdialog.name.exposed': ['violating-no-name'],
  'alertdialog.description.references-message': [
    'violating-no-description',
    'violating-description-dangling',
    'violating-empty-message',
  ],
  'alertdialog.modal.exposed': ['violating-nonmodal'],
  'alertdialog.focus.least-destructive-first': ['violating-focus-on-action'],
  'alertdialog.keys.escape': ['violating-escape-ignored'],
  'alertdialog.dismissal.click-beside-is-inert': ['violating-backdrop-closes'],
};
