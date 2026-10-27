// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file List.stories.tsx
 * @input List, ListItem, and Storybook args
 * @output List examples, including the four row edge treatments
 * @position Storybook demonstrations for List consumers
 */

import {useMemo, useRef, useState, type MouseEvent} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {Meta, StoryObj} from '@storybook/react';
import {List, ListItem} from '@astryxdesign/core/List';
import {createReorderable} from '@astryxdesign/core/reorderable';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Badge} from '@astryxdesign/core/Badge';
import {Card} from '@astryxdesign/core/Card';
import {Icon} from '@astryxdesign/core/Icon';
import {Switch} from '@astryxdesign/core/Switch';
import {Heading, Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/Layout';
import {Button} from '@astryxdesign/core/Button';
import {ContextMenu} from '@astryxdesign/core/ContextMenu';
// The selection hold is internal to core (no public API records it yet).
import {
  holdSelection,
  type SelectionHold as RowSelectionHold,
} from '../../../packages/core/src/List/selectionHold';
import {
  Cog6ToothIcon,
  BellIcon,
  ShieldCheckIcon,
  ChevronRightIcon,
  InboxIcon,
  PaperAirplaneIcon,
  DocumentIcon,
} from '@heroicons/react/24/outline';

const meta: Meta<typeof List> = {
  title: 'Core/List',
  component: List,
  tags: ['autodocs'],
  argTypes: {
    density: {
      control: 'select',
      options: ['compact', 'balanced', 'spacious'],
      description: 'Spacing density for list items',
    },
    hasDividers: {
      control: 'boolean',
      description: 'Whether to show dividers between items',
    },
    edge: {
      control: 'select',
      options: ['padded', 'flush', 'outset', 'bleed'],
      description:
        "Where row text, dividers, and backgrounds sit relative to the list's " +
        "edges and the container's padding",
    },
    listStyle: {
      control: 'select',
      options: ['none', 'disc', 'decimal', 'circle'],
      description: 'List marker style',
    },
  },
};

export default meta;
type Story = StoryObj<typeof List>;

const edgeStoryStyles = stylex.create({
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 24,
  },
});

export const Basic: Story = {
  render: args => (
    <List {...args}>
      <ListItem label="Notifications" description="Manage your alerts" />
      <ListItem label="Privacy" description="Control your data" />
      <ListItem label="Security" description="Password and 2FA" />
    </List>
  ),
};

export const WithDividers: Story = {
  render: args => (
    <List hasDividers header={<strong>Settings</strong>} {...args}>
      <ListItem
        label="Notifications"
        description="Manage your alerts"
        startContent={<Icon icon={BellIcon} />}
      />
      <ListItem
        label="Privacy"
        description="Control your data"
        startContent={<Icon icon={ShieldCheckIcon} />}
      />
      <ListItem
        label="General"
        description="App preferences"
        startContent={<Icon icon={Cog6ToothIcon} />}
      />
    </List>
  ),
};

export const Compact: Story = {
  render: args => (
    <List density="compact" hasDividers {...args}>
      <ListItem
        label="Notifications"
        onClick={() => {}}
        endContent={<Badge label="3" />}
      />
      <ListItem
        label="Messages"
        onClick={() => {}}
        endContent={<Badge label="12" />}
      />
      <ListItem label="Settings" onClick={() => {}} />
    </List>
  ),
};

export const Spacious: Story = {
  render: args => (
    <List density="spacious" {...args}>
      <ListItem
        label="Getting Started"
        description="Learn the basics of our platform"
      />
      <ListItem
        label="Advanced Topics"
        description="Deep dive into advanced features"
      />
      <ListItem
        label="API Reference"
        description="Complete API documentation"
      />
    </List>
  ),
};

