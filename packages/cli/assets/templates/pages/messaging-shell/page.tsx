// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * Messaging Shell: the app frame of a team messaging tool.
 *
 * Frame (desktop, left to right):
 *   side navigation (workspace, search, channels, direct messages) |
 *   message stream (fill) | thread panel 340px
 *
 * The side navigation is the app's global chrome, so AppShell owns it and
 * moves it into its mobile drawer on narrow screens. Channels and direct
 * messages are SideNav rows with presence dots and unread badges. The stream
 * is built on the Chat component family; the thread lists replies as rows
 * above a ChatComposer.
 *
 * Responsive contract:
 *   >1024px  thread panel beside the stream
 *   <=1024px the thread opens in a Drawer over the stream
 *   below AppShell's mobile breakpoint the side navigation moves into the
 *   AppShell drawer, opened from its toggle
 *
 * Fixtures are deterministic: fixed ISO timestamps rendered via <Timestamp>.
 * Only a message sent in the page reads the current time.
 */

import {useState} from 'react';

import {AppShell} from '@astryxdesign/core/AppShell';
import {
  SideNav,
  SideNavHeading,
  SideNavItem,
  SideNavSection,
} from '@astryxdesign/core/SideNav';
import {
  Layout,
  LayoutContent,
  LayoutFooter,
  LayoutHeader,
  LayoutPanel,
  HStack,
  VStack,
  StackItem,
} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {
  ChatComposer,
  ChatLayout,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageList,
  ChatMessageMetadata,
} from '@astryxdesign/core/Chat';
import {Avatar} from '@astryxdesign/core/Avatar';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {Divider} from '@astryxdesign/core/Divider';
import {Drawer} from '@astryxdesign/core/Drawer';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Timestamp} from '@astryxdesign/core/Timestamp';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {useToast} from '@astryxdesign/core/Toast';
import {useMediaQuery} from '@astryxdesign/core/hooks';

