// Copyright (c) Meta Platforms, Inc. and affiliates.

/** Plain-HTML positive and mutation fixtures for the Landmark contract. */

import type {LandmarkStateFacts} from './landmark';

export const LANDMARK_SUBJECT_SELECTOR = '[data-a11y-landmark]';
export const LANDMARK_CONTENT_SELECTOR = '[data-a11y-landmark-content]';
export const LANDMARK_PEER_SELECTOR = '[data-a11y-landmark-peer]';

export interface LandmarkFixture {
  readonly id: string;
  readonly summary: string;
  readonly facts: LandmarkStateFacts;
  readonly html: string;
}

function facts(
  overrides: Partial<LandmarkStateFacts> = {},
): LandmarkStateFacts {
  return {
    role: 'navigation',
    label: 'Project sections',
    sameRolePeers: 0,
    ...overrides,
  };
}

function attributes(role: string | null, label: string | null): string {
  return [
    role == null ? '' : `role="${role}"`,
    label == null ? '' : `aria-label="${label}"`,
  ].join(' ');
}

interface Options {
  readonly role?: string | null;
  readonly label?: string | null;
  readonly contentOutside?: boolean;
  readonly peerLabel?: string | null;
}

function html(options: Options = {}): string {
  const role = options.role === undefined ? 'navigation' : options.role;
  const label =
    options.label === undefined ? 'Project sections' : options.label;
  const content = '<p data-a11y-landmark-content>Region content</p>';
  const peer =
    options.peerLabel === undefined
      ? ''
      : `<div data-a11y-landmark-peer ${attributes('navigation', options.peerLabel)}><p>Peer content</p></div>`;
  return `
    <div data-a11y-landmark ${attributes(role, label)}>
      ${options.contentOutside ? '' : content}
    </div>
    ${options.contentOutside ? content : ''}
    ${peer}
  `;
}

export const LANDMARK_FIXTURES: readonly LandmarkFixture[] = [
  {
    id: 'conforming-labelled',
    summary: 'an explicitly labelled navigation landmark around its content',
    facts: facts(),
    html: html(),
  },
  {
    id: 'conforming-unlabelled',
    summary: 'a main landmark whose binding declares no label',
    facts: facts({role: 'main', label: null}),
    html: html({role: 'main', label: null}),
  },
  {
    id: 'conforming-repeated-distinct',
    summary: 'two navigation landmarks with distinct labels',
    facts: facts({sameRolePeers: 1}),
    html: html({peerLabel: 'Page outline'}),
  },
  {
    id: 'violating-role-missing',
    summary: 'a labelled generic container instead of a landmark',
    facts: facts(),
    html: html({role: null}),
  },
  {
    id: 'violating-role-wrong',
    summary: 'a complementary landmark where navigation was declared',
    facts: facts(),
    html: html({role: 'complementary'}),
  },
  {
    id: 'violating-name-missing',
    summary: 'a navigation landmark that drops its declared label',
    facts: facts(),
    html: html({label: null}),
  },
  {
    id: 'violating-name-wrong',
    summary: 'a navigation landmark exposing a different label',
    facts: facts(),
    html: html({label: 'Sections'}),
  },
  {
    id: 'violating-content-outside',
    summary: 'an empty landmark beside the content it should contain',
    facts: facts(),
    html: html({contentOutside: true}),
  },
  {
    id: 'violating-peer-duplicate-name',
    summary: 'two navigation landmarks sharing one label',
    facts: facts({sameRolePeers: 1}),
    html: html({peerLabel: 'Project sections'}),
  },
  {
    id: 'violating-peer-unnamed',
    summary: 'a repeated navigation landmark with no label',
    facts: facts({sameRolePeers: 1}),
    html: html({peerLabel: null}),
  },
];

export const CONFORMING_LANDMARK_FIXTURES = LANDMARK_FIXTURES.filter(fixture =>
  fixture.id.startsWith('conforming-'),
).map(fixture => fixture.id);

export const LANDMARK_MUTATIONS: Readonly<Record<string, readonly string[]>> = {
  'landmark.role.exposed': ['violating-role-missing', 'violating-role-wrong'],
  'landmark.name.exposed': ['violating-name-missing', 'violating-name-wrong'],
  'landmark.content.contained': ['violating-content-outside'],
  'landmark.peers.distinct-names': [
    'violating-peer-duplicate-name',
    'violating-peer-unnamed',
  ],
};

export function landmarkFixture(id: string): LandmarkFixture {
  const fixture = LANDMARK_FIXTURES.find(candidate => candidate.id === id);
  if (fixture == null) {
    throw new Error(`unknown Landmark fixture "${id}"`);
  }
  return fixture;
}
