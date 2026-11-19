// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useCallback, useState, type ReactNode} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {REFRESH_REVEAL_VAR, useRefreshControl} from '@astryxdesign/lab';
import {Button} from '@astryxdesign/core/Button';
import {List, ListItem} from '@astryxdesign/core/List';
import {Spinner} from '@astryxdesign/core/Spinner';

interface StoryArgs {
  /**
   * How long a refresh takes, in ms. Below 0, it lasts until the page
   * dispatches `refreshcontrol-story-end` on `window`, so a test ends it.
   */
  refreshMs: number;
  /** Rows in the list. */
  rows: number;
}

const meta: Meta<StoryArgs> = {
  title: 'Lab/Pull to refresh',
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    refreshMs: 1500,
    rows: 40,
  },
  argTypes: {
    refreshMs: {control: {type: 'number', min: 0, step: 100}},
    rows: {control: {type: 'number', min: 1, step: 1}},
  },
};

export default meta;

type Story = StoryObj<StoryArgs>;

const wait = (ms: number) =>
  new Promise<void>(resolve => {
    setTimeout(resolve, ms);
  });

/** One refresh: `ms`, or until the page ends it when `ms` is below 0. */
function refreshFor(ms: number): Promise<void> {
  if (Number(ms) >= 0) {
    return wait(ms);
  }
  return new Promise<void>(resolve => {
    window.addEventListener('refreshcontrol-story-end', () => resolve(), {
      once: true,
    });
  });
}

function Messages({rows, count}: {rows: number; count: number}) {
  return (
    <List header={`Inbox (refreshed ${count} times)`}>
      {Array.from({length: rows}, (_, index) => (
        <ListItem
          key={index}
          label={`Message ${index + 1}`}
          description={
            index === 0 ? `Refresh ${count}` : 'Pull down at the top to refresh'
          }
        />
      ))}
    </List>
  );
}

/** The app's indicator shows as much of itself as the pull reveals. */
const revealed = {opacity: `var(${REFRESH_REVEAL_VAR}, 0)`};

/**
 * What an app writes: its own scroll container, the content the hook pulls,
 * and its own indicator, here Core's Spinner. The indicator band sits at the
 * bottom of an overflow-hidden box on the content's top edge, after the
 * content. The list holds nothing focusable, so the container is a named tab
 * stop that a keyboard can scroll.
 */
function PullToRefresh({
  onRefresh,
  isRefreshing,
  text,
  count,
  isAlwaysScrollable = false,
  children,
}: {
  onRefresh: () => unknown;
  isRefreshing?: boolean;
  text: string;
  count: number;
  /**
   * Makes the content 1 px taller than the container. The pull applies only
   * in a container that overflows, so a short list pulls only with this.
   */
  isAlwaysScrollable?: boolean;
  children: ReactNode;
}) {
  const control = useRefreshControl({
    onRefresh,
    isRefreshing,
    announce: 'Refreshing',
  });
  return (
    <div
      data-refresh-scroller=""
      data-refresh-count={count}
      role="region"
      aria-label="Inbox"
      tabIndex={0}
      style={{height: '100%', overflowY: 'auto'}}>
      <div
        ref={control.contentRef}
        data-refresh-content=""
        aria-busy={control.isRefreshing || undefined}
        style={{
          position: 'relative',
          minHeight: isAlwaysScrollable ? 'calc(100% + 1px)' : undefined,
        }}>
        {children}
        <div
          style={{
            position: 'absolute',
            insetInline: 0,
            bottom: '100%',
            height: '100lvh',
            overflow: 'hidden',
            pointerEvents: 'none',
          }}>
          <div
            ref={control.indicatorRef}
            aria-hidden
            style={{
              position: 'absolute',
              insetInline: 0,
              bottom: 0,
              height: 60,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <span style={revealed}>
              <Spinner size="lg" shade="subtle" label={text} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function useInbox(refreshMs: number) {
  const [count, setCount] = useState(0);
  const onRefresh = useCallback(async () => {
    await refreshFor(refreshMs);
    setCount(value => value + 1);
  }, [refreshMs]);
  return {count, onRefresh};
}

/**
 * A list in the app's own scroll container. Pull it down past the top on a
 * touch screen, or with a trackpad's two-finger scroll. Past the trigger, the
 * refresh starts with the finger down.
 */
export const InAScrollContainer: Story = {
  render: function InAScrollContainerStory({refreshMs, rows}) {
    const {count, onRefresh} = useInbox(refreshMs);
    return (
      <div style={{height: '100dvh'}}>
        <PullToRefresh
          onRefresh={onRefresh}
          count={count}
          text={`Updated ${count} times`}>
          <Messages rows={rows} count={count} />
        </PullToRefresh>
      </div>
    );
  },
};

/**
 * Controlled: the button refreshes too (the pull has no keyboard or
 * screen-reader equivalent), and the app sets `isRefreshing` itself.
 */
export const Controlled: Story = {
  render: function ControlledStory({refreshMs, rows}) {
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [count, setCount] = useState(0);
    const refresh = useCallback(() => {
      setIsRefreshing(true);
      void refreshFor(refreshMs).then(() => {
        setCount(value => value + 1);
        setIsRefreshing(false);
      });
    }, [refreshMs]);
    return (
      <div style={{height: '100dvh', display: 'flex', flexDirection: 'column'}}>
        <div style={{padding: 8}}>
          <Button label="Refresh" onClick={refresh} isDisabled={isRefreshing} />
        </div>
        <div style={{flex: 1, minHeight: 0}}>
          <PullToRefresh
            onRefresh={refresh}
            isRefreshing={isRefreshing}
            count={count}
            text={`Updated ${count} times`}>
            <Messages rows={rows} count={count} />
          </PullToRefresh>
        </div>
      </div>
    );
  },
};

/**
 * A list shorter than the screen still pulls: the app makes its content 1 px
 * taller than the container, so the container overflows.
 */
export const ShortList: Story = {
  args: {rows: 3},
  render: function ShortListStory({refreshMs, rows}) {
    const {count, onRefresh} = useInbox(refreshMs);
    return (
      <div style={{height: '100dvh'}}>
        <PullToRefresh
          onRefresh={onRefresh}
          count={count}
          isAlwaysScrollable
          text="Pull to refresh">
          <Messages rows={rows} count={count} />
        </PullToRefresh>
      </div>
    );
  },
};
