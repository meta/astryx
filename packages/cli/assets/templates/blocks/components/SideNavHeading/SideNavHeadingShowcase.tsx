// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import type {ComponentProps} from 'react';
import {AppShell} from '@astryxdesign/core/AppShell';
import {HStack} from '@astryxdesign/core/Layout';
import {
  SideNav,
  SideNavHeading,
  SideNavItem,
  SideNavSection,
} from '@astryxdesign/core/SideNav';

function AppIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z"
      />
    </svg>
  );
}

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

function ChartBarIcon(props: ComponentProps<'svg'>) {
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
        d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"
      />
    </svg>
  );
}

// Two full-height shells side by side compare a simple heading against one with
// a superheading and subheading. Mobile switching is disabled so both rails always
// render at their desktop width inside the preview.
export default function SideNavHeadingShowcase() {
  return (
    <HStack gap={6} style={{width: '100%', height: '100%', minHeight: 0}}>
      <AppShell
        contentPadding={6}
        style={{flex: 1, minWidth: 0, height: '100%', minHeight: 0}}
        mobileNav={{breakpoint: 'none'}}
        sideNav={
          <SideNav
            header={
              <SideNavHeading
                heading="Analytics"
                icon={<AppIcon />}
                headingHref="/"
              />
            }>
            <SideNavSection title="Main" isHeaderHidden>
              <SideNavItem
                label="Overview"
                icon={HomeIcon}
                isSelected
                href="#"
              />
              <SideNavItem label="Reports" icon={ChartBarIcon} href="#" />
            </SideNavSection>
          </SideNav>
        }>
        {null}
      </AppShell>
      <AppShell
        contentPadding={6}
        style={{flex: 1, minWidth: 0, height: '100%', minHeight: 0}}
        mobileNav={{breakpoint: 'none'}}
        sideNav={
          <SideNav
            header={
              <SideNavHeading
                heading="Analytics"
                icon={<AppIcon />}
                superheading="Acme Corp"
                subheading="Production"
                headingHref="/"
              />
            }>
            <SideNavSection title="Main" isHeaderHidden>
              <SideNavItem
                label="Overview"
                icon={HomeIcon}
                isSelected
                href="#"
              />
              <SideNavItem label="Reports" icon={ChartBarIcon} href="#" />
            </SideNavSection>
          </SideNav>
        }>
        {null}
      </AppShell>
    </HStack>
  );
}