import {
  Cog6ToothIcon,
  HashtagIcon,
  InboxIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  UserGroupIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

// ---------------------------------------------------------------------------
// Deterministic fixtures: fixed ISO timestamps, stable ordering.
// ---------------------------------------------------------------------------

type Presence = 'online' | 'busy' | 'offline';

interface User {
  name: string;
}

const USERS = {
  mira: {name: 'Mira Chen'},
  devon: {name: 'Devon Park'},
  sasha: {name: 'Sasha Ortiz'},
  you: {name: 'Riley Quinn'},
} satisfies Record<string, User>;

type UserId = keyof typeof USERS;

interface Channel {
  id: string;
  name: string;
  topic: string;
  unread: number;
}

const CHANNELS: Channel[] = [
  {
    id: 'design-systems',
    name: 'design-systems',
    topic: 'Component APIs, tokens, and release coordination',
    unread: 0,
  },
  {
    id: 'frontend-guild',
    name: 'frontend-guild',
    topic: 'Cross-team frontend practices',
    unread: 4,
  },
  {
    id: 'releases',
    name: 'releases',
    topic: 'Release announcements and rollbacks',
    unread: 12,
  },
  {id: 'random', name: 'random', topic: 'Everything else', unread: 0},
];

interface DirectMessage {
  id: string;
  userId: UserId;
  presence: Presence;
  unread: number;
}

const DIRECT_MESSAGES: DirectMessage[] = [
  {id: 'dm-mira', userId: 'mira', presence: 'online', unread: 0},
  {id: 'dm-devon', userId: 'devon', presence: 'busy', unread: 2},
  {id: 'dm-sasha', userId: 'sasha', presence: 'offline', unread: 0},
];

const PRESENCE_VARIANT: Record<Presence, 'success' | 'error' | 'neutral'> = {
  online: 'success',
  busy: 'error',
  offline: 'neutral',
};

const PRESENCE_LABEL: Record<Presence, string> = {
  online: 'Online',
  busy: 'Busy',
  offline: 'Offline',
};

/** One message group: consecutive bubbles from the same sender. */
interface StreamMessage {
  id: string;
  userId: UserId;
  time: string;
  bubbles: string[];
}

interface ThreadReply {
  id: string;
  userId: UserId;
  time: string;
  text: string;
}

/** Messages per conversation, keyed by channel or direct-message id. */
const INITIAL_MESSAGES: Record<string, StreamMessage[]> = {
  'design-systems': [
    {
      id: 'm1',
      userId: 'mira',
      time: '2026-06-30T09:12:00',
      bubbles: [
        'Morning! The Timestamp component now supports a `system_date` format, worth switching the audit log over.',
        'I put the migration notes in the wiki under Decisions.',
      ],
    },
    {
      id: 'm2',
      userId: 'devon',
      time: '2026-06-30T09:15:00',
      bubbles: ['Nice. Does that unblock the incident console timeline work?'],
    },
    {
      id: 'm3',
      userId: 'you',
      time: '2026-06-30T09:17:00',
      bubbles: [
        'It does. I will pick that up after the template review.',
        'One question on the List density defaults: should channel sidebars use compact or balanced? The spec shows both.',
      ],
    },
    {
      id: 'm4',
      userId: 'sasha',
      time: '2026-06-30T09:24:00',
      bubbles: [
        'Heads up: the token sync job ran clean overnight, no drift between core and the theme packages.',
      ],
    },
    {
      id: 'm5',
      userId: 'mira',
      time: '2026-06-30T09:26:00',
      bubbles: ['Great, closing out the drift task then.'],
    },
  ],
  'frontend-guild': [
    {
      id: 'g1',
      userId: 'devon',
      time: '2026-06-30T08:40:00',
      bubbles: [
        'Guild sync moved to Thursday this week to avoid the release freeze.',
      ],
    },
    {
      id: 'g2',
      userId: 'you',
      time: '2026-06-30T08:44:00',
      bubbles: ['Works for me. The agenda doc is updated.'],
    },
  ],
  'dm-mira': [
    {
      id: 'd1',
      userId: 'mira',
      time: '2026-06-30T08:05:00',
      bubbles: ['Can you review the density note before standup?'],
    },
    {
      id: 'd2',
      userId: 'you',
      time: '2026-06-30T08:07:00',
      bubbles: ['On it, I will leave comments inline.'],
    },
  ],
  'dm-devon': [
    {
      id: 'd3',
      userId: 'devon',
      time: '2026-06-30T09:30:00',
      bubbles: [
        'Pushed the timeline fix to a branch.',
        'Want to pair on the review after lunch?',
      ],
    },
  ],
};

/** Thread replies, keyed by the message group they answer. */
const INITIAL_THREADS: Record<string, ThreadReply[]> = {
  m3: [
    {
      id: 't1',
      userId: 'mira',
      time: '2026-06-30T09:19:00',
      text: 'Compact for navigation surfaces. Balanced is for content lists where descriptions carry weight.',
    },
    {
      id: 't2',
      userId: 'devon',
      time: '2026-06-30T09:21:00',
      text: 'Agreed. The sidebar rows here are a good reference implementation.',
    },
  ],
};

const INITIAL_UNREAD: Record<string, number> = Object.fromEntries(
  [...CHANNELS, ...DIRECT_MESSAGES].map(item => [item.id, item.unread]),
);

// ---------------------------------------------------------------------------
// Stream message group: avatar and name on the first bubble, timestamp and
// thread link on the last. `group` positions tighten corner radii between
// consecutive bubbles.
// ---------------------------------------------------------------------------

function StreamMessageGroup({
  message,
  replyCount,
  onOpenThread,
}: {
  message: StreamMessage;
  replyCount: number;
  onOpenThread: () => void;
}) {
  const isSelf = message.userId === 'you';
  const user = USERS[message.userId];
  const lastIndex = message.bubbles.length - 1;

  return (
    <ChatMessage
      sender={isSelf ? 'user' : 'assistant'}
      avatar={isSelf ? undefined : <Avatar name={user.name} size="md" />}>
      {message.bubbles.map((text, index) => (
        <ChatMessageBubble
          key={`${message.id}-${index}`}
          group={
            message.bubbles.length === 1
              ? undefined
              : index === 0
                ? 'first'
                : index === lastIndex
                  ? 'last'
                  : 'middle'
          }
          name={!isSelf && index === 0 ? user.name : undefined}
          metadata={
            index === lastIndex ? (
              <ChatMessageMetadata
                timestamp={<Timestamp value={message.time} format="time" />}
                footer={
                  replyCount > 0 ? (
                    <Button
                      label={
                        replyCount === 1 ? '1 reply' : `${replyCount} replies`
                      }
                      variant="ghost"
                      size="sm"
                      onClick={onOpenThread}
                    />
                  ) : undefined
                }
              />
            ) : undefined
          }>
          {text}
        </ChatMessageBubble>
      ))}
    </ChatMessage>
  );
}

function ThreadReplyRow({reply}: {reply: ThreadReply}) {
  const user = USERS[reply.userId];
  return (
    <HStack gap={2} vAlign="start">
      <Avatar name={user.name} size="sm" />
      <StackItem size="fill">
        <VStack gap={0.5}>
          <HStack gap={2} vAlign="center">
            <Text type="body" weight="bold">
              {user.name}
            </Text>
            <Text type="supporting" color="secondary">
              <Timestamp value={reply.time} format="time" />
            </Text>
          </HStack>
          <Text type="body">{reply.text}</Text>
        </VStack>
      </StackItem>
    </HStack>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MessagingShellPage() {
  const showToast = useToast();
  const [conversationId, setConversationId] = useState('design-systems');
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [threads, setThreads] = useState(INITIAL_THREADS);
  const [unread, setUnread] = useState(INITIAL_UNREAD);
  const [threadId, setThreadId] = useState<string | null>('m3');
  const [isThreadDrawerOpen, setIsThreadDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const isNarrow = useMediaQuery('(max-width: 1024px)');

  const channel = CHANNELS.find(item => item.id === conversationId);
  const dm = DIRECT_MESSAGES.find(item => item.id === conversationId);
  const title = channel ? channel.name : USERS[dm?.userId ?? 'you'].name;
  const stream = messages[conversationId] ?? [];
  const threadRoot = stream.find(message => message.id === threadId);
  const threadReplies = threadId ? (threads[threadId] ?? []) : [];

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleChannels = CHANNELS.filter(item =>
    item.name.toLowerCase().includes(normalizedQuery),
  );
  const visibleDms = DIRECT_MESSAGES.filter(item =>
    USERS[item.userId].name.toLowerCase().includes(normalizedQuery),
  );

  // Demo only: replace these toasts with the calls that open the real views.
  const demoAction = (what: string) =>
    showToast({body: `Demo: ${what} would open here`, uniqueID: what});

  const openConversation = (id: string) => {
    setConversationId(id);
    setThreadId(null);
    setUnread(current => ({...current, [id]: 0}));
  };

  const sendMessage = (text: string) => {
    const body = text.trim();
    if (!body) {
      return;
    }
    setMessages(current => ({
      ...current,
      [conversationId]: [
        ...(current[conversationId] ?? []),
        {
          id: `sent-${conversationId}-${(current[conversationId] ?? []).length}`,
          userId: 'you',
          time: new Date().toISOString(),
          bubbles: [body],
        },
      ],
    }));
  };

  const sendReply = (text: string) => {
    const body = text.trim();
    if (!body || !threadId) {
      return;
    }
    setThreads(current => ({
      ...current,
      [threadId]: [
        ...(current[threadId] ?? []),
        {
          id: `reply-${threadId}-${(current[threadId] ?? []).length}`,
          userId: 'you',
          time: new Date().toISOString(),
          text: body,
        },
      ],
    }));
  };

  const sideNav = (
    <SideNav
      resizable={{defaultWidth: 260, minWidth: 220, maxWidth: 360}}
      header={
        <SideNavHeading
          heading="Astryx HQ"
          icon={<Avatar name="Astryx HQ" size="sm" />}
          headerEndContent={
            <IconButton
              label="New message"
              tooltip="New message"
              icon={<Icon icon={PencilSquareIcon} size="sm" color="inherit" />}
              variant="ghost"
              size="sm"
              onClick={() => demoAction('A new message')}
            />
          }
        />
      }
      topContent={
        <TextInput
          label="Jump to"
          isLabelHidden
          placeholder="Jump to..."
          value={searchQuery}
          onChange={setSearchQuery}
          startIcon={MagnifyingGlassIcon}
          hasClear
        />
      }
      footer={
        <SideNavSection title="Account" isHeaderHidden>
          <SideNavItem
            label="Preferences"
            icon={Cog6ToothIcon}
            onClick={() => demoAction('Preferences')}
          />
        </SideNavSection>
      }>
      <SideNavSection title="Channels">
        {visibleChannels.map(item => (
          <SideNavItem
            key={item.id}
            label={item.name}
            icon={HashtagIcon}
            isSelected={item.id === conversationId}
            onClick={() => openConversation(item.id)}
            endContent={
              (unread[item.id] ?? 0) > 0 ? (
                <Badge label={String(unread[item.id] ?? 0)} variant="neutral" />
              ) : undefined
            }
          />
        ))}
      </SideNavSection>
      <SideNavSection title="Direct messages">
        {visibleDms.map(item => (
          <SideNavItem
            key={item.id}
            label={USERS[item.userId].name}
            isSelected={item.id === conversationId}
            onClick={() => openConversation(item.id)}
            endContent={
              <HStack gap={2} vAlign="center">
                <StatusDot
                  variant={PRESENCE_VARIANT[item.presence]}
                  label={PRESENCE_LABEL[item.presence]}
                />
                {(unread[item.id] ?? 0) > 0 ? (
                  <Badge
                    label={String(unread[item.id] ?? 0)}
                    variant="neutral"
                  />
                ) : null}
              </HStack>
            }
          />
        ))}
      </SideNavSection>
    </SideNav>
  );

  const threadView = threadRoot ? (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider padding={3}>
          <HStack gap={2} vAlign="center">
            <StackItem size="fill">
              <VStack gap={0}>
                <Heading level={4}>Thread</Heading>
                <Text type="supporting" color="secondary" maxLines={1}>
                  {channel ? `#${channel.name}` : title}
                </Text>
              </VStack>
            </StackItem>
            <IconButton
              label="Close thread"
              tooltip="Close thread"
              icon={<Icon icon={XMarkIcon} size="sm" color="inherit" />}
              variant="ghost"
              size="sm"
              onClick={() => {
                setThreadId(null);
                setIsThreadDrawerOpen(false);
              }}
            />
          </HStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={3}>
          <VStack gap={4}>
            <ThreadReplyRow
              reply={{
                id: threadRoot.id,
                userId: threadRoot.userId,
                time: threadRoot.time,
                text: threadRoot.bubbles.at(-1) ?? '',
              }}
            />
            <Divider />
            {threadReplies.map(reply => (
              <ThreadReplyRow key={reply.id} reply={reply} />
            ))}
          </VStack>
        </LayoutContent>
      }
      footer={
        <LayoutFooter padding={3}>
          <ChatComposer placeholder="Reply in thread" onSubmit={sendReply} />
        </LayoutFooter>
      }
    />
  ) : null;

  return (
    <AppShell contentPadding={0} sideNav={sideNav}>
      <Layout
        height="fill"
        header={
          <LayoutHeader hasDivider padding={3}>
            <HStack gap={3} vAlign="center">
              {channel ? (
                <Icon icon={HashtagIcon} size="sm" />
              ) : (
                <Avatar name={title} size="sm" />
              )}
              <StackItem size="fill">
                <VStack gap={0}>
                  <Heading level={3}>{title}</Heading>
                  <Text type="supporting" color="secondary" maxLines={1}>
                    {channel
                      ? channel.topic
                      : PRESENCE_LABEL[dm?.presence ?? 'offline']}
                  </Text>
                </VStack>
              </StackItem>
              {channel ? (
                <IconButton
                  label="Members"
                  tooltip="Members"
                  icon={<Icon icon={UserGroupIcon} size="sm" color="inherit" />}
                  variant="ghost"
                  size="sm"
                  onClick={() => demoAction(`The #${channel.name} member list`)}
                />
              ) : null}
            </HStack>
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={0} isScrollable={false}>
            <VStack height="100%">
              <ChatLayout
                composer={
                  <ChatComposer
                    placeholder={
                      channel ? `Message #${channel.name}` : `Message ${title}`
                    }
                    onSubmit={sendMessage}
                  />
                }
                emptyState={
                  <EmptyState
                    icon={<Icon icon={InboxIcon} size="lg" />}
                    title="No messages yet"
                    description="Start the conversation. Messages posted here are visible to everyone in it."
                  />
                }>
                {stream.length > 0 ? (
                  <ChatMessageList density="balanced">
                    {stream.map(message => (
                      <StreamMessageGroup
                        key={message.id}
                        message={message}
                        replyCount={(threads[message.id] ?? []).length}
                        onOpenThread={() => {
                          setThreadId(message.id);
                          setIsThreadDrawerOpen(true);
                        }}
                      />
                    ))}
                  </ChatMessageList>
                ) : null}
              </ChatLayout>
            </VStack>
          </LayoutContent>
        }
        end={
          threadView && !isNarrow ? (
            <LayoutPanel width={340} padding={0} hasDivider>
              {threadView}
            </LayoutPanel>
          ) : undefined
        }
      />
      <Drawer
        label="Thread"
        isOpen={isNarrow && isThreadDrawerOpen && threadView !== null}
        onOpenChange={setIsThreadDrawerOpen}
        width={360}
        padding={0}>
        {isNarrow ? threadView : null}
      </Drawer>
    </AppShell>
  );
}
