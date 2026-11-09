// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useRef, useState, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {Meta, StoryObj} from '@storybook/react';
import {
  useClickableContainer,
  usePressFeedback,
} from '@astryxdesign/core/hooks';
import {
  focusOutlineStyles,
  interactionOverlayStyles,
} from '@astryxdesign/core/utils';
import {VisuallyHidden} from '@astryxdesign/core/VisuallyHidden';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/Layout';
import {
  borderVars,
  colorVars,
  radiusVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';

/**
 * A pressable surface without Card chrome: the recipe for a surface that owns
 * its own box but presses like a ClickableCard.
 *
 * - `useClickableContainer` gives the surface its press rules: a press on the
 *   words acts, a press on a nested link or a text drag does not.
 * - `usePressFeedback` plus `interactionOverlayStyles.backgroundColor` paint
 *   the system's hover tint and the touch press on the surface.
 * - A visually hidden native `<button>` (or `<a>` for a destination) is the
 *   named control: it carries the role, the name and the Tab stop.
 * - `focusOutlineStyles.focusWithin` draws the shared focus ring, the one
 *   ClickableCard draws, on the surface while its control has keyboard focus.
 */
const meta: Meta = {
  title: 'Core/Hooks/useClickableContainer',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A pressable surface without Card chrome: `useClickableContainer` for the press rules, `usePressFeedback` with `interactionOverlayStyles.backgroundColor` for the hover tint and touch press, a visually hidden `<button>` (or `<a>` for a destination) as the named control, and `focusOutlineStyles.focusWithin` for the shared focus ring, the one ClickableCard draws. Use it when a surface owns its own box; use ClickableCard when the surface is a card.',
      },
    },
  },
};

export default meta;
type Story = StoryObj;

const styles = stylex.create({
  surface: {
    display: 'block',
    cursor: 'pointer',
    borderRadius: radiusVars['--radius-element'],
    borderInlineStartColor: colorVars['--color-border-emphasized'],
    borderInlineStartStyle: 'solid',
    borderInlineStartWidth: borderVars['--border-width'],
    paddingBlock: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-3'],
  },
});

interface PressableQuoteProps {
  /** The control's accessible name: what a press does. */
  label: string;
  /** A destination: the control is a link. */
  href?: string;
  /** An action: the control is a button. */
  onPress?: () => void;
  children: ReactNode;
}

/** The recipe: copy this component into your app. */
function PressableQuote({label, href, onPress, children}: PressableQuoteProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const controlRef = useRef<HTMLElement | null>(null);
  const pressable = usePressFeedback();
  const {onClick, onMouseUp, onPointerDown} = useClickableContainer({
    containerRef,
    interactiveRef: controlRef,
    href,
    onClick: onPress,
  });
  return (
    <div
      ref={containerRef}
      {...pressable}
      onClick={onClick}
      onMouseUp={onMouseUp}
      onPointerDown={onPointerDown}
      {...stylex.props(
        styles.surface,
        interactionOverlayStyles.backgroundColor,
        focusOutlineStyles.focusWithin,
      )}>
      <VisuallyHidden>
        {href != null ? (
          <a
            ref={node => {
              controlRef.current = node;
            }}
            href={href}>
            {label}
          </a>
        ) : (
          <button
            ref={node => {
              controlRef.current = node;
            }}
            type="button"
            onClick={onPress}>
            {label}
          </button>
        )}
      </VisuallyHidden>
      {children}
    </div>
  );
}

export const PressableSurface: Story = {
  name: 'Pressable surface without Card chrome',
  render: function PressableSurfaceStory() {
    const [jumps, setJumps] = useState(0);
    return (
      <VStack gap={3}>
        <PressableQuote
          label="Jump to the quoted message"
          onPress={() => setJumps(count => count + 1)}>
          <VStack gap={1}>
            <Text type="supporting" color="secondary">
              Replying to Alex
            </Text>
            <Text type="body">
              Can we move the review to Thursday? The{' '}
              <a href="#agenda">agenda</a> is in the doc.
            </Text>
          </VStack>
        </PressableQuote>
        <Text type="supporting" color="secondary">
          {jumps === 0 ? 'Not jumped yet' : `Jumped ${jumps}×`}
        </Text>
      </VStack>
    );
  },
};

export const PressableSurfaceLink: Story = {
  name: 'Pressable surface without Card chrome (link)',
  render: () => (
    <PressableQuote label="Open the quoted message" href="#message-42">
      <VStack gap={1}>
        <Text type="supporting" color="secondary">
          Replying to Alex
        </Text>
        <Text type="body">Can we move the review to Thursday?</Text>
      </VStack>
    </PressableQuote>
  ),
};
