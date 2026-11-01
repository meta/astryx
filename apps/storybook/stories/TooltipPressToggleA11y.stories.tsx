// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TooltipPressToggleA11y.stories.tsx
 * @input Uses Tooltip, Button, ClickableCard and Layout from core
 * @output The fixtures the press-toggle proofs drive in a real browser: a
 *   button whose only job is its tooltip, and the same trigger inside a
 *   clickable card.
 * @position The reproduction path for the `pressTrigger="toggle"` cases in
 *   `packages/core/src/Layer/__tests__/TouchTrigger.a11y.chromium.spec.ts`
 *   (`component:Tooltip` FR9, FR10; `docs/specs/AST-009/spec.md` FR30: a
 *   browser claim is checked against a checked-in story).
 *
 * SYNC: The spec navigates to these story ids by name. Nothing at compile
 *   time catches a renamed export — the Chromium spec does, when it finds no
 *   story.
 */

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Button} from '@astryxdesign/core/Button';
import {ClickableCard} from '@astryxdesign/core/ClickableCard';
import {VStack} from '@astryxdesign/core/Layout';
import {Tooltip} from '@astryxdesign/core/Tooltip';

const meta: Meta = {
  title: 'a11y/Tooltip press toggle',
  // Driven by the press-toggle spec, not photographed: the states under test
  // are pins and closes across presses, which no single frame shows.
  tags: ['no-visual'],
  parameters: {
    docs: {
      description: {
        component:
          'A button whose only job is its tooltip takes `pressTrigger="toggle"`: a click, a tap, Enter, or Space pins the tooltip, and the same press closes it. Inside a clickable card, the press stops at the trigger.',
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
        pressTrigger="toggle">
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
              pressTrigger="toggle">
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
