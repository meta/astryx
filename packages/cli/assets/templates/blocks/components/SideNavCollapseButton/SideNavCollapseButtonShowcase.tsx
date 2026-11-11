// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import type {ComponentProps} from 'react';
import {AppShell} from '@astryxdesign/core/AppShell';
import {
  SideNav,
  SideNavCollapseButton,
  SideNavHeading,
  SideNavItem,
  SideNavSection,
} from '@astryxdesign/core/SideNav';

function HomeIcon(props: ComponentProps<'svg'>) {
  return (
    <svg
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      {...props}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
      />
    </svg>
  );
}

function FolderIcon(props: ComponentProps<'svg'>) {
  return (
    <svg
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      {...props}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
      />
    </svg>
  );
}

export default function SideNavCollapseButtonShowcase() {
  return (
    <AppShell
      contentPadding={6}
      style={{width: '100%', height: '100%', minHeight: 0}}
      mobileNav={{breakpoint: 'none'}}
      sideNav={
        <SideNav
          collapsible={{hasButton: false}}
          header={<SideNavHeading heading="Workspace" />}
          footerIcons={<SideNavCollapseButton />}>
          <SideNavSection title="Main">
            <SideNavItem label="Home" icon={HomeIcon} isSelected href="#" />
            <SideNavItem label="Projects" icon={FolderIcon} href="#" />
          </SideNavSection>
        </SideNav>
      }>
      {null}
    </AppShell>
  );
}
