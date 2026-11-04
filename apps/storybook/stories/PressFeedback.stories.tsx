// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
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
 * follows the clocks a native list uses: nothing paints for 150 ms; a held
 * press then paints the full pressed overlay on the next frame; travelling
 * 10 px, or a scroll claiming the gesture, cancels it with no fade and nothing
 * repaints until a new touch; a tap shorter than the delay paints at the lift;
 * the release fades over 200 ms. A mouse keeps `:active`.
 */
const meta: Meta = {
  title: 'Core/Press feedback (touch)',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The touch press model on every pressable surface. View with a coarse pointer (DevTools device toolbar, or a phone). Under a finger the bare `:active` arm is dropped and one document-level controller writes `data-astryx-press="on"` once a press is believed (150 ms, no travel, no scroll) and `data-astryx-press="fading"` for the 200 ms release; a scroll or 10 px of travel cancels with no fade, and nothing repaints until a new touch. A mouse keeps `:active`. Scroll the list stories with a finger: no row paints while the list moves.',
      },
    },
  },
};

export default meta;
type Story = StoryObj;

const touchNote = (what: string) =>
  `${what} Hold: paints after 150 ms. Tap: paints at the lift. Drag or scroll: never paints, and stays dark until the finger lifts and lands again.`;

export const Buttons: Story = {
  parameters: {
    docs: {description: {story: touchNote('Buttons under a finger.')}},
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
        story: touchNote(
          'Item rows, a menu, and a clickable card. The list scrolls: flick it and no row paints; stop it with a finger and that touch is a brake, not a press.',
        ),
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
        story: touchNote(
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
