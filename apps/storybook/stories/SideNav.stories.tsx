// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {AppShell} from '@astryxdesign/core/AppShell';
import {
  SideNav,
  SideNavHeading,
  SideNavItem,
  SideNavSection,
} from '@astryxdesign/core/SideNav';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {ListItem} from '@astryxdesign/core/List';
import {MoreMenu} from '@astryxdesign/core/MoreMenu';
import {NavIcon} from '@astryxdesign/core/NavIcon';
import {NavHeadingMenu, NavHeadingMenuItem} from '@astryxdesign/core/NavMenu';
import {Text} from '@astryxdesign/core/Text';
import {
  HomeIcon,
  FolderIcon,
  Cog6ToothIcon,
  ChartBarIcon,
  UserGroupIcon,
  BellIcon,
  QuestionMarkCircleIcon,
  DocumentTextIcon,
  CubeIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import {
  HomeIcon as HomeIconSolid,
  FolderIcon as FolderIconSolid,
} from '@heroicons/react/24/solid';

const meta: Meta<typeof SideNav> = {
  title: 'Core/SideNav',
  component: SideNav,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div style={{height: 480}}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof SideNav>;

// =============================================================================
// Basic
// =============================================================================

export const Default: Story = {
  render: () => (
    <SideNav
      header={
        <SideNavHeading
          icon={<NavIcon icon={<CubeIcon style={{width: 16, height: 16}} />} />}
          heading="My App"
          headingHref="/"
        />
      }>
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
          endContent={<Badge label="3" />}
        />
        <SideNavItem label="Analytics" icon={ChartBarIcon} href="/analytics" />
        <SideNavItem label="Team" icon={UserGroupIcon} href="/team" />
      </SideNavSection>
      <SideNavSection title="Documents">
        <SideNavItem
          label="All Documents"
          icon={DocumentTextIcon}
          href="/documents"
        />
      </SideNavSection>
    </SideNav>
  ),
};

// =============================================================================
// Title Without Icon
// =============================================================================

export const TitleWithoutIcon: Story = {
  name: 'Title Without Icon',
  render: () => (
    <SideNav header={<SideNavHeading heading="My App" headingHref="/" />}>
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
        <SideNavItem label="Analytics" icon={ChartBarIcon} href="/analytics" />
      </SideNavSection>
    </SideNav>
  ),
};

// =============================================================================
// With Header Menu
// =============================================================================

/**
 * A header whose menu holds NavHeadingMenu items. A press that slides across
 * them acts on the item it lifts on, as every menu does.
 */
export const WithHeaderMenuItems: Story = {
  name: 'Header with Menu Items',
  render: () => (
    <SideNav
      header={
        <SideNavHeading
          icon={<NavIcon icon={<CubeIcon style={{width: 16, height: 16}} />} />}
          heading="Product Name"
          subheading="Business Account"
          menu={
            <NavHeadingMenu>
              <NavHeadingMenuItem label="Personal Account" onClick={() => {}} />
              <NavHeadingMenuItem label="Acme Corp" onClick={() => {}} />
              <NavHeadingMenuItem label="Sign out" onClick={() => {}} />
            </NavHeadingMenu>
          }
        />
      }>
      <SideNavSection title="Navigation">
        <SideNavItem label="Dashboard" icon={HomeIcon} isSelected />
      </SideNavSection>
    </SideNav>
  ),
};

export const WithHeaderMenu: Story = {
  name: 'Header with Menu',
  render: () => (
    <SideNav
      header={
        <SideNavHeading
          icon={<NavIcon icon={<CubeIcon style={{width: 16, height: 16}} />} />}
          heading="Product Name"
          subheading="Business Account"
          menu={
            <>
              <ListItem label="Personal Account" href="#" />
              <ListItem label="Acme Corp" href="#" />
              <ListItem label="Add account" href="#" />
              <ListItem label="Sign out" href="#" />
            </>
          }
        />
      }>
      <SideNavSection title="Navigation">
        <SideNavItem
          label="Dashboard"
          icon={HomeIcon}
          selectedIcon={HomeIconSolid}
          isSelected
        />
        <SideNavItem label="Settings" icon={Cog6ToothIcon} />
      </SideNavSection>
    </SideNav>
  ),
};

// =============================================================================
// Suite Header
// =============================================================================

export const SuiteHeader: Story = {
  name: 'Suite with Independent Links',
  render: () => (
    <SideNav
      header={
        <SideNavHeading
          icon={<NavIcon icon={<CubeIcon style={{width: 16, height: 16}} />} />}
          superheading="Suite Name"
          superheadingHref="/suite"
          heading="Product Name"
          headingHref="/product"
          menu={
            <>
              <ListItem label="Analytics" href="#" />
              <ListItem label="Commerce" href="#" />
              <ListItem label="Team Hub" href="#" />
            </>
          }
        />
      }>
      <SideNavSection title="Main">
        <SideNavItem
          label="Dashboard"
          icon={HomeIcon}
          selectedIcon={HomeIconSolid}
          isSelected
        />
        <SideNavItem label="Projects" icon={FolderIcon} />
      </SideNavSection>
    </SideNav>
  ),
};

// =============================================================================
// Nested Items
// =============================================================================

export const NestedItems: Story = {
  name: 'Nested Items',
  render: () => (
    <SideNav
      header={
        <SideNavHeading
          icon={<NavIcon icon={<CubeIcon style={{width: 16, height: 16}} />} />}
          heading="My App"
        />
      }>
      <SideNavSection title="Main">
        <SideNavItem
          label="Dashboard"
          icon={HomeIcon}
          selectedIcon={HomeIconSolid}
          isSelected
        />
        <SideNavItem label="Settings" icon={Cog6ToothIcon}>
          <SideNavItem label="General" href="/settings/general" />
          <SideNavItem label="Security" href="/settings/security" />
          <SideNavItem label="Notifications" href="/settings/notifications" />
        </SideNavItem>
      </SideNavSection>
    </SideNav>
  ),
};

// =============================================================================
// With Footer
// =============================================================================

export const WithFooter: Story = {
  name: 'With Footer Icons',
  render: () => (
    <SideNav
      header={
        <SideNavHeading
          icon={<NavIcon icon={<CubeIcon style={{width: 16, height: 16}} />} />}
          heading="My App"
        />
      }
      footerIcons={
        <>
          <Button
            label="Help"
            icon={<Icon icon={QuestionMarkCircleIcon} size="md" />}
            variant="ghost"
            size="sm"
            isIconOnly
          />
          <Button
            label="Notifications"
            icon={<Icon icon={BellIcon} size="md" />}
            variant="ghost"
            size="sm"
            isIconOnly
          />
        </>
      }>
      <SideNavSection title="Main">
        <SideNavItem
          label="Dashboard"
          icon={HomeIcon}
          selectedIcon={HomeIconSolid}
          isSelected
        />
        <SideNavItem label="Projects" icon={FolderIcon} />
      </SideNavSection>
    </SideNav>
  ),
};

// =============================================================================
// Disabled Item
// =============================================================================

export const DisabledItem: Story = {
  name: 'Disabled Items',
  render: () => (
    <SideNav
      header={
        <SideNavHeading
          icon={<NavIcon icon={<CubeIcon style={{width: 16, height: 16}} />} />}
          heading="My App"
        />
      }>
      <SideNavSection title="Main">
        <SideNavItem
          label="Dashboard"
          icon={HomeIcon}
          selectedIcon={HomeIconSolid}
          isSelected
        />
        <SideNavItem label="Projects" icon={FolderIcon} />
        <SideNavItem
          label="Analytics (Coming Soon)"
          icon={ChartBarIcon}
          isDisabled
        />
      </SideNavSection>
    </SideNav>
  ),
};

// =============================================================================
// Hidden Section Header
// =============================================================================

export const HiddenSectionHeader: Story = {
  name: 'Hidden Section Header',
  render: () => (
    <SideNav
      header={
        <SideNavHeading
          icon={<NavIcon icon={<CubeIcon style={{width: 16, height: 16}} />} />}
          heading="My App"
        />
      }>
      <SideNavSection title="Main navigation" isHeaderHidden>
        <SideNavItem
          label="Dashboard"
          icon={HomeIcon}
          selectedIcon={HomeIconSolid}
          isSelected
        />
        <SideNavItem label="Projects" icon={FolderIcon} />
        <SideNavItem label="Analytics" icon={ChartBarIcon} />
      </SideNavSection>
    </SideNav>
  ),
};

// =============================================================================
// End Content
// =============================================================================

export const EndContent: Story = {
  name: 'End Content (Badges)',
  render: () => (
    <SideNav
      header={
        <SideNavHeading
          icon={<NavIcon icon={<CubeIcon style={{width: 16, height: 16}} />} />}
          heading="My App"
          headingHref="/"
        />
      }>
      <SideNavSection title="Navigation" isHeaderHidden>
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
          endContent={<Badge label={12} />}
        />
        <SideNavItem
          label="Analytics"
          icon={ChartBarIcon}
          href="/analytics"
          endContent={<Badge label="New" />}
        />
        <SideNavItem
          label="Team"
          icon={UserGroupIcon}
          href="/team"
          endContent={
            <Text type="supporting" color="secondary">
              8 members
            </Text>
          }
        />
        <SideNavItem
          label="Notifications"
          icon={BellIcon}
          href="/notifications"
          endContent={<Badge label={5} />}
        />
        <SideNavItem
          label="Documents"
          icon={DocumentTextIcon}
          href="/documents"
          endContent={
            <Text type="supporting" color="secondary">
              ⌘D
            </Text>
          }
        />
        <SideNavItem
          label="Settings"
          icon={Cog6ToothIcon}
          href="/settings"
          endContent={
            <Text type="supporting" color="secondary">
              3 pending
            </Text>
          }
        />
        <SideNavItem
          label="A very long navigation label that should truncate with ellipsis"
          icon={DocumentTextIcon}
          href="/long"
          endContent={<Badge label={99} />}
        />
      </SideNavSection>
    </SideNav>
  ),
};

// =============================================================================
// Row Actions
// =============================================================================

export const RowActions: Story = {
  name: 'Row Actions (Sibling Controls)',
  render: () => (
    <SideNav
      header={
        <SideNavHeading
          icon={<NavIcon icon={<CubeIcon style={{width: 16, height: 16}} />} />}
          heading="My App"
          headingHref="/"
        />
      }>
      <SideNavSection title="Projects" isHeaderHidden>
        <SideNavItem
          label="Project Alpha"
          icon={FolderIcon}
          selectedIcon={FolderIconSolid}
          isSelected
          href="/projects/alpha"
          collapsible
          actions={
            <MoreMenu
              label="Project Alpha actions"
              items={[
                {label: 'New session', onClick: () => {}},
                {label: 'Rename project', onClick: () => {}},
                {label: 'Archive project', onClick: () => {}},
              ]}
            />
          }>
          <SideNavItem label="Session 1" href="/projects/alpha/sessions/1" />
          <SideNavItem label="Session 2" href="/projects/alpha/sessions/2" />
        </SideNavItem>
        <SideNavItem
          label="Project Beta"
          icon={FolderIcon}
          href="/projects/beta"
          collapsible={{defaultIsCollapsed: true}}
          actions={
            <MoreMenu
              label="Project Beta actions"
              items={[
                {label: 'New session', onClick: () => {}},
                {label: 'Rename project', onClick: () => {}},
              ]}
            />
          }>
          <SideNavItem label="Session 1" href="/projects/beta/sessions/1" />
        </SideNavItem>
        <SideNavItem
          label="Notes"
          icon={DocumentTextIcon}
          href="/notes"
          endContent={<Badge label={4} />}
          actions={
            <Button
              label="New note"
              icon={<Icon icon={PlusIcon} size="sm" color="secondary" />}
              variant="ghost"
              isIconOnly
            />
          }
        />
      </SideNavSection>
    </SideNav>
  ),
};

// =============================================================================
// Header End Content
// =============================================================================

export const HeaderEndContent: Story = {
  name: 'Header End Content',
  render: () => (
    <SideNav
      header={
        <SideNavHeading
          icon={<NavIcon icon={<CubeIcon style={{width: 16, height: 16}} />} />}
          heading="My App"
          headingHref="/"
          headerEndContent={<Badge label="3" variant="error" />}
        />
      }>
      <SideNavSection title="Main">
        <SideNavItem
          label="Dashboard"
          icon={HomeIcon}
          selectedIcon={HomeIconSolid}
          isSelected
        />
        <SideNavItem label="Projects" icon={FolderIcon} />
      </SideNavSection>
    </SideNav>
  ),
};

export const HeaderEndContentAction: Story = {
  name: 'Header End Content: Action Beside A Heading Link',
  render: () => (
    <SideNav
      header={
        <SideNavHeading
          icon={<NavIcon icon={<CubeIcon style={{width: 16, height: 16}} />} />}
          heading="My App"
          headingHref="/"
          headerEndContent={<Button label="Create" variant="ghost" size="sm" />}
        />
      }>
      <SideNavSection title="Main">
        <SideNavItem label="Dashboard" icon={HomeIcon} isSelected />
      </SideNavSection>
    </SideNav>
  ),
};

// =============================================================================
// Header End Content + Menu
// =============================================================================

export const HeaderEndContentWithMenu: Story = {
  name: 'Header End Content + Menu',
  render: () => (
    <SideNav
      header={
        <SideNavHeading
          icon={<NavIcon icon={<CubeIcon style={{width: 16, height: 16}} />} />}
          heading="Product Name"
          subheading="Business Account"
          headerEndContent={<Badge label="New" variant="info" />}
          menu={
            <>
              <ListItem label="Switch Account" href="#" />
              <ListItem label="Sign Out" href="#" />
            </>
          }
        />
      }>
      <SideNavSection title="Main">
        <SideNavItem
          label="Dashboard"
          icon={HomeIcon}
          selectedIcon={HomeIconSolid}
          isSelected
        />
      </SideNavSection>
    </SideNav>
  ),
};

// =============================================================================
// Collapsible Items
// =============================================================================

export const CollapsibleItems: Story = {
  name: 'Collapsible Items',
  render: () => (
    <SideNav
      header={
        <SideNavHeading
          icon={<NavIcon icon={<CubeIcon style={{width: 16, height: 16}} />} />}
          heading="My App"
        />
      }>
      <SideNavSection title="Collapsible (no href)">
        <SideNavItem label="Settings" icon={Cog6ToothIcon} collapsible>
          <SideNavItem label="General" href="/settings/general" />
          <SideNavItem label="Security" href="/settings/security" />
          <SideNavItem label="Notifications" href="/settings/notifications" />
        </SideNavItem>
        <SideNavItem
          label="Documents"
          icon={DocumentTextIcon}
          collapsible={{defaultIsCollapsed: true}}>
          <SideNavItem label="Drafts" href="/documents/drafts" />
          <SideNavItem label="Published" href="/documents/published" />
        </SideNavItem>
      </SideNavSection>
      <SideNavSection title="Collapsible + href">
        <SideNavItem
          label="Settings"
          icon={Cog6ToothIcon}
          href="/settings"
          collapsible>
          <SideNavItem label="General" href="/settings/general" />
          <SideNavItem label="Security" href="/settings/security" />
          <SideNavItem label="Notifications" href="/settings/notifications" />
        </SideNavItem>
        <SideNavItem
          label="Documents"
          icon={DocumentTextIcon}
          href="/documents"
          collapsible={{defaultIsCollapsed: true}}>
          <SideNavItem label="Drafts" href="/documents/drafts" />
          <SideNavItem label="Published" href="/documents/published" />
        </SideNavItem>
      </SideNavSection>
      <SideNavSection title="Collapsible + onClick">
        <SideNavItem
          label="Settings"
          icon={Cog6ToothIcon}
          onClick={() => alert('Settings clicked')}
          collapsible>
          <SideNavItem label="General" href="/settings/general" />
          <SideNavItem label="Security" href="/settings/security" />
          <SideNavItem label="Notifications" href="/settings/notifications" />
        </SideNavItem>
      </SideNavSection>
    </SideNav>
  ),
};

// =============================================================================
// Collapsible Sidebar
// =============================================================================

export const CollapsibleSidebar: Story = {
  name: 'Collapsible Sidebar',
  render: () => (
    <SideNav
      collapsible
      header={
        <SideNavHeading
          icon={<NavIcon icon={<CubeIcon style={{width: 16, height: 16}} />} />}
          heading="My App"
          headingHref="/"
        />
      }
      footerIcons={
        <>
          <Button
            label="Help"
            icon={<Icon icon={QuestionMarkCircleIcon} size="md" />}
            variant="ghost"
            size="sm"
            isIconOnly
          />
          <Button
            label="Notifications"
            icon={<Icon icon={BellIcon} size="md" />}
            variant="ghost"
            size="sm"
            isIconOnly
          />
        </>
      }>
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
          endContent={<Badge label="3" />}
        />
        <SideNavItem label="Analytics" icon={ChartBarIcon} href="/analytics" />
        <SideNavItem label="Team" icon={UserGroupIcon} href="/team" />
      </SideNavSection>
      <SideNavSection title="Settings">
        <SideNavItem label="Settings" icon={Cog6ToothIcon} collapsible>
          <SideNavItem label="General" href="/settings/general" />
          <SideNavItem label="Security" href="/settings/security" />
          <SideNavItem label="Notifications" href="/settings/notifications" />
        </SideNavItem>
        <SideNavItem
          label="Documents"
          icon={DocumentTextIcon}
          href="/documents"
        />
      </SideNavSection>
    </SideNav>
  ),
};

// =============================================================================
// Resizable in AppShell
// =============================================================================

export const ResizableInAppShell: Story = {
  name: 'Resizable in AppShell',
  parameters: {
    layout: 'fullscreen',
  },
  render: () => (
    <AppShell
      contentPadding={6}
      sideNav={
        <SideNav
          resizable
          header={
            <SideNavHeading
              icon={
                <NavIcon icon={<CubeIcon style={{width: 16, height: 16}} />} />
              }
              heading="My App"
            />
          }>
          <SideNavSection title="Main">
            <SideNavItem
              label="Dashboard"
              icon={HomeIcon}
              selectedIcon={HomeIconSolid}
              isSelected
            />
            <SideNavItem label="Projects" icon={FolderIcon} />
            <SideNavItem label="Analytics" icon={ChartBarIcon} />
          </SideNavSection>
        </SideNav>
      }>
      <Text type="body">Drag the sidebar edge to resize the navigation.</Text>
    </AppShell>
  ),
  play: async ({canvasElement}) => {
    await document.fonts.ready;
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );

    const nav = canvasElement.querySelector<HTMLElement>('nav');
    const panel = nav?.closest<HTMLElement>('.astryx-app-shell-sidenav');
    const handle = canvasElement.querySelector<HTMLElement>(
      '[data-testid="astryx-sidenav-resize-handle"]',
    );

    if (!panel || !handle) {
      throw new Error('Resizable AppShell fixture did not render as expected');
    }

    if (panel.scrollWidth !== panel.clientWidth) {
      throw new Error(
        `Resizable SideNav overflowed its AppShell panel: clientWidth ${panel.clientWidth}px, scrollWidth ${panel.scrollWidth}px`,
      );
    }

    handle.focus();
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

    const focusStyle = getComputedStyle(handle);
    const outlineWidth = Number.parseFloat(focusStyle.outlineWidth);
    const outlineOffset = Number.parseFloat(focusStyle.outlineOffset);
    if (
      canvasElement.ownerDocument.activeElement !== handle ||
      !handle.matches(':focus-visible') ||
      focusStyle.outlineStyle === 'none' ||
      !Number.isFinite(outlineWidth) ||
      outlineWidth <= 0 ||
      !Number.isFinite(outlineOffset) ||
      outlineOffset > -outlineWidth
    ) {
      throw new Error(
        `Resize handle focus ring was not visibly inset: ${outlineWidth}px ${focusStyle.outlineStyle}, offset ${outlineOffset}px`,
      );
    }
  },
};

// =============================================================================
// Iconless Items with Nested Children
// =============================================================================

export const IconlessNestedItems: Story = {
  name: 'Iconless Nested Items',
  render: () => (
    <SideNav
      header={
        <SideNavHeading
          icon={<NavIcon icon={<CubeIcon style={{width: 16, height: 16}} />} />}
          heading="My App"
        />
      }>
      <SideNavSection title="Main">
        <SideNavItem
          label="Dashboard"
          icon={HomeIcon}
          selectedIcon={HomeIconSolid}
          isSelected
          href="/dashboard"
        />
        <SideNavItem label="Settings" icon={Cog6ToothIcon} collapsible>
          <SideNavItem label="General" href="/settings/general" />
          <SideNavItem label="Security" href="/settings/security" />
          <SideNavItem label="Notifications" href="/settings/notifications" />
        </SideNavItem>
        <SideNavItem label="Reports" collapsible>
          <SideNavItem label="Monthly" href="/reports/monthly" />
          <SideNavItem label="Quarterly" href="/reports/quarterly" />
          <SideNavItem label="Annual" href="/reports/annual" />
        </SideNavItem>
        <SideNavItem label="Analytics" icon={ChartBarIcon} href="/analytics" />
      </SideNavSection>
    </SideNav>
  ),
};
