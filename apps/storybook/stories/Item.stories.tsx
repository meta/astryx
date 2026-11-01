// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Item.stories.tsx
 * @input Item and composing rows, including numbered/bulleted marker anatomy
 * @output Reusable row examples and before/after DOM-count browser fixtures
 * @position Storybook examples and Item/List regression evidence
 */

import {useState, type ReactNode} from 'react';
import {Button} from '@astryxdesign/core/Button';
import * as stylex from '@stylexjs/stylex';
import type {Meta, StoryObj} from '@storybook/react';
import {expect} from 'storybook/test';
import {Item} from '@astryxdesign/core/Item';
import {Avatar} from '@astryxdesign/core/Avatar';
import {Badge} from '@astryxdesign/core/Badge';
import {Icon} from '@astryxdesign/core/Icon';
import {Text} from '@astryxdesign/core/Text';
import {Stack} from '@astryxdesign/core/Layout';
import {List, ListItem} from '@astryxdesign/core/List';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {StatusDot} from '@astryxdesign/core/StatusDot';

const storyStyles = stylex.create({
  markerAnatomy: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    width: 320,
    maxWidth: '100%',
  },
  iconCircle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    borderRadius: '50%',
    backgroundColor: 'var(--color-neutral)',
  },
});
import {
  UserIcon,
  Cog6ToothIcon,
  DocumentIcon,
  PencilSquareIcon,
  BellIcon,
  ChatBubbleLeftIcon,
  MagnifyingGlassIcon,
  ArchiveBoxIcon,
  EnvelopeIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';

const meta: Meta<typeof Item> = {
  title: 'Core/Item',
  component: Item,
  tags: ['autodocs'],
  argTypes: {
    align: {control: 'select', options: ['center', 'start', 'first-line']},
    density: {control: 'select', options: ['compact', 'balanced', 'spacious']},
  },
};

export default meta;
type Story = StoryObj<typeof Item>;

/** Numbered rows alone need the two-column marker/content grouping. */
export const MarkerAnatomy: Story = {
  tags: ['!autodocs'],
  render: function MarkerAnatomyStory() {
    const [isOpen, setOpen] = useState(false);
    const slots = {
      startContent: <span data-anatomy-slot="start">S</span>,
      label: (
        <span data-anatomy-slot="label">
          A row label that can wrap naturally
        </span>
      ),
      description: 'Secondary description',
      endContent: <span data-anatomy-slot="end">E</span>,
      align: 'first-line' as const,
    };
    const marker = <span data-anatomy-slot="marker">•</span>;
    return (
      <div data-marker-anatomy {...stylex.props(storyStyles.markerAnatomy)}>
        <div data-marker-case="numbered">
          <List listStyle="decimal" start={99}>
            <ListItem {...slots} />
          </List>
        </div>
        <div data-marker-case="bulleted">
          <List listStyle="disc">
            <ListItem {...slots} isSelected />
          </List>
        </div>
        <div data-marker-case="marked-item">
          <Item {...slots} marker={marker} />
        </div>
        <div data-marker-case="unmarked-item">
          <Item {...slots} />
        </div>
        <Button
          label="Toggle marker menu"
          onClick={() => setOpen(value => !value)}
        />
        {isOpen && (
          <div
            role="menu"
            aria-label="Marker anatomy menu"
            data-marker-case="menu">
            <Item
              {...slots}
              marker={marker}
              role="menuitem"
              tabIndex={0}
              onClick={() => {}}
            />
          </div>
        )}
      </div>
    );
  },
};

/** Basic item with all slots populated. */
export const Default: Story = {
  render: () => (
    <Item
      startContent={<Icon icon={UserIcon} size="sm" />}
      label="Alice Johnson"
      description="Software Engineer"
      endContent={<Badge label="Admin" />}
    />
  ),
};

/** Contact list with avatars and roles. */
export const ContactList: Story = {
  render: () => (
    <Stack gap={0}>
      <Item
        startContent={<Avatar name="Alice Johnson" size={40} />}
        label="Alice Johnson"
        description="Engineering Lead"
        endContent={<Badge label="Admin" />}
        onClick={() => {}}
      />
      <Item
        startContent={<Avatar name="Bob Smith" size={40} />}
        label="Bob Smith"
        description="Product Designer"
        onClick={() => {}}
      />
      <Item
        startContent={<Avatar name="Carol Williams" size={40} />}
        label="Carol Williams"
        description="Data Scientist"
        endContent={<Text color="secondary">Away</Text>}
        onClick={() => {}}
      />
    </Stack>
  ),
};

/** Notification inbox with timestamps and truncation. */
export const Notifications: Story = {
  render: () => (
    <Stack gap={0}>
      <Item
        startContent={<Avatar name="Alice" size={40} />}
        label={
          <>
            <b>Alice</b> commented on your PR
          </>
        }
        description="Looks good, one nit on the error handling..."
        endContent={<Text color="secondary">2h ago</Text>}
        descriptionLines={1}
        onClick={() => {}}
      />
      <Item
        startContent={
          <div {...stylex.props(storyStyles.iconCircle)}>
            <Icon icon={BellIcon} size="sm" />
          </div>
        }
        label="Build completed successfully"
        description="Pipeline #4521 — all 42 tests passed"
        endContent={<Text color="secondary">5h ago</Text>}
        descriptionLines={1}
        onClick={() => {}}
      />
    </Stack>
  ),
};

/** Compact menu items with icons. */
export const CompactMenu: Story = {
  render: () => (
    <Stack gap={0}>
      <Item
        startContent={<Icon icon={PencilSquareIcon} size="sm" />}
        label="Edit"
        density="compact"
        onClick={() => {}}
      />
      <Item
        startContent={<Icon icon={Cog6ToothIcon} size="sm" />}
        label="Settings"
        description="Manage your preferences"
        density="compact"
        onClick={() => {}}
      />
      <Item
        startContent={<Icon icon={ChatBubbleLeftIcon} size="sm" />}
        label="Messages"
        density="compact"
        endContent={<Badge label="12" />}
        onClick={() => {}}
      />
    </Stack>
  ),
};

/** Spacious item rows for roomy layouts. */
export const SpaciousRows: Story = {
  render: () => (
    <Stack gap={0}>
      <Item
        startContent={<Icon icon={BellIcon} size="sm" />}
        label="Product updates"
        description="Major announcements and release notes"
        density="spacious"
      />
      <Item
        startContent={<Icon icon={ChatBubbleLeftIcon} size="sm" />}
        label="Team messages"
        description="Direct messages, mentions, and thread replies"
        endContent={<Badge label="4" />}
        density="spacious"
      />
    </Stack>
  ),
};

/** File browser with selection state. */
export const FileBrowser: Story = {
  render: function FileBrowserStory() {
    const [selected, setSelected] = useState<Set<string>>(new Set(['doc1']));
    const toggle = (id: string) =>
      setSelected(prev => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });

    return (
      <Stack gap={0}>
        <Item
          startContent={<Icon icon={DocumentIcon} size="sm" />}
          label="design-spec.pdf"
          description="Modified 2 hours ago"
          endContent={<Text color="secondary">2.4 MB</Text>}
          isSelected={selected.has('doc1')}
          onClick={() => toggle('doc1')}
        />
        <Item
          startContent={<Icon icon={DocumentIcon} size="sm" />}
          label="architecture-diagram.png"
          description="Modified yesterday"
          endContent={<Text color="secondary">1.2 MB</Text>}
          isSelected={selected.has('doc2')}
          onClick={() => toggle('doc2')}
        />
        <Item
          startContent={<Icon icon={DocumentIcon} size="sm" />}
          label="meeting-notes.md"
          description="Modified 3 days ago"
          endContent={<Text color="secondary">48 KB</Text>}
          isSelected={selected.has('doc3')}
          onClick={() => toggle('doc3')}
        />
      </Stack>
    );
  },
};

