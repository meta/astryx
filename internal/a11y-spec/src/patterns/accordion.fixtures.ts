// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file accordion.fixtures.ts
 * @input Plain HTML accordions with three headers, conforming and deliberately violating
 * @output ACCORDION_FIXTURES, the subject and relation selectors, and the expectation → violating-fixture map
 * @position Contract self-test data for accordion.jsdom.test.ts and accordion.chromium.spec.ts
 */

import type {AccordionStateFacts} from './accordion';

const SUBJECT_ATTRIBUTE = 'data-a11y-subject';
export const SUBJECT_SELECTOR = `[${SUBJECT_ATTRIBUTE}]`;
export const PANEL_SELECTOR = '#panel-2';
export const NEXT_HEADER_SELECTOR = '#header-3';
export const OPEN_SIBLING_SELECTOR = '#header-1';

export interface AccordionFixture {
  readonly id: string;
  readonly summary: string;
  readonly facts: AccordionStateFacts;
  readonly html: string;
}

/**
 * The subject is always the second header. Header 1 starts expanded, header 2
 * collapsed, header 3 collapsed; `single` fixtures collapse the other open
 * header when one expands.
 */
const TOGGLE_MULTIPLE = `const open = this.getAttribute('aria-expanded') !== 'true'; this.setAttribute('aria-expanded', String(open)); document.getElementById(this.getAttribute('aria-controls')).hidden = !open;`;
const TOGGLE_SINGLE = `const open = this.getAttribute('aria-expanded') !== 'true'; if (open) { for (const other of document.querySelectorAll('[data-accordion-header]')) { if (other !== this) { other.setAttribute('aria-expanded', 'false'); document.getElementById(other.getAttribute('aria-controls')).hidden = true; } } } this.setAttribute('aria-expanded', String(open)); document.getElementById(this.getAttribute('aria-controls')).hidden = !open;`;
const TOGGLE_SINGLE_NO_COLLAPSE = TOGGLE_MULTIPLE;
const STATE_ONLY = `this.setAttribute('aria-expanded', String(this.getAttribute('aria-expanded') !== 'true'));`;
const ARROW_MOVES = `if (event.key === 'ArrowDown') { event.preventDefault(); document.getElementById('header-3').focus(); } if (event.key === 'ArrowUp') { event.preventDefault(); document.getElementById('header-1').focus(); }`;

function header(
  index: 1 | 2 | 3,
  {
    expanded,
    tag = 'button',
    controls = `panel-${index}`,
    onclick,
    onkeydown = '',
    disabled = false,
    subject = false,
    tabindex = '',
  }: {
    expanded: boolean;
    tag?: string;
    controls?: string | null;
    onclick: string;
    onkeydown?: string;
    disabled?: boolean;
    subject?: boolean;
    tabindex?: string;
  },
): string {
  const typeAttr = tag === 'button' ? ' type="button"' : '';
  return `<${tag}${typeAttr} id="header-${index}" data-accordion-header${subject ? ` ${SUBJECT_ATTRIBUTE}` : ''} aria-expanded="${expanded}"${controls == null ? '' : ` aria-controls="${controls}"`}${disabled ? ' aria-disabled="true"' : ''}${tabindex === '' ? '' : ` tabindex="${tabindex}"`}${onclick === '' ? '' : ` onclick="${onclick}"`}${onkeydown === '' ? '' : ` onkeydown="${onkeydown}"`}>Section ${index}</${tag}>`;
}

function panel(index: 1 | 2 | 3, hidden: boolean): string {
  return `<div id="panel-${index}"${hidden ? ' hidden' : ''}>Body ${index}</div>`;
}

