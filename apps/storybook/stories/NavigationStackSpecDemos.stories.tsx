// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file NavigationStackSpecDemos.stories.tsx
 * @input Lab's NavigationStack with the options its draft record proposes
 * @output One demo per proposed behavior: a cut that a typing screen opens
 *   with, retained screens, a screen prepared at a press, content that owns
 *   its scroller, and hidden screens that take no input
 * @position Storybook; a preview of NavigationStack's draft record, for the
 *   decision on it
 */

import {useEffect, useRef, useState} from 'react';
import {flushSync} from 'react-dom';
import type {Meta, StoryObj} from '@storybook/react';
import {
  NavigationScreen,
  NavigationStack,
  useNavigationLink,
  useNavigationScreen,
  useNavigationScroller,
  useNavigationStack,
} from '@astryxdesign/lab';
import {Button} from '@astryxdesign/core/Button';
import {List, ListItem} from '@astryxdesign/core/List';
import {Icon} from '@astryxdesign/core/Icon';
import {rtlStyles} from '@astryxdesign/core/utils';

const meta: Meta<typeof NavigationStack> = {
  title: 'Lab/NavigationStack/Spec demos',
  component: NavigationStack,
  parameters: {layout: 'fullscreen'},
};

export default meta;
type Story = StoryObj<typeof NavigationStack>;

const chevron = (
  <Icon icon="chevronRight" color="secondary" xstyle={rtlStyles.mirror} />
);

const CHATS = Array.from({length: 24}, (_, index) => `Chat ${index + 1}`);

/** A badge with the screen's state: top, covered, retained or prepared. */
function ScreenState() {
  const {state} = useNavigationScreen();
  return (
    <p data-testid="screen-state" style={{margin: 16}}>
      Screen state: <strong>{state}</strong>
    </p>
  );
}

// =============================================================================
// (a2) A cut: the new screen lands at once, and the same tap focuses its field
// =============================================================================

function NewChatButton() {
  const nav = useNavigationStack<string>();
  return (
    <Button
      label="New chat"
      variant="secondary"
      size="sm"
      onClick={() => {
        // The cut lands in this commit, so the field exists before the tap's
        // handler returns, and a phone shows its keyboard for this focus.
        flushSync(() => nav.push('New chat', {transition: 'cut'}));
        document.querySelector<HTMLTextAreaElement>('[data-compose]')?.focus();
      }}
    />
  );
}

function ChatRows() {
  const nav = useNavigationStack<string>();
  return (
    <List>
      {CHATS.map(chat => (
        <ListItem
          key={chat}
          label={chat}
          endContent={chevron}
          onClick={() => nav.push(chat)}
        />
      ))}
    </List>
  );
}

function Compose() {
  return (
    <div style={{padding: 16}}>
      <textarea
        data-compose
        aria-label="Message"
        placeholder="Write a message"
        rows={4}
        style={{width: '100%'}}
      />
      <ScreenState />
    </div>
  );
}

function CutStack() {
  const [path, setPath] = useState<string[]>([]);
  const [pathTransition, setPathTransition] = useState<'default' | 'cut'>(
    'default',
  );
  return (
    <div style={{height: '100vh'}}>
      <NavigationStack
        label="Chats"
        root={
          <NavigationScreen title="Chats" endContent={<NewChatButton />}>
            <ChatRows />
          </NavigationScreen>
        }
        path={path}
        pathTransition={pathTransition}
        onPathChange={next => {
          setPathTransition('default');
          setPath(next);
        }}
        getKey={entry => entry}
        renderScreen={entry => (
          <NavigationScreen
            title={entry}
            endContent={
              entry === 'New chat' ? undefined : (
                <Button
                  label="Fork"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    // A fork takes the chat's place: Back then opens the list.
                    setPathTransition('cut');
                    setPath(current => [
                      ...current.slice(0, -1),
                      `${entry} (fork)`,
                    ]);
                  }}
                />
              )
            }>
            {entry === 'New chat' ? <Compose /> : <ScreenState />}
          </NavigationScreen>
        )}
      />
    </div>
  );
}

/**
 * New chat pushes with `transition: 'cut'`: the screen lands in the tap's
 * commit, with no travel or dimming, and the tap focuses its field. On a
 * phone the keyboard's rise is the only motion. A row still pushes with
 * UIKit's motion.
 */
export const CutWithKeyboard: Story = {render: () => <CutStack />};

// =============================================================================
// (c) Retained screens: a popped chat comes back as it was left
// =============================================================================