/** Search results with highlighted terms and links. */
export const SearchResults: Story = {
  render: () => (
    <Stack gap={0}>
      <Item
        startContent={<Icon icon={MagnifyingGlassIcon} size="sm" />}
        label={
          <>
            Astryx <b>Button</b> Component
          </>
        }
        description="Primary interactive element for triggering actions..."
        descriptionLines={1}
        href="/docs/button"
      />
      <Item
        startContent={<Icon icon={MagnifyingGlassIcon} size="sm" />}
        label={
          <>
            Astryx <b>Button</b>Group
          </>
        }
        description="Groups related buttons into a single connected control..."
        descriptionLines={1}
        href="/docs/button-group"
      />
    </Stack>
  ),
};

/** Disabled items. */
export const Disabled: Story = {
  render: () => (
    <Stack gap={0}>
      <Item
        startContent={<Icon icon={UserIcon} size="sm" />}
        label="Active item"
        description="This item is interactive"
        onClick={() => {}}
      />
      <Item
        startContent={<Icon icon={UserIcon} size="sm" />}
        label="Disabled item"
        description="This item cannot be interacted with"
        onClick={() => {}}
        isDisabled
      />
    </Stack>
  ),
};

/** Top-aligned layout for multi-line content. */
export const AlignStart: Story = {
  render: () => (
    <Item
      align="start"
      startContent={<Avatar name="Alice" size={40} />}
      label="Alice Johnson"
      description="This is a longer description that wraps across multiple lines to demonstrate the align=start behavior, which positions the start and end content at the top rather than vertically centering them."
      endContent={<Text color="secondary">Just now</Text>}
    />
  ),
};

