// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {TopNav, TopNavHeading, TopNavItem} from '@astryxdesign/core/TopNav';
import {Icon} from '@astryxdesign/core/Icon';

function HomeIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
      />
    </svg>
  );
}

export default function TopNavItemShowcase() {
  return (
    <TopNav
      style={{width: 600, maxWidth: '100%'}}
      label="Navigation items demo"
      heading={<TopNavHeading heading="App" />}
      startContent={
        <>
          <TopNavItem
            label="Dashboard"
            href="#"
            isSelected
            icon={<HomeIcon />}
          />
          <TopNavItem label="Projects" href="#" />
          <TopNavItem label="Reports" href="#" />
          <TopNavItem label="Archived" href="#" isDisabled />
        </>
      }
      endContent={<Icon icon="search" />}
    />
  );
}
