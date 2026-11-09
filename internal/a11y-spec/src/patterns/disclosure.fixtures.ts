// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file disclosure.fixtures.ts
 * @input Uses DisclosureStateFacts from ./disclosure
 * @output Plain-HTML conforming and deliberately violating disclosure fixtures
 * @position Contract mutation proof shared by jsdom and Chromium.
 */

import type {DisclosureStateFacts} from './disclosure';

const SUBJECT_ATTRIBUTE = 'data-a11y-subject';
export const SUBJECT_SELECTOR = `[${SUBJECT_ATTRIBUTE}]`;
export const CONTENT_SELECTOR = '#content';

export interface DisclosureFixture {
  readonly id: string;
  readonly summary: string;
  readonly facts: DisclosureStateFacts;
  readonly html: string;
}

const TOGGLE = `const open = this.getAttribute('aria-expanded') !== 'true'; this.setAttribute('aria-expanded', String(open)); document.getElementById('content').hidden = !open;`;
const OPEN_ONLY = `this.setAttribute('aria-expanded', 'true'); document.getElementById('content').hidden = false;`;
const STATE_ONLY = `this.setAttribute('aria-expanded', String(this.getAttribute('aria-expanded') !== 'true'));`;

function disclosure({
  expanded = false,
  controls = 'content',
  onclick = TOGGLE,
  onkeydown = '',
  onpointerdown = '',
  contentHidden = !expanded,
  contentTabIndex = false,
}: {
  expanded?: boolean;
  controls?: string | null;
  onclick?: string;
  onkeydown?: string;
  onpointerdown?: string;
  contentHidden?: boolean;
  contentTabIndex?: boolean;
} = {}): string {
  return `<button type="button" ${SUBJECT_ATTRIBUTE} aria-expanded="${expanded}"${controls == null ? '' : ` aria-controls="${controls}"`}${onclick === '' ? '' : ` onclick="${onclick}"`}${onkeydown === '' ? '' : ` onkeydown="${onkeydown}"`}${onpointerdown === '' ? '' : ` onpointerdown="${onpointerdown}"`}>Details</button><div id="content"${contentHidden ? ' hidden' : ''}${contentTabIndex ? ' tabindex="-1"' : ''}>Body</div><div id="other">Other content</div>`;
}

const facts = (
  overrides: Partial<DisclosureStateFacts> = {},
): DisclosureStateFacts => ({
  expanded: false,
  controls: true,
  operable: true,
  focusable: true,
  ...overrides,
});

export const DISCLOSURE_FIXTURES: readonly DisclosureFixture[] = [
  {
    id: 'conforming-closed',
    summary: 'a collapsed disclosure that can be opened and closed again',
    facts: facts(),
    html: disclosure(),
  },
  {
    id: 'conforming-open',
    summary: 'an expanded disclosure that can be closed and opened again',
    facts: facts({expanded: true}),
    html: disclosure({expanded: true}),
  },
  {
    id: 'conforming-no-controls',
    summary:
      'a disclosure using the APG-optional form without an aria-controls relationship',
    facts: facts({controls: false}),
    html: disclosure({controls: null}),
  },
  {
    id: 'conforming-inoperable-open',
    summary:
      'an expanded disclosure whose unavailable trigger preserves the visible state',
    facts: facts({expanded: true, operable: false, focusable: false}),
    html: disclosure({
      expanded: true,
      onclick: '',
      onkeydown: '',
    }).replace('<button ', '<button aria-disabled="true" tabindex="-1" '),
  },
  {
    id: 'violating-expanded-missing',
    summary: 'a disclosure trigger with no expanded state',
    facts: facts({expanded: true}),
    html: disclosure({expanded: true}).replace(' aria-expanded="true"', ''),
  },
  {
    id: 'violating-expanded-opposite',
    summary:
      'visible content whose trigger reports the opposite expanded state',
    facts: facts({expanded: true}),
    html: disclosure({expanded: true}).replace(
      'aria-expanded="true"',
      'aria-expanded="false"',
    ),
  },
  {
    id: 'violating-controls-dangling',
    summary:
      'a relationship that names the content and a second target that does not exist',
    facts: facts(),
    html: disclosure({controls: 'content missing'}),
  },
  {
    id: 'violating-controls-unrelated',
    summary: 'a relationship that points only at unrelated content',
    facts: facts(),
    html: disclosure({controls: 'other'}),
  },
  {
    id: 'violating-expanded-content-hidden',
    summary: 'an expanded trigger whose content remains hidden',
    facts: facts({expanded: true}),
    html: disclosure({expanded: true, contentHidden: true}),
  },
  {
    id: 'violating-collapsed-content-visible',
    summary: 'a collapsed trigger whose content remains visible',
    facts: facts(),
    html: disclosure({contentHidden: false}),
  },
  {
    id: 'violating-pointer-one-way',
    summary: 'a pointer can expand the disclosure but cannot collapse it again',
    facts: facts(),
    html: disclosure({onclick: OPEN_ONLY}),
  },
  {
    id: 'violating-pointer-state-only',
    summary: 'a pointer changes aria-expanded without revealing the content',
    facts: facts(),
    html: disclosure({onclick: STATE_ONLY}),
  },
  {
    id: 'violating-enter-unavailable',
    summary:
      'a disclosure that blocks Enter while still responding to a pointer',
    facts: facts(),
    html: disclosure({
      onkeydown: "if (event.key === 'Enter') event.preventDefault();",
    }),
  },
  {
    id: 'violating-space-unavailable',
    summary:
      'a disclosure that blocks Space while still responding to a pointer',
    facts: facts(),
    html: disclosure({
      onkeydown: "if (event.key === ' ') event.preventDefault();",
    }),
  },
  {
    id: 'violating-down-event-activation',
    summary:
      'a disclosure that toggles on pointer-down before the user can cancel the press',
    facts: facts(),
    html: disclosure({onclick: '', onpointerdown: TOGGLE}),
  },
  {
    id: 'violating-focus-moved',
    summary: 'a disclosure that moves focus into its content when toggled',
    facts: facts(),
    html: disclosure({
      onclick: `${TOGGLE} document.getElementById('content').focus();`,
      contentTabIndex: true,
    }),
  },
];

export function fixture(id: string): DisclosureFixture {
  const found = DISCLOSURE_FIXTURES.find(candidate => candidate.id === id);
  if (found == null) {
    throw new Error(`unknown disclosure fixture "${id}"`);
  }
  return found;
}

export const CONFORMING_FIXTURES: readonly string[] =
  DISCLOSURE_FIXTURES.filter(candidate =>
    candidate.id.startsWith('conforming-'),
  ).map(candidate => candidate.id);

export const DISCLOSURE_MUTATIONS: Readonly<Record<string, readonly string[]>> =
  {
    'disclosure.state.expanded': [
      'violating-expanded-missing',
      'violating-expanded-opposite',
    ],
    'disclosure.relationship.controls': [
      'violating-controls-dangling',
      'violating-controls-unrelated',
    ],
    'disclosure.content.matches-state': [
      'violating-expanded-content-hidden',
      'violating-collapsed-content-visible',
    ],
    'disclosure.state.pointer-round-trip': [
      'violating-pointer-one-way',
      'violating-pointer-state-only',
    ],
    'disclosure.state.enter-round-trip': ['violating-enter-unavailable'],
    'disclosure.state.space-round-trip': ['violating-space-unavailable'],
    'disclosure.state.survives-an-aborted-press': [
      'violating-down-event-activation',
    ],
    'disclosure.focus.stays-on-trigger': ['violating-focus-moved'],
  };