export const Flush: Story = {
  args: {edge: 'flush', hasDividers: true},
  render: args => (
    <div>
      <Text type="label" size="lg">
        Order items
      </Text>
      <List {...args}>
        <ListItem label="Solstice Mug" description="Ceramic, 12 oz" />
        <ListItem label="Meridian Notebook" description="Dot grid, A5" />
        <ListItem label="Field Pen" description="0.5 mm, black ink" />
      </List>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'edge="flush" drops the rows\' side padding, so row text starts on ' +
          'the same line as the heading and the ends of the dividers, with no ' +
          'container needed. Switch edge to compare.',
      },
    },
  },
};

const EDGES = ['padded', 'flush', 'outset', 'bleed'] as const;

/**
 * The four edge treatments inside a Card, for a static list with dividers
 * and an interactive list with a selected row.
 */
export const EdgeInCard: Story = {
  render: args => (
    <div {...stylex.props(edgeStoryStyles.grid)}>
      {EDGES.map(edge => (
        <Card key={edge} data-edge={edge}>
          <VStack gap={3}>
            <Heading level={3}>{`edge="${edge}"`}</Heading>
            <List {...args} edge={edge} hasDividers>
              <ListItem label="Ada Lovelace" description="Engineer" />
              <ListItem label="Grace Hopper" description="Admiral" />
            </List>
            <List {...args} edge={edge}>
              <ListItem
                label="Inbox"
                onClick={() => {}}
                startContent={<Icon icon={InboxIcon} />}
              />
              <ListItem
                label="Sent"
                isSelected
                onClick={() => {}}
                startContent={<Icon icon={PaperAirplaneIcon} />}
              />
            </List>
          </VStack>
        </Card>
      ))}
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "padded keeps text inside each row's padding. flush puts text, " +
          "dividers, and backgrounds on the heading's line. outset puts text " +
          "on the heading's line and reaches backgrounds into the card's " +
          "padding by the rows' own padding. bleed reaches rows to the card's " +
          "edges, like Table rows, with text on the card's padding line.",
      },
    },
  },
};

export const Interactive: Story = {
  render: args => (
    <List {...args}>
      <ListItem
        label="Inbox"
        isSelected
        onClick={() => {}}
        startContent={<Icon icon={InboxIcon} />}
        endContent={<Icon icon={ChevronRightIcon} />}
      />
      <ListItem
        label="Sent"
        onClick={() => {}}
        startContent={<Icon icon={PaperAirplaneIcon} />}
        endContent={<Icon icon={ChevronRightIcon} />}
      />
      <ListItem
        label="Drafts"
        onClick={() => {}}
        startContent={<Icon icon={DocumentIcon} />}
        endContent={<Icon icon={ChevronRightIcon} />}
      />
    </List>
  ),
};

export const Links: Story = {
  render: args => (
    <List {...args}>
      <ListItem label="Documentation" href="/docs" />
      <ListItem
        label="GitHub"
        href="https://github.com"
        target="_blank"
        description="View source code"
      />
      <ListItem
        label="Storybook"
        href="/storybook"
        description="Component playground"
      />
    </List>
  ),
};

export const OrderedList: Story = {
  render: args => (
    <List listStyle="decimal" {...args}>
      <ListItem
        label="Install the package"
        description="npm install @astryxdesign/core"
      />
      <ListItem
        label="Import components"
        description="import { List } from '@astryxdesign/core'"
      />
      <ListItem
        label="Start building"
        description="Use components in your app"
      />
    </List>
  ),
};

export const BulletedList: Story = {
  render: args => (
    <List listStyle="disc" {...args}>
      <ListItem label="Accessible by default" />
      <ListItem label="Themeable with StyleX" />
      <ListItem label="Composable and extensible" />
    </List>
  ),
};

export const DisabledItems: Story = {
  render: args => (
    <List {...args}>
      <ListItem label="Available" onClick={() => {}} />
      <ListItem label="Unavailable" onClick={() => {}} isDisabled />
      <ListItem label="Also Available" onClick={() => {}} />
    </List>
  ),
};

