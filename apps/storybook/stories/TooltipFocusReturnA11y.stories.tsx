// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TooltipFocusReturnA11y.stories.tsx
 * @input Uses Popover, Tooltip and Button from core
 * @output The fixture the tooltip focus-return regression spec drives in a
 *   real browser: a popover whose trigger also carries a tooltip.
 * @position The reproduction path for
 *   `packages/core/src/Tooltip/__tests__/TooltipFocusReturn.a11y.chromium.spec.ts`
 *   (`docs/specs/AST-009/spec.md` FR30: a browser claim is checked against a
 *   checked-in story, not a page a test builds and throws away).
 *
 * Closing the popover from the keyboard hands focus back to its trigger while
 * the engine is still hiding the popover, and the Popover API refuses to show
 * another popover inside that window. The tooltip on the trigger is the layer
 * that asks; the spec checks that the press closes the popover without an
 * error and the tooltip still appears for the keyboard focus that returned.
 *
 * SYNC: The spec navigates to this story id by name. Nothing at compile time
 *   catches a renamed export — the Chromium spec does, when it finds no story.
 */

import type {Meta, StoryObj} from '@storybook/react';
import {Button} from '@astryxdesign/core/Button';
import {Popover} from '@astryxdesign/core/Popover';
import {Tooltip} from '@astryxdesign/core/Tooltip';

const meta: Meta = {
  title: 'a11y/Tooltip focus return',
  // This fixture exists to be DRIVEN by the regression spec, not photographed:
  // the state under test is a focus hand-off inside one keypress, which no
  // frame can show. Excluding it costs no coverage — it is driven in a real
  // browser.
  tags: ['no-visual'],
  parameters: {
    docs: {
      description: {
        component:
          'A popover whose trigger carries a tooltip. Tab to the trigger, open the popover with Enter, then close it with Escape: focus returns to the trigger and the tooltip shows again, with no error.',
      },
    },
  },
};

export default meta;

/**
 * A popover trigger that also carries a tooltip — the shape of any toolbar
 * button with a hint that opens a menu or a settings surface.
 */
export const PopoverTriggerWithTooltip: StoryObj = {
  name: 'popover trigger that carries a tooltip',
  render: () => (
    <Popover
      label="Options"
      content={<Button label="Inside action" onClick={() => {}} />}>
      <Tooltip content="More options">
        <Button label="Options" />
      </Tooltip>
    </Popover>
  ),
};
