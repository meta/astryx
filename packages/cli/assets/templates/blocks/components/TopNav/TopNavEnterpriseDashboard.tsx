// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {TopNav, TopNavHeading, TopNavItem} from '@astryxdesign/core/TopNav';
import {NavIcon} from '@astryxdesign/core/NavIcon';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {
  CubeIcon,
  HomeIcon,
  DocumentTextIcon,
  BellIcon,
} from '@heroicons/react/24/outline';
import {useToast} from '@astryxdesign/core/Toast';

export default function TopNavEnterpriseDashboard() {
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
          <TopNavItem
            label="Dashboard"
            href="#"
            isSelected
            icon={<Icon icon={HomeIcon} size="sm" />}
          />
          <TopNavItem
            label="Reports"
            href="#"
            icon={<Icon icon={DocumentTextIcon} size="sm" />}
          />
        </>
      }
      endContent={
        <>
          <Button
            onClick={() => showToast({body: 'Demo: search would open here'})}
            label="Search"
            variant="ghost"
            icon={<Icon icon="search" color="inherit" />}
            isIconOnly
          />
          <Button
            onClick={() =>
              showToast({body: 'Demo: your notifications would open here'})
            }
            label="Notifications"
            variant="ghost"
            icon={<Icon icon={BellIcon} />}
            isIconOnly
          />
          <Button href={'#'} label="Upgrade" variant="primary" />
        </>
      }
    />
  );
}
