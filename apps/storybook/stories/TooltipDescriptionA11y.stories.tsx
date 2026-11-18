// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TooltipDescriptionA11y.stories.tsx
 * @input Button, IconButton and Tooltip
 * @output Browser fixtures for Tooltip AR1: a tooltip that adds to its
 *   trigger's name, one that repeats it (Button FR12), and a cut Button label
 *   (Button FR18), each marked with `data-case`
 * @position Read by TooltipDescription.a11y.browser.spec.ts; `no-visual`, so
 *   the visual plan never captures these fixtures
 */

import type {Meta, StoryObj} from '@storybook/react';
import {Button} from '@astryxdesign/core/Button';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Tooltip} from '@astryxdesign/core/Tooltip';
import {XMarkIcon} from '@heroicons/react/24/outline';

const meta = {
  title: 'A11y/Tooltip Description',
  tags: ['no-visual'],
  parameters: {layout: 'padded'},
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const icon = <XMarkIcon style={{width: 16, height: 16}} />;

export const Paths: Story = {
  render: () => (
    <div style={{display: 'flex', flexDirection: 'column', gap: 24}}>
      <div data-case="wrapped">
        <Tooltip content="Saves your changes to this draft">
          <Button label="Save" />
        </Tooltip>
      </div>
      <div data-case="adds">
        <IconButton label="Close" tooltip="Close the panel" icon={icon} />
      </div>
      <div data-case="repeats">
        <IconButton label="Dismiss" tooltip="Dismiss" icon={icon} />
      </div>
      <div data-case="cut" style={{width: 160}}>
        <Button label="A very long button label that overflows its box" />
      </div>
    </div>
  ),
};
