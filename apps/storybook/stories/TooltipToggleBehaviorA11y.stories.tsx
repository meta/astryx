// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TooltipToggleBehaviorA11y.stories.tsx
 * @input Uses InfoTip, Tooltip, ClickableCard and Layout from core
 * @output Fixtures for the press-to-pin browser tests: an InfoTip alone and
 *   inside a clickable card, and one story with a plain Tooltip term beside
 *   an InfoTip.
 * @position The reproduction path for the press-to-pin cases in
 *   `packages/core/src/Layer/__tests__/TouchTrigger.a11y.chromium.spec.ts`
 *   (`component:Tooltip` FR9, FR10; InfoTip is Tooltip's press-to-pin
 *   trigger). Per `docs/specs/AST-009/spec.md` FR30, a browser claim is
 *   checked against a checked-in story.
 *
 * SYNC: The spec navigates to these story ids by name. Nothing at compile
 *   time catches a renamed export — the Chromium spec does, when it finds no
 *   story.
 */

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {ClickableCard} from '@astryxdesign/core/ClickableCard';
import {InfoTip} from '@astryxdesign/core/InfoTip';
import {VStack} from '@astryxdesign/core/Layout';
import {Tooltip} from '@astryxdesign/core/Tooltip';

const meta: Meta = {
  title: 'a11y/Tooltip toggle behavior',
  // Driven by the press-to-pin spec, not photographed: the states under test
  // are pins and closes across presses, which no single frame shows.
  tags: ['no-visual'],
  parameters: {
    docs: {
      description: {
        component:
          'InfoTip pins its help on a press: a click, a tap, Enter, or Space pins it, and the same press closes it. Inside a clickable card, the press stops at the InfoTip.',
      },
    },
  },
};

export default meta;

type Story = StoryObj;

const HELP = 'Rows are ranked by how many places import the icon';

/** A press pins the help open; the same press, Escape, or a press outside closes it. */
export const ButtonToggle: Story = {
  render: () => (
    <div style={{padding: 100}}>
      <InfoTip content={HELP} label="What is this?" />
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
            <InfoTip content={HELP} label="What is this?" />
          </VStack>
        </ClickableCard>
        <span>Card opened {opened} times</span>
      </VStack>
    </div>
  );
}

/** A press on the InfoTip pins its help and stops there: the card does not open. */
export const InAClickableCard: Story = {
  render: () => <InAClickableCardRender />,
};

/** A plain Tooltip term, which a tap opens, beside an InfoTip, which a press pins. */
export const TriggerBehaviors: Story = {
  render: () => (
    <div style={{padding: 100}}>
      <VStack gap={4}>
        <Tooltip content="Adaptive: a tap opens it" delay={0}>
          <span tabIndex={0}>Adaptive term</span>
        </Tooltip>
        <InfoTip content="Toggle: a press pins it" label="Toggle term" />
      </VStack>
    </div>
  ),
};
