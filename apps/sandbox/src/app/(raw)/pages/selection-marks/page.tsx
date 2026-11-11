// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input The sandbox's theme and mode, chosen in the page's own theme menu
 * @output CheckboxLists, single checkboxes and a RadioList in that theme,
 *   Neutral light by default. The RadioList's last row holds a select
 * @position Raw page for phone and mouse checks of the selection marks'
 *   press. The document scrolls; there is no inner scroll container.
 */

import {useState} from 'react';
import {CheckboxInput} from '@astryxdesign/core/CheckboxInput';
import {CheckboxList, CheckboxListItem} from '@astryxdesign/core/CheckboxList';
import {DropdownMenu} from '@astryxdesign/core/DropdownMenu';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Heading, Text} from '@astryxdesign/core/Text';
import type {ThemeMode} from '@astryxdesign/core/theme';
import {SANDBOX_THEMES, useThemeControls} from '../../../providers';

function ThemeMenu() {
  const {themeName, setThemeName, mode, setMode} = useThemeControls();
  return (
    <HStack gap={3} vAlign="center" wrap="wrap">
      <DropdownMenu
        button={{
          label:
            SANDBOX_THEMES.find(item => item.id === themeName)?.label ??
            themeName,
          variant: 'secondary',
          size: 'sm',
        }}
        items={SANDBOX_THEMES.map(({id, label}) => ({
          label,
          onClick: () => setThemeName(id),
        }))}
      />
      <SegmentedControl
        label="Mode"
        size="sm"
        value={mode}
        onChange={value => setMode(value as ThemeMode)}>
        <SegmentedControlItem value="light" label="Light" />
        <SegmentedControlItem value="dark" label="Dark" />
      </SegmentedControl>
    </HStack>
  );
}

export default function SelectionMarksPage() {
  const [channels, setChannels] = useState<string[]>(['email']);
  const [terms, setTerms] = useState(false);
  const [updates, setUpdates] = useState(true);
  const [plan, setPlan] = useState('pro');
  const [topics, setTopics] = useState<string[]>(['design']);
  return (
    <VStack gap={6} padding={4}>
      <VStack gap={3}>
        <Heading level={1}>Selection marks</Heading>
        <Text color="secondary">
          Press and hold a checkbox, a list row or a radio option, then let go.
          Scroll the page with a finger between presses. The menu below picks
          the theme and the mode.
        </Text>
        <ThemeMenu />
      </VStack>
      <CheckboxList
        label="Notifications"
        value={channels}
        onChange={setChannels}>
        <CheckboxListItem
          label="Email"
          value="email"
          description="A summary each morning"
        />
        <CheckboxListItem
          label="SMS"
          value="sms"
          description="Message rates may apply"
        />
        <CheckboxListItem label="Push notification" value="push" />
        <CheckboxListItem label="Phone call" value="call" />
        <CheckboxListItem
          label="Weekly digest"
          value="digest"
          description="Every Monday"
        />
        <CheckboxListItem label="Product news" value="news" />
      </CheckboxList>
      <VStack gap={3}>
        <CheckboxInput
          label="I accept the terms"
          value={terms}
          onChange={setTerms}
        />
        <CheckboxInput
          label="Send me product updates"
          value={updates}
          onChange={setUpdates}
        />
        <CheckboxInput label="Read-only" value={true} isReadOnly />
        <CheckboxInput label="Disabled" value={false} isDisabled />
      </VStack>
      <RadioList label="Plan" value={plan} onChange={setPlan}>
        <RadioListItem label="Starter" value="starter" />
        <RadioListItem
          label="Pro"
          value="pro"
          description="For teams of up to 20"
        />
        <RadioListItem
          label="Team"
          value="team"
          description="Shared billing and roles"
        />
        <RadioListItem
          label="Enterprise"
          value="enterprise"
          endContent={
            <select aria-label="Billing">
              <option>Monthly</option>
              <option>Yearly</option>
            </select>
          }
        />
      </RadioList>
      <CheckboxList label="Topics" value={topics} onChange={setTopics}>
        <CheckboxListItem label="Design" value="design" />
        <CheckboxListItem label="Engineering" value="engineering" />
        <CheckboxListItem label="Research" value="research" />
        <CheckboxListItem label="Marketing" value="marketing" />
        <CheckboxListItem label="Support" value="support" />
      </CheckboxList>
      <CheckboxList
        label="Saved filters (read-only)"
        value={['open']}
        onChange={() => {}}
        isReadOnly>
        <CheckboxListItem label="Open" value="open" />
        <CheckboxListItem label="Assigned to me" value="mine" />
        <CheckboxListItem label="Due this week" value="due" />
      </CheckboxList>
    </VStack>
  );
}
