// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useLayoutEffect, useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {
  NavigationScreen,
  NavigationStack,
  useNavigationStack,
} from '@astryxdesign/lab';
import {Button} from '@astryxdesign/core/Button';
import {List, ListItem} from '@astryxdesign/core/List';
import {Icon} from '@astryxdesign/core/Icon';
import {rtlStyles} from '@astryxdesign/core/utils';

// =============================================================================
// Meta
// =============================================================================

const meta: Meta<typeof NavigationStack> = {
  title: 'Lab/NavigationStack',
  component: NavigationStack,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof NavigationStack>;

// =============================================================================
// Settings — the drill-down UIKit's own captures were taken on
// =============================================================================

const SECTIONS: Record<string, string[]> = {
  Settings: ['General', 'Accessibility', 'Privacy & Security', 'Display'],
  General: ['About', 'Software Update', 'Storage', 'Language & Region'],
  Accessibility: ['Motion', 'Display & Text Size', 'Touch', 'Spoken Content'],
  'Privacy & Security': ['Location Services', 'Tracking', 'Camera', 'Photos'],
  Display: ['Brightness', 'Text Size', 'Night Shift'],
};

function Rows({title}: {title: string}) {
  const nav = useNavigationStack<string>();
  const rows = SECTIONS[title] ?? [];
  return (
    <List>
      {rows.map(row => (
        <ListItem
          key={row}
          label={row}
          endContent={
            <Icon
              icon="chevronRight"
              color="secondary"
              xstyle={rtlStyles.mirror}
            />
          }
          onClick={() => nav.push(row)}
        />
      ))}
      {rows.length === 0 ? (
        <ListItem label={`${title} has nothing deeper.`} />
      ) : null}
      {rows.length === 0 ? (
        <ListItem label="Done" onClick={() => nav.popToRoot()} />
      ) : null}
    </List>
  );
}

function SettingsStack() {
  const [path, setPath] = useState<string[]>([]);
  return (
    <div style={{height: '100vh'}}>
      <NavigationStack
        label="Settings"
        root={
          <NavigationScreen title="Settings">
            <Rows title="Settings" />
          </NavigationScreen>
        }
        path={path}
        onPathChange={setPath}
        getKey={entry => entry}
        renderScreen={entry => (
          <NavigationScreen title={entry}>
            <Rows title={entry} />
          </NavigationScreen>
        )}
        data-testid="navigation-stack"
      />
    </div>
  );
}

export const Settings: Story = {
  render: () => <SettingsStack />,
};

// =============================================================================
// Settings Heavy Commit — a push whose own commit blocks the main thread
// =============================================================================

type HeavyMode = 'commit' | 'after';

/** Holds the main thread for `ms`, as a heavy commit does. */
function holdMainThread(ms: number) {
  const until = performance.now() + ms;
  while (performance.now() < until) {
    // Busy on purpose.
  }
}

/** A pushed screen whose mount blocks for 300 ms inside the push's commit. */
function HeavyScreen({entry, mode}: {entry: string; mode: HeavyMode}) {
  useLayoutEffect(() => {
    if (mode === 'commit') {
      holdMainThread(300);
    }
  }, [mode]);
  return <Rows title={entry} />;
}

/**
 * Reads the pushed card's travelled share in each of the first eight frames
 * after a push. In `after` mode, the first moving frame blocks for 300 ms.
 */
function traceFrames(
  entry: string,
  mode: HeavyMode,
  done: (lines: string[]) => void,
) {
  const start = performance.now();
  const lines: string[] = [];
  let hasHeld = false;
  const step = (t: number) => {
    const card = document.querySelector<HTMLElement>(
      `[data-navigation-screen="screen-${entry}"]`,
    );
    const stack = document.querySelector<HTMLElement>(
      '[data-testid="navigation-stack"]',
    );
    const width = stack?.getBoundingClientRect().width ?? 1;
    const value = card == null ? 'none' : getComputedStyle(card).translate;
    const offset = value === 'none' ? 0 : Math.abs(parseFloat(value));
    const share = card == null ? 0 : 1 - offset / width;
    lines.push(`${Math.round(t - start)} ms ${(share * 100).toFixed(1)}%`);
    if (mode === 'after' && !hasHeld && share > 0.005) {
      hasHeld = true;
      holdMainThread(300);
    }
    if (lines.length < 8) {
      requestAnimationFrame(step);
    } else {
      done(lines);
    }
  };
  requestAnimationFrame(step);
}

function HeavyCommitStack() {
  const [path, setPath] = useState<string[]>([]);
  const [mode, setMode] = useState<HeavyMode>('commit');
  const [readout, setReadout] = useState<string[]>([]);
  const standalone =
    typeof navigator !== 'undefined' &&
    (navigator as Navigator & {standalone?: boolean}).standalone === true;
  // With Reduce Motion on, the push cross-fades, so every frame reads 100%.
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const push = (next: HeavyMode) => {
    setMode(next);
    setReadout([]);
    traceFrames('General', next, setReadout);
    setPath(['General']);
  };
  return (
    <div style={{height: '100vh', position: 'relative'}}>
      <NavigationStack
        label="Settings"
        root={
          <NavigationScreen title="Settings">
            <List>
              <ListItem
                label="General (heavy commit)"
                onClick={() => push('commit')}
              />
              <ListItem
                label="General (heavy after)"
                onClick={() => push('after')}
              />
            </List>
          </NavigationScreen>
        }
        path={path}
        onPathChange={setPath}
        getKey={entry => entry}
        renderScreen={entry => (
          <NavigationScreen title={entry}>
            <HeavyScreen entry={entry} mode={mode} />
          </NavigationScreen>
        )}
        data-testid="navigation-stack"
      />
      <pre
        style={{
          position: 'fixed',
          insetInlineStart: 8,
          bottom: 8,
          margin: 0,
          padding: 6,
          font: '11px/1.3 monospace',
          background: 'rgba(0, 0, 0, 0.75)',
          color: 'white',
          pointerEvents: 'none',
          zIndex: 10,
        }}>
        {`standalone ${String(standalone)} reduce-motion ${String(reducedMotion)} mode ${mode}\n${readout.join('\n')}`}
      </pre>
    </div>
  );
}

/**
 * Evidence story: a push whose own commit blocks the main thread for 300 ms
 * (`heavy commit`), or whose first moving frame does (`heavy after`). The
 * readout lists the pushed card's travelled share in the first eight frames,
 * and whether the page runs as a Home Screen app.
 */
export const SettingsHeavyCommit: Story = {
  render: () => <HeavyCommitStack />,
};

/** The root screen's bar holds an Edit button at its end (`endContent`). */
function EndContentStack() {
  const [path, setPath] = useState<string[]>([]);
  return (
    <div style={{height: '100vh'}}>
      <NavigationStack
        label="Settings"
        root={
          <NavigationScreen
            title="Settings"
            endContent={<Button label="Edit" variant="ghost" size="sm" />}>
            <Rows title="Settings" />
          </NavigationScreen>
        }
        path={path}
        onPathChange={setPath}
        getKey={entry => entry}
        renderScreen={entry => (
          <NavigationScreen title={entry}>
            <Rows title={entry} />
          </NavigationScreen>
        )}
        data-testid="navigation-stack"
      />
    </div>
  );
}

export const EndContent: Story = {
  name: 'End content',
  render: () => <EndContentStack />,
};

/**
 * Opens two levels deep, so the back swipe has somewhere to go; Done on the
 * top screen pops back to the root in one transition.
 */
function DeepStack() {
  const [path, setPath] = useState<string[]>(['General', 'About']);
  return (
    <div style={{height: '100vh'}}>
      <NavigationStack
        label="Settings"
        root={
          <NavigationScreen title="Settings">
            <Rows title="Settings" />
          </NavigationScreen>
        }
        path={path}
        onPathChange={setPath}
        getKey={entry => entry}
        renderScreen={entry => (
          <NavigationScreen title={entry}>
            <Rows title={entry} />
          </NavigationScreen>
        )}
        data-testid="navigation-stack"
      />
    </div>
  );
}

export const Pushed: Story = {
  name: 'Pushed two levels',
  render: () => <DeepStack />,
};

// =============================================================================
// Edge cases the stack must handle
// =============================================================================

/**
 * A pushed screen with a horizontal strip: a sideways drag on the strip
 * scrolls it while it can still scroll that way; elsewhere it pops.
 */
function CarouselStack() {
  const [path, setPath] = useState<string[]>(['General']);
  return (
    <div style={{height: '100vh'}}>
      <NavigationStack
        label="Settings"
        root={
          <NavigationScreen title="Settings">
            <Rows title="Settings" />
          </NavigationScreen>
        }
        path={path}
        onPathChange={setPath}
        getKey={entry => entry}
        renderScreen={entry => (
          <NavigationScreen title={entry}>
            <div
              data-testid="carousel"
              style={{
                display: 'flex',
                gap: 12,
                padding: 16,
                overflowX: 'auto',
              }}>
              {SECTIONS.Settings.concat(SECTIONS.General).map(label => (
                <div
                  key={label}
                  style={{
                    flex: '0 0 140px',
                    height: 96,
                    borderRadius: 12,
                    border: '1px solid currentColor',
                    padding: 8,
                  }}>
                  {label}
                </div>
              ))}
            </div>
            <Rows title={entry} />
          </NavigationScreen>
        )}
        data-testid="navigation-stack"
      />
    </div>
  );
}

export const Carousel: Story = {
  name: 'Pushed screen with a carousel',
  render: () => <CarouselStack />,
};

/**
 * An app that declines pops (it keeps its path, as one guarding unsaved
 * edits would): a released back swipe springs back.
 */
function DeclinesPopsStack() {
  const [path, setPath] = useState<string[]>(['General']);
  return (
    <div style={{height: '100vh'}}>
      <NavigationStack
        label="Settings"
        root={
          <NavigationScreen title="Settings">
            <Rows title="Settings" />
          </NavigationScreen>
        }
        path={path}
        onPathChange={next => {
          if (next.length >= path.length) {
            setPath(next);
          }
        }}
        getKey={entry => entry}
        renderScreen={entry => (
          <NavigationScreen title={entry}>
            <Rows title={entry} />
          </NavigationScreen>
        )}
        data-testid="navigation-stack"
      />
    </div>
  );
}

export const DeclinesPops: Story = {
  name: 'Declines pops',
  render: () => <DeclinesPopsStack />,
};

/** The root with a large title (as in Settings): it scrolls with the rows and hands over to the bar. */
function LargeTitleStack() {
  const [path, setPath] = useState<string[]>([]);
  return (
    <div style={{height: '100vh'}}>
      <NavigationStack
        label="Settings"
        root={
          <NavigationScreen title="Settings" titleDisplayMode="large">
            <Rows title="Settings" />
            <List>
              {Array.from({length: 24}, (_, i) => (
                <ListItem key={i} label={`Setting ${i + 1}`} />
              ))}
            </List>
          </NavigationScreen>
        }
        path={path}
        onPathChange={setPath}
        getKey={entry => entry}
        renderScreen={entry =>
          entry === 'Display' ? (
            <NavigationScreen title={entry} titleDisplayMode="large">
              <Rows title={entry} />
              <List>
                {Array.from({length: 24}, (_, i) => (
                  <ListItem key={i} label={`Display option ${i + 1}`} />
                ))}
              </List>
            </NavigationScreen>
          ) : (
            <NavigationScreen title={entry}>
              <Rows title={entry} />
            </NavigationScreen>
          )
        }
        data-testid="navigation-stack"
      />
    </div>
  );
}

export const LargeTitle: Story = {
  name: 'Large title',
  render: () => <LargeTitleStack />,
};

// =============================================================================
// Scrolling — content passing under the bar
// =============================================================================

const MESSAGES = Array.from({length: 40}, (_, index) => `Message ${index + 1}`);

function MessageRows() {
  const nav = useNavigationStack<string>();
  return (
    <List>
      {MESSAGES.map(message => (
        <ListItem
          key={message}
          label={message}
          description="Tap to open; scroll the list under the bar."
          endContent={
            <Icon
              icon="chevronRight"
              color="secondary"
              xstyle={rtlStyles.mirror}
            />
          }
          onClick={() => nav.push(message)}
        />
      ))}
    </List>
  );
}

function MessageBody({title}: {title: string}) {
  return (
    <List>
      {Array.from({length: 30}, (_, index) => (
        <ListItem
          key={index}
          label={`${title}, line ${index + 1}`}
          description="Long content scrolls under the bar."
        />
      ))}
    </List>
  );
}

function ScrollingStack() {
  const [path, setPath] = useState<string[]>([]);
  return (
    <div style={{height: '100vh'}}>
      <NavigationStack
        label="Mail"
        root={
          <NavigationScreen title="Inbox">
            <MessageRows />
          </NavigationScreen>
        }
        path={path}
        onPathChange={setPath}
        getKey={entry => entry}
        renderScreen={entry => (
          <NavigationScreen title={entry}>
            <MessageBody title={entry} />
          </NavigationScreen>
        )}
        data-testid="navigation-stack"
      />
    </div>
  );
}

/**
 * Screens long enough to scroll under the bar. On a touch screen the bar
 * paints no background. Once a screen's content has moved 10px under it, a
 * veil of the body colour fades in, as iOS 26's scroll edge effect does.
 * Each screen keeps its own veil through a push, a pop or a back swipe.
 */
export const Scrolling: Story = {
  render: () => <ScrollingStack />,
};

/**
 * A pushed screen whose content raises a layer with `z-index: 2` over its
 * top edge, under the bar. The bar's title and Back stay above it.
 */
function RaisedContentStack() {
  const [path, setPath] = useState<string[]>(['General']);
  return (
    <div style={{height: '100vh'}}>
      <NavigationStack
        label="Settings"
        root={
          <NavigationScreen title="Settings">
            <Rows title="Settings" />
          </NavigationScreen>
        }
        path={path}
        onPathChange={setPath}
        getKey={entry => entry}
        renderScreen={entry => (
          <NavigationScreen title={entry}>
            <div
              data-testid="raised-content"
              style={{
                position: 'absolute',
                insetInline: 0,
                top: 0,
                height: 160,
                zIndex: 2,
                background: 'rgb(255 214 0 / 0.9)',
              }}
            />
            <Rows title={entry} />
          </NavigationScreen>
        )}
        data-testid="navigation-stack"
      />
    </div>
  );
}

export const RaisedContent: Story = {
  name: 'Raised content under the bar',
  render: () => <RaisedContentStack />,
};
