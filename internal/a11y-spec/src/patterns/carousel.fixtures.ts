// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file carousel.fixtures.ts
 * @input Uses CarouselStateFacts
 * @output Plain-HTML conforming and deliberately violating Carousel fixtures
 * @position Mutation proof for the reusable contract; no Astryx component code.
 */

import type {CarouselStateFacts} from './carousel';

const SUBJECT_ATTRIBUTE = 'data-a11y-subject';
export const CAROUSEL_SUBJECT_SELECTOR = `[${SUBJECT_ATTRIBUTE}]`;

export interface CarouselFixture {
  readonly id: string;
  readonly summary: string;
  readonly facts: CarouselStateFacts;
  readonly html: string;
}

function facts(overrides: Partial<CarouselStateFacts>): CarouselStateFacts {
  return {
    part: 'container',
    expectedName: 'Featured work',
    slideRelations: ['slide-1', 'slide-2', 'slide-3'],
    offscreen: false,
    scrollable: false,
    focusable: false,
    preservesControlFocus: false,
    ...overrides,
  };
}

interface FixtureOptions {
  readonly subject?: 'container' | 'slide-1' | 'slide-3' | 'scroller' | 'next';
  readonly containerRole?: string;
  readonly containerLabel?: string;
  readonly containerRoleDescription?: string;
  readonly slideRole?: string;
  readonly slideLabel?: string;
  readonly slideRoleDescription?: string;
  readonly detachFirstSlide?: boolean;
  readonly hideThirdSlide?: boolean;
  readonly scrollerTabIndex?: number;
  readonly scrollerRole?: string | null;
  readonly scrollerLabel?: string | null;
  readonly trapTab?: boolean;
  readonly moveFocusOnNext?: boolean;
}

function fixtureHtml(options: FixtureOptions = {}): string {
  const {
    subject = 'container',
    containerRole = 'region',
    containerLabel = 'Featured work',
    containerRoleDescription = 'carousel',
    slideRole = 'group',
    slideLabel = 'Slide 1 of 3',
    slideRoleDescription = 'slide',
    detachFirstSlide = false,
    hideThirdSlide = false,
    scrollerTabIndex = 0,
    scrollerRole = 'group',
    scrollerLabel = 'Slides',
    trapTab = false,
    moveFocusOnNext = false,
  } = options;
  const mark = (part: FixtureOptions['subject']) =>
    subject === part ? ` ${SUBJECT_ATTRIBUTE}` : '';
  const first = `<div${mark('slide-1')} data-a11y-related="slide-1" role="${slideRole}" aria-roledescription="${slideRoleDescription}" aria-label="${slideLabel}" style="flex:0 0 100px">One</div>`;
  return `
    <button type="button">Before</button>
    <div${mark('container')} role="${containerRole}"${containerLabel === '' ? '' : ` aria-label="${containerLabel}"`}${containerRoleDescription === '' ? '' : ` aria-roledescription="${containerRoleDescription}"`}>
      <div${mark('scroller')} data-a11y-related="scroller"${scrollerRole == null ? '' : ` role="${scrollerRole}"`}${scrollerLabel == null ? '' : ` aria-label="${scrollerLabel}"`} tabindex="${scrollerTabIndex}" style="display:flex;width:120px;overflow-x:auto"${trapTab ? ` onkeydown="if (event.key === 'Tab') event.preventDefault()"` : ''}>
        ${detachFirstSlide ? '' : first}
        <div data-a11y-related="slide-2" role="group" aria-roledescription="slide" aria-label="Slide 2 of 3" style="flex:0 0 100px">Two</div>
        <div${mark('slide-3')} data-a11y-related="slide-3" role="group" aria-roledescription="slide" aria-label="Slide 3 of 3" style="flex:0 0 100px"${hideThirdSlide ? ' aria-hidden="true"' : ''}>Three</div>
      </div>
      <button${mark('next')} data-a11y-related="next" type="button"${moveFocusOnNext ? ` onclick="document.getElementById('after').focus()"` : ''}>Next slide</button>
    </div>
    ${detachFirstSlide ? first : ''}
    <button id="after" type="button">After</button>
  `;
}

