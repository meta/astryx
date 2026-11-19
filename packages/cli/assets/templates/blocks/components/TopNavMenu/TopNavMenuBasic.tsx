// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {
  TopNav,
  TopNavHeading,
  TopNavItem,
  TopNavMenu,
} from '@astryxdesign/core/TopNav';
import {ChartBarIcon, Cog6ToothIcon} from '@heroicons/react/24/outline';

export default function TopNavMenuBasic() {
  return (
    <TopNav
      style={{width: 600, maxWidth: '100%'}}
      label="Main navigation"
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
                icon: <ChartBarIcon />,
                href: '#analytics',
              },
              {
                title: 'Settings',
                description: 'Configure your workspace',
                icon: <Cog6ToothIcon />,
                href: '#settings',
              },
            ]}
          />
        </>
      }
    />
  );
}
