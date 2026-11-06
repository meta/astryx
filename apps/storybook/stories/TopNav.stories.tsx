// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {TopNav, TopNavHeading, TopNavItem} from '@astryxdesign/core/TopNav';
import {NavIcon} from '@astryxdesign/core/NavIcon';
import {NavHeadingMenu, NavHeadingMenuItem} from '@astryxdesign/core/NavMenu';
import {Button} from '@astryxdesign/core/Button';
import {
  HomeIcon,
  Cog6ToothIcon,
  MagnifyingGlassIcon,
  BellIcon,
  UserCircleIcon,
  CubeIcon,
  DocumentTextIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';

const meta: Meta<typeof TopNav> = {
  title: 'Core/TopNav',
  component: TopNav,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    label: {
      control: 'text',
      description: 'Accessible label for navigation landmark',
    },
  },
};

export default meta;
type Story = StoryObj<typeof TopNav>;

export const Default: Story = {
  args: {
    label: 'Main navigation',
    heading: <TopNavHeading heading="My App" />,
    startContent: (
      <>
        <TopNavItem label="Home" href="#" isSelected />
        <TopNavItem label="Products" href="#" />
        <TopNavItem label="About" href="#" />
      </>
    ),
    endContent: (
      <>
        <Button
          label="Search"
          variant="ghost"
          icon={<MagnifyingGlassIcon style={{width: 16, height: 16}} />}
          isIconOnly
        />
        <Button
          label="Notifications"
          variant="ghost"
          icon={<BellIcon style={{width: 16, height: 16}} />}
          isIconOnly
        />
        <Button
          label="Profile"
          variant="ghost"
          icon={<UserCircleIcon style={{width: 16, height: 16}} />}
          isIconOnly
        />
      </>
    ),
  },
};

export const ChildrenNavigationItems: Story = {
  render: () => (
    <TopNav
      label="Main navigation"
      heading={<TopNavHeading heading="Children Alias" />}>
      <TopNavItem label="Home" href="#" isSelected />
      <TopNavItem label="Products" href="#" />
      <TopNavItem label="About" href="#" />
    </TopNav>
  ),
};

export const WithLogo: Story = {
  args: {
    label: 'Main navigation',
    heading: (
      <TopNavHeading
        heading="Dashboard"
        logo={<NavIcon icon={<CubeIcon style={{width: 16, height: 16}} />} />}
        headingHref="#"
      />
    ),
    startContent: (
      <>
        <TopNavItem label="Overview" href="#" isSelected />
        <TopNavItem label="Analytics" href="#" />
        <TopNavItem label="Reports" href="#" />
      </>
    ),
    endContent: (
      <Button
        label="Profile"
        variant="ghost"
        icon={<UserCircleIcon style={{width: 16, height: 16}} />}
        isIconOnly
      />
    ),
  },
};

/**
 * A heading with a product menu. A press that slides across the menu's items
 * acts on the item it lifts on, as every menu does.
 */
export const WithHeadingMenu: Story = {
  args: {
    label: 'Main navigation',
    heading: (
      <TopNavHeading
        heading="Acme Suite"
        logo={<NavIcon icon={<CubeIcon style={{width: 16, height: 16}} />} />}
        menu={
          <NavHeadingMenu>
            <NavHeadingMenuItem label="Analytics" onClick={() => {}} />
            <NavHeadingMenuItem label="Billing" onClick={() => {}} />
            <NavHeadingMenuItem label="Settings" onClick={() => {}} />
          </NavHeadingMenu>
        }
      />
    ),
  },
};

export const TitleOnly: Story = {
  args: {
    label: 'Main navigation',
    heading: (
      <TopNavHeading
        heading="Simple App"
        logo={<NavIcon icon={<HomeIcon style={{width: 16, height: 16}} />} />}
      />
    ),
    endContent: <Button label="Sign in" variant="primary" />,
  },
};