function accordion({
  single = true,
  subjectExpanded = false,
  subjectTag = 'button',
  subjectControls = `panel-2`,
  subjectOnclick,
  subjectOnkeydown = '',
  subjectDisabled = false,
  subjectPanelHidden,
  subjectTabindex = '',
  siblingToggle,
}: {
  single?: boolean;
  subjectExpanded?: boolean;
  subjectTag?: string;
  subjectControls?: string | null;
  subjectOnclick?: string;
  subjectOnkeydown?: string;
  subjectDisabled?: boolean;
  subjectPanelHidden?: boolean;
  subjectTabindex?: string;
  siblingToggle?: string;
} = {}): string {
  const toggle = single ? TOGGLE_SINGLE : TOGGLE_MULTIPLE;
  return [
    header(1, {expanded: true, onclick: siblingToggle ?? toggle}),
    panel(1, false),
    header(2, {
      expanded: subjectExpanded,
      tag: subjectTag,
      controls: subjectControls,
      onclick: subjectOnclick ?? toggle,
      onkeydown: subjectOnkeydown,
      disabled: subjectDisabled,
      subject: true,
      tabindex: subjectTabindex,
    }),
    panel(2, subjectPanelHidden ?? !subjectExpanded),
    header(3, {expanded: false, onclick: toggle}),
    panel(3, true),
  ].join('');
}

const facts = (
  overrides: Partial<AccordionStateFacts> = {},
): AccordionStateFacts => ({
  expanded: false,
  operable: true,
  focusable: true,
  single: true,
  hasNextHeader: true,
  hasOpenSibling: true,
  ...overrides,
});

export const ACCORDION_FIXTURES: readonly AccordionFixture[] = [
  {
    id: 'conforming-single-collapsed',
    summary:
      'a collapsed header in a single-expansion group whose sibling is open',
    facts: facts(),
    html: accordion(),
  },
  {
    id: 'conforming-single-expanded',
    summary: 'an expanded header in a single-expansion group',
    facts: facts({expanded: true, hasOpenSibling: false}),
    html: accordion({subjectExpanded: true, siblingToggle: TOGGLE_SINGLE})
      .replace(
        'id="header-1" data-accordion-header aria-expanded="true"',
        'id="header-1" data-accordion-header aria-expanded="false"',
      )
      .replace('<div id="panel-1">', '<div id="panel-1" hidden>'),
  },
  {
    id: 'conforming-multiple-collapsed',
    summary: 'a collapsed header in a group that allows several open panels',
    facts: facts({single: false}),
    html: accordion({single: false}),
  },
  {
    id: 'conforming-fixed-open',
    summary:
      'an expanded header that cannot be collapsed and says so with aria-disabled',
    facts: facts({
      expanded: true,
      operable: false,
      focusable: true,
      hasOpenSibling: false,
    }),
    html: accordion({
      subjectExpanded: true,
      subjectOnclick: '',
      subjectDisabled: true,
    }),
  },
  {
    id: 'violating-header-not-button',
    summary: 'a header rendered as a div with no role',
    facts: facts(),
    html: accordion({subjectTag: 'div', subjectTabindex: '0'}),
  },
  {
    id: 'violating-expanded-missing',
    summary: 'a header with no aria-expanded',
    facts: facts(),
    html: accordion().replace(
      `${SUBJECT_ATTRIBUTE} aria-expanded="false"`,
      SUBJECT_ATTRIBUTE,
    ),
  },
  {
    id: 'violating-controls-missing',
    summary: 'a header that does not name its panel',
    facts: facts(),
    html: accordion({subjectControls: null}),
  },
  {
    id: 'violating-controls-unrelated',
    summary: 'a header whose aria-controls points at another panel',
    facts: facts(),
    html: accordion({subjectControls: 'panel-3'}),
  },
  {
    id: 'violating-fixed-not-disabled',
    summary:
      'an expanded header that cannot be collapsed but carries no aria-disabled',
    facts: facts({
      expanded: true,
      operable: false,
      focusable: true,
      hasOpenSibling: false,
    }),
    html: accordion({subjectExpanded: true, subjectOnclick: ''}),
  },
  {
    id: 'violating-collapsed-panel-visible',
    summary: 'a collapsed header whose panel stays visible',
    facts: facts(),
    html: accordion({subjectPanelHidden: false}),
  },
  {
    id: 'violating-enter-unavailable',
    summary: 'a header that blocks Enter',
    facts: facts(),
    html: accordion({
      subjectOnkeydown: "if (event.key === 'Enter') event.preventDefault();",
    }),
  },
  {
    id: 'violating-space-unavailable',
    summary: 'a header that blocks Space',
    facts: facts(),
    html: accordion({
      subjectOnkeydown: "if (event.key === ' ') event.preventDefault();",
    }),
  },
  {
    id: 'violating-state-only',
    summary: 'a header that changes aria-expanded without showing its panel',
    facts: facts(),
    html: accordion({subjectOnclick: STATE_ONLY}),
  },
  {
    id: 'violating-down-event-activation',
    summary:
      'a header that toggles on pointer-down before the user can cancel the press',
    facts: facts(),
    html: accordion({subjectOnclick: ''}).replace(
      `${SUBJECT_ATTRIBUTE} aria-expanded="false"`,
      `${SUBJECT_ATTRIBUTE} aria-expanded="false" onpointerdown="${TOGGLE_SINGLE}"`,
    ),
  },
  {
    id: 'violating-focus-moved',
    summary: 'a header that moves focus into its panel when toggled',
    facts: facts(),
    html: accordion({
      subjectOnclick: `${TOGGLE_SINGLE} document.getElementById('panel-2').focus();`,
    }).replace(
      '<div id="panel-2" hidden>',
      '<div id="panel-2" hidden tabindex="-1">',
    ),
  },
  {
    id: 'violating-single-keeps-sibling',
    summary:
      'a single-expansion group that leaves the open sibling expanded when another header opens',
    facts: facts(),
    html: accordion({subjectOnclick: TOGGLE_SINGLE_NO_COLLAPSE}),
  },
  {
    id: 'violating-next-header-out-of-tab-order',
    summary: 'the following header is removed from the Tab sequence',
    facts: facts(),
    html: accordion().replace(
      'id="header-3" data-accordion-header',
      'id="header-3" data-accordion-header tabindex="-1"',
    ),
  },
  {
    id: 'violating-arrows-move-focus',
    summary:
      'arrow keys move focus between headers as if the group were one widget',
    facts: facts(),
    html: accordion({subjectOnkeydown: ARROW_MOVES}),
  },
];

