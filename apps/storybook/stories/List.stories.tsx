// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file List.stories.tsx
 * @input List, ListItem, and Storybook args
 * @output List examples, including row edge treatments and long number markers
 * @position Storybook demonstrations for List consumers
 */

import {useEffect, useRef, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {Meta, StoryObj} from '@storybook/react';
import {List, ListItem} from '@astryxdesign/core/List';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Icon} from '@astryxdesign/core/Icon';
import {Switch} from '@astryxdesign/core/Switch';
import {Heading, Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/Layout';
import {useAnimatedLayout} from '@astryxdesign/core/hooks';
import {rtlStyles} from '@astryxdesign/core/utils';
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

/** How far a row's touch target reaches above and below its box, px. */
interface TouchReach {
  readonly label: string;
  readonly above: number;
  readonly below: number;
}

/** One striped band of a row's touch target, outside the row's own box. */
interface TouchBand {
  readonly key: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

interface TouchTargets {
  readonly bands: ReadonlyArray<TouchBand>;
  readonly reach: ReadonlyArray<TouchReach>;
}

const TOUCH_TARGET_ROWS = ['Row 1', 'Row 2', 'Row 3', 'Row 4'];

/** A length rounded to the nearest half pixel. */
const toHalfPx = (value: number) => Math.round(value * 2) / 2;

/**
 * Reads each row's touch hit layer, the row's own `::after`, as the browser
 * lays it out, and the bands of it past the row's box. Under a fine pointer a
 * row has no layer, so nothing is read.
 */
function readTouchTargets(frame: HTMLElement): TouchTargets {
  const origin = frame.getBoundingClientRect();
  const bands: TouchBand[] = [];
  const reach: TouchReach[] = [];
  frame.querySelectorAll<HTMLElement>('ul > li').forEach((row, index) => {
    const layer = getComputedStyle(row, '::after');
    if (layer.position !== 'absolute') {
      return;
    }
    const style = getComputedStyle(row);
    const box = row.getBoundingClientRect();
    // The layer's offsets start at the row's padding box, inside its border.
    const top =
      box.top + parseFloat(style.borderTopWidth) + parseFloat(layer.top);
    const bottom =
      box.bottom -
      parseFloat(style.borderBottomWidth) -
      parseFloat(layer.bottom);
    const left =
      box.left + parseFloat(style.borderLeftWidth) + parseFloat(layer.left);
    const right =
      box.right - parseFloat(style.borderRightWidth) - parseFloat(layer.right);
    if (![top, bottom, left, right].every(Number.isFinite)) {
      return;
    }
    const label = TOUCH_TARGET_ROWS[index] ?? `Row ${index + 1}`;
    reach.push({
      label,
      above: toHalfPx(box.top - top),
      below: toHalfPx(bottom - box.bottom),
    });
    const addBand = (
      side: string,
      fromX: number,
      fromY: number,
      toX: number,
      toY: number,
    ) => {
      if (toX - fromX >= 0.5 && toY - fromY >= 0.5) {
        bands.push({
          key: `${label} ${side}`,
          left: fromX - origin.left,
          top: fromY - origin.top,
          width: toX - fromX,
          height: toY - fromY,
        });
      }
    };
    addBand('above', left, top, right, box.top);
    addBand('below', left, box.bottom, right, bottom);
    addBand('left', left, box.top, box.left, box.bottom);
    addBand('right', box.right, box.top, right, box.bottom);
  });
  return {bands, reach};
}

const touchTargetStyles = stylex.create({
  frame: {
    position: 'relative',
    padding: 24,
  },
  bands: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
  },
  band: {
    position: 'absolute',
    backgroundImage:
      'repeating-linear-gradient(-45deg, color-mix(in srgb, var(--color-accent) 60%, transparent) 0 2px, transparent 2px 5px)',
    outline:
      '1px solid color-mix(in srgb, var(--color-accent) 80%, transparent)',
    outlineOffset: -1,
  },
});

function CompactTouchTargetsDemo() {
  const frameRef = useRef<HTMLDivElement | null>(null);
  // Whether a row handled the click that the page is dispatching.
  const rowFiredRef = useRef(false);
  const [lastTapped, setLastTapped] = useState('nothing yet');
  const [targets, setTargets] = useState<TouchTargets>({
    bands: [],
    reach: [],
  });

  // Syncs with the browser's layout and the page's clicks. Each row's hit insets
  // arrive after the first frame and change with the page, so the bands follow
  // them. A click that no row handles reads "none".
  useEffect(() => {
    const frame = frameRef.current;
    if (frame == null) {
      return undefined;
    }
    let pending = 0;
    const measure = () => {
      pending = 0;
      setTargets(readTouchTargets(frame));
    };
    const schedule = () => {
      if (pending === 0) {
        pending = requestAnimationFrame(measure);
      }
    };
    const lists = frame.querySelectorAll('ul');
    const insets = new MutationObserver(schedule);
    const sizes = new ResizeObserver(schedule);
    sizes.observe(frame);
    lists.forEach(list => {
      insets.observe(list, {
        attributes: true,
        attributeFilter: ['style'],
        subtree: true,
      });
      sizes.observe(list);
    });
    const doc = frame.ownerDocument;
    let verdict = 0;
    // The capture phase hears every click, including one the shared hit area
    // swallows. The check runs once the click's dispatch has ended.
    const onAnyClick = () => {
      rowFiredRef.current = false;
      clearTimeout(verdict);
      verdict = window.setTimeout(() => {
        if (!rowFiredRef.current) {
          setLastTapped('none');
        }
      });
    };
    doc.addEventListener('click', onAnyClick, true);
    schedule();
    return () => {
      cancelAnimationFrame(pending);
      clearTimeout(verdict);
      insets.disconnect();
      sizes.disconnect();
      doc.removeEventListener('click', onAnyClick, true);
    };
  }, []);

  const onRowClick = (label: string) => {
    rowFiredRef.current = true;
    setLastTapped(label);
  };
  const row = (label: string) => (
    <ListItem key={label} label={label} onClick={() => onRowClick(label)} />
  );
  return (
    <VStack gap={4}>
      <div aria-live="polite">
        <Text>Last tapped: {lastTapped}</Text>
      </div>
      <div ref={frameRef} {...stylex.props(touchTargetStyles.frame)}>
        <VStack gap={2}>
          <List density="compact" hasDividers>
            {TOUCH_TARGET_ROWS.slice(0, 2).map(row)}
          </List>
          <List density="compact" hasDividers>
            {TOUCH_TARGET_ROWS.slice(2).map(row)}
          </List>
        </VStack>
        <div aria-hidden="true" {...stylex.props(touchTargetStyles.bands)}>
          {targets.bands.map(band => (
            <div
              key={band.key}
              {...stylex.props(touchTargetStyles.band)}
              style={{
                left: band.left,
                top: band.top,
                width: band.width,
                height: band.height,
              }}
            />
          ))}
        </div>
      </div>
      <VStack gap={1}>
        {targets.reach.length === 0 ? (
          <Text color="secondary">
            No bands with a mouse: a row&apos;s target is its own box. Open this
            story on a touch screen.
          </Text>
        ) : (
          targets.reach.map(({label, above, below}) => (
            <Text key={label} color="secondary">
              {label}: {above} px above, {below} px below
            </Text>
          ))
        )}
      </VStack>
    </VStack>
  );
}

/**
 * Each compact row's touch target under a finger, drawn as a striped band
 * past the row's box. The bands are read from the rows' own hit layers, and
 * the readout names the row a tap fires, or "none".
 */
export const CompactTouchTargets: Story = {
  render: () => <CompactTouchTargetsDemo />,
  parameters: {
    docs: {
      description: {
        story:
          "Under a finger each compact row's touch target reaches past its " +
          'box where nothing is near, up to 44 px tall. The striped bands ' +
          "show that reach, read from the rows' own hit layers. They sit " +
          'above the first row, below the last one, and halfway across the ' +
          'gap between the two lists. Touching rows have no band between ' +
          'them. The ' +
          'readout names the row a tap fires, or "none".',
      },
    },
  },
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

function EndControlsDemo() {
  const [isWifiOn, setIsWifiOn] = useState(true);
  return (
    // The button after the list sits 4 px below its last row.
    <div style={{display: 'flex', flexDirection: 'column', gap: 4}}>
      <List
        density="compact"
        hasDividers
        header={
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
            <Text type="label" size="lg">
              Connections
            </Text>
            <Button label="Edit" variant="ghost" size="sm" />
          </div>
        }>
        <ListItem
          label="Network"
          onClick={() => {}}
          endContent={
            <Icon icon={ChevronRightIcon} xstyle={rtlStyles.mirror} />
          }
          swipeActions={{trailing: [{label: 'Forget', onActivate: () => {}}]}}
        />
        <ListItem
          label="Wi-Fi"
          endContent={
            <Switch
              label="Wi-Fi"
              isLabelHidden
              value={isWifiOn}
              onChange={checked => setIsWifiOn(checked)}
            />
          }
        />
        <ListItem
          label="Bluetooth"
          onClick={() => {}}
          endContent={
            <Icon icon={ChevronRightIcon} xstyle={rtlStyles.mirror} />
          }
        />
      </List>
      <Button label="Load more" variant="secondary" />
    </div>
  );
}

export const WithEndControls: Story = {
  render: () => <EndControlsDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'A compact row whose end content is its own control, a switch, ' +
          'between two interactive rows (the first one swipeable), under a ' +
          'header with its own button ' +
          'and above a button 4 px after the list. Under a finger, the ' +
          'interactive rows grow ' +
          'their touch targets only where nothing is near, never into the ' +
          "control's row, and a tap on the switch stays the switch's.",
      },
    },
  },
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