export const WithMedia: Story = {
  render: args => (
    <List hasDividers {...args}>
      <ListItem
        label="Alex Johnson"
        description="Hey, are we still on for lunch tomorrow?"
        startContent={<Avatar name="Alex Johnson" size={40} />}
        onClick={() => {}}
        endContent={<Badge label="2" />}
      />
      <ListItem
        label="Sam Rivera"
        description="I pushed the latest changes to the repo"
        startContent={<Avatar name="Sam Rivera" size={40} />}
        onClick={() => {}}
      />
      <ListItem
        label="Jordan Lee"
        description="Can you review the design spec when you get a chance?"
        startContent={<Avatar name="Jordan Lee" size={40} />}
        onClick={() => {}}
        endContent={<Badge label="5" />}
      />
    </List>
  ),
};

function ToggleHeaderDemo() {
  const [showArchived, setShowArchived] = useState(false);
  return (
    <List
      hasDividers
      header={
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
          <Text type="label" size="lg">
            Notifications
          </Text>
          <Switch
            label="Show archived"
            value={showArchived}
            onChange={checked => setShowArchived(checked)}
          />
        </div>
      }>
      <ListItem
        label="New deployment succeeded"
        description="Production v2.4.1 deployed"
        startContent={<Icon icon={BellIcon} />}
      />
      <ListItem
        label="Security alert"
        description="Unusual login detected"
        startContent={<Icon icon={ShieldCheckIcon} />}
      />
      {showArchived && (
        <ListItem
          label="Archived: Build completed"
          description="CI pipeline finished"
          startContent={<Icon icon={Cog6ToothIcon} />}
        />
      )}
    </List>
  );
}

export const HeaderWithToggle: Story = {
  render: () => <ToggleHeaderDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'A list with a toggle in the header. The header and list are ' +
          'wrapped so they stack correctly even inside flex parents.',
      },
    },
  },
};

export const HeaderInFlexParent: Story = {
  render: () => (
    <div
      style={{
        display: 'flex',
        gap: 24,
        border: '1px dashed #888',
        padding: 16,
      }}>
      <div style={{flex: 1}}>
        <Text type="label" size="lg">
          Sidebar
        </Text>
      </div>
      <div style={{flex: 2}}>
        <ToggleHeaderDemo />
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Demonstrates the list with a header inside a flex parent. ' +
          'The header should appear above the list, not beside it.',
      },
    },
  },
};

function SelectionHoldDemo() {
  const hold = useRef<RowSelectionHold | null>(null);
  const slider = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const push = (label: string) => (event: MouseEvent) => {
    // In the same task as the activation that pushes.
    hold.current = holdSelection(event.target);
    setProgress(0);
    setOpen(label);
  };
  const settle = async (
    to: 0 | 1,
    timing?: Parameters<RowSelectionHold['animate']>[1],
    {followSlider = false}: {followSlider?: boolean} = {},
  ) => {
    const current = hold.current;
    // A slow pop shows where it is on the slider (written to the input, no
    // render per frame), so a finger that takes the slider over mid-flight
    // continues from the value on screen. (Off for the regular pop, whose
    // proof counts every paint.)
    const following = {frame: 0};
    const follow = () => {
      if (current != null && slider.current != null) {
        slider.current.value = String(current.presentation());
      }
      following.frame = requestAnimationFrame(follow);
    };
    if (followSlider) {
      following.frame = requestAnimationFrame(follow);
    }
    // No hold under a mouse: the screen just pops.
    const arrived = current == null || (await current.animate(to, timing));
    cancelAnimationFrame(following.frame);
    if (!arrived) {
      // Interrupted (a finger took the progress over mid-flight): the hold
      // stays where the finger left it.
      return;
    }
    if (to === 1) {
      setOpen(null);
      current?.end(true);
      current?.focus({preventScroll: true});
      hold.current = null;
    } else {
      current?.end(false);
      setProgress(0);
    }
  };
  return (
    <VStack gap={4}>
      <List hasDividers>
        {['Inbox', 'Sent', 'Drafts'].map(label => (
          <ListItem
            key={label}
            label={label}
            onClick={push(label)}
            endContent={<Icon icon={ChevronRightIcon} />}
          />
        ))}
      </List>
      {open != null && (
        <VStack gap={2} data-testid="pushed-screen">
          <Text type="label">{open} (pushed)</Text>
          <Button label="Back" onClick={() => void settle(1)} />
          <Button
            label="Back, slowly"
            onClick={() =>
              void settle(
                1,
                {durationMs: 3000, curve: [0, 0, 1, 1]},
                {followSlider: true},
              )
            }
          />
          <label>
            Pop progress
            <input
              ref={slider}
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={progress}
              onChange={event => {
                const value = Number(event.target.value);
                setProgress(value);
                hold.current?.setProgress(value);
              }}
            />
          </label>
          <Button label="Finish pop" onClick={() => void settle(1)} />
          <Button label="Cancel pop" onClick={() => void settle(0)} />
        </VStack>
      )}
    </VStack>
  );
}

