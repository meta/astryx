// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {usePathname} from '../../../../router';
import Link from '../../../../router';
import {TopNav, TopNavHeading, TopNavItem} from '@astryxdesign/core/TopNav';

const NAV_ITEMS = [
  {label: 'Home', href: '/pages/doc-home/'},
  {label: 'Documentation', href: '/pages/doc-docs/'},
  {label: 'Discover', href: '/pages/doc-discover/'},
];

export default function DocTopNav() {
  const pathname = usePathname();

  return (
    <TopNav
      label="Documentation navigation"
      heading={
        <TopNavHeading
          heading="Astryx"
          headingHref="/pages/doc-home/"
          as={Link}
        />
      }
      centerContent={
        <>
          {NAV_ITEMS.map(item => {
            const isActive = pathname?.startsWith(item.href.replace(/\/$/, ''));
            return (
              <TopNavItem
                key={item.href}
                label={item.label}
                href={item.href}
                isSelected={!!isActive}
                as={Link}
              />
            );
          })}
        </>
      }
    />
  );
}
