// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
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