const WRAPPING_TITLE =
  'Investigate why the session list jumps when a long title wraps onto a second line';

function FirstLineCase({
  name,
  dir,
  children,
}: {
  name: string;
  dir?: 'rtl';
  children: ReactNode;
}) {
  return (
    <div data-first-line-case={name} dir={dir} style={{inlineSize: 320}}>
      {children}
    </div>
  );
}

/**
 * `align="first-line"` centers each start and end slot on the label's first
 * line: a status dot and an age stay level with the first line of a wrapped
 * title, a taller slot (an avatar beside a description) moves the text down
 * instead of leaving the row, and a one-line row looks the same as `center`.
 * The play function measures every case in a real browser.
 */
export const AlignFirstLine: Story = {
  render: () => {
    const dot = <StatusDot variant="success" label="Active" />;
    const age = (
      <Text type="supporting" color="secondary">
        12m
      </Text>
    );
    return (
      <Stack gap={4}>
        <FirstLineCase name="wrapped">
          <Item
            align="first-line"
            startContent={dot}
            label={<span>{WRAPPING_TITLE}</span>}
            endContent={age}
          />
        </FirstLineCase>
        <FirstLineCase name="wrapped-description">
          <Item
            align="first-line"
            startContent={dot}
            label={<span>{WRAPPING_TITLE}</span>}
            description="astryx · 3 files changed"
            endContent={age}
          />
        </FirstLineCase>
        <FirstLineCase name="clamped">
          <Item
            align="first-line"
            startContent={dot}
            label={WRAPPING_TITLE}
            labelLines={2}
            endContent={age}
          />
        </FirstLineCase>
        <FirstLineCase name="compact">
          <Item
            align="first-line"
            density="compact"
            startContent={dot}
            label={<span>{WRAPPING_TITLE}</span>}
            endContent={age}
          />
        </FirstLineCase>
        <FirstLineCase name="spacious">
          <Item
            align="first-line"
            density="spacious"
            startContent={dot}
            label={<span>{WRAPPING_TITLE}</span>}
            endContent={age}
          />
        </FirstLineCase>
        <FirstLineCase name="avatar-description">
          <Item
            align="first-line"
            startContent={<Avatar name="Ada Lovelace" size="lg" />}
            label="Ada Lovelace"
            description="Design systems"
            endContent={age}
          />
        </FirstLineCase>
        <FirstLineCase name="interactive">
          <Item
            align="first-line"
            onClick={() => {}}
            startContent={dot}
            label={<span>{WRAPPING_TITLE}</span>}
            endContent={age}
          />
        </FirstLineCase>
        <FirstLineCase name="rtl" dir="rtl">
          <Item
            align="first-line"
            startContent={dot}
            label={
              <span>
                تحقق من سبب قفز قائمة الجلسات عندما يلتف عنوان طويل إلى سطر ثان
              </span>
            }
            endContent={age}
          />
        </FirstLineCase>
        <FirstLineCase name="list-item">
          <List>
            <ListItem
              align="first-line"
              startContent={dot}
              label={<span>{WRAPPING_TITLE}</span>}
              endContent={age}
            />
          </List>
        </FirstLineCase>
        <FirstLineCase name="radio-list-item">
          <RadioList label="Plan" value="team" onChange={() => {}}>
            <RadioListItem
              value="team"
              align="first-line"
              label={<span>{WRAPPING_TITLE}</span>}
            />
          </RadioList>
        </FirstLineCase>
      </Stack>
    );
  },
  play: async ({canvasElement}) => {
    const cases = canvasElement.querySelectorAll<HTMLElement>(
      '[data-first-line-case]',
    );
    expect(cases).toHaveLength(10);
    for (const testCase of cases) {
      const row = testCase.querySelector<HTMLElement>('.astryx-item');
      expect(row?.dataset.align).toBe('first-line');
      if (row == null) {
        continue;
      }
      const children = [...row.children] as HTMLElement[];
      const content = children.find(
        child => getComputedStyle(child).flexGrow === '1',
      );
      const label = content?.firstElementChild as HTMLElement | null;
      expect(label).toBeTruthy();
      if (content == null || label == null) {
        continue;
      }
      const lineHeight = parseFloat(getComputedStyle(label).lineHeight);
      const firstLineCenter =
        label.getBoundingClientRect().top + lineHeight / 2;
      const rowBox = row.getBoundingClientRect();
      const contentTop =
        rowBox.top + parseFloat(getComputedStyle(row).paddingBlockStart);
      // The start and end slots: in-flow children other than the text.
      // Out-of-flow children (a slot's own popover, such as Avatar's
      // tooltip) are not slots.
      const slots = children.filter(
        child =>
          child !== content &&
          !['absolute', 'fixed'].includes(getComputedStyle(child).position),
      );
      expect(slots.length).toBeGreaterThan(0);
      for (const slot of slots) {
        const mark = (slot.firstElementChild as HTMLElement | null) ?? slot;
        const box = mark.getBoundingClientRect();
        // Each slot's center sits on the first line's center...
        expect(
          Math.abs(box.top + box.height / 2 - firstLineCenter),
          `${testCase.dataset.firstLineCase}: slot center off the first line`,
        ).toBeLessThanOrEqual(0.5);
        // ...and never rises into the row's padding.
        expect(slot.getBoundingClientRect().top).toBeGreaterThanOrEqual(
          contentTop - 0.5,
        );
      }
    }
  },
};

