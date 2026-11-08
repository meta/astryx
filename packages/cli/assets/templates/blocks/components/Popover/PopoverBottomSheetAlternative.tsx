// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {CalendarIcon, TagIcon, UserIcon} from '@heroicons/react/24/outline';
import {BottomSheet} from '@astryxdesign/core/BottomSheet';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {List, ListItem} from '@astryxdesign/core/List';
import {VStack} from '@astryxdesign/core/Layout';
import {Section} from '@astryxdesign/core/Section';
import {Heading, Text} from '@astryxdesign/core/Text';
import {spacingVars} from '@astryxdesign/core/theme/tokens.stylex';

const styles = stylex.create({
  header: {
    // Match the unchanged spacious ListItem inset so the title and description
    // align with the action icons.
    marginInlineStart: spacingVars['--spacing-3'],
  },
});

const PROJECT_ACTIONS = [
  [UserIcon, 'Assign owner', 'Route follow-up to a teammate.'],
  [TagIcon, 'Add label', 'Group this item with related work.'],
  [CalendarIcon, 'Set due date', 'Pick a reminder for review.'],
] as const;

export default function PopoverBottomSheetAlternative() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button label="Open project actions" onClick={() => setIsOpen(true)}>
        Open project actions
      </Button>
      <BottomSheet
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        label="Project actions"
        height="hug">
        <Section paddingBlock={4} paddingInline={1}>
          <VStack gap={3}>
            <VStack gap={1} xstyle={styles.header}>
              <Heading level={3}>Project actions</Heading>
              <Text type="supporting" color="secondary">
                Use this modal touch surface when the task should move away from
                its trigger and stay close to the bottom edge.
              </Text>
            </VStack>
            <List density="spacious">
              {PROJECT_ACTIONS.map(([icon, label, description]) => (
                <ListItem
                  key={label}
                  label={label}
                  description={description}
                  startContent={
                    <Icon icon={icon} size="md" color="secondary" />
                  }
                  onClick={() => setIsOpen(false)}
                />
              ))}
            </List>
          </VStack>
        </Section>
      </BottomSheet>
    </>
  );
}
