// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {MobileNav} from '@astryxdesign/core/MobileNav';
import {SideNavSection, SideNavItem} from '@astryxdesign/core/SideNav';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {
  HomeIcon,
  FolderIcon,
  ChartIcon,
  SettingsIcon,
  UsersIcon,
} from '@astryxdesign/template-icons';

export default function MobileNavBasicMobileNav() {
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
            isSelected
            href="/dashboard"
          />
          <SideNavItem label="Projects" icon={FolderIcon} href="/projects" />
          <SideNavItem label="Analytics" icon={ChartIcon} href="/analytics" />
        </SideNavSection>
        <SideNavSection title="Settings">
          <SideNavItem label="General" icon={SettingsIcon} href="/settings" />
          <SideNavItem label="Team" icon={UsersIcon} href="/team" />
        </SideNavSection>
      </MobileNav>
    </>
  );
}
