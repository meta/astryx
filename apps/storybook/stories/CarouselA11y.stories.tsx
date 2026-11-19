// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CarouselA11y.stories.tsx
 * @input Uses the shared Carousel binding inventory and render map
 * @output One checked-in reproduction story for every Carousel contract state
 * @position Stable real-browser fixtures required by AST-009 FR30 and AST-021.
 */

import type {Meta, StoryObj} from '@storybook/react';
import {CAROUSEL_STATE_RENDERS} from '../../../packages/core/src/Carousel/__tests__/Carousel.a11y.renders';
import {CAROUSEL_BINDING_STATES} from '../../../packages/core/src/Carousel/__tests__/Carousel.a11y.states';

function storyFor(id: string): StoryObj {
  const state = CAROUSEL_BINDING_STATES.find(candidate => candidate.id === id);
  if (state == null) {
    throw new Error(`no binding state "${id}" — see Carousel.a11y.states.ts`);
  }
  return {
    name: `Carousel — ${state.id}`,
    render: () => CAROUSEL_STATE_RENDERS[state.id](),
  };
}

const meta: Meta = {
  title: 'a11y/Carousel pattern',
  tags: ['no-visual'],
  parameters: {
    docs: {
      description: {
        component:
          'Binding states for the non-rotating Carousel accessibility contract.',
      },
    },
  },
};

export default meta;

export const ContainerLabelled = storyFor('container-labelled');
export const SlideVisible = storyFor('slide-visible');
export const SlideOffscreen = storyFor('slide-offscreen');
export const ScrollerKeyboard = storyFor('scroller-keyboard');
export const NextControlFocus = storyFor('next-control-focus');
