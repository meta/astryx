// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import type {ComponentProps} from 'react';
import {AppShell} from '@astryxdesign/core/AppShell';
import {
  SideNav,
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

function DocumentTextIcon(props: ComponentProps<'svg'>) {
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
        d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
      />
    </svg>
  );
}

function Cog6ToothIcon(props: ComponentProps<'svg'>) {
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
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
    </svg>
  );
}

function LifebuoyIcon(props: ComponentProps<'svg'>) {
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
        d="m7.864 4.243 3.32 3.319m1.632 0 3.32-3.32M7.864 19.757l3.32-3.319m1.632 0 3.32 3.32M4.243 7.864l3.319 3.32m0 1.632-3.32 3.32M19.757 7.864l-3.319 3.32m0 1.632 3.32 3.32M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-6 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
    </svg>
  );
}

export default function SideNavShowcase() {
  return (
    <AppShell
      contentPadding={6}
      style={{width: '100%', height: '100%', minHeight: 0}}
      mobileNav={{breakpoint: 'none'}}
      sideNav={
        <SideNav
          header={<SideNavHeading heading="My App" headingHref="/" />}
          footer={
            <SideNavSection title="Support" isHeaderHidden>
              <SideNavItem
                label="Help & docs"
                icon={LifebuoyIcon}
                href="/help"
              />
              <SideNavItem
                label="Settings"
                icon={Cog6ToothIcon}
                href="/settings"
              />
            </SideNavSection>
          }>
          <SideNavSection title="Main">
            <SideNavItem
              label="Dashboard"
              icon={HomeIcon}
              isSelected
              href="/dashboard"
            />
            <SideNavItem label="Projects" icon={FolderIcon} href="/projects" />
            <SideNavItem
              label="Analytics"
              icon={ChartBarIcon}
              href="/analytics"
            />
          </SideNavSection>
          <SideNavSection title="Documents">
            <SideNavItem
              label="All Documents"
              icon={DocumentTextIcon}
              href="/documents"
            />
          </SideNavSection>
        </SideNav>
      }>
      {null}
    </AppShell>
  );
}
