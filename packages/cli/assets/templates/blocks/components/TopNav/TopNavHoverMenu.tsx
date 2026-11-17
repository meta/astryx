// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {
  TopNav,
  TopNavHeading,
  TopNavItem,
  TopNavMenu,
} from '@astryxdesign/core/TopNav';
import {NavIcon} from '@astryxdesign/core/NavIcon';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {useToast} from '@astryxdesign/core/Toast';
import {
  CubeIcon,
  ChartBarIcon,
  ShieldCheckIcon,
  BoltIcon,
  CodeBracketIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';

export default function TopNavHoverMenu() {
  const showToast = useToast();
  return (
    <TopNav
      label="Main navigation"
      heading={
        <TopNavHeading
          heading="My App"
          logo={<NavIcon icon={<Icon icon={CubeIcon} size="sm" />} />}
          headingHref="#"
        />
      }
      startContent={
        <>
          <TopNavItem label="Home" href="#" isSelected />
          <TopNavMenu
            label="Products"
            items={[
              {
                title: 'Analytics',
                description: 'Track and analyze user behavior',
                icon: <ChartBarIcon />,
                href: '#analytics',
              },
              {
                title: 'Security',
                description: 'Enterprise-grade protection',
                icon: <ShieldCheckIcon />,
                href: '#security',
              },
              {
                title: 'Automation',
                description: 'Streamline your workflows',
                icon: <BoltIcon />,
                href: '#automation',
              },
              {
                title: 'Developer Tools',
                description: 'APIs, SDKs, and CLI tools',
                icon: <CodeBracketIcon />,
                href: '#dev-tools',
              },
            ]}
          />
          <TopNavItem label="Pricing" href="#" />
        </>
      }
      endContent={
        <Button
          label="Profile"
          variant="ghost"
          icon={<UserCircleIcon />}
          isIconOnly
          onClick={() =>
            showToast({body: 'Demo: your profile menu would open here'})
          }
        />
      }
    />
  );
}
