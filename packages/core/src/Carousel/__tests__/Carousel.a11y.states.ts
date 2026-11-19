// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Carousel.a11y.states.ts
 * @input Uses CarouselStateFacts from @astryxdesign/a11y-spec
 * @output The AST-021 binding inventory for Carousel semantic parts
 * @position Data-only inventory shared by jsdom, Storybook, and Chromium bindings.
 */

import type {CarouselStateFacts} from '@astryxdesign/a11y-spec';

export interface CarouselBindingState {
  readonly id: string;
  readonly summary: string;
  readonly facts: CarouselStateFacts;
  readonly subject:
    | {readonly role: 'region' | 'group' | 'button'; readonly name: string}
    | {readonly selector: string};
  readonly relations?: Readonly<Record<string, {readonly selector: string}>>;
  readonly storyId: string;
}

export type CarouselBindingRow = CarouselBindingState;

const story = (id: string) => `a11y-carousel-pattern--${id}`;
const slideRelations = {
  'slide-1': {selector: '[role="group"][aria-label="Slide 1 of 4"]'},
  'slide-2': {selector: '[role="group"][aria-label="Slide 2 of 4"]'},
  'slide-3': {selector: '[role="group"][aria-label="Slide 3 of 4"]'},
  'slide-4': {selector: '[role="group"][aria-label="Slide 4 of 4"]'},
} as const;

export const CAROUSEL_BINDING_STATES = [
  {
    id: 'container-labelled',
    summary: 'the labelled Carousel region and all four slides',
    facts: {
      part: 'container',
      expectedName: 'Featured work',
      slideRelations: Object.keys(slideRelations),
      offscreen: false,
      scrollable: false,
      focusable: false,
      preservesControlFocus: false,
    },
    subject: {role: 'region', name: 'Featured work'},
    relations: slideRelations,
    storyId: story('container-labelled'),
  },
  {
    id: 'slide-visible',
    summary: 'the first visible positional slide',
    facts: {
      part: 'slide',
      expectedName: 'Slide 1 of 4',
      slideRelations: [],
      offscreen: false,
      scrollable: false,
      focusable: false,
      preservesControlFocus: false,
    },
    subject: {role: 'group', name: 'Slide 1 of 4'},
    storyId: story('slide-visible'),
  },
  {
    id: 'slide-offscreen',
    summary: 'the fourth off-screen slide that remains exposed',
    facts: {
      part: 'slide',
      expectedName: 'Slide 4 of 4',
      slideRelations: [],
      offscreen: true,
      scrollable: false,
      focusable: false,
      preservesControlFocus: false,
    },
    subject: {role: 'group', name: 'Slide 4 of 4'},
    storyId: story('slide-offscreen'),
  },
  {
    id: 'scroller-keyboard',
    summary: 'the native horizontal scroll container in the tab sequence',
    facts: {
      part: 'scroller',
      expectedName: '',
      slideRelations: [],
      offscreen: false,
      scrollable: true,
      focusable: true,
      preservesControlFocus: false,
    },
    subject: {
      selector: '[data-testid="carousel-a11y"] > .astryx-carousel-scroller',
    },
    storyId: story('scroller-keyboard'),
  },
  {
    id: 'next-control-focus',
    summary: 'the looping next control, which stays enabled and keeps focus',
    facts: {
      part: 'control',
      expectedName: 'Scroll right',
      slideRelations: [],
      offscreen: false,
      scrollable: false,
      focusable: true,
      preservesControlFocus: true,
    },
    subject: {role: 'button', name: 'Scroll right'},
    storyId: story('next-control-focus'),
  },
] as const satisfies ReadonlyArray<CarouselBindingState>;

export const CAROUSEL_EXCLUSIONS = [
  {
    owner: 'Button pattern',
    classification: 'preserved',
    reason:
      'Navigation-control role, name, activation, unavailable state, and pointer cancellation remain owned by the shared Button contract.',
  },
  {
    owner: 'Carousel implementation and visual gate',
    classification: 'preserved',
    reason:
      'Scroll distance, snapping, looping, edge fades, focus-ring paint, target geometry, and reduced-motion behavior remain component-owned browser and visual evidence.',
  },
  {
    owner: 'Caller content',
    classification: 'out-of-scope',
    reason:
      'Slide descendants keep their own image, link, control, reading-order, and language obligations.',
  },
  {
    owner: 'Automatic rotation',
    classification: 'out-of-scope',
    reason:
      'Carousel does not auto-advance; the public docs explicitly tell consumers not to auto-advance items.',
  },
] as const;