function Transcript({chat}: {chat: string}) {
  const nav = useNavigationStack<string>();
  const [draft, setDraft] = useState('');
  const [sent, setSent] = useState<string[]>([]);
  return (
    <div data-chat={chat}>
      <ScreenState />
      <div style={{padding: '0 16px'}}>
        <input
          aria-label={`Draft for ${chat}`}
          placeholder="Type a draft, scroll, go back, then reopen"
          value={draft}
          onChange={event => setDraft(event.target.value)}
          style={{width: '100%'}}
        />
        <Button
          label="Send"
          variant="primary"
          size="sm"
          onClick={() => {
            setSent(list => [...list, draft]);
            setDraft('');
          }}
        />
        <ul data-sent aria-label={`Sent in ${chat}`}>
          {sent.map((message, index) => (
            <li key={index}>{message}</li>
          ))}
        </ul>
        <Button
          label="Delete chat"
          variant="secondary"
          size="sm"
          onClick={() => {
            nav.pop();
            nav.evict(chat);
          }}
        />
      </div>
      <List>
        {Array.from({length: 60}, (_, index) => (
          <ListItem key={index} label={`${chat}, message ${index + 1}`} />
        ))}
      </List>
    </div>
  );
}

function RetainStack() {
  const [path, setPath] = useState<string[]>([]);
  return (
    <div style={{height: '100vh'}}>
      <NavigationStack
        label="Chats"
        retainPopped={2}
        root={
          <NavigationScreen title="Chats">
            <ChatRows />
          </NavigationScreen>
        }
        path={path}
        onPathChange={setPath}
        getKey={entry => entry}
        renderScreen={entry => (
          <NavigationScreen title={entry}>
            <Transcript chat={entry} />
          </NavigationScreen>
        )}
      />
    </div>
  );
}

/**
 * `retainPopped={2}`: the last two popped chats stay mounted, hidden. Reopen
 * one and it comes back with no remount, its scroll and draft as left. A
 * third popped chat sends the least recently popped one away. Delete chat
 * pops and evicts at once.
 */
export const RetainedScreens: Story = {render: () => <RetainStack />};

// =============================================================================
// (d) A screen prepared at the press
// =============================================================================

const tally = {mounts: 0};

function HeavyChat({chat}: {chat: string}) {
  const {state} = useNavigationScreen();
  useEffect(() => {
    tally.mounts += 1;
  }, []);
  return (
    <div>
      <ScreenState />
      <p style={{margin: 16}}>
        {chat} rendered {state === 'prepared' ? 'ahead, hidden' : 'on view'}.
        Mounts so far: {tally.mounts}.
      </p>
      <List>
        {Array.from({length: 800}, (_, index) => (
          <ListItem
            key={index}
            label={`${chat}, message ${index + 1}`}
            description="A long screen, so its render takes time."
          />
        ))}
      </List>
    </div>
  );
}

function PreparedRow({chat}: {chat: string}) {
  const link = useNavigationLink(chat);
  return (
    <ListItem
      ref={link.ref}
      label={chat}
      description="Press: it renders ahead. Scroll instead: it is dropped."
      endContent={chevron}
      onClick={link.onClick}
    />
  );
}

function PreparedStack() {
  const [path, setPath] = useState<string[]>([]);
  return (
    <div style={{height: '100vh'}}>
      <NavigationStack
        label="Chats"
        root={
          <NavigationScreen title="Chats">
            <List>
              {CHATS.map(chat => (
                <PreparedRow key={chat} chat={chat} />
              ))}
            </List>
          </NavigationScreen>
        }
        path={path}
        onPathChange={setPath}
        getKey={entry => entry}
        renderScreen={entry => (
          <NavigationScreen title={entry}>
            <HeavyChat chat={entry} />
          </NavigationScreen>
        )}
      />
    </div>
  );
}

/**
 * Each row uses `useNavigationLink`: the press renders the chat ahead at
 * transition priority, hidden, so the push mounts nothing and starts at once.
 * A press that becomes a scroll drops it. One chat is prepared at a time.
 */
export const PreparedPush: Story = {render: () => <PreparedStack />};

// =============================================================================
// (e) Content that owns its scroller
// =============================================================================

