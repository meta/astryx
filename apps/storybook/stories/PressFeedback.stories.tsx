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
 * follows UIKit. A control (a button, a card) highlights in the frame the
 * finger lands, or 150 ms later inside a scroller, where a flick paints
 * nothing; the browser taking the touch to scroll cancels it with no fade; a
 * tap shorter than the delay paints at the lift; the release fades over
 * 250 ms (UIButton's) under a coarse primary pointer. A cell (a list row)
 * waits 150 ms inside a scroller and highlights at once outside one, is
 * cancelled by 10 px of travel, and releases on the deselect clock. A mouse
 * keeps `:active` on a desktop.
 */
const meta: Meta = {
  title: 'Core/Press feedback (touch)',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The touch press model on every pressable surface. View with a coarse pointer (DevTools device toolbar, or a phone). Under a finger the bare `:active` arm is dropped and one document-level controller writes `data-astryx-press="on"` while a press is held and `data-astryx-press="fading"` for the release. A control highlights in the frame the finger lands (150 ms later inside a scroller) and releases over 250 ms; a cell (a list row) waits 150 ms inside a scroller and highlights at once outside one, is cancelled by 10 px of travel, and releases on the deselect clock. A scroll claiming the touch cancels with no fade. A mouse keeps `:active` on a desktop. Scroll the list stories with a finger: nothing paints while the list moves.',
      },
    },
  },
};

export default meta;
type Story = StoryObj;

const controlNote = (what: string) =>
  `${what} Touch: paints in the frame the finger lands. Lift: fades over 250 ms. A scroll that takes the touch: the paint goes at once, with no fade and no click.`;

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
          'Item rows, a menu, and a clickable card. The rows sit in a scroller, so a held row paints after 150 ms, a tap paints at the lift, and a drag or scroll never paints; the card, outside it, paints in the frame the finger lands. Flick the list and no row paints; stop it with a finger and that touch is a brake, not a press.',
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
