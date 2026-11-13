// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Plain-HTML positive and mutation fixtures for the Link contract.
 *
 * Every destination is a same-document fragment, so following a link never
 * leaves the fixture page. The Chromium half counts each navigation the page
 * requests through the browser's Navigation API and cancels it, so the count
 * is the observation and the page stays put for the next one.
 */

import type {LinkStateFacts} from './link';

export const LINK_SUBJECT_SELECTOR = '[data-a11y-link]';

export interface LinkFixture {
  readonly id: string;
  readonly summary: string;
  readonly facts: LinkStateFacts;
  readonly html: string;
}

function facts(overrides: Partial<LinkStateFacts> = {}): LinkStateFacts {
  return {name: 'Documentation', current: null, ...overrides};
}

const ICON =
  '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor"/></svg>';

/** A script-free way to request a second, distinct navigation. */
const NAVIGATE = (hash: string) => `location.hash='${hash}'`;

export const LINK_FIXTURES: readonly LinkFixture[] = [
  {
    id: 'conforming-text',
    summary: 'a native link named by its visible text',
    facts: facts(),
    html: '<a data-a11y-link href="#destination">Documentation</a>',
  },
  {
    id: 'conforming-labelled-icon',
    summary: 'an icon-only native link named by aria-label',
    facts: facts({name: 'Close dialog'}),
    html: `<a data-a11y-link href="#destination" aria-label="Close dialog">${ICON}</a>`,
  },
  {
    id: 'conforming-current',
    summary: 'a native link that marks the current page',
    facts: facts({name: 'Overview', current: 'page'}),
    html: '<a data-a11y-link href="#destination" aria-current="page">Overview</a>',
  },
  {
    id: 'violating-role-missing',
    summary: 'a focusable span that navigates on click but is no link',
    facts: facts(),
    html: `<span data-a11y-link tabindex="0" onclick="${NAVIGATE('destination')}">Documentation</span>`,
  },
  {
    id: 'violating-role-button',
    summary: 'a button that navigates, announced as a button',
    facts: facts(),
    html: `<button data-a11y-link type="button" onclick="${NAVIGATE('destination')}">Documentation</button>`,
  },
  {
    id: 'violating-name-missing',
    summary: 'an icon-only link with no accessible name',
    facts: facts({name: 'Close dialog'}),
    html: `<a data-a11y-link href="#destination">${ICON}</a>`,
  },
  {
    id: 'violating-name-wrong',
    summary: 'a link whose aria-label replaces the declared name',
    facts: facts(),
    html: '<a data-a11y-link href="#destination" aria-label="Docs">Documentation</a>',
  },
  {
    id: 'violating-label-not-in-name',
    summary: 'a link whose computed name omits its visible words',
    facts: facts({name: 'Read the guide'}),
    html: '<a data-a11y-link href="#destination" aria-label="Read the guide">Documentation</a>',
  },
  {
    id: 'violating-unfocusable',
    summary: 'a link removed from the tab sequence',
    facts: facts(),
    html: '<a data-a11y-link href="#destination" tabindex="-1">Documentation</a>',
  },
  {
    id: 'violating-enter-inert',
    summary: 'a role="link" element that only listens for clicks',
    facts: facts(),
    html: `<div data-a11y-link role="link" tabindex="0" onclick="${NAVIGATE('destination')}">Documentation</div>`,
  },
  {
    id: 'violating-enter-twice',
    summary: 'a link whose Enter handler navigates on top of native activation',
    facts: facts(),
    html: `<a data-a11y-link href="#destination" onkeydown="if (event.key === 'Enter') { ${NAVIGATE('again')} }">Documentation</a>`,
  },
  {
    id: 'violating-navigates-on-press',
    summary: 'a link that navigates as soon as the pointer goes down',
    facts: facts(),
    html: `<a data-a11y-link href="#destination" onmousedown="${NAVIGATE('pressed')}">Documentation</a>`,
  },
  {
    id: 'violating-pointer-inert',
    summary: 'a link that cancels pointer activation and keeps only a key path',
    facts: facts(),
    html: `<a data-a11y-link href="#destination" onclick="if (event.detail > 0) { event.preventDefault() }">Documentation</a>`,
  },
  {
    id: 'violating-current-missing',
    summary: 'a current-page link that omits aria-current',
    facts: facts({name: 'Overview', current: 'page'}),
    html: '<a data-a11y-link href="#destination">Overview</a>',
  },
  {
    id: 'violating-current-unexpected',
    summary: 'an ordinary link that claims to be the current page',
    facts: facts(),
    html: '<a data-a11y-link href="#destination" aria-current="page">Documentation</a>',
  },
];

export const CONFORMING_LINK_FIXTURES = LINK_FIXTURES.filter(fixture =>
  fixture.id.startsWith('conforming-'),
).map(fixture => fixture.id);

export const LINK_MUTATIONS: Readonly<Record<string, readonly string[]>> = {
  'link.role.exposed': ['violating-role-missing', 'violating-role-button'],
  'link.name.exposed': ['violating-name-missing', 'violating-name-wrong'],
  'link.name.matches-visible-label': ['violating-label-not-in-name'],
  'link.focus.reachable-and-escapable': ['violating-unfocusable'],
  'link.navigation.runs-on-enter': [
    'violating-enter-inert',
    'violating-enter-twice',
  ],
  'link.navigation.completes-on-release': [
    'violating-navigates-on-press',
    'violating-pointer-inert',
  ],
  'link.current.exposed': [
    'violating-current-missing',
    'violating-current-unexpected',
  ],
};

export function linkFixture(id: string): LinkFixture {
  const fixture = LINK_FIXTURES.find(candidate => candidate.id === id);
  if (fixture == null) {
    throw new Error(`unknown Link fixture "${id}"`);
  }
  return fixture;
}
