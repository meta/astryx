// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {Meta, StoryObj} from '@storybook/react';
import {Button} from '@astryxdesign/core/Button';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {ClickableCard} from '@astryxdesign/core/ClickableCard';
import {Collapsible} from '@astryxdesign/core/Collapsible';
import {DropdownMenu, DropdownMenuItem} from '@astryxdesign/core/DropdownMenu';

import {Item} from '@astryxdesign/core/Item';
import {Link} from '@astryxdesign/core/Link';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Switch} from '@astryxdesign/core/Switch';
import {Tab, TabList} from '@astryxdesign/core/TabList';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/Layout';

/**
 * The touch press model, on every kind of pressable surface.
 *
 * View these with a coarse pointer: in Chromium, open DevTools, toggle the
 * device toolbar (a phone preset), and use the touch cursor; or open Storybook
 * on a phone. Under a finger the bare `:active` arm is dropped and the press
 * follows UIKit. A surface highlights in the frame the finger lands, or
 * 150 ms later inside a scroller, where a flick paints nothing; travelling
 * 10 px, or the browser taking the touch to scroll, cancels it with no fade;
 * a tap shorter than the delay paints at the lift; the lift fades it out. A
 * mouse keeps `:active` on a desktop.
 */
const meta: Meta = {
  title: 'Core/Press feedback (touch)',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The touch press model on every pressable surface. View with a coarse pointer (DevTools device toolbar, or a phone). Under a finger the bare `:active` arm is dropped and one document-level controller writes `data-astryx-press="on"` while a press is held and `data-astryx-press="fading"` for the release. A surface highlights in the frame the finger lands (150 ms later inside a scroller) and fades at the lift; 10 px of travel or a scroll claiming the touch cancels it with no fade. A mouse keeps `:active` on a desktop. Scroll the list stories with a finger: nothing paints while the list moves.',
      },
    },
  },
};

export default meta;
type Story = StoryObj;

const controlNote = (what: string) =>
  `${what} Touch: paints in the frame the finger lands. Lift: fades out. A scroll that takes the touch: the paint goes at once, with no fade and no click.`;

export const Buttons: Story = {
  parameters: {
    docs: {description: {story: controlNote('Buttons under a finger.')}},
  },
  render: () => (
    <VStack gap={3}>
      <Button label="Primary" variant="primary" />
      <Button label="Secondary" variant="secondary" />
      <Button label="Ghost" variant="ghost" />
      <Button label="Destructive" variant="destructive" />
      <Button label="Disabled — never presses" isDisabled />
    </VStack>
  ),
};

export const Rows: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Item rows, a menu, and a clickable card. The rows sit in a scroller, so a held row paints after 150 ms, a tap paints at the lift, and a drag or scroll never paints; the card, outside it, paints in the frame the finger lands. Flick the list and no row paints.',
      },
    },
  },
  render: () => (
    <VStack gap={4}>
      <div
        style={{
          height: 220,
          overflowY: 'auto',
          border: '1px solid transparent',
        }}>
        {Array.from({length: 24}, (_, index) => (
          <Item
            key={index}
            label={`Conversation ${index + 1}`}
            description="Press and hold, or scroll past"
            onClick={() => {}}
          />
        ))}
      </div>
      <DropdownMenu button={{label: 'Menu'}}>
        <DropdownMenuItem label="Rename" onClick={() => {}} />
        <DropdownMenuItem label="Duplicate" onClick={() => {}} />
        <DropdownMenuItem
          label="Delete"
          variant="destructive"
          onClick={() => {}}
        />
      </DropdownMenu>
      <ClickableCard label="A clickable card" onClick={() => {}}>
        <Text>A clickable card: press and hold</Text>
      </ClickableCard>
    </VStack>
  ),
};

export const Controls: Story = {
  parameters: {
    docs: {
      description: {
        story: controlNote(
          'The eight components that gained a pressed state, under a finger.',
        ),
      },
    },
  },
  render: () => {
    const [on, setOn] = useState(false);
    const [checked, setChecked] = useState<boolean | 'indeterminate'>(false);
    const [radio, setRadio] = useState('email');
    const [segment, setSegment] = useState('grid');
    const [tab, setTab] = useState('home');
    return (
      <VStack gap={4}>
        <Switch label="Notifications" value={on} onChange={setOn} />
        <CheckboxInput
          label="Accept terms"
          value={checked}
          onChange={setChecked}
        />
        <RadioList label="Channel" value={radio} onChange={setRadio}>
          <RadioListItem label="Email" value="email" />
          <RadioListItem label="SMS" value="sms" />
        </RadioList>
        <SegmentedControl value={segment} onChange={setSegment} label="View">
          <SegmentedControlItem value="grid" label="Grid" />
          <SegmentedControlItem value="list" label="List" />
        </SegmentedControl>
        <TabList value={tab} onChange={setTab}>
          <Tab value="home" label="Home" />
          <Tab value="settings" label="Settings" />
        </TabList>
        <Text>
          Read the{' '}
          <Link href="#docs" onClick={e => e.preventDefault()}>
            documentation
          </Link>
          .
        </Text>
        <Collapsible trigger="Details">
          <Text>The trigger row presses.</Text>
        </Collapsible>
      </VStack>
    );
  },
};

export const ButtonsInScroller: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Buttons in a scrolling list, under a finger: a held button paints 150 ms after the finger lands (UIScrollView.delaysContentTouches); a flick scrolls the list and paints nothing; a scroll that starts after the button painted takes the touch, and the paint goes at once with no fade and no click.',
      },
    },
  },
  render: () => (
    <div
      data-testid="button-scroller"
      style={{height: 240, overflowY: 'auto', border: '1px solid transparent'}}>
      <VStack gap={3}>
        {Array.from({length: 16}, (_, index) => (
          <Button
            key={index}
            label={`Action ${index + 1}`}
            variant="secondary"
            onClick={() => {}}
          />
        ))}
      </VStack>
    </div>
  ),
};

/**
 * A row whose whole box is one Button's tap target. The Button stays static
 * and has no transform, so the row is the containing block of the Button's
 * absolutely placed `::after`, which covers the row.
 */
const rowTargetStyles = stylex.create({
  row: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
    padding: 12,
    borderRadius: 12,
    outline: '1px solid color-mix(in srgb, currentColor 20%, transparent)',
  },
  button: {
    position: 'static',
    transform: 'none',
    '::after': {
      content: '""',
      position: 'absolute',
      inset: 0,
    },
  },
});

export const ButtonCoveringItsRow: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "A row whose whole box is a Button's tap target: the Button stays static with no transform, so its `::after` covers the row. Under a finger, a tap anywhere on the row, the line under the Button included, activates the Button once, through its press and its release. A press on the Button tints the Button, and a press elsewhere on the row tints the row.",
      },
    },
  },
  render: () => {
    const [opened, setOpened] = useState(0);
    return (
      <div {...stylex.props(rowTargetStyles.row)}>
        <Button
          label="Open the conversation"
          variant="ghost"
          xstyle={rowTargetStyles.button}
          onClick={() => setOpened(count => count + 1)}
        />
        <Text>Last message a minute ago</Text>
        <Text>Opened: {opened}</Text>
      </div>
    );
  },
};
