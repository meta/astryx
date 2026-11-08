// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useEffect, useState} from 'react';
import {flushSync} from 'react-dom';
import type {Meta, StoryObj} from '@storybook/react';
import {
  BookOpenIcon as BookOpenOutline,
  HomeIcon as HomeOutline,
  Squares2X2Icon as GridOutline,
  UserCircleIcon as UserOutline,
  BellIcon as BellOutline,
} from '@heroicons/react/24/outline';
import {
  BookOpenIcon as BookOpenSolid,
  HomeIcon as HomeSolid,
  Squares2X2Icon as GridSolid,
  UserCircleIcon as UserSolid,
  BellIcon as BellSolid,
} from '@heroicons/react/24/solid';
import {TabBar, TabBarItem} from '@astryxdesign/lab';
import {Button} from '@astryxdesign/core/Button';
import {LayerProvider} from '@astryxdesign/core/Layer';
import {Icon, type IconType} from '@astryxdesign/core/Icon';

// =============================================================================
// Meta
// =============================================================================

const meta: Meta<typeof TabBar> = {
  // The bar floats over the bottom edge: declared on LayerProvider, menus,
  // popovers and toasts clear it.
  decorators: [
    Story => (
      <LayerProvider inset={{blockEnd: 83}}>
        <Story />
      </LayerProvider>
    ),
  ],
  title: 'Lab/TabBar',
  component: TabBar,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof TabBar>;

// =============================================================================
// The sections UIKit's own captures were taken with: four tabs over long
// scrolling screens
// =============================================================================

interface Section {
  value: string;
  label: string;
  icon: IconType;
  selectedIcon: IconType;
}

const SECTIONS: Section[] = [
  {value: 'home', label: 'Home', icon: HomeOutline, selectedIcon: HomeSolid},
  {
    value: 'library',
    label: 'Library',
    icon: BookOpenOutline,
    selectedIcon: BookOpenSolid,
  },
  {
    value: 'browse',
    label: 'Browse',
    icon: GridOutline,
    selectedIcon: GridSolid,
  },
  {
    value: 'profile',
    label: 'Profile',
    icon: UserOutline,
    selectedIcon: UserSolid,
  },
];

const INBOX: Section = {
  value: 'inbox',
  label: 'Inbox',
  icon: BellOutline,
  selectedIcon: BellSolid,
};

/** A screen long enough to scroll under the bar. */
function Screen({title, reselects}: {title: string; reselects: number}) {
  return (
    <div style={{padding: '16px 16px 104px'}}>
      <h1 style={{margin: '8px 0 16px', fontSize: 28}}>
        {title || 'No tab selected'}
      </h1>
      <p data-testid="reselects">Reselected {reselects} times</p>
      {Array.from({length: 40}, (_, i) => (
        <p key={i} style={{margin: 0, padding: '12px 0'}}>
          {title} row {i + 1}
        </p>
      ))}
    </div>
  );
}

function Bar({
  sections = SECTIONS,
  initial = 'home',
  badges = {library: 3},
  keeps = [],
  disabled = [],
  onChange,
}: {
  sections?: Section[];
  initial?: string;
  badges?: Record<string, string | number>;
  /** Tabs the app declines to switch to (it keeps the selection). */
  keeps?: string[];
  /** Tabs the app has disabled. */
  disabled?: string[];
  /** Also told of every choice. */
  onChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const [reselects, setReselects] = useState(0);
  const title = sections.find(section => section.value === value)?.label ?? '';
  return (
    <>
      <Screen title={title} reselects={reselects} />
      <TabBar
        value={value}
        onChange={next => {
          onChange?.(next);
          if (!keeps.includes(next)) {
            setValue(next);
          }
        }}
        onReselect={() => setReselects(n => n + 1)}
        label="Sections"
        data-testid="tab-bar">
        {sections.map(section => (
          <TabBarItem
            key={section.value}
            value={section.value}
            label={section.label}
            icon={<Icon icon={section.icon} size="lg" />}
            selectedIcon={<Icon icon={section.selectedIcon} size="lg" />}
            badge={badges[section.value]}
            aria-disabled={disabled.includes(section.value) || undefined}
          />
        ))}
      </TabBar>
    </>
  );
}

/** Four tabs, a badge on Library. Choosing Home again counts a reselect. */
export const Default: Story = {
  render: () => <Bar />,
};

/** Badges appear, change and disappear at once, as UIKit's do. */
function BadgesDemo() {
  const [count, setCount] = useState(0);
  const badge = count === 0 ? undefined : count > 99 ? '99+' : count;
  return (
    <>
      <div style={{padding: 16, display: 'flex', gap: 8}}>
        <Button label="Add one" onClick={() => setCount(n => n + 1)} />
        <Button label="Add ten" onClick={() => setCount(n => n + 10)} />
        <Button label="Clear" variant="secondary" onClick={() => setCount(0)} />
      </div>
      <TabBarHost badges={{inbox: badge ?? '', browse: '!'}} />
    </>
  );
}

function TabBarHost({badges}: {badges: Record<string, string | number>}) {
  const [value, setValue] = useState('home');
  return (
    <TabBar
      value={value}
      onChange={setValue}
      label="Sections"
      data-testid="tab-bar">
      {[SECTIONS[0], INBOX, SECTIONS[2], SECTIONS[3]].map(section => (
        <TabBarItem
          key={section.value}
          value={section.value}
          label={section.label}
          icon={<Icon icon={section.icon} size="lg" />}
          selectedIcon={<Icon icon={section.selectedIcon} size="lg" />}
          badge={badges[section.value]}
          badgeLabel={
            section.value === 'inbox' && badges.inbox !== ''
              ? `${badges.inbox} unread`
              : undefined
          }
        />
      ))}
    </TabBar>
  );
}

/**
 * The app keeps the selection when Profile is chosen (say it needs a
 * sign-in first): the lens settles back onto the selected tab.
 */
export const KeepsSelection: Story = {
  render: () => <Bar keeps={['profile']} />,
};

/** No tab selected (the value matches none): a tap chooses one. */
export const NoSelection: Story = {
  render: () => <Bar initial="none" />,
};

/**
 * The app removes the bar as a finger lifts: the lift reports nothing (each
 * choice would be listed on `window.__tabBarChanges`).
 */
function RemovedOnLiftDemo() {
  const [isShown, setIsShown] = useState(true);
  useEffect(() => {
    const hide = () => {
      const log = window as unknown as {__tabBarChanges?: string[]};
      log.__tabBarChanges = [...(log.__tabBarChanges ?? []), '(removed)'];
      flushSync(() => setIsShown(false));
    };
    window.addEventListener('touchend', hide);
    return () => window.removeEventListener('touchend', hide);
  }, []);
  return isShown ? (
    <Bar
      onChange={value => {
        const log = window as unknown as {__tabBarChanges?: string[]};
        log.__tabBarChanges = [...(log.__tabBarChanges ?? []), value];
      }}
    />
  ) : (
    <p style={{padding: 16}}>Removed</p>
  );
}

export const RemovedOnLift: Story = {
  render: () => <RemovedOnLiftDemo />,
};

/**
 * The app drops its last tab on the window event `tabbar:drop-last`, sent while
 * a finger holds the bar. The press ends without choosing a tab (each choice
 * would be listed on `window.__tabBarChanges`).
 */
function DropsLastTabDemo() {
  const [sections, setSections] = useState(SECTIONS);
  useEffect(() => {
    const drop = () => setSections(current => current.slice(0, -1));
    window.addEventListener('tabbar:drop-last', drop);
    return () => window.removeEventListener('tabbar:drop-last', drop);
  }, []);
  return (
    <Bar
      sections={sections}
      onChange={value => {
        const log = window as unknown as {__tabBarChanges?: string[]};
        log.__tabBarChanges = [...(log.__tabBarChanges ?? []), value];
      }}
    />
  );
}

export const DropsLastTab: Story = {
  render: () => <DropsLastTabDemo />,
};

export const Badges: Story = {
  render: () => <BadgesDemo />,
};

/** Five tabs: the items overlap more, as they do on iOS. */
export const FiveTabs: Story = {
  render: () => (
    <Bar sections={[...SECTIONS.slice(0, 2), INBOX, ...SECTIONS.slice(2)]} />
  ),
};

/** Browse is disabled: dimmed, skipped by the arrow keys, and never chosen. */
export const DisabledTab: Story = {
  render: () => <Bar disabled={['browse']} />,
};

/** No tab selected, Browse disabled: a held finger paints only enabled tabs. */
export const DisabledTabNoSelection: Story = {
  render: () => <Bar initial="none" disabled={['browse']} />,
};

/** Three tabs: the capsule narrows to its natural width and centres. */
export const ThreeTabs: Story = {
  render: () => <Bar sections={SECTIONS.slice(0, 3)} />,
};

/** Right to left: the first tab sits on the right and the badge on the icon's top-left. */
export const RightToLeft: Story = {
  render: () => (
    <div dir="rtl">
      <Bar initial="library" />
    </div>
  ),
};