export const SelectionHold: Story = {
  render: () => <SelectionHoldDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'A row tapped to push stays selected while the pushed screen covers it ' +
          'and deselects as the screen pops (UIKit’s push from a table row), ' +
          'driven here by buttons standing in for a navigation stack: Back runs ' +
          'the in-transition deselect, the slider scrubs it like an edge swipe, ' +
          'and Cancel selects the row again.',
      },
    },
  },
};

function AnimatedChangesDemo() {
  const [rows, setRows] = useState([
    'Inbox',
    'Sent',
    'Drafts',
    'Archive',
    'Spam',
  ]);
  const [next, setNext] = useState(1);
  return (
    <VStack gap={4}>
      <List hasAnimatedChanges hasDividers>
        {rows.map(label => (
          <ListItem key={label} label={label} onClick={() => {}} />
        ))}
      </List>
      <Button
        label="Insert a row second"
        onClick={() => {
          setRows(current => [
            current[0],
            `Folder ${next}`,
            ...current.slice(1),
          ]);
          setNext(n => n + 1);
        }}
      />
      <Button
        label="Remove the second row"
        onClick={() =>
          setRows(current => current.filter((_, index) => index !== 1))
        }
      />
      <Button
        label="Move the last row first"
        onClick={() =>
          setRows(current => [
            current[current.length - 1],
            ...current.slice(0, -1),
          ])
        }
      />
    </VStack>
  );
}

export const AnimatedChanges: Story = {
  render: () => <AnimatedChangesDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'With `hasAnimatedChanges`, under a finger, ' +
          'rows that stay slide to their new places and new rows fade in ' +
          'once the rows sliding past have cleared them, on UIKit’s table ' +
          'update spring; a row crossing rows that move the other way ' +
          'rides above them with the surface color behind it.',
      },
    },
  },
};

function AnimatedChangesSwipeDemo() {
  const [rows, setRows] = useState(['Inbox', 'Sent', 'Drafts', 'Archive']);
  return (
    <List hasAnimatedChanges hasDividers>
      {rows.map(label => (
        <ListItem
          key={label}
          label={label}
          onClick={() => {}}
          swipeActions={{
            trailing: [
              {
                label: 'Delete',
                variant: 'destructive',
                hasRemoval: true,
                onActivate: () =>
                  setRows(current => current.filter(row => row !== label)),
              },
            ],
          }}
        />
      ))}
    </List>
  );
}

export const AnimatedChangesSwipe: Story = {
  render: () => <AnimatedChangesSwipeDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'With `hasAnimatedChanges`, a row swiped away with a removal ' +
          'action collapses in place, its action showing, while the rows ' +
          'below slide up into its gap on UIKit’s table update spring.',
      },
    },
  },
};

function moveKey(
  rows: ReadonlyArray<string>,
  key: unknown,
  to: number,
): string[] {
  const next = rows.filter(row => row !== key);
  next.splice(to, 0, key as string);
  return next;
}

