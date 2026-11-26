// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input None
 * @output A bare page of large DropdownMenus and a Popover, spread down a
 *   page that scrolls with the document
 * @position A raw page, with no sandbox chrome, for checking on a phone how
 *   menus grow out of their trigger and shrink back. It has a tall menu that
 *   scrolls, a wide one and a filter menu with many rows. It also has nested
 *   sub-menus, menus at each edge, one that flips above, and a Popover.
 */

import {Button} from '@astryxdesign/core/Button';
import {
  DropdownMenu,
  type DropdownMenuOption,
} from '@astryxdesign/core/DropdownMenu';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Popover} from '@astryxdesign/core/Popover';
import {Heading, Text} from '@astryxdesign/core/Text';

const SHORT: DropdownMenuOption[] = [
  {label: 'Edit'},
  {label: 'Duplicate'},
  {label: 'Share'},
  {label: 'Delete', variant: 'destructive'},
];

const TALL: DropdownMenuOption[] = Array.from({length: 40}, (_, index) => ({
  label: `Project ${index + 1}`,
}));

const WIDE: DropdownMenuOption[] = [
  {
    label: 'Export the whole workspace as a spreadsheet',
    description: 'Every table, with its filters and hidden columns',
  },
  {
    label: 'Copy a link that opens this exact view',
    description: 'Sorting, grouping and the scroll position travel with it',
  },
  {
    label: 'Send a weekly summary to the team channel',
    description: 'Every Monday morning, in the channel time zone',
  },
];

function section(title: string, labels: string[]): DropdownMenuOption {
  return {type: 'section', title, items: labels.map(label => ({label}))};
}

const FILTERS: DropdownMenuOption[] = [
  section('Status', ['Open', 'In progress', 'In review', 'Blocked', 'Done']),
  {type: 'divider'},
  section('Priority', ['Urgent', 'High', 'Medium', 'Low']),
  {type: 'divider'},
  section('Owner', [
    'Anyone',
    'Me',
    'My team',
    'Unassigned',
    'Recently active',
    'Former members',
  ]),
  {type: 'divider'},
  section('Labels', [
    'Bug',
    'Feature',
    'Design',
    'Docs',
    'Performance',
    'Accessibility',
    'Security',
    'Mobile',
  ]),
];

const NESTED: DropdownMenuOption[] = [
  {label: 'New file'},
  {
    label: 'Move to',
    items: [
      {label: 'Inbox'},
      {
        label: 'Projects',
        items: [
          {label: 'Website'},
          {label: 'Mobile app'},
          {
            label: 'Archive',
            items: [{label: '2024'}, {label: '2025'}, {label: '2026'}],
          },
        ],
      },
      {label: 'Shared with me'},
    ],
  },
  {
    label: 'Share',
    items: [{label: 'Copy link'}, {label: 'Email'}, {label: 'Message'}],
  },
  {label: 'Delete', variant: 'destructive'},
];

const FILLER = Array.from({length: 12}, (_, index) => `Row ${index + 1}`);

function Filler() {
  return (
    <VStack gap={2}>
      {FILLER.map(row => (
        <Text key={row} color="secondary">
          {row}
        </Text>
      ))}
    </VStack>
  );
}

function Case({title, children}: {title: string; children: React.ReactNode}) {
  return (
    <VStack gap={2}>
      <Text weight="semibold">{title}</Text>
      {children}
    </VStack>
  );
}

export default function MenuGrowCasesPage() {
  return (
    <VStack gap={6} padding={4}>
      <HStack justify="between">
        <DropdownMenu button={{label: 'Top left'}} items={SHORT} />
        <DropdownMenu
          button={{label: 'Top right'}}
          items={SHORT}
          alignment="end"
        />
      </HStack>
      <VStack gap={1}>
        <Heading level={1}>Menu grow cases</Heading>
        <Text color="secondary">
          Tap or hold each trigger: the menu grows out of it and shrinks back
          into it. The Popover below grows the same way.
        </Text>
      </VStack>
      <Case title="A tall menu that scrolls (40 rows)">
        <DropdownMenu button={{label: 'Projects'}} items={TALL} />
      </Case>
      <Case title="A wide menu">
        <DropdownMenu button={{label: 'Export'}} items={WIDE} menuWidth={360} />
      </Case>
      <Case title="A filter menu with many rows in sections">
        <DropdownMenu
          button={{label: 'Filters'}}
          items={FILTERS}
          menuMaxHeight={520}
        />
      </Case>
      <Filler />
      <Case title="Nested sub-menus">
        <DropdownMenu button={{label: 'File'}} items={NESTED} />
      </Case>
      <Case title="A Popover, for comparison">
        <Popover
          label="Filter"
          width={280}
          content={
            <VStack gap={2} padding={3}>
              <Text weight="semibold">Filter</Text>
              {['Open', 'In progress', 'In review', 'Done'].map(label => (
                <Text key={label}>{label}</Text>
              ))}
            </VStack>
          }>
          <Button label="Popover" />
        </Popover>
      </Case>
      <Case title="At the side edges">
        <HStack justify="between">
          <DropdownMenu button={{label: 'Left edge'}} items={FILTERS} />
          <DropdownMenu
            button={{label: 'Right edge'}}
            items={WIDE}
            alignment="end"
          />
        </HStack>
      </Case>
      <Filler />
      <Case title="At the bottom: scroll to the end, and it flips above">
        <HStack justify="between">
          <DropdownMenu button={{label: 'Bottom left'}} items={FILTERS} />
          <DropdownMenu
            button={{label: 'Bottom right'}}
            items={NESTED}
            alignment="end"
          />
        </HStack>
      </Case>
    </VStack>
  );
}