export const CAROUSEL_FIXTURES: readonly CarouselFixture[] = [
  {
    id: 'conforming-container',
    summary: 'a labelled carousel region containing three slides',
    facts: facts({}),
    html: fixtureHtml(),
  },
  {
    id: 'conforming-slide',
    summary: 'a visible positional slide',
    facts: facts({
      part: 'slide',
      expectedName: 'Slide 1 of 3',
      slideRelations: [],
    }),
    html: fixtureHtml({subject: 'slide-1'}),
  },
  {
    id: 'conforming-offscreen-slide',
    summary: 'an off-screen slide that remains in the accessibility tree',
    facts: facts({
      part: 'slide',
      expectedName: 'Slide 3 of 3',
      slideRelations: [],
      offscreen: true,
    }),
    html: fixtureHtml({subject: 'slide-3'}),
  },
  {
    id: 'conforming-scroller',
    summary: 'a scroll container reachable by and escapable with Tab',
    facts: facts({
      part: 'scroller',
      scrollable: true,
      expectedName: '',
      slideRelations: [],
      focusable: true,
    }),
    html: fixtureHtml({subject: 'scroller'}),
  },
  {
    id: 'conforming-next-control',
    summary: 'a next control that keeps focus after activation',
    facts: facts({
      part: 'control',
      expectedName: 'Next slide',
      slideRelations: [],
      focusable: true,
      preservesControlFocus: true,
    }),
    html: fixtureHtml({subject: 'next'}),
  },
  {
    id: 'violating-container-role',
    summary: 'a carousel exposed as main',
    facts: facts({}),
    html: fixtureHtml({containerRole: 'main'}),
  },
  {
    id: 'violating-container-name',
    summary: 'an unnamed carousel region',
    facts: facts({}),
    html: fixtureHtml({containerLabel: ''}),
  },
  {
    id: 'violating-container-roledescription',
    summary: 'a carousel without its role description',
    facts: facts({}),
    html: fixtureHtml({containerRoleDescription: ''}),
  },
  {
    id: 'violating-slide-role',
    summary: 'a slide exposed as an article',
    facts: facts({
      part: 'slide',
      expectedName: 'Slide 1 of 3',
      slideRelations: [],
    }),
    html: fixtureHtml({subject: 'slide-1', slideRole: 'article'}),
  },
  {
    id: 'violating-slide-name',
    summary: 'an unnamed slide',
    facts: facts({
      part: 'slide',
      expectedName: 'Slide 1 of 3',
      slideRelations: [],
    }),
    html: fixtureHtml({subject: 'slide-1', slideLabel: ''}),
  },
  {
    id: 'violating-slide-roledescription',
    summary: 'a slide without its role description',
    facts: facts({
      part: 'slide',
      expectedName: 'Slide 1 of 3',
      slideRelations: [],
    }),
    html: fixtureHtml({subject: 'slide-1', slideRoleDescription: ''}),
  },
  {
    id: 'violating-detached-slide',
    summary: 'a declared slide outside the carousel container',
    facts: facts({}),
    html: fixtureHtml({detachFirstSlide: true}),
  },
  {
    id: 'violating-offscreen-hidden',
    summary: 'an off-screen slide removed from the accessibility tree',
    facts: facts({
      part: 'slide',
      expectedName: 'Slide 3 of 3',
      slideRelations: [],
      offscreen: true,
    }),
    html: fixtureHtml({subject: 'slide-3', hideThirdSlide: true}),
  },
  {
    id: 'violating-scroller-unnamed',
    summary: 'a focusable scroll container with no role and no accessible name',
    facts: facts({
      part: 'scroller',
      scrollable: true,
      expectedName: '',
      slideRelations: [],
      focusable: true,
    }),
    html: fixtureHtml({
      subject: 'scroller',
      scrollerRole: null,
      scrollerLabel: null,
    }),
  },
  {
    id: 'violating-scroller-unreachable',
    summary: 'a scroll container outside the tab sequence',
    facts: facts({
      part: 'scroller',
      scrollable: true,
      expectedName: '',
      slideRelations: [],
      focusable: true,
    }),
    html: fixtureHtml({subject: 'scroller', scrollerTabIndex: -1}),
  },
  {
    id: 'violating-scroller-trap',
    summary: 'a scroll container that traps Tab',
    facts: facts({
      part: 'scroller',
      scrollable: true,
      expectedName: '',
      slideRelations: [],
      focusable: true,
    }),
    html: fixtureHtml({subject: 'scroller', trapTab: true}),
  },
  {
    id: 'violating-control-focus',
    summary: 'a next control that moves focus elsewhere',
    facts: facts({
      part: 'control',
      expectedName: 'Next slide',
      slideRelations: [],
      focusable: true,
      preservesControlFocus: true,
    }),
    html: fixtureHtml({subject: 'next', moveFocusOnNext: true}),
  },
];