export function fixture(id: string): AccordionFixture {
  const found = ACCORDION_FIXTURES.find(candidate => candidate.id === id);
  if (found == null) {
    throw new Error(`unknown accordion fixture "${id}"`);
  }
  return found;
}

export const CONFORMING_FIXTURES: readonly string[] = ACCORDION_FIXTURES.filter(
  candidate => candidate.id.startsWith('conforming-'),
).map(candidate => candidate.id);

export const ACCORDION_MUTATIONS: Readonly<Record<string, readonly string[]>> =
  {
    'accordion.header.role-and-name': ['violating-header-not-button'],
    'accordion.header.expanded-state': ['violating-expanded-missing'],
    'accordion.header.controls-panel': [
      'violating-controls-missing',
      'violating-controls-unrelated',
    ],
    'accordion.header.disabled-when-fixed': ['violating-fixed-not-disabled'],
    'accordion.panel.matches-state': ['violating-collapsed-panel-visible'],
    'accordion.header.enter-round-trip': [
      'violating-enter-unavailable',
      'violating-state-only',
    ],
    'accordion.header.space-round-trip': [
      'violating-space-unavailable',
      'violating-state-only',
    ],
    'accordion.header.survives-an-aborted-press': [
      'violating-down-event-activation',
    ],
    'accordion.focus.stays-on-header': ['violating-focus-moved'],
    'accordion.group.single-collapses-sibling': [
      'violating-single-keeps-sibling',
    ],
    'accordion.group.tab-order': ['violating-next-header-out-of-tab-order'],
    'accordion.group.arrows-do-not-move-focus': ['violating-arrows-move-focus'],
  };