export const LongNumberMarkers: Story = {
  args: {listStyle: 'decimal', start: 98},
  render: args => (
    <List {...args}>
      <ListItem
        label={<>Review the migration before applying it to your project.</>}
      />
      <ListItem label={<>Check that existing behavior stays unchanged.</>} />
      <ListItem
        label={<>Verify that the complete number stays beside its label.</>}
      />
    </List>
  ),
};

export const NumberedFirstLine: Story = {
  args: {listStyle: 'decimal', start: 9},
  render: args => (
    <List {...args}>
      <ListItem
        align="first-line"
        startContent={<Avatar name="Ada Lovelace" size={40} />}
        label={<>A numbered row with a tall avatar and a wrapped first line.</>}
      />
      <ListItem
        align="first-line"
        startContent={<Avatar name="Grace Hopper" size={40} />}
        label={<>The number and avatar follow the same first text line.</>}
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

function AnimatedChangesDemo() {
  const [rows, setRows] = useState([
    'Inbox',
    'Sent',
    'Drafts',
    'Archive',
    'Spam',
  ]);
  const [next, setNext] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const animatedLayout = useAnimatedLayout({containerRef});
  return (
    <div ref={containerRef}>
      <VStack gap={4}>
        <List animatedLayout={animatedLayout} hasDividers>
          {rows.map(label => (
            <ListItem
              key={label}
              itemKey={label}
              label={label}
              onClick={() => {}}
            />
          ))}
        </List>
        <Text data-testid="after-list">{`${rows.length} folders`}</Text>
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
    </div>
  );
}

export const AnimatedChanges: Story = {
  render: () => <AnimatedChangesDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'With `animatedLayout` (the handle from `useAnimatedLayout`) and ' +
          'an `itemKey` on each row, an inserted row enters, a removed row ' +
          'collapses in place, a row crossing rows that move the other way ' +
          'rides above them with the surface color behind it, and the rows ' +
          'after a change and the buttons below the list glide to their new ' +
          'places, all on one shared motion, under every pointer.',
      },
    },
  },
};

