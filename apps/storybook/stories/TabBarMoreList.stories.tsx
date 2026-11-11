// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {
  BookOpenIcon as BookOpenOutline,
  Cog6ToothIcon as CogOutline,
  HomeIcon as HomeOutline,
  QuestionMarkCircleIcon as HelpOutline,
  Squares2X2Icon as GridOutline,
  UserCircleIcon as UserOutline,
} from '@heroicons/react/24/outline';
import {
  BookOpenIcon as BookOpenSolid,
  Cog6ToothIcon as CogSolid,
  HomeIcon as HomeSolid,
  QuestionMarkCircleIcon as HelpSolid,
  Squares2X2Icon as GridSolid,
  UserCircleIcon as UserSolid,
} from '@heroicons/react/24/solid';
import {TabBar, TabBarItem, TabBarMoreList} from '@astryxdesign/lab';
import {Button} from '@astryxdesign/core/Button';
import {LayerProvider} from '@astryxdesign/core/Layer';
import {Icon, type IconType} from '@astryxdesign/core/Icon';

// =============================================================================
// Meta
// =============================================================================

const meta: Meta<typeof TabBarMoreList> = {
  // The bar floats over the bottom edge: declared on LayerProvider, menus,
  // popovers and toasts clear it.
  decorators: [
    Story => (
      <LayerProvider inset={{blockEnd: 83}}>
        <Story />
      </LayerProvider>
    ),
  ],
  title: 'Lab/TabBarMoreList',
  component: TabBarMoreList,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof TabBarMoreList>;

// =============================================================================
// Six sections: the four the bar holds, then two that overflow into More
// =============================================================================

interface Section {
  value: string;
  label: string;
  icon: IconType;
  selectedIcon: IconType;
}

const SIX: Section[] = [
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
  {
    value: 'settings',
    label: 'Settings',
    icon: CogOutline,
    selectedIcon: CogSolid,
  },
  {value: 'help', label: 'Help', icon: HelpOutline, selectedIcon: HelpSolid},
];

/** A screen long enough to scroll under the bar. */
function Screen({title, reselects}: {title: string; reselects: number}) {
  return (
    <div style={{padding: '16px 16px 104px'}}>
      <h1 style={{margin: '8px 0 16px', fontSize: 28}}>{title}</h1>
      <p data-testid="reselects">Reselected {reselects} times</p>
      {Array.from({length: 40}, (_, i) => (
        <p key={i} style={{margin: 0, padding: '12px 0'}}>
          {title} row {i + 1}
        </p>
      ))}
    </div>
  );
}

function MoreDemo({disabled = []}: {disabled?: string[]}) {
  const [value, setValue] = useState('home');
  const [reselects, setReselects] = useState(0);
  const tabs = SIX.map(section => (
    <TabBarItem
      key={section.value}
      value={section.value}
      label={section.label}
      icon={<Icon icon={section.icon} size="lg" />}
      selectedIcon={<Icon icon={section.selectedIcon} size="lg" />}
      badge={section.value === 'help' ? 2 : undefined}
      aria-disabled={disabled.includes(section.value) || undefined}
    />
  ));
  const inMore = SIX.slice(4).find(section => section.value === value);
  return (
    <>
      {value === 'more' ? (
        <div style={{padding: '16px 16px 104px'}}>
          <h1 style={{margin: '8px 0 16px', fontSize: 28}}>More</h1>
          <TabBarMoreList value={value} onChange={setValue}>
            {tabs}
          </TabBarMoreList>
        </div>
      ) : inMore != null ? (
        <div style={{padding: '16px 16px 104px'}}>
          <Button
            label="More"
            variant="ghost"
            onClick={() => setValue('more')}
          />
          <h1 style={{margin: '8px 0 16px', fontSize: 28}}>{inMore.label}</h1>
        </div>
      ) : (
        <Screen
          title={SIX.find(section => section.value === value)?.label ?? ''}
          reselects={reselects}
        />
      )}
      <TabBar
        value={value}
        onChange={setValue}
        onReselect={reselected => {
          // More again returns to its list, as iOS pops More's stack.
          if (reselected === 'more') {
            setValue('more');
          } else {
            setReselects(n => n + 1);
          }
        }}
        label="Sections"
        data-testid="tab-bar">
        {tabs}
      </TabBar>
    </>
  );
}

/**
 * Six tabs: the bar shows the first four and More, whose list holds the
 * rest. A section chosen there opens inside More, which stays selected;
 * More again returns to the list.
 */
export const MoreTab: Story = {
  render: () => <MoreDemo />,
};

/** Six tabs, Help disabled: its More row is dimmed and never chosen. */
export const MoreDisabledRow: Story = {
  render: () => <MoreDemo disabled={['help']} />,
};