function OwnScrollerTranscript({chat}: {chat: string}) {
  const scroller = useNavigationScroller();
  return (
    <div style={{display: 'flex', flexDirection: 'column', height: '100%'}}>
      <div
        ref={scroller.ref}
        data-own-scroller
        style={{flex: 1, overflowY: 'auto', paddingTop: scroller.barInset}}>
        <div {...scroller.sentinelProps} />
        <ScreenState />
        <List>
          {Array.from({length: 60}, (_, index) => (
            <ListItem key={index} label={`${chat}, message ${index + 1}`} />
          ))}
        </List>
      </div>
      <div style={{padding: 12, borderTop: '1px solid'}}>
        <input aria-label="Message" placeholder="Docked composer" />
      </div>
    </div>
  );
}

function ContentScrollStack() {
  const [path, setPath] = useState<string[]>([]);
  return (
    <div style={{height: '100vh'}}>
      <NavigationStack
        label="Chats"
        retainPopped={2}
        root={
          <NavigationScreen title="Chats">
            <ChatRows />
          </NavigationScreen>
        }
        path={path}
        onPathChange={setPath}
        getKey={entry => entry}
        renderScreen={entry => (
          <NavigationScreen title={entry} scroll="content">
            <OwnScrollerTranscript chat={entry} />
          </NavigationScreen>
        )}
      />
    </div>
  );
}

/**
 * Each chat uses `scroll="content"`: its content gets the card's whole box,
 * a definite height, and brings its own scroller with a docked composer. The
 * bar's edge veil follows that scroller, and a reopened chat keeps its
 * scroll.
 */
export const ContentScroller: Story = {render: () => <ContentScrollStack />};

// =============================================================================
// Hidden screens take no input, whatever their place in the DOM
// =============================================================================

function HitProbe() {
  const [hit, setHit] = useState('none yet');
  const [clicks, setClicks] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={boxRef}
      data-hit-probe
      onClick={() => setClicks(count => count + 1)}
      onPointerMove={event => {
        const element = document.elementFromPoint(event.clientX, event.clientY);
        const screen = element?.closest('[data-navigation-screen]');
        setHit(screen?.getAttribute('data-navigation-screen') ?? 'none');
      }}
      style={{margin: 16, padding: 24, border: '1px dashed', minHeight: 160}}>
      <p>Move the pointer here and click.</p>
      <p>
        The screen under the pointer: <strong data-hit>{hit}</strong>
      </p>
      <p>
        Clicks this screen received: <strong data-clicks>{clicks}</strong>
      </p>
    </div>
  );
}

function HitStack() {
  const [path, setPath] = useState<string[]>([]);
  return (
    <div style={{height: '100vh'}}>
      <NavigationStack
        label="Chats"
        retainPopped={2}
        root={
          <NavigationScreen title="Chats">
            <ScreenState />
            <HitProbe />
            <ChatRows />
          </NavigationScreen>
        }
        path={path}
        onPathChange={setPath}
        getKey={entry => entry}
        renderScreen={entry => (
          <NavigationScreen title={entry}>
            <ScreenState />
            <HitProbe />
          </NavigationScreen>
        )}
      />
    </div>
  );
}

/**
 * Open a chat and go back: the chat stays mounted after the root in the DOM.
 * Pointer moves, clicks and wheels over the root still reach the root, and
 * the probe names the root as the screen under the pointer.
 */
export const HiddenScreensTakeNoInput: Story = {render: () => <HitStack />};

// =============================================================================
// (f) A root with its own header and no bar
// =============================================================================

function ScopeHeader() {
  return (
    <div style={{padding: 16, display: 'grid', gap: 8}}>
      <Button label="All Spaces ▾" variant="secondary" size="sm" />
      <input aria-label="Search chats" placeholder="Search" />
    </div>
  );
}

function BarHiddenStack() {
  const [path, setPath] = useState<string[]>([]);
  return (
    <div style={{height: '100vh'}}>
      <NavigationStack
        label="Chats"
        root={
          <NavigationScreen title="Chats" isBarHidden>
            <ScopeHeader />
            <ChatRows />
          </NavigationScreen>
        }
        path={path}
        onPathChange={setPath}
        getKey={entry => entry}
        renderScreen={entry => (
          <NavigationScreen title={entry}>
            <ScreenState />
          </NavigationScreen>
        )}
      />
    </div>
  );
}

/**
 * The root sets `isBarHidden` and keeps its own header: a scope menu over a
 * search field. A push brings the chat's bar in with the push, on the push's
 * spring; Back takes it out again. The root's title stays a heading for
 * screen readers.
 */
export const BarHiddenRoot: Story = {render: () => <BarHiddenStack />};
