// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TooltipToggleBehaviorA11y.stories.tsx
 * @input Uses Tooltip, HoverCard, Button, ClickableCard and Layout from core
 * @output The fixtures the toggle-behavior proofs drive in a real browser: a
 *   button whose only job is its tooltip, the same trigger inside a clickable
 *   card, an anchored trigger with its own click handler inside a clickable
 *   card, a trigger whose tooltip opens on no focus, one trigger per
 *   `triggerBehavior` value, and an unlabelled HoverCard of two paragraphs on
 *   a button.
 * @position The reproduction path for the `triggerBehavior="toggle"` cases in
 *   `packages/core/src/Layer/__tests__/TouchTrigger.a11y.chromium.spec.ts`
 *   (`component:Tooltip` FR9, FR10; `component:HoverCard` FR9, FR10;
 *   `docs/specs/AST-009/spec.md` FR30: a
 *   browser claim is checked against a checked-in story).
 *
 * SYNC: The spec navigates to these story ids by name. Nothing at compile
 *   time catches a renamed export — the Chromium spec does, when it finds no
 *   story.
 */

import {useRef, useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Button} from '@astryxdesign/core/Button';
import {ClickableCard} from '@astryxdesign/core/ClickableCard';
import {HoverCard} from '@astryxdesign/core/HoverCard';
import {VStack} from '@astryxdesign/core/Layout';
import {Tooltip} from '@astryxdesign/core/Tooltip';

const meta: Meta = {
  title: 'a11y/Tooltip toggle behavior',
  // Driven by the toggle-behavior spec, not photographed: the states under test
  // are pins and closes across presses, which no single frame shows.
  tags: ['no-visual'],
  parameters: {
    docs: {
      description: {
        component:
          'A button whose only job is its tooltip takes `triggerBehavior="toggle"`: a click, a tap, Enter, or Space pins the tooltip, and the same press closes it. Inside a clickable card, the press stops at the trigger.',
      },
    },
  },
};

export default meta;

type Story = StoryObj;

/** A press pins the tooltip open; the same press, Escape, or a press outside closes it. */
export const ButtonToggle: Story = {
  render: () => (
    <div style={{padding: 100}}>
      <Tooltip
        content="Rows are ranked by how many places import the icon"
        placement="above"
        triggerBehavior="toggle">
        <Button label="What is this?" variant="secondary">
          ?
        </Button>
      </Tooltip>
    </div>
  ),
};

function InAClickableCardRender() {
  const [opened, setOpened] = useState(0);
  return (
    <div style={{padding: 100, maxWidth: 360}}>
      <VStack gap={2}>
        <ClickableCard label="Icon usage" onClick={() => setOpened(n => n + 1)}>
          <VStack gap={2}>
            Icon usage
            <Tooltip
              content="Rows are ranked by how many places import the icon"
              placement="above"
              triggerBehavior="toggle">
              <Button label="What is this?" variant="secondary">
                ?
              </Button>
            </Tooltip>
          </VStack>
        </ClickableCard>
        <span>Card opened {opened} times</span>
      </VStack>
    </div>
  );
}

/** A press on the trigger pins its tooltip and stops there: the card does not open. */
export const InAClickableCard: Story = {
  render: () => <InAClickableCardRender />,
};

function AnchoredActionInACardRender() {
  const [opened, setOpened] = useState(0);
  const [pressed, setPressed] = useState(0);
  const anchorRef = useRef<HTMLButtonElement>(null);
  return (
    <div style={{padding: 100, maxWidth: 360}}>
      <VStack gap={2}>
        <ClickableCard label="Icon usage" onClick={() => setOpened(n => n + 1)}>
          <VStack gap={2}>
            Icon usage
            <Button
              ref={anchorRef}
              label="What is this?"
              variant="secondary"
              onClick={() => setPressed(n => n + 1)}>
              ?
            </Button>
            <Tooltip
              anchorRef={anchorRef}
              content="Rows are ranked by how many places import the icon"
              placement="above"
              triggerBehavior="toggle"
            />
          </VStack>
        </ClickableCard>
        <span>Card opened {opened} times</span>
        <span>Button pressed {pressed} times</span>
      </VStack>
    </div>
  );
}

/**
 * An anchored trigger with its own click handler, in a clickable card: the
 * pinning press runs the trigger's own handler, and the card ignores it.
 */
export const AnchoredActionInACard: Story = {
  render: () => <AnchoredActionInACardRender />,
};

/** A tooltip that opens on no focus: focus moving to another control still closes a pin. */
export const FocusTriggerNever: Story = {
  render: () => (
    <div style={{padding: 100}}>
      <VStack gap={2}>
        <Tooltip
          content="Rows are ranked by how many places import the icon"
          placement="above"
          triggerBehavior="toggle"
          focusTrigger="never">
          <Button label="What is this?" variant="secondary">
            ?
          </Button>
        </Tooltip>
        <Button label="Next" variant="secondary">
          Next
        </Button>
      </VStack>
    </div>
  ),
};

/** One info-only trigger per `triggerBehavior` value: a tap opens, never opens, or pins. */
export const TriggerBehaviors: Story = {
  render: () => (
    <div style={{padding: 100}}>
      <VStack gap={4}>
        <Tooltip content="Adaptive: a tap opens it" triggerBehavior="adaptive">
          <span tabIndex={0}>Adaptive term</span>
        </Tooltip>
        <Tooltip content="Hover: touch never opens it" triggerBehavior="hover">
          <span tabIndex={0}>Hover term</span>
        </Tooltip>
        <Tooltip content="Toggle: a press pins it" triggerBehavior="toggle">
          <Button label="Toggle term" variant="secondary">
            ?
          </Button>
        </Tooltip>
      </VStack>
    </div>
  ),
};

/**
 * An unlabelled card of two paragraphs on a button: a press pins it, its text
 * is announced with the paragraphs apart, and a press on that text, which
 * moves focus to no element, keeps it pinned.
 */
export const HoverCardToggle: Story = {
  render: () => (
    <div style={{padding: 100}}>
      <HoverCard
        content={
          <>
            <p>Ada Lovelace</p>
            <p>Analyst, Payments</p>
          </>
        }
        placement="below"
        triggerBehavior="toggle">
        <Button label="Ada" variant="secondary">
          Ada
        </Button>
      </HoverCard>
    </div>
  ),
};
