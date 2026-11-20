// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {
  TopNav,
  TopNavHeading,
  TopNavItem,
  TopNavMenu,
} from '@astryxdesign/core/TopNav';
import {Button} from '@astryxdesign/core/Button';
import {useToast} from '@astryxdesign/core/Toast';
import {
  ChartIcon,
  SettingsIcon,
  SearchIcon,
  UsersIcon,
} from '@astryxdesign/template-icons';

export default function TopNavMenuShowcase() {
  const showToast = useToast();
  return (
    <TopNav
      style={{width: 600, maxWidth: '100%'}}
      label="Menu demo"
      heading={<TopNavHeading heading="Platform" />}
      startContent={
        <>
          <TopNavItem label="Home" href="#" isSelected />
          <TopNavMenu
            label="Tools"
            items={[
              {
                title: 'Analytics',
                description: 'View traffic and engagement metrics',
                icon: <ChartIcon />,
                href: '#analytics',
              },
              {
                title: 'Team Members',
                description: 'Manage your team and permissions',
                icon: <UsersIcon />,
                href: '#team',
              },
              {
                title: 'Settings',
                description: 'Configure your workspace',
                icon: <SettingsIcon />,
                href: '#settings',
              },
            ]}
          />
        </>
      }
      endContent={
        <Button
          label="Search"
          variant="ghost"
          icon={<SearchIcon />}
          isIconOnly
          onClick={() => showToast({body: 'Demo: search would open here'})}
        />
      }
    />
  );
}