/** The swipe story's row with no swipe actions. */
const PLAIN_ROW = 'Notes';

function AnimatedChangesSwipeDemo() {
  const [rows, setRows] = useState([
    'Inbox',
    'Sent',
    'Drafts',
    'Archive',
    PLAIN_ROW,
  ]);
  const containerRef = useRef<HTMLDivElement>(null);
  const animatedLayout = useAnimatedLayout({containerRef});
  const moveFirst = (label: string) =>
    setRows(current =>
      current.includes(label)
        ? [label, ...current.filter(row => row !== label)]
        : current,
    );
  return (
    <div ref={containerRef}>
      <List animatedLayout={animatedLayout} hasDividers>
        {rows.map(label => (
          <ListItem
            key={label}
            itemKey={label}
            label={label}
            onClick={() => {}}
            swipeActions={
              label === PLAIN_ROW
                ? undefined
                : {
                    trailing: [
                      {
                        label: 'Delete',
                        variant: 'destructive',
                        hasRemoval: true,
                        onActivate: () =>
                          setRows(current =>
                            current.filter(row => row !== label),
                          ),
                      },
                    ],
                  }
            }
          />
        ))}
      </List>
      <Button
        label="Move Archive first"
        variant="secondary"
        onClick={() => moveFirst('Archive')}
      />
      <Button
        label="Move Notes first"
        variant="secondary"
        onClick={() => moveFirst(PLAIN_ROW)}
      />
    </div>
  );
}

export const AnimatedChangesSwipe: Story = {
  render: () => <AnimatedChangesSwipeDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'With `animatedLayout`, a row swiped away with a removal action ' +
          'collapses in place, its action showing, while the rows below ' +
          'glide up into its gap on the shared motion. A row moved up ' +
          'across the swipeable rows, with swipe actions (Archive) or ' +
          'without (Notes), rides above the rows it crosses.',
      },
    },
  },
};
