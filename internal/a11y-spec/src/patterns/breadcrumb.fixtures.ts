// Copyright (c) Meta Platforms, Inc. and affiliates.

/** Plain-HTML positive and mutation fixtures for the Breadcrumb contract. */

import type {BreadcrumbStateFacts} from './breadcrumb';

export const BREADCRUMB_SUBJECT_SELECTOR = '[data-a11y-breadcrumb]';
export const BREADCRUMB_LIST_SELECTOR = '[data-a11y-list]';
export const BREADCRUMB_CURRENT_SELECTOR = '[data-a11y-current]';
export const BREADCRUMB_SEPARATOR_SELECTOR = '[data-a11y-separator]';

export interface BreadcrumbFixture {
  readonly id: string;
  readonly summary: string;
  readonly facts: BreadcrumbStateFacts;
  readonly html: string;
}

interface Options {
  readonly landmark?: 'nav' | 'div';
  readonly label?: string | null;
  readonly list?: 'ol' | 'div';
  readonly listOutside?: boolean;
  readonly currentPage?: boolean;
  readonly currentAttribute?: boolean;
  readonly currentOutside?: boolean;
  readonly exposedSeparator?: number;
}

function facts(
  overrides: Partial<BreadcrumbStateFacts> = {},
): BreadcrumbStateFacts {
  return {
    landmarkLabel: 'Breadcrumb',
    currentPage: true,
    separatorCount: 3,
    ...overrides,
  };
}

function html(options: Options = {}): string {
  const landmark = options.landmark ?? 'nav';
  const label = options.label === undefined ? 'Breadcrumb' : options.label;
  const list = options.list ?? 'ol';
  const currentPage = options.currentPage ?? true;
  const currentAttribute = options.currentAttribute ?? true;
  const separator = (index: number) =>
    `<span data-a11y-separator ${options.exposedSeparator === index ? '' : 'aria-hidden="true"'}>/</span>`;
  const items = `
    <li>${separator(0)}<a href="/">Home</a></li>
    <li>${separator(1)}<a href="/projects">Projects</a></li>
    <li>${separator(2)}<span ${currentPage ? 'data-a11y-current' : ''} ${currentPage && currentAttribute ? 'aria-current="page"' : ''}>Current page</span></li>
  `;
  const trail = `<${list} data-a11y-list>${items}</${list}>`;
  const outsideCurrent = options.currentOutside
    ? '<span data-a11y-current aria-current="page">Current page</span>'
    : '';
  const landmarkContent = options.listOutside
    ? outsideCurrent
    : `${trail}${outsideCurrent}`;
  return `
    <${landmark} data-a11y-breadcrumb ${label == null ? '' : `aria-label="${label}"`}>
      ${landmarkContent}
    </${landmark}>
    ${options.listOutside ? trail : ''}
  `;
}

export const BREADCRUMB_FIXTURES: readonly BreadcrumbFixture[] = [
  {
    id: 'conforming-current-page',
    summary:
      'a named breadcrumb landmark with an ordered trail and current page',
    facts: facts(),
    html: html(),
  },
  {
    id: 'conforming-custom-label',
    summary: 'a trail with a caller-provided landmark name',
    facts: facts({landmarkLabel: 'Project location'}),
    html: html({label: 'Project location'}),
  },
  {
    id: 'conforming-no-current-page',
    summary: 'a named ordered trail that intentionally omits a current page',
    facts: facts({currentPage: false}),
    html: html({currentPage: false}),
  },
  {
    id: 'violating-landmark-role',
    summary: 'a generic container instead of a navigation landmark',
    facts: facts(),
    html: html({landmark: 'div'}),
  },
  {
    id: 'violating-landmark-name',
    summary: 'an unnamed navigation landmark',
    facts: facts(),
    html: html({label: null}),
  },
  {
    id: 'violating-list-role',
    summary: 'generic content instead of a list',
    facts: facts(),
    html: html({list: 'div'}),
  },
  {
    id: 'violating-list-containment',
    summary: 'an ordered trail outside its navigation landmark',
    facts: facts(),
    html: html({listOutside: true}),
  },
  {
    id: 'violating-current-page',
    summary: 'a current page without aria-current',
    facts: facts(),
    html: html({currentAttribute: false}),
  },
  {
    id: 'violating-current-containment',
    summary: 'a current-page marker outside the trail',
    facts: facts(),
    html: html({currentPage: false, currentOutside: true}),
  },
  {
    id: 'violating-separator',
    summary: 'a visual separator exposed to assistive technology',
    facts: facts(),
    html: html({exposedSeparator: 1}),
  },
];

export const CONFORMING_BREADCRUMB_FIXTURES = BREADCRUMB_FIXTURES.filter(
  fixture => fixture.id.startsWith('conforming-'),
).map(fixture => fixture.id);

export const BREADCRUMB_MUTATIONS: Readonly<Record<string, readonly string[]>> =
  {
    'breadcrumb.landmark.named': [
      'violating-landmark-role',
      'violating-landmark-name',
    ],
    'breadcrumb.trail.list': [
      'violating-list-role',
      'violating-list-containment',
    ],
    'breadcrumb.current-page.exposed': [
      'violating-current-page',
      'violating-current-containment',
    ],
    'breadcrumb.separators.decorative': ['violating-separator'],
  };

export function breadcrumbFixture(id: string): BreadcrumbFixture {
  const fixture = BREADCRUMB_FIXTURES.find(candidate => candidate.id === id);
  if (fixture == null) {
    throw new Error(`unknown Breadcrumb fixture "${id}"`);
  }
  return fixture;
}
