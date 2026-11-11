// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LayerSamePress.stories.tsx
 * @input DropdownMenu, ContextMenu, Popover and BottomSheet from
 *   @astryxdesign/core
 * @output A story whose menu rows open a layer as they act: a Popover, a
 *   BottomSheet, and a Popover nested in an open Popover. The rows act at
 *   the press's release, so the release must not close the layer it opened
 * @position Fixture for Layer/__tests__/LayerSamePress.interaction.browser.spec.ts
 */

import {useState, type ReactNode} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {DropdownMenu, DropdownMenuItem} from '@astryxdesign/core/DropdownMenu';
import {ContextMenu} from '@astryxdesign/core/ContextMenu';
import {Popover} from '@astryxdesign/core/Popover';
import {BottomSheet} from '@astryxdesign/core/BottomSheet';
import {Button} from '@astryxdesign/core/Button';

const meta: Meta = {
  title: 'Core/Layer Same Press',
  tags: ['no-visual'],
  parameters: {layout: 'padded'},
};
export default meta;

type Story = StoryObj;

/** A controlled Popover anchored to `children`, closed by default. */
function AnchoredPopover({
  label,
  isOpen,
  onOpenChange,
  content,
  children,
}: {
  label: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  content: ReactNode;
  children: ReactNode;
}) {
  return (
    <Popover
      label={label}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isModal={false}
      content={content}>
      {({ref}) => (
        <span ref={ref} style={{display: 'inline-flex'}}>
          {children}
        </span>
      )}
    </Popover>
  );
}

function SamePressDemo() {
  const [isItemPopoverOpen, setItemPopoverOpen] = useState(false);
  const [isSheetOpen, setSheetOpen] = useState(false);
  const [isContextPopoverOpen, setContextPopoverOpen] = useState(false);
  const [isParentOpen, setParentOpen] = useState(false);
  const [isChildOpen, setChildOpen] = useState(false);
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 48}}>
      <AnchoredPopover
        label="Item popover"
        isOpen={isItemPopoverOpen}
        onOpenChange={setItemPopoverOpen}
        content={<button type="button">Inside item popover</button>}>
        <DropdownMenu button={{label: 'Actions'}}>
          <DropdownMenuItem
            label="Open popover"
            onClick={() => setItemPopoverOpen(true)}
          />
          <DropdownMenuItem
            label="Open sheet"
            onClick={() => setSheetOpen(true)}
          />
        </DropdownMenu>
      </AnchoredPopover>

      <AnchoredPopover
        label="Context popover"
        isOpen={isContextPopoverOpen}
        onOpenChange={setContextPopoverOpen}
        content={<span>Context popover content</span>}>
        <ContextMenu
          label="Region actions"
          items={[
            {
              label: 'Open context popover',
              onClick: () => setContextPopoverOpen(true),
            },
          ]}>
          <div
            style={{padding: 24, border: '1px dashed currentColor'}}
            data-testid="context-region">
            Right-click here
          </div>
        </ContextMenu>
      </AnchoredPopover>

      <AnchoredPopover
        label="Parent popover"
        isOpen={isParentOpen}
        onOpenChange={setParentOpen}
        content={
          <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
            <AnchoredPopover
              label="Child popover"
              isOpen={isChildOpen}
              onOpenChange={setChildOpen}
              content={<button type="button">Inside child popover</button>}>
              <DropdownMenu button={{label: 'Child actions'}}>
                <DropdownMenuItem
                  label="Open child"
                  onClick={() => setChildOpen(true)}
                />
              </DropdownMenu>
            </AnchoredPopover>
            <span>Inside parent popover</span>
          </div>
        }>
        <Button label="Open parent" onClick={() => setParentOpen(true)} />
      </AnchoredPopover>

      <div data-testid="outside" style={{height: 120}}>
        Outside
      </div>

      <BottomSheet
        label="Item sheet"
        isOpen={isSheetOpen}
        onOpenChange={setSheetOpen}>
        <p>Opened from a menu row</p>
      </BottomSheet>
    </div>
  );
}

export const MenuRowOpensLayer: Story = {
  render: () => <SamePressDemo />,
};
