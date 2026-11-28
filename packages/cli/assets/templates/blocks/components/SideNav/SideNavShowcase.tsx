// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {
  ChartIcon,
  DocumentIcon,
  FolderIcon,
  HelpIcon,
  HomeIcon,
  SettingsIcon,
} from '@astryxdesign/template-icons';
import {
  SideNav,
  SideNavHeading,
  SideNavItem,
  SideNavSection,
} from '@astryxdesign/core/SideNav';

export default function SideNavShowcase() {
  return (
    <SideNav
      header={<SideNavHeading heading="My App" headingHref="/" />}
      footer={
        <SideNavSection title="Support" isHeaderHidden>
          <SideNavItem label="Help & docs" icon={HelpIcon} href="/help" />
          <SideNavItem label="Settings" icon={SettingsIcon} href="/settings" />
        </SideNavSection>
      }>
      <SideNavSection title="Main">
        <SideNavItem
          label="Dashboard"
          icon={HomeIcon}
          isSelected
          href="/dashboard"
        />
        <SideNavItem label="Projects" icon={FolderIcon} href="/projects" />
        <SideNavItem label="Analytics" icon={ChartIcon} href="/analytics" />
      </SideNavSection>
      <SideNavSection title="Documents">
        <SideNavItem
          label="All Documents"
          icon={DocumentIcon}
          href="/documents"
        />
      </SideNavSection>
    </SideNav>
  );
}
