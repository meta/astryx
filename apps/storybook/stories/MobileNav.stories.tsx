// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {MobileNav} from '@astryxdesign/core/MobileNav';
import {
  SideNav,
  SideNavHeading,
  SideNavItem,
  SideNavSection,
} from '@astryxdesign/core/SideNav';
import {Button} from '@astryxdesign/core/Button';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Icon} from '@astryxdesign/core/Icon';
import {NavIcon} from '@astryxdesign/core/NavIcon';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {
  HomeIcon,
  FolderIcon,
  Cog6ToothIcon,
  ChartBarIcon,
  UserGroupIcon,
  CubeIcon,
} from '@heroicons/react/24/outline';
import {
  HomeIcon as HomeIconSolid,
  FolderIcon as FolderIconSolid,
} from '@heroicons/react/24/solid';

// =============================================================================
// Meta
// =============================================================================

const meta: Meta<typeof MobileNav> = {
  title: 'Core/MobileNav',
  component: MobileNav,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof MobileNav>;

// =============================================================================
// Default
// =============================================================================

export const Default: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <Button
          label="Open Navigation"
          icon={<Icon icon="menu" color="inherit" />}
          variant="ghost"
          onClick={() => setIsOpen(true)}
          isIconOnly
        />
        <MobileNav
          isOpen={isOpen}
          onOpenChange={open => setIsOpen(open)}
          header="Navigation">
          <SideNavSection title="Main">
            <SideNavItem
              label="Dashboard"
              icon={HomeIcon}
              selectedIcon={HomeIconSolid}
              isSelected
              href="/dashboard"
            />
            <SideNavItem
              label="Projects"
              icon={FolderIcon}
              selectedIcon={FolderIconSolid}
              href="/projects"
            />
            <SideNavItem
              label="Analytics"
              icon={ChartBarIcon}
              href="/analytics"
            />
          </SideNavSection>
          <SideNavSection title="Settings">
            <SideNavItem
              label="General"
              icon={Cog6ToothIcon}
              href="/settings"
            />
            <SideNavItem label="Team" icon={UserGroupIcon} href="/team" />
          </SideNavSection>
        </MobileNav>
      </>
    );
  },
};

// =============================================================================
// With SideNav Children
// =============================================================================

export const WithSideNavChildren: Story = {
  name: 'With SideNav Children',
  render: () => {
    const [isOpen, setIsOpen] = useState(false);

    const navSections = (
      <>
        <SideNavSection title="Main">
          <SideNavItem
            label="Dashboard"
            icon={HomeIcon}
            selectedIcon={HomeIconSolid}
            isSelected
            href="/dashboard"
          />
          <SideNavItem
            label="Projects"
            icon={FolderIcon}
            selectedIcon={FolderIconSolid}
            href="/projects"
          />
          <SideNavItem
            label="Analytics"
            icon={ChartBarIcon}
            href="/analytics"
          />
        </SideNavSection>
        <SideNavSection title="Settings">
          <SideNavItem
            label="General"
            icon={Cog6ToothIcon}
            href="/settings"
          />
        </SideNavSection>
      </>
    );

    return (
      <>
        <Button label="Open Drawer" onClick={() => setIsOpen(true)} />
        <MobileNav
          isOpen={isOpen}
          onOpenChange={open => setIsOpen(open)}
          header="My App">
          {navSections}
        </MobileNav>
      </>
    );
  },
};

// =============================================================================
// Responsive Pattern
// =============================================================================

