// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file NestedControlPress.stories.tsx
 * @input ClickableCard, SelectableCard, Item, TreeList, Token and Button from
 *   @astryxdesign/core
 * @output One story with each container that holds a nested control: a
 *   ClickableCard and a SelectableCard with a Button, an Item row and a
 *   TreeList row with an end-content Button, and a Token with a remove
 *   button, and a standalone Button. A press on the nested control paints
 *   only that control; a press on the container's own surface, or a held
 *   Space key on its action, paints the container
 * @position Fixture for __tests__/NestedControlPress.a11y.chromium.spec.ts
 */

import type {ReactNode} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {ClickableCard} from '@astryxdesign/core/ClickableCard';
import {SelectableCard} from '@astryxdesign/core/SelectableCard';
import {Item} from '@astryxdesign/core/Item';
import {TreeList} from '@astryxdesign/core/TreeList';
import {Token} from '@astryxdesign/core/Token';
import {Button} from '@astryxdesign/core/Button';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/Layout';

const meta: Meta = {
  title: 'Core/Nested Control Press',
  tags: ['no-visual'],
  parameters: {layout: 'padded'},
};
export default meta;

type Story = StoryObj;

function Case({id, children}: {id: string; children: ReactNode}) {
  return (
    <div data-testid={id} style={{width: 320}}>
      {children}
    </div>
  );
}

function NestedButton() {
  return <Button label="Nested" size="sm" onClick={() => {}} />;
}

export const Containers: Story = {
  render: () => (
    <VStack gap={4}>
      <Case id="clickable-card">
        <ClickableCard label="Open billing" onClick={() => {}}>
          <VStack gap={2}>
            <Text type="body">Billing summary</Text>
            <NestedButton />
          </VStack>
        </ClickableCard>
      </Case>
      <Case id="selectable-card">
        <SelectableCard label="Plan" isSelected={false} onChange={() => {}}>
          <VStack gap={2}>
            <Text type="body">Team plan</Text>
            <NestedButton />
          </VStack>
        </SelectableCard>
      </Case>
      <Case id="item">
        <Item
          label="Open row"
          onClick={() => {}}
          endContent={<NestedButton />}
        />
      </Case>
      <Case id="tree-list">
        <TreeList
          items={[
            {
              id: 'row',
              label: 'Open tree row',
              onClick: () => {},
              endContent: <NestedButton />,
            },
          ]}
        />
      </Case>
      <Case id="token">
        <Token label="Filter token" onClick={() => {}} onRemove={() => {}} />
      </Case>
      <Case id="button">
        <Button label="Standalone" onClick={() => {}} />
      </Case>
    </VStack>
  ),
};
