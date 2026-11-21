// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PopoverTabBehavior.stories.tsx
 * @input Popover, usePopover, Button, Toolbar, HStack, VStack and Text from
 *   @astryxdesign/core
 * @output A tip built with usePopover between two page buttons, with a
 *   second Popover after them. Six stories let Tab pass through the open
 *   tip in page order: with the trigger as its anchor, with a wrapper as its
 *   trigger, with an anchor of its own, with a tooltip on its trigger, with
 *   a cut label on its trigger, and with a toolbar item as its trigger. One
 *   is not modal and holds Tab
 * @position Fixture for Popover/__tests__/PopoverTabBehavior.interaction.browser.spec.ts
 */

import {useRef} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Popover, usePopover} from '@astryxdesign/core/Popover';
import {Button} from '@astryxdesign/core/Button';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {Toolbar} from '@astryxdesign/core/Toolbar';

const meta: Meta = {
  title: 'Core/Popover Tab Behavior',
  tags: ['no-visual'],
  parameters: {layout: 'padded'},
};
export default meta;

type Story = StoryObj;

interface TipProps {
  tabBehavior?: 'contain' | 'pageOrder';
  isModal?: boolean;
  /** The trigger ref goes on a wrapper around the button. */
  isTriggerWrapped?: boolean;
  /** The tip anchors to a button of its own, before the trigger. */
  hasSeparateAnchor?: boolean;
  /** A tooltip on the trigger. */
  triggerTooltip?: string;
  /** The row is too narrow for its labels. */
  isRowNarrow?: boolean;
}

// The row with the extra button keeps a width at which no label is cut. The
// narrow row cuts every label, so a Button shows its label in a tooltip on
// keyboard focus.
const styles = {wideRow: {minWidth: 640}, narrowRow: {width: 240}} as const;

function Tip({
  tabBehavior,
  isModal,
  isTriggerWrapped = false,
  hasSeparateAnchor = false,
  triggerTooltip,
  isRowNarrow = false,
}: TipProps) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const popover = usePopover({
    dialogLabel: 'Tip',
    tabBehavior,
    isModal,
    padding: 3,
    anchorRef: hasSeparateAnchor ? anchorRef : undefined,
  });
  const trigger = (
    <Button
      label="Show tip"
      tooltip={triggerTooltip}
      ref={isTriggerWrapped ? undefined : popover.triggerRef}
      {...popover.triggerProps}
      onClick={() => popover.toggle()}
    />
  );
  return (
    <HStack
      gap={3}
      style={
        hasSeparateAnchor
          ? styles.wideRow
          : isRowNarrow
            ? styles.narrowRow
            : undefined
      }>
      <Button label="Before" />
      {hasSeparateAnchor ? <Button label="Target" ref={anchorRef} /> : null}
      {isTriggerWrapped ? (
        <span ref={popover.triggerRef}>{trigger}</span>
      ) : (
        trigger
      )}
      <Button label="After" />
      <Popover label="More" content={<Text type="body">More filters.</Text>}>
        <Button label="More" />
      </Popover>
      {/* After every page control, so only the invoker order puts the tip's
          controls after its trigger. */}
      {popover.render(
        <VStack gap={2}>
          <Text type="body">Filters narrow the list.</Text>
          <HStack gap={2}>
            <Button label="Got it" />
            <Button label="Learn more" variant="ghost" />
          </HStack>
        </VStack>,
        {placement: 'below', style: {width: 240}},
      )}
    </HStack>
  );
}

/**
 * Tab moves from the trigger into the popover and on to the button after the
 * trigger. Escape closes the popover only while focus is inside it or on its
 * trigger.
 */
export const PageOrder: Story = {
  render: () => <Tip tabBehavior="pageOrder" />,
};

/** The trigger ref is on a wrapper; Tab from the button still enters the tip. */
export const WrappedTrigger: Story = {
  render: () => <Tip tabBehavior="pageOrder" isTriggerWrapped />,
};

/** The tip anchors to its own button and follows its trigger in the Tab order. */
export const SeparateAnchor: Story = {
  render: () => <Tip tabBehavior="pageOrder" hasSeparateAnchor />,
};

/** The trigger has a tooltip, and the tip still follows it in the Tab order. */
export const TooltipTrigger: Story = {
  render: () => <Tip tabBehavior="pageOrder" triggerTooltip="Opens the tip" />,
};

/**
 * The row cuts the trigger's label, which then shows in a tooltip on keyboard
 * focus, and the tip still follows the trigger in the Tab order.
 */
export const CutLabelTrigger: Story = {
  render: () => <Tip tabBehavior="pageOrder" isRowNarrow />,
};

function ToolbarTip() {
  const popover = usePopover({
    dialogLabel: 'Tip',
    tabBehavior: 'pageOrder',
    padding: 3,
  });
  return (
    <VStack gap={3}>
      <Button label="Before" />
      <Toolbar
        label="Tools"
        startContent={
          <>
            <Button
              label="Show tip"
              ref={popover.triggerRef}
              {...popover.triggerProps}
              onClick={() => popover.toggle()}
            />
            <Button label="Bold" />
          </>
        }
      />
      <Button label="After" />
      {popover.render(
        <HStack gap={2}>
          <Button label="Got it" />
          <Button label="Learn more" variant="ghost" />
        </HStack>,
        {placement: 'below', style: {width: 240}},
      )}
    </VStack>
  );
}

/**
 * The trigger is a toolbar item, so the keyboard hint shows from it, and the
 * tip still follows the trigger in the Tab order.
 */
export const ToolbarTrigger: Story = {
  render: () => <ToolbarTip />,
};

/** Not modal, and Tab still cycles inside the open popover. */
export const NotModal: Story = {
  render: () => <Tip isModal={false} />,
};