/**
 * Swipe actions, as a mail list uses them: on a touch screen a drag toward
 * the inline start uncovers Archive and Delete (Delete outermost, so a long
 * drag or a fling fires it); a drag toward the inline end uncovers a
 * read/unread toggle. Under `reveal` (the default) the row rests open with
 * every entry a real button. Every verb is also in the row's own content, so
 * a mouse and a keyboard reach it without the gesture. `List` clips the rows
 * in the inline axis for the slide.
 */
export const SwipeActions: Story = {
  render: () => {
    const [rows, setRows] = useState(() =>
      Array.from({length: 6}, (_, index) => ({
        id: index,
        isUnread: index % 2 === 0,
        label: `Message ${index + 1}`,
      })),
    );
    const remove = (id: number) =>
      setRows(current => current.filter(row => row.id !== id));
    const toggleRead = (id: number) =>
      setRows(current =>
        current.map(row =>
          row.id === id ? {...row, isUnread: !row.isUnread} : row,
        ),
      );
    return (
      <List>
        {rows.map(row => (
          <ListItem
            key={row.id}
            label={row.label}
            description={row.isUnread ? 'Unread' : 'Read'}
            onClick={() => {}}
            endContent={
              <Text color="secondary">
                {row.isUnread ? 'Mark read' : 'Mark unread'} · Archive · Delete
              </Text>
            }
            swipeActions={{
              leading: [
                {
                  label: row.isUnread ? 'Read' : 'Unread',
                  icon: <Icon icon={EnvelopeIcon} size="sm" />,
                  onActivate: () => toggleRead(row.id),
                },
              ],
              trailing: [
                {
                  label: 'Archive',
                  icon: <Icon icon={ArchiveBoxIcon} size="sm" />,
                  onActivate: () => remove(row.id),
                  variant: 'neutral',
                  hasRemoval: true,
                },
                {
                  label: 'Delete',
                  icon: <Icon icon={TrashIcon} size="sm" />,
                  onActivate: () => remove(row.id),
                  variant: 'destructive',
                  hasRemoval: true,
                },
              ],
            }}
          />
        ))}
        {rows.length === 0 && <ListItem label="All done." />}
      </List>
    );
  },
};

/**
 * `swipeBehavior="commit"`: one verb per side; a release past the commit
 * point slides the row out and fires it, and nothing rests. The panel is
 * presentational.
 */
export const SwipeCommit: Story = {
  render: () => {
    const [rows, setRows] = useState(() =>
      Array.from({length: 5}, (_, index) => ({
        id: index,
        label: `Notification ${index + 1}`,
      })),
    );
    const remove = (id: number) =>
      setRows(current => current.filter(row => row.id !== id));
    return (
      <List>
        {rows.map(row => (
          <ListItem
            key={row.id}
            label={row.label}
            description="Swipe toward the start to dismiss"
            onClick={() => {}}
            endContent={<Text color="secondary">Dismiss</Text>}
            swipeBehavior="commit"
            swipeActions={{
              trailing: [
                {
                  label: 'Dismiss',
                  icon: <Icon icon={TrashIcon} size="sm" />,
                  onActivate: () => remove(row.id),
                  variant: 'destructive',
                  hasRemoval: true,
                },
              ],
            }}
          />
        ))}
        {rows.length === 0 && <ListItem label="All caught up." />}
      </List>
    );
  },
};
