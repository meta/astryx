// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {TopNav, TopNavHeading, TopNavItem} from '@astryxdesign/core/TopNav';
import {NavIcon} from '@astryxdesign/core/NavIcon';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {useToast} from '@astryxdesign/core/Toast';
import {PackageIcon, UserCircleIcon} from '@astryxdesign/template-icons';

export default function TopNavWithLogo() {
  const showToast = useToast();
  return (
    <TopNav
      label="Main navigation"
      heading={
        <TopNavHeading
          heading="My App"
          logo={<NavIcon icon={<Icon icon={PackageIcon} size="sm" />} />}
          headingHref="#"
        />
      }
      startContent={
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
