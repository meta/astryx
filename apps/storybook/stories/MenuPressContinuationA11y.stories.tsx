// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MenuPressContinuationA11y.stories.tsx
 * @input The menu-press continuation fixture from core's hook tests
 * @output The fixture that the menu-press continuation interaction spec
 *   drives in a real browser. A button's finger long press opens a menu and
 *   hands it the held finger. Each picked row prints outside the menu.
 *   Excluded from the visual matrix.
 * @position The reproduction path for
 *   `packages/core/src/hooks/__tests__/MenuPressContinuation.interaction.browser.spec.ts`.
 *
 * SYNC: The spec navigates to this story id by name.
 */

import type {Meta, StoryObj} from '@storybook/react';
import {ContinuedPressFixture} from '../../../packages/core/src/hooks/__tests__/menuPressContinuation.fixture';

const meta: Meta = {
  title: 'a11y/Menu press continuation',
  tags: ['no-visual'],
};

export default meta;

export const ContinuedPress: StoryObj = {
  render: () => <ContinuedPressFixture />,
};
