// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file cases.tsx
 * @input A case id from caseIds.ts
 * @output One swipe actions case: a mail List whose rows take `swipe`
 * @position The content of the swipe actions cases page.
 */

import {useMemo, useState, type Dispatch, type SetStateAction} from 'react';
import {
  ArchiveBoxIcon,
  EnvelopeIcon,
  EnvelopeOpenIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {VStack} from '@astryxdesign/core/Layout';
import {List, ListItem} from '@astryxdesign/core/List';
import {createSwipe, type Swipe} from '@astryxdesign/core/Swipe';
import {Text} from '@astryxdesign/core/Text';
import type {SwipeActionsCaseId} from './caseIds';

interface Message {
  id: number;
  sender: string;
  subject: string;
  time: string;
  isUnread: boolean;
}

const MESSAGES: readonly Message[] = [
  {
    id: 1,
    sender: 'Ana Ruiz',
    subject: 'Design review moved to Thursday',
    time: '9:41',
    isUnread: true,
  },
  {
    id: 2,
    sender: 'Build bot',
    subject: 'Nightly build passed',
    time: '8:15',
    isUnread: false,
  },
  {
    id: 3,
    sender: 'Kenji Mori',
    subject: 'Photos from the offsite',
    time: 'Yesterday',
    isUnread: true,
  },
  {
    id: 4,
    sender: 'Priya Shah',
    subject: 'Lunch on Friday?',
    time: 'Yesterday',
    isUnread: false,
  },
  {
    id: 5,
    sender: 'Calendar',
    subject: 'Reminder: 1:1 at 3 PM',
    time: 'Mon',
    isUnread: true,
  },
  {
    id: 6,
    sender: 'Leo Martin',
    subject: 'Re: the onboarding guide',
    time: 'Mon',
    isUnread: false,
  },
  {
    id: 7,
    sender: 'Support',
    subject: 'Your request was closed',
    time: 'Sun',
    isUnread: false,
  },
  {
    id: 8,
    sender: 'Mia Chen',
    subject: 'Slides for tomorrow',
    time: 'Sat',
    isUnread: true,
  },
  {
    id: 9,
    sender: 'Omar Haddad',
    subject: 'Trip itinerary',
    time: 'Fri',
    isUnread: false,
  },
  {
    id: 10,
    sender: 'Newsletter',
    subject: 'This week in design systems',
    time: 'Fri',
    isUnread: false,
  },
  {
    id: 11,
    sender: 'Sofia Rossi',
    subject: 'Feedback on the prototype',
    time: 'Thu',
    isUnread: true,
  },
  {
    id: 12,
    sender: 'Jonas Berg',
    subject: 'Invoice for October',
    time: 'Wed',
    isUnread: false,
  },
];

/** The key `onActivate` hands a handler: the row's `itemKey`. */
type RowKey = {itemKey: string | number | undefined};

/** Flips the read state of the message with `messageId`. */
function toggledRead(
  messages: readonly Message[],
  messageId: string | number | undefined,
): readonly Message[] {
  return messages.map(item =>
    item.id === messageId ? {...item, isUnread: !item.isUnread} : item,
  );
}

/**
 * The two swipes a case's rows take, built once: unread rows offer Read, and
 * read rows offer Unread. Each handler reads its row from the key.
 */
function swipesFor(
  id: SwipeActionsCaseId,
  setMessages: Dispatch<SetStateAction<readonly Message[]>>,
): {unread: Swipe; read: Swipe} {
  const remove = ({itemKey}: RowKey) =>
    setMessages(current => current.filter(item => item.id !== itemKey));
  const toggleRead = ({itemKey}: RowKey) =>
    setMessages(current => toggledRead(current, itemKey));
  const swipeFor = (isUnread: boolean): Swipe => {
    const readEntry = {
      id: 'read',
      label: isUnread ? 'Read' : 'Unread',
      icon: (
        <Icon icon={isUnread ? EnvelopeOpenIcon : EnvelopeIcon} size="sm" />
      ),
      onActivate: toggleRead,
    };
    const deleteEntry = {
      id: 'delete',
      label: 'Delete',
      icon: <Icon icon={TrashIcon} size="sm" />,
      onActivate: remove,
      variant: 'destructive' as const,
      hasRemoval: true,
    };
    switch (id) {
      case 'mail':
        return createSwipe({
          leading: [readEntry],
          trailing: [
            {
              id: 'archive',
              label: 'Archive',
              icon: <Icon icon={ArchiveBoxIcon} size="sm" />,
              onActivate: remove,
              variant: 'neutral',
              hasRemoval: true,
            },
            deleteEntry,
          ],
        });
      case 'one-entry':
        return createSwipe({leading: [readEntry], trailing: [deleteEntry]});
      case 'commit':
        return createSwipe({
          trailing: [{...deleteEntry, label: 'Dismiss'}],
          swipeBehavior: 'commit',
        });
    }
  };
  return {unread: swipeFor(true), read: swipeFor(false)};
}

export function SwipeActionsCase({id}: {id: SwipeActionsCaseId}) {
  const [messages, setMessages] = useState<readonly Message[]>(MESSAGES);
  const swipes = useMemo(() => swipesFor(id, setMessages), [id]);
  return (
    <VStack gap={3}>
      <List hasDividers>
        {messages.map(message => (
          <ListItem
            key={message.id}
            itemKey={message.id}
            label={message.sender}
            description={message.subject}
            startContent={<Avatar name={message.sender} />}
            endContent={
              <Text color={message.isUnread ? 'primary' : 'secondary'}>
                {message.time}
              </Text>
            }
            onClick={() =>
              setMessages(current => toggledRead(current, message.id))
            }
            swipe={message.isUnread ? swipes.unread : swipes.read}
          />
        ))}
        {messages.length === 0 && <ListItem label="No messages left" />}
      </List>
      <Button
        label="Restore the messages"
        variant="secondary"
        onClick={() => setMessages(MESSAGES)}
      />
    </VStack>
  );
}
