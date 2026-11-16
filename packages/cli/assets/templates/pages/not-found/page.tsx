// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * Not found: the screen an app shows for an address that matches no page.
 * A centered message with a search over the app's main destinations, so the
 * reader can get where they meant to go, and a way home.
 */

import {useState} from 'react';

import {Center} from '@astryxdesign/core/Center';
import {VStack} from '@astryxdesign/core/Layout';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {TextInput} from '@astryxdesign/core/TextInput';
import {List, ListItem} from '@astryxdesign/core/List';
import {Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {useToast} from '@astryxdesign/core/Toast';

import {
  ChartBarIcon,
  Cog6ToothIcon,
  FolderIcon,
  MagnifyingGlassIcon,
  MapIcon,
  QuestionMarkCircleIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';

const DESTINATIONS = [
  {
    id: 'projects',
    label: 'Projects',
    description: 'Every project you own or follow',
    icon: FolderIcon,
  },
  {
    id: 'reports',
    label: 'Reports',
    description: 'Weekly and monthly summaries',
    icon: ChartBarIcon,
  },
  {
    id: 'people',
    label: 'People',
    description: 'Teammates and their roles',
    icon: UsersIcon,
  },
  {
    id: 'settings',
    label: 'Settings',
    description: 'Your account and workspace preferences',
    icon: Cog6ToothIcon,
  },
  {
    id: 'help',
    label: 'Help center',
    description: 'Guides and answers to common questions',
    icon: QuestionMarkCircleIcon,
  },
];

export default function NotFoundPage() {
  const showToast = useToast();
  const [query, setQuery] = useState('');

  const normalized = query.trim().toLowerCase();
  const matches = DESTINATIONS.filter(
    destination =>
      destination.label.toLowerCase().includes(normalized) ||
      destination.description.toLowerCase().includes(normalized),
  );

  // Demo only: replace this toast with navigation to the destination's route.
  const open = (label: string) =>
    showToast({body: `Demo: ${label} would open here`, uniqueID: label});

  return (
    <Center height="100%" padding={6}>
      <VStack gap={6} width="100%" maxWidth={480}>
        <EmptyState
          icon={<Icon icon={MapIcon} size="lg" />}
          headingLevel={1}
          title="Page not found"
          description="The page you're looking for doesn't exist or has moved. Check the address, or find what you need below."
          actions={<Button label="Go to home" variant="primary" href="/" />}
        />
        <VStack gap={3}>
          <TextInput
            label="Search pages"
            isLabelHidden
            placeholder="Search pages"
            value={query}
            onChange={setQuery}
            startIcon={MagnifyingGlassIcon}
            hasClear
          />
          {matches.length > 0 ? (
            <List hasDividers>
              {matches.map(destination => (
                <ListItem
                  key={destination.id}
                  label={destination.label}
                  description={destination.description}
                  startContent={
                    <Icon icon={destination.icon} size="sm" color="secondary" />
                  }
                  onClick={() => open(destination.label)}
                />
              ))}
            </List>
          ) : (
            <Text type="body" color="secondary">
              No pages match &ldquo;{query.trim()}&rdquo;.
            </Text>
          )}
        </VStack>
      </VStack>
    </Center>
  );
}