export const NavItemStates: Story = {
  render: () => (
    <TopNav
      label="Navigation states demo"
      heading={<TopNavHeading heading="States" />}
      startContent={
        <>
          <TopNavItem label="Selected" href="#" isSelected />
          <TopNavItem label="Default" href="#" />
          <TopNavItem label="Disabled" href="#" isDisabled />
          <TopNavItem
            label="With Icon"
            href="#"
            icon={<Cog6ToothIcon style={{width: 16, height: 16}} />}
          />
        </>
      }
    />
  ),
};

export const CenteredNavigation: Story = {
  render: () => (
    <TopNav
      label="Main navigation"
      heading={
        <TopNavHeading
          heading="My App"
          logo={<NavIcon icon={<CubeIcon style={{width: 16, height: 16}} />} />}
          headingHref="#"
        />
      }
      centerContent={
        <>
          <TopNavItem label="Home" href="#" isSelected />
          <TopNavItem label="Products" href="#" />
          <TopNavItem label="About" href="#" />
        </>
      }
      endContent={
        <>
          <Button
            label="Search"
            variant="ghost"
            icon={<MagnifyingGlassIcon style={{width: 16, height: 16}} />}
            isIconOnly
          />
          <Button
            label="Profile"
            variant="ghost"
            icon={<UserCircleIcon style={{width: 16, height: 16}} />}
            isIconOnly
          />
        </>
      }
    />
  ),
};

export const CenteredWithStartContent: Story = {
  render: () => (
    <TopNav
      label="Main navigation"
      heading={
        <TopNavHeading
          heading="Dashboard"
          logo={
            <NavIcon icon={<ChartBarIcon style={{width: 16, height: 16}} />} />
          }
          headingHref="#"
        />
      }
      startContent={
        <TopNavItem
          label="Back"
          href="#"
          icon={<HomeIcon style={{width: 16, height: 16}} />}
        />
      }
      centerContent={
        <>
          <TopNavItem label="Overview" href="#" isSelected />
          <TopNavItem label="Analytics" href="#" />
          <TopNavItem label="Reports" href="#" />
        </>
      }
      endContent={
        <Button
          label="Profile"
          variant="ghost"
          icon={<UserCircleIcon style={{width: 16, height: 16}} />}
          isIconOnly
        />
      }
    />
  ),
};

export const CenterContentWithoutEnd: Story = {
  args: {
    label: 'Main navigation',
    heading: (
      <TopNavHeading
        heading="My App"
        logo={<NavIcon icon={<CubeIcon style={{width: 16, height: 16}} />} />}
        headingHref="#"
      />
    ),
    centerContent: (
      <>
        <TopNavItem label="Home" href="#" isSelected />
        <TopNavItem label="Products" href="#" />
      </>
    ),
  },
};

export const FullExample: Story = {
  render: () => (
    <TopNav
      label="Main navigation"
      heading={
        <TopNavHeading
          heading="Enterprise Dashboard"
          logo={
            <NavIcon icon={<ChartBarIcon style={{width: 16, height: 16}} />} />
          }
          headingHref="#"
        />
      }
      startContent={
        <>
          <TopNavItem
            label="Dashboard"
            href="#"
            isSelected
            icon={<HomeIcon style={{width: 16, height: 16}} />}
          />
          <TopNavItem
            label="Reports"
            href="#"
            icon={<DocumentTextIcon style={{width: 16, height: 16}} />}
          />
          <TopNavItem
            label="Analytics"
            href="#"
            icon={<ChartBarIcon style={{width: 16, height: 16}} />}
          />
          <TopNavItem
            label="Settings"
            href="#"
            icon={<Cog6ToothIcon style={{width: 16, height: 16}} />}
          />
        </>
      }
      endContent={
        <>
          <Button
            label="Search"
            variant="ghost"
            icon={<MagnifyingGlassIcon style={{width: 16, height: 16}} />}
            isIconOnly
          />
          <Button
            label="Notifications"
            variant="ghost"
            icon={<BellIcon style={{width: 16, height: 16}} />}
            isIconOnly
          />
          <Button label="Upgrade" variant="primary" />
        </>
      }
    />
  ),
};