export const CONFORMING_CAROUSEL_FIXTURES = CAROUSEL_FIXTURES.filter(fixture =>
  fixture.id.startsWith('conforming-'),
).map(fixture => fixture.id);

export const CAROUSEL_MUTATIONS: Readonly<Record<string, readonly string[]>> = {
  'carousel.container.role-exposed': ['violating-container-role'],
  'carousel.container.name-exposed': ['violating-container-name'],
  'carousel.container.roledescription': ['violating-container-roledescription'],
  'carousel.slide.role-exposed': ['violating-slide-role'],
  'carousel.slide.name-exposed': ['violating-slide-name'],
  'carousel.slide.roledescription': ['violating-slide-roledescription'],
  'carousel.collection.contains-slides': ['violating-detached-slide'],
  'carousel.slide.offscreen-exposed': ['violating-offscreen-hidden'],
  'carousel.scroller.role-and-name': ['violating-scroller-unnamed'],
  'carousel.scroller.reachable-and-escapable': [
    'violating-scroller-unreachable',
    'violating-scroller-trap',
  ],
  'carousel.control.focus-preserved': ['violating-control-focus'],
};

const EXPECTED_FAILURES: Readonly<Record<string, string>> = {
  'carousel.container.role-exposed:violating-container-role':
    'the browser exposes this container as "main", not as a region or group',
  'carousel.container.name-exposed:violating-container-name':
    'the browser computes no accessible name for this carousel',
  'carousel.container.roledescription:violating-container-roledescription':
    'the carousel has no aria-roledescription="carousel"',
  'carousel.slide.role-exposed:violating-slide-role':
    'the browser exposes this slide as "article", not as a group',
  'carousel.slide.name-exposed:violating-slide-name':
    'the browser computes no accessible name for this slide',
  'carousel.slide.roledescription:violating-slide-roledescription':
    'the slide has no aria-roledescription="slide"',
  'carousel.collection.contains-slides:violating-detached-slide':
    'the binding’s "slide-1" is not contained by the carousel',
  'carousel.slide.offscreen-exposed:violating-offscreen-hidden':
    'the off-screen slide is absent from the accessibility tree',
  'carousel.scroller.role-and-name:violating-scroller-unnamed':
    'the browser exposes the focusable scroll container with no role',
  'carousel.scroller.reachable-and-escapable:violating-scroller-unreachable':
    '10 presses of Tab never reached the scroll container',
  'carousel.scroller.reachable-and-escapable:violating-scroller-trap':
    'Tab did not leave the scroll container',
  'carousel.control.focus-preserved:violating-control-focus':
    'activating the carousel control moved focus away from it',
};

export function expectedCarouselMutationFailure(
  expectation: string,
  fixture: string,
): string {
  const failure = EXPECTED_FAILURES[`${expectation}:${fixture}`];
  if (failure == null) {
    throw new Error(
      `no expected Carousel mutation failure for ${expectation}:${fixture}`,
    );
  }
  return failure;
}

export function carouselFixture(id: string): CarouselFixture {
  const fixture = CAROUSEL_FIXTURES.find(candidate => candidate.id === id);
  if (fixture == null) {
    throw new Error(`unknown Carousel fixture "${id}"`);
  }
  return fixture;
}