function ReorderDemo({
  initial,
  pinned = [],
  edge,
}: {
  initial: ReadonlyArray<string>;
  pinned?: ReadonlyArray<string>;
  edge?: 'padded' | 'flush';
}) {
  const [rows, setRows] = useState(initial);
  // Each move onReorder reports, counted on the list for the browser proofs:
  // one per drop and per reorder mode move, none per cancel (spec:AST-103
  // FR3).
  const [moves, setMoves] = useState(0);
  return (
    <List
      data-moves={moves}
      hasDividers
      hasAnimatedChanges
      edge={edge}
      reorderable={createReorderable({
        onReorder: ({key, to}) => {
          setMoves(count => count + 1);
          setRows(current => moveKey(current, key, to));
        },
        isReorderable: key => !pinned.includes(key as string),
      })}>
      {rows.map(label => (
        <ListItem key={label} itemKey={label} label={label} />
      ))}
    </List>
  );
}

export const Reorderable: Story = {
  render: () => (
    <ReorderDemo
      initial={['Inbox', 'Sent', 'Drafts', 'Archive', 'Spam', 'Trash']}
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'With `reorderable` (from `createReorderable`), each row with an ' +
          '`itemKey` gets a reorder handle. On a touch screen, hold a handle ' +
          'for a moment, then drag: the row dims in place, a copy follows ' +
          'your finger and a line marks where it will land, and the rows ' +
          'rearrange on release. A mouse drags a handle at once, the same ' +
          'way. Or activate a handle (click it, or press Space ' +
          'or Enter) to turn on reorder mode for its row: each arrow key, or ' +
          'each move in the hint below the handle, moves it a place, and ' +
          'Escape or Done ends the mode.',
      },
    },
  },
};

export const ReorderFlush: Story = {
  render: () => (
    <ReorderDemo
      initial={['Inbox', 'Sent', 'Drafts', 'Archive']}
      edge="flush"
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'With `edge="flush"` the rows have no side padding, so each ' +
          "reorder handle ends at the row's edge, inside the list.",
      },
    },
  },
};

export const ReorderWithPinnedRows: Story = {
  render: () => (
    <ReorderDemo
      initial={['Favorites', 'Inbox', 'Sent', 'All mail', 'Drafts', 'Spam']}
      pinned={['Favorites', 'All mail']}
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'A row the object’s `isReorderable` rejects has no handle. At an ' +
          'end of the list it also bounds the others (nothing drops above ' +
          'Favorites); in the middle, other rows move past it.',
      },
    },
  },
};

function ReorderFromYourUIDemo() {
  const [rows, setRows] = useState([
    'Inbox',
    'Sent',
    'Drafts',
    'Archive',
    'Spam',
    'Trash',
  ]);
  const [selected, setSelected] = useState('Sent');
  const reorderable = useMemo(
    () =>
      createReorderable({
        onReorder: ({key, to}) => setRows(current => moveKey(current, key, to)),
      }),
    [],
  );
  return (
    <VStack gap={2}>
      <Button
        label={`Move ${selected}`}
        onClick={() => reorderable.start(selected)}
      />
      <ContextMenu
        label="Row actions"
        items={[
          {
            label: `Move ${selected}`,
            onClick: () => reorderable.start(selected),
          },
        ]}>
        <List hasDividers hasAnimatedChanges reorderable={reorderable}>
          {rows.map(label => (
            <ListItem
              key={label}
              itemKey={label}
              label={label}
              isSelected={label === selected}
              onClick={() => setSelected(label)}
            />
          ))}
        </List>
      </ContextMenu>
    </VStack>
  );
}

export const ReorderFromYourUI: Story = {
  render: () => <ReorderFromYourUIDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'The object’s `start(key)` turns on reorder mode for a row from ' +
          'your own UI, here a button and the list’s context menu: the ' +
          'focus moves to the row’s handle, and its arrow keys, hint and ' +
          'Done work as they do from the handle.',
      },
    },
  },
};

export const ReorderLongList: Story = {
  render: () => (
    <ReorderDemo
      initial={Array.from({length: 30}, (_, index) => `Item ${index + 1}`)}
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Dragging a row near the top or bottom of the screen scrolls the ' +
          'page, faster the further past the edge the row goes.',
      },
    },
  },
};
