// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BottomSheetA11y.stories.tsx
 * @input BottomSheet with overflowing content placed directly in its content
 *   box: at the hug height as plain text and as block children, and at a
 *   budget height as block children
 * @output One checked-in story per case for the browser accessibility lane;
 *   excluded from the visual matrix
 * @position Browser fixtures for BottomSheetScrollEnd.a11y.browser.spec.ts:
 *   the content box's block-end padding stays in the scroll range. Every
 *   long BottomSheet story wraps its content in a Section, which escapes that
 *   padding, so none of them shows it.
 */

import type {Meta, StoryObj} from '@storybook/react';
import {useState, type ComponentProps, type ReactNode} from 'react';
import {BottomSheet} from '@astryxdesign/core/BottomSheet';
import {Button} from '@astryxdesign/core/Button';

const meta = {
  title: 'A11y/BottomSheet',
  tags: ['no-visual'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const SENTENCE =
  'The sheet scrolls its content once it reaches its height, and the last line still clears the bottom edge by the content padding.';

function DirectContentSheet({
  height,
  children,
}: {
  height: ComponentProps<typeof BottomSheet>['height'];
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <Button label="Open sheet" onClick={() => setIsOpen(true)} />
      <BottomSheet
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        label="Direct content"
        height={height}>
        {children}
      </BottomSheet>
    </>
  );
}

const longText = Array.from({length: 24}, () => SENTENCE).join(' ');

const blocks = Array.from({length: 24}, (_, i) => (
  <p key={i} style={{margin: 0}}>
    Paragraph {i + 1}. {SENTENCE}
  </p>
));

export const HugDirectText: Story = {
  render: () => (
    <DirectContentSheet height="hug">{longText}</DirectContentSheet>
  ),
};

export const HugDirectBlocks: Story = {
  render: () => <DirectContentSheet height="hug">{blocks}</DirectContentSheet>,
};

export const CappedDirectBlocks: Story = {
  render: () => (
    <DirectContentSheet height="capped">{blocks}</DirectContentSheet>
  ),
};
