// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {useCallback, useRef} from 'react';
import {useKeyboardHint} from '@astryxdesign/core/hooks';
import {Toolbar} from '@astryxdesign/core/Toolbar';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Section} from '@astryxdesign/core/Section';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/Layout';

/**
 * `useKeyboardHint` shows an ephemeral "← → to navigate" badge the first time a
 * roving-tabindex composite receives keyboard focus, teaching sighted keyboard
 * users that arrow keys move within the group.
 *
 * **Tab into the widget with the keyboard** to see the hint appear. It
 * auto-dismisses on the first arrow press, on blur, or after a short timeout,
 * and does not re-show for that instance. (A mouse click does not trigger it —
 * the hint only appears on `:focus-visible` entry.)
 */

// ---------------------------------------------------------------------------
// A minimal roving-tabindex toolbar built by hand, to show the raw hook wiring.
// ---------------------------------------------------------------------------

interface HintToolbarProps {
  label: string;
  orientation: 'horizontal' | 'vertical';
  items: string[];
}

function HintToolbar({label, orientation, items}: HintToolbarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hint = useKeyboardHint({orientation});

  const nextKey = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
  const prevKey = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const buttons = Array.from(
        container.querySelectorAll<HTMLButtonElement>('button'),
      );
      const current = buttons.findIndex(b => b === document.activeElement);
      if (current === -1) {
        return;
      }
      let next: number;
      if (e.key === nextKey) {
        next = (current + 1) % buttons.length;
      } else if (e.key === prevKey) {
        next = (current - 1 + buttons.length) % buttons.length;
      } else {
        return;
      }
      e.preventDefault();
      buttons[current].tabIndex = -1;
      buttons[next].tabIndex = 0;
      buttons[next].focus();
    },
    [nextKey, prevKey],
  );

  return (
    <div
      ref={containerRef}
      role="toolbar"
      aria-label={label}
      aria-orientation={orientation}
      onKeyDown={e => {
        hint.onKeyDown(e);
        handleKeyDown(e);
      }}
      onFocus={hint.onFocus}
      onBlur={hint.onBlur}
      style={{
        display: 'inline-flex',
        flexDirection: orientation === 'vertical' ? 'column' : 'row',
        alignItems: orientation === 'vertical' ? 'stretch' : 'center',
        gap: 4,
        padding: 8,
        borderRadius: 8,
        background: 'var(--color-background-muted)',
      }}>
      {items.map((item, i) => (
        <button
          key={item}
          type="button"
          tabIndex={i === 0 ? 0 : -1}
          style={{
            appearance: 'none',
            border: 'none',
            borderRadius: 6,
            padding: '6px 12px',
            background: 'var(--color-background-popover)',
            color: 'var(--color-text-primary)',
            font: 'inherit',
            textAlign: orientation === 'vertical' ? 'start' : 'center',
            cursor: 'pointer',
          }}>
          {item}
        </button>
      ))}
      {hint.hintElement}
    </div>
  );
}

const meta: Meta = {
  title: 'Core/Hooks/useKeyboardHint',
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj;

/**
 * Tab into the toolbar to reveal the horizontal "← → to navigate" hint.
 */
export const Default: Story = {
  render: () => (
    <Card padding={4}>
      <VStack gap={3}>
        <Text type="body" weight="bold">
          Formatting
        </Text>
        <Text type="supporting" color="secondary">
          Tab into the toolbar with your keyboard — the hint appears once.
        </Text>
        <HintToolbar
          label="Formatting"
          orientation="horizontal"
          items={['Bold', 'Italic', 'Underline']}
        />
      </VStack>
    </Card>
  ),
};

/**
 * A vertical list (e.g. a sidebar nav) shows the "↑ ↓ to navigate" hint.
 */
export const Vertical: Story = {
  render: () => (
    <Card padding={4}>
      <VStack gap={3}>
        <Text type="body" weight="bold">
          Navigation
        </Text>
        <Text type="supporting" color="secondary">
          Tab into the list — the vertical hint teaches ↑ ↓ navigation.
        </Text>
        <HintToolbar
          label="Sidebar navigation"
          orientation="vertical"
          items={['Overview', 'Reports', 'Settings']}
        />
      </VStack>
    </Card>
  ),
};

/**
 * The real `<Toolbar>` component wires `useKeyboardHint` in automatically — no
 * extra wiring required. Tab into it to see the integrated behavior.
 */
export const WithToolbar: Story = {
  render: () => (
    <Card style={{width: 420}}>
      <Toolbar
        label="Document actions"
        startContent={
          <>
            <Button label="Cut" variant="ghost" />
            <Button label="Copy" variant="ghost" />
            <Button label="Paste" variant="ghost" />
          </>
        }
        endContent={<Button label="Settings" variant="ghost" />}
      />
      <Section>
        <Text type="supporting" color="secondary">
          Tab into the toolbar above — the arrow-key hint appears on first
          keyboard focus.
        </Text>
      </Section>
    </Card>
  ),
};
