// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @input `?mode=current|proposed` (proposed by default)
 * @output One chat app on a full-page NavigationStack, twice: with today's
 *   stack (Current) and with its opt-in options (Proposed). A switch at the
 *   top changes between them, and a line says what to try
 * @position A raw page to try NavigationStack's opt-in options on a phone: a
 *   reopened chat keeps its draft and scroll, a pressed row renders its chat
 *   ahead, a chat brings its own scroller with a docked composer, the root
 *   keeps its own header, and New chat opens at once with the keyboard
 */

import {Suspense, useState, type ReactNode} from 'react';
import {flushSync} from 'react-dom';
import {useSearchParams} from 'react-router-dom';
import * as stylex from '@stylexjs/stylex';
import {
  NavigationScreen,
  NavigationStack,
  useNavigationLink,
  useNavigationScroller,
  useNavigationStack,
} from '@astryxdesign/lab';
import {Button} from '@astryxdesign/core/Button';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {List, ListItem} from '@astryxdesign/core/List';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';

type Mode = 'current' | 'proposed';

const CHATS = Array.from({length: 24}, (_, index) => `Chat ${index + 1}`);

const HINTS: Record<Mode, string> = {
  current:
    'Open a chat, type a draft and scroll it, go back and open it again: it starts over. New chat slides in.',
  proposed:
    'Open a chat, type a draft and scroll it, go back and open it again: it is as you left it. New chat opens at once.',
};

const styles = stylex.create({
  page: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  top: {
    paddingTop: 'max(8px, env(safe-area-inset-top))',
    paddingInline: 12,
    paddingBottom: 8,
  },
  stack: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
  },
  ownScroller: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    overscrollBehavior: 'contain',
  },
  inset: (height: number) => ({
    paddingTop: height,
  }),
  composer: {
    padding: 8,
  },
});

/** A chat's draft, its sent messages and its earlier messages. */
function Chat({chat, ownScroller}: {chat: string; ownScroller: boolean}) {
  const [draft, setDraft] = useState('');
  const [sent, setSent] = useState<string[]>([]);
  const messages = (
    <List>
      {Array.from({length: 60}, (_, index) => (
        <ListItem key={index} label={`${chat}, message ${index + 1}`} />
      ))}
      {sent.map((message, index) => (
        <ListItem key={`sent-${index}`} label={message} description="Sent" />
      ))}
    </List>
  );
  const composer = (
    <HStack gap={2} xstyle={styles.composer}>
      <TextInput
        label={`Draft for ${chat}`}
        isLabelHidden
        placeholder="Type a draft"
        value={draft}
        onChange={setDraft}
      />
      <Button
        label="Send"
        variant="primary"
        size="sm"
        onClick={() => {
          if (draft !== '') {
            setSent(list => [...list, draft]);
            setDraft('');
          }
        }}
      />
    </HStack>
  );
  return ownScroller ? (
    <OwnScroller footer={composer}>{messages}</OwnScroller>
  ) : (
    <VStack>
      {composer}
      {messages}
    </VStack>
  );
}

/** The content's own scroller, under the bar, above a docked footer. */
function OwnScroller({
  children,
  footer,
}: {
  children: ReactNode;
  footer: ReactNode;
}) {
  const scroller = useNavigationScroller();
  return (
    <VStack xstyle={styles.stack}>
      <div
        ref={scroller.ref}
        {...stylex.props(styles.ownScroller, styles.inset(scroller.barInset))}>
        <div {...scroller.sentinelProps} />
        {children}
      </div>
      {footer}
    </VStack>
  );
}

function PreparedRow({chat}: {chat: string}) {
  const link = useNavigationLink(chat);
  return <ListItem ref={link.ref} label={chat} onClick={link.onClick} />;
}

function PlainRow({chat}: {chat: string}) {
  const nav = useNavigationStack<string>();
  return <ListItem label={chat} onClick={() => nav.push(chat)} />;
}

function NewChatButton({mode}: {mode: Mode}) {
  const nav = useNavigationStack<string>();
  return (
    <Button
      label="New chat"
      variant="secondary"
      size="sm"
      onClick={() => {
        if (mode === 'current') {
          nav.push('New chat');
          return;
        }
        // The cut lands in this commit, so the field exists before the tap's
        // handler returns, and a phone shows its keyboard for this focus.
        flushSync(() =>
          nav.push('New chat', {transition: 'cut', focus: 'keep'}),
        );
        document
          .querySelector<HTMLInputElement>(
            '[data-navigation-screen="New chat"] input',
          )
          ?.focus();
      }}
    />
  );
}

function ChatApp({mode}: {mode: Mode}) {
  const [path, setPath] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const proposed = mode === 'proposed';
  const rows = (
    <List>
      {CHATS.map(chat =>
        proposed ? (
          <PreparedRow key={chat} chat={chat} />
        ) : (
          <PlainRow key={chat} chat={chat} />
        ),
      )}
    </List>
  );
  return (
    <NavigationStack
      label="Chats"
      retainPopped={proposed ? 2 : 0}
      root={
        proposed ? (
          <NavigationScreen title="Chats" isBarHidden>
            <VStack gap={2} xstyle={styles.top}>
              <HStack gap={2}>
                <Button label="All chats ▾" variant="secondary" size="sm" />
                <NewChatButton mode={mode} />
              </HStack>
              <TextInput
                label="Search chats"
                isLabelHidden
                placeholder="Search"
                value={search}
                onChange={setSearch}
              />
            </VStack>
            {rows}
          </NavigationScreen>
        ) : (
          <NavigationScreen
            title="Chats"
            endContent={<NewChatButton mode={mode} />}>
            {rows}
          </NavigationScreen>
        )
      }
      path={path}
      onPathChange={setPath}
      getKey={entry => entry}
      renderScreen={entry => (
        <NavigationScreen
          title={entry}
          scroll={proposed ? 'content' : 'screen'}
          titleContent={
            proposed ? (
              <VStack>
                <Text type="label">{entry}</Text>
                <Text type="supporting" color="secondary">
                  Active now
                </Text>
              </VStack>
            ) : undefined
          }>
          <Chat chat={entry} ownScroller={proposed} />
        </NavigationScreen>
      )}
    />
  );
}

function CurrentProposed() {
  const [params, setParams] = useSearchParams();
  const mode: Mode = params.get('mode') === 'current' ? 'current' : 'proposed';
  return (
    <VStack xstyle={styles.page}>
      <VStack gap={2} xstyle={styles.top}>
        <SegmentedControl
          value={mode}
          onChange={value => setParams({mode: value})}
          label="Which stack"
          size="sm">
          <SegmentedControlItem value="current" label="Current" />
          <SegmentedControlItem value="proposed" label="Proposed" />
        </SegmentedControl>
        <Text type="supporting" color="secondary">
          {HINTS[mode]}
        </Text>
      </VStack>
      <VStack xstyle={styles.stack}>
        <ChatApp key={mode} mode={mode} />
      </VStack>
    </VStack>
  );
}

export default function NavigationStackCurrentProposedPage() {
  return (
    <Suspense>
      <CurrentProposed />
    </Suspense>
  );
}
