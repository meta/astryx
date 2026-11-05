// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import * as stylex from '@stylexjs/stylex';
import {
  Breadcrumbs,
  BreadcrumbItem,
  BreadcrumbMenuItem,
} from '@astryxdesign/core/Breadcrumbs';
import type {BreadcrumbMenuOption} from '@astryxdesign/core/Breadcrumbs';
import {Icon} from '@astryxdesign/core/Icon';
import {VStack} from '@astryxdesign/core/Layout';
import {rtlStyles} from '@astryxdesign/core/utils';
import {HomeIcon, Cog6ToothIcon, FolderIcon} from '@heroicons/react/24/outline';

const meta: Meta<typeof Breadcrumbs> = {
  title: 'Core/Breadcrumbs',
  component: Breadcrumbs,
  tags: ['autodocs'],
  argTypes: {
    separator: {
      control: 'text',
      description: 'Separator between items',
    },
    label: {
      control: 'text',
      description: 'Accessible label for the nav landmark',
    },
    variant: {
      control: 'select',
      options: ['default', 'supporting'],
      description: 'Visual variant controlling text size and color',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Breadcrumbs>;

export const Default: Story = {
  render: () => (
    <Breadcrumbs>
      <BreadcrumbItem href="/">Home</BreadcrumbItem>
      <BreadcrumbItem href="/projects">Projects</BreadcrumbItem>
      <BreadcrumbItem isCurrent>My Project</BreadcrumbItem>
    </Breadcrumbs>
  ),
};

export const TwoLevels: Story = {
  render: () => (
    <Breadcrumbs>
      <BreadcrumbItem href="/">Home</BreadcrumbItem>
      <BreadcrumbItem isCurrent>Settings</BreadcrumbItem>
    </Breadcrumbs>
  ),
};

export const AutoDetectCurrent: Story = {
  name: 'Auto-detect Current',
  render: () => (
    <Breadcrumbs>
      <BreadcrumbItem href="/">Home</BreadcrumbItem>
      <BreadcrumbItem href="/projects">Projects</BreadcrumbItem>
      <BreadcrumbItem>Auto Current</BreadcrumbItem>
    </Breadcrumbs>
  ),
};

/**
 * Covers both separator strategies D6 distinguishes: automatic Unicode bidi
 * mirroring and one explicit mirror for a directional glyph.
 */
export const CustomSeparator: Story = {
  tags: ['visual-baseline'],
  render: () => (
    <VStack gap={3}>
      <Breadcrumbs label="Automatic bidi separator" separator={'›'}>
        <BreadcrumbItem href="/">Home</BreadcrumbItem>
        <BreadcrumbItem href="/docs">Docs</BreadcrumbItem>
        <BreadcrumbItem isCurrent>API Reference</BreadcrumbItem>
      </Breadcrumbs>
      <Breadcrumbs
        label="Explicitly mirrored separator"
        separator={<span {...stylex.props(rtlStyles.mirror)}>→</span>}>
        <BreadcrumbItem href="/">Home</BreadcrumbItem>
        <BreadcrumbItem href="/docs">Docs</BreadcrumbItem>
        <BreadcrumbItem isCurrent>API Reference</BreadcrumbItem>
      </Breadcrumbs>
    </VStack>
  ),
};

export const WithIcons: Story = {
  render: () => (
    <Breadcrumbs>
      <BreadcrumbItem href="/" startIcon={<Icon icon={HomeIcon} size="sm" />}>
        Home
      </BreadcrumbItem>
      <BreadcrumbItem
        href="/settings"
        startIcon={<Icon icon={Cog6ToothIcon} size="sm" />}>
        Settings
      </BreadcrumbItem>
      <BreadcrumbItem isCurrent>Profile</BreadcrumbItem>
    </Breadcrumbs>
  ),
};

export const WithOnClick: Story = {
  render: () => (
    <Breadcrumbs>
      <BreadcrumbItem
        href="/"
        onClick={e => {
          e.preventDefault();
          console.log('Navigate to Home');
        }}>
        Home
      </BreadcrumbItem>
      <BreadcrumbItem
        href="/projects"
        onClick={e => {
          e.preventDefault();
          console.log('Navigate to Projects');
        }}>
        Projects
      </BreadcrumbItem>
      <BreadcrumbItem isCurrent>Detail</BreadcrumbItem>
    </Breadcrumbs>
  ),
};

export const DeepHierarchy: Story = {
  render: () => (
    <Breadcrumbs>
      <BreadcrumbItem href="/">Home</BreadcrumbItem>
      <BreadcrumbItem href="/products">Products</BreadcrumbItem>
      <BreadcrumbItem href="/products/electronics">Electronics</BreadcrumbItem>
      <BreadcrumbItem href="/products/electronics/phones">
        Phones
      </BreadcrumbItem>
      <BreadcrumbItem isCurrent>iPhone 15 Pro</BreadcrumbItem>
    </Breadcrumbs>
  ),
};

export const SupportingVariant: Story = {
  name: 'Supporting Variant',
  render: () => (
    <Breadcrumbs variant="supporting">
      <BreadcrumbItem href="/">Home</BreadcrumbItem>
      <BreadcrumbItem href="/projects">Projects</BreadcrumbItem>
      <BreadcrumbItem isCurrent>My Project</BreadcrumbItem>
    </Breadcrumbs>
  ),
};

export const SupportingWithIcons: Story = {
  name: 'Supporting Variant with Icons',
  render: () => (
    <Breadcrumbs variant="supporting">
      <BreadcrumbItem href="/" startIcon={<Icon icon={HomeIcon} size="xsm" />}>
        Home
      </BreadcrumbItem>
      <BreadcrumbItem
        href="/projects"
        startIcon={<Icon icon={FolderIcon} size="xsm" />}>
        Projects
      </BreadcrumbItem>
      <BreadcrumbItem isCurrent>My Project</BreadcrumbItem>
    </Breadcrumbs>
  ),
};

/**
 * Shows `isCurrent` on a middle breadcrumb item rather than the last one.
 * This is useful when navigating to a child page that isn't represented
 * in the breadcrumb trail — the parent is still the "current" page in
 * the hierarchy.
 */
export const CurrentOnMiddleItem: Story = {
  name: 'Current on Middle Item',
  render: () => (
    <Breadcrumbs>
      <BreadcrumbItem href="/">Home</BreadcrumbItem>
      <BreadcrumbItem isCurrent>Projects</BreadcrumbItem>
      <BreadcrumbItem href="/projects/my-project/settings">
        Settings
      </BreadcrumbItem>
    </Breadcrumbs>
  ),
};

const teamMenu: BreadcrumbMenuOption[] = [
  {label: 'Design', onClick: () => console.log('go /team/design')},
  {label: 'Engineering', onClick: () => console.log('go /team/eng')},
  {type: 'divider'},
  {label: 'Data', icon: 'chart', onClick: () => console.log('go /team/data')},
];

/**
 * A mid-trail crumb can open a menu of sibling destinations. The `menu` prop
 * accepts the SAME item API as `DropdownMenu` / `MoreMenu` / `ContextMenu`, so
 * an existing `DropdownMenuOption[]` drops in verbatim. The crumb renders a
 * link-styled trigger with a trailing chevron; separators before and after are
 * unaffected.
 */
export const MenuCrumb: Story = {
  name: 'Menu Crumb (data array)',
  render: () => (
    <Breadcrumbs>
      <BreadcrumbItem href="/">Home</BreadcrumbItem>
      <BreadcrumbItem menu={teamMenu}>Teams</BreadcrumbItem>
      <BreadcrumbItem isCurrent>Overview</BreadcrumbItem>
    </Breadcrumbs>
  ),
};

/**
 * The `menu` prop also accepts composed `BreadcrumbMenuItem` children (an alias
 * of `DropdownMenuItem`), for dynamic or stateful menus.
 */
export const MenuCrumbComposed: Story = {
  name: 'Menu Crumb (composed children)',
  render: () => (
    <Breadcrumbs>
      <BreadcrumbItem href="/">Home</BreadcrumbItem>
      <BreadcrumbItem
        menu={
          <>
            <BreadcrumbMenuItem
              label="Overview"
              onClick={() => console.log('overview')}
            />
            <BreadcrumbMenuItem
              label="Settings"
              icon="gear"
              onClick={() => console.log('settings')}
            />
          </>
        }>
        Project
      </BreadcrumbItem>
      <BreadcrumbItem isCurrent>Details</BreadcrumbItem>
    </Breadcrumbs>
  ),
};

/**
 * An icon separator is an SVG, so the bidi algorithm never mirrors it the way it
 * mirrors an angle-quote glyph such as `›`. A directional icon therefore needs
 * `rtlStyles.mirror` through `xstyle`, or it points against the reading
 * direction in an RTL locale.
 */
export const MirroredIconSeparator: Story = {
  name: 'Mirrored Icon Separator',
  render: () => (
    <Breadcrumbs
      separator={
        <Icon
          icon="chevronRight"
          size="xsm"
          color="secondary"
          xstyle={rtlStyles.mirror}
        />
      }>
      <BreadcrumbItem href="/">Home</BreadcrumbItem>
      <BreadcrumbItem href="/docs">Docs</BreadcrumbItem>
      <BreadcrumbItem isCurrent>API Reference</BreadcrumbItem>
    </Breadcrumbs>
  ),
};

/**
 * The trail wraps rather than collapsing behind an overflow control, so a long
 * label and a narrow container both reflow instead of clipping. Rendered in a
 * 320px box, the narrowest width the responsive bar covers.
 */
export const LongLabelsNarrow: Story = {
  name: 'Long Labels in a Narrow Container',
  render: () => (
    <div style={{width: 320, outline: '1px dashed #ccc'}}>
      <Breadcrumbs>
        <BreadcrumbItem href="/">Home</BreadcrumbItem>
        <BreadcrumbItem href="/reports">
          Quarterly Financial Reconciliation
        </BreadcrumbItem>
        <BreadcrumbItem isCurrent>
          Consolidated Statement of Operations 2026 Q3
        </BreadcrumbItem>
      </Breadcrumbs>
    </div>
  ),
};

/**
 * A single crumb renders no separator, and an empty trail collapses to nothing
 * rather than leaving a blank row.
 */
export const SingleItem: Story = {
  render: () => (
    <Breadcrumbs>
      <BreadcrumbItem isCurrent>Only Page</BreadcrumbItem>
    </Breadcrumbs>
  ),
};

const teamMenuWithDisabled: BreadcrumbMenuOption[] = [
  {label: 'Design', onClick: () => console.log('go /team/design')},
  {label: 'Engineering', isDisabled: true},
  {type: 'divider'},
  {label: 'Data', icon: 'chart', onClick: () => console.log('go /team/data')},
];

/**
 * A menu item can be disabled. The disabled row is what the A20 hover sweep and
 * the A21 cursor sweep measure on this component; without a story rendering one
 * neither has anything to check here.
 */
export const MenuCrumbDisabledItem: Story = {
  name: 'Menu Crumb (disabled item)',
  render: () => (
    <Breadcrumbs>
      <BreadcrumbItem href="/">Home</BreadcrumbItem>
      <BreadcrumbItem menu={teamMenuWithDisabled}>Teams</BreadcrumbItem>
      <BreadcrumbItem isCurrent>Overview</BreadcrumbItem>
    </Breadcrumbs>
  ),
  play: async ({canvasElement}) => {
    const trigger = canvasElement.querySelector('nav button');
    if (trigger instanceof HTMLElement) {
      trigger.click();
    }
  },
};
