// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {AppShell} from '@astryxdesign/core/AppShell';
import {VStack} from '@astryxdesign/core/Stack';
import {Heading, Text} from '@astryxdesign/core/Text';
import {TopNav, TopNavHeading, TopNavItem} from '@astryxdesign/core/TopNav';
import {NavIcon} from '@astryxdesign/core/NavIcon';
import {PackageIcon} from '@astryxdesign/template-icons';

export default function AppShellTopNavOnly() {
  return (
    <AppShell
      contentPadding={6}
      style={{height: '100%', minHeight: 0}}
      topNav={
        <TopNav
          label="Main navigation"
          heading={
            <TopNavHeading
              heading="App Shell"
              logo={
                <NavIcon
                  icon={<PackageIcon style={{width: 16, height: 16}} />}
                />
              }
            />
          }
          startContent={
            <>
              <TopNavItem label="Home" href="#" isSelected />
              <TopNavItem label="Products" href="#" />
              <TopNavItem label="Docs" href="#" />
            </>
          }
        />
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
