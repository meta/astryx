// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {AppShell} from '@astryxdesign/core/AppShell';
import {VStack} from '@astryxdesign/core/Stack';
import {Heading, Text} from '@astryxdesign/core/Text';
import {NavIcon} from '@astryxdesign/core/NavIcon';
import {
  SideNav,
  SideNavHeading,
  SideNavItem,
  SideNavSection,
} from '@astryxdesign/core/SideNav';
import {
  ChartIcon,
  FolderIcon,
  UsersIcon,
  SettingsIcon,
} from '@astryxdesign/template-icons';
import {HomeIcon} from '@astryxdesign/template-icons/24/solid';
import {PackageIcon} from '@astryxdesign/template-icons';

export default function AppShellSideNavOnly() {
  return (
    <AppShell
      contentPadding={6}
      style={{height: '100%', minHeight: 0}}
      sideNav={
        <SideNav
          header={
            <SideNavHeading
              icon={
                <NavIcon
                  icon={<PackageIcon style={{width: 16, height: 16}} />}
                />
              }
              heading="App Shell"
              headingHref="#"
            />
          }>
          <SideNavSection title="Main" isHeaderHidden>
            <SideNavItem
              label="Dashboard"
              icon={HomeIcon}
              isSelected
              href="#"
            />
            <SideNavItem label="Analytics" icon={ChartIcon} href="#" />
            <SideNavItem label="Projects" icon={FolderIcon} href="#" />
          </SideNavSection>
          <SideNavSection title="Organization">
            <SideNavItem label="Team" icon={UsersIcon} href="#" />
            <SideNavItem label="Settings" icon={SettingsIcon} href="#" />
          </SideNavSection>
        </SideNav>
      }>
      <VStack gap={4}>
        <Heading level={3}>Page Content</Heading>
        <Text type="body">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do
          eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad
          minim veniam, quis nostrud exercitation ullamco laboris.
        </Text>
      </VStack>
    </AppShell>
  );
}
