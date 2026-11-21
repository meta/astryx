// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import type {ReactNode} from 'react';
import {RadioIndicator} from '@astryxdesign/core/Indicator';
import {Text} from '@astryxdesign/core/Text';
import {HStack, VStack} from '@astryxdesign/core/Stack';

/**
 * The radio visual on its own. Story checks that select stories by component
 * reach RadioIndicator through this file; the shared indicator stories live
 * under Core/Indicator.
 */
const meta: Meta<typeof RadioIndicator> = {
  title: 'Core/RadioIndicator',
  component: RadioIndicator,
  parameters: {layout: 'padded'},
};

export default meta;
type Story = StoryObj<typeof RadioIndicator>;

const cellStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 40,
  minHeight: 32,
} as const;

function Row({label, children}: {label: string; children: ReactNode}) {
  return (
    <HStack gap={4} vAlign="center">
      <span style={{minWidth: 120}}>
        <Text type="supporting" color="secondary">
          {label}
        </Text>
      </span>
      {children}
    </HStack>
  );
}

/** Unchecked, checked, and both disabled, at each size. */
export const States: Story = {
  render: () => (
    <VStack gap={4}>
      {(['sm', 'md'] as const).map(size => (
        <Row key={size} label={`Size ${size}`}>
          <span style={cellStyle}>
            <RadioIndicator state="unchecked" size={size} />
          </span>
          <span style={cellStyle}>
            <RadioIndicator state="checked" size={size} />
          </span>
          <span style={cellStyle}>
            <RadioIndicator state="unchecked" size={size} isDisabled />
          </span>
          <span style={cellStyle}>
            <RadioIndicator state="checked" size={size} isDisabled />
          </span>
        </Row>
      ))}
    </VStack>
  ),
};