export const ResponsivePattern: Story = {
  name: 'Responsive Pattern',
  render: () => {
    const isMobile = useMediaQuery('(max-width: 768px)');
    const [drawerOpen, setDrawerOpen] = useState(false);

    const navSections = (
      <>
        <SideNavSection title="Main">
          <SideNavItem
            label="Dashboard"
            icon={HomeIcon}
            selectedIcon={HomeIconSolid}
            isSelected
            href="/"
          />
          <SideNavItem
            label="Projects"
            icon={FolderIcon}
            selectedIcon={FolderIconSolid}
            href="/projects"
          />
          <SideNavItem
            label="Analytics"
            icon={ChartBarIcon}
            href="/analytics"
          />
        </SideNavSection>
        <SideNavSection title="Settings">
          <SideNavItem
            label="General"
            icon={Cog6ToothIcon}
            href="/settings"
          />
          <SideNavItem label="Team" icon={UserGroupIcon} href="/team" />
        </SideNavSection>
      </>
    );

    if (isMobile) {
      return (
        <>
          <Button
            label="Menu"
            icon={<Icon icon="menu" color="inherit" />}
            variant="ghost"
            onClick={() => setDrawerOpen(true)}
            isIconOnly
          />
          <MobileNav
            isOpen={drawerOpen}
            onOpenChange={open => setDrawerOpen(open)}
            header="My App">
            {navSections}
          </MobileNav>
        </>
      );
    }

    return (
      <div style={{width: 280, height: 600, border: '1px solid #e5e7eb'}}>
        <SideNav
          header={
            <SideNavHeading
              icon={
                <NavIcon
                  icon={<CubeIcon style={{width: 16, height: 16}} />}
                />
              }
              heading="My App"
              headingHref="/"
            />
          }>
          {navSections}
        </SideNav>
      </div>
    );
  },
};

// =============================================================================
// End Side
// =============================================================================

export const EndSide: Story = {
  name: 'End Side',
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <Button label="Open from Right" onClick={() => setIsOpen(true)} />
        <MobileNav
          isOpen={isOpen}
          onOpenChange={open => setIsOpen(open)}
          header="Settings"
          side="end">
          <SideNavSection title="Settings">
            <SideNavItem
              label="General"
              icon={Cog6ToothIcon}
              href="/settings"
            />
            <SideNavItem label="Team" icon={UserGroupIcon} href="/team" />
          </SideNavSection>
        </MobileNav>
      </>
    );
  },
};

// =============================================================================
// Custom Width
// =============================================================================

export const CustomWidth: Story = {
  name: 'Custom Width',
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <Button label="Open Wide Drawer" onClick={() => setIsOpen(true)} />
        <MobileNav
          isOpen={isOpen}
          onOpenChange={open => setIsOpen(open)}
          header="Wide Navigation"
          width={360}>
          <SideNavSection title="Main">
            <SideNavItem
              label="Dashboard"
              icon={HomeIcon}
              selectedIcon={HomeIconSolid}
              isSelected
              href="/dashboard"
            />
            <SideNavItem
              label="Projects"
              icon={FolderIcon}
              href="/projects"
            />
          </SideNavSection>
        </MobileNav>
      </>
    );
  },
};

// =============================================================================
// Without Title
// =============================================================================

export const WithoutTitle: Story = {
  name: 'Without Title',
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <Button
          label="Open Navigation"
          icon={<Icon icon="menu" color="inherit" />}
          variant="ghost"
          onClick={() => setIsOpen(true)}
          isIconOnly
        />
        <MobileNav isOpen={isOpen} onOpenChange={open => setIsOpen(open)}>
          <SideNavSection title="Main">
            <SideNavItem
              label="Dashboard"
              icon={HomeIcon}
              isSelected
              href="/dashboard"
            />
            <SideNavItem
              label="Projects"
              icon={FolderIcon}
              href="/projects"
            />
          </SideNavSection>
        </MobileNav>
      </>
    );
  },
};

// =============================================================================
// Tall Header
// =============================================================================

/**
 * Header content taller than one bar: a workspace name with a search field
 * under it. The header row grows to fit it, above the first item.
 */
export const TallHeader: Story = {
  name: 'Tall Header',
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    return (
      <>
        <Button
          label="Open Navigation"
          icon={<Icon icon="menu" color="inherit" />}
          variant="ghost"
          onClick={() => setIsOpen(true)}
          isIconOnly
        />
        <MobileNav
          isOpen={isOpen}
          onOpenChange={open => setIsOpen(open)}
          label="Workspace navigation"
          header={
            <div>
              <Text weight="bold">Workspace</Text>
              <TextInput
                label="Search"
                isLabelHidden
                value={query}
                onChange={setQuery}
              />
            </div>
          }>
          <SideNavSection title="Main">
            <SideNavItem
              label="Dashboard"
              icon={HomeIcon}
              isSelected
              href="/dashboard"
            />
            <SideNavItem label="Projects" icon={FolderIcon} href="/projects" />
          </SideNavSection>
        </MobileNav>
      </>
    );
  },
};
