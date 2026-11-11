// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input The sandbox's theme controls
 * @output A bare page with SegmentedControl's default example above rows
 *   that make the document scroll, and a theme menu
 * @position A raw page, with no sandbox chrome, for checking SegmentedControl
 *   on a phone. The page scrolls with the document, as an app's page does.
 */

import {useState} from 'react';
import {DropdownMenu} from '@astryxdesign/core/DropdownMenu';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Heading, Text} from '@astryxdesign/core/Text';
import type {ThemeMode} from '@astryxdesign/core/theme';
import {SANDBOX_THEMES, useThemeControls} from '../../../providers';

const ROWS = Array.from({length: 40}, (_, index) => `Row ${index + 1}`);

const MODES: ReadonlyArray<{mode: ThemeMode; label: string}> = [
  {mode: 'light', label: 'Light'},
  {mode: 'dark', label: 'Dark'},
];

function ThemeMenu() {
  const {themeName, setThemeName, mode, setMode} = useThemeControls();
  const themeLabel =
    SANDBOX_THEMES.find(theme => theme.id === themeName)?.label ?? themeName;
  return (
    <HStack gap={2}>
      <DropdownMenu
        button={{label: `Theme: ${themeLabel}`, size: 'sm'}}
        hasChevron
        items={SANDBOX_THEMES.map(({id, label}) => ({
          label,
          onClick: () => setThemeName(id),
        }))}
      />
      <DropdownMenu
        button={{
          label: MODES.find(entry => entry.mode === mode)?.label ?? mode,
          size: 'sm',
        }}
        hasChevron
        items={MODES.map(entry => ({
          label: entry.label,
          onClick: () => setMode(entry.mode),
        }))}
      />
    </HStack>
  );
}

export default function SegmentedControlCasesPage() {
  const [view, setView] = useState('grid');
  return (
    <VStack gap={4} padding={4}>
      <VStack gap={2}>
        <Heading level={1}>SegmentedControl</Heading>
        <ThemeMenu />
      </VStack>
      <SegmentedControl value={view} onChange={setView} label="View mode">
        <SegmentedControlItem value="grid" label="Grid" />
        <SegmentedControlItem value="list" label="List" />
        <SegmentedControlItem value="table" label="Table" />
      </SegmentedControl>
      <VStack gap={2}>
        {ROWS.map(row => (
          <Text key={row} color="secondary">
            {row}
          </Text>
        ))}
      </VStack>
    </VStack>
  );
}
