// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuTooltipA11y.stories.tsx
 * @input Uses DropdownMenu, DropdownMenuItem, Button and React state
 * @output Built-in menu triggers with tooltips for pointer and keyboard tests
 * @position Browser regression fixtures for DropdownMenuTooltip.a11y.chromium.spec.ts
 */

import type {Meta, StoryObj} from '@storybook/react';
import {useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Button} from '@astryxdesign/core/Button';
import {DropdownMenu, DropdownMenuItem} from '@astryxdesign/core/DropdownMenu';
import {spacingVars} from '@astryxdesign/core/theme/tokens.stylex';

const meta: Meta = {
  title: 'a11y/DropdownMenu tooltip',
  tags: ['no-visual'],
};
export default meta;

const styles = stylex.create({
  layout: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: spacingVars['--spacing-12'],
    padding: spacingVars['--spacing-12'],
  },
});

function MenuWithTooltip({mode}: {mode: 'data' | 'compound' | 'bottom-sheet'}) {
  const [picks, setPicks] = useState(0);
  const onPick = () => setPicks(count => count + 1);
  const button = {label: 'Actions', tooltip: 'More actions'};
  return (
    <div {...stylex.props(styles.layout)}>
      {mode === 'compound' ? (
        <DropdownMenu button={button}>
          <DropdownMenuItem label="Rename" onClick={onPick} />
        </DropdownMenu>
      ) : (
        <DropdownMenu
          button={button}
          presentation={mode === 'bottom-sheet' ? 'bottom-sheet' : 'popover'}
          items={[{label: 'Rename', onClick: onPick}]}
        />
      )}
      <Button label="Elsewhere" />
      <output aria-label="Picks">{picks}</output>
    </div>
  );
}

export const Data: StoryObj = {
  render: () => <MenuWithTooltip mode="data" />,
};

export const Compound: StoryObj = {
  render: () => <MenuWithTooltip mode="compound" />,
};

export const BottomSheet: StoryObj = {
  render: () => <MenuWithTooltip mode="bottom-sheet" />,
};
