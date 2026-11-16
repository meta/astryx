// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {
  TopNav,
  TopNavHeading,
  TopNavItem,
  TopNavMegaMenu,
  TopNavMegaMenuItem,
} from '@astryxdesign/core/TopNav';
import {RocketLaunchIcon, BookOpenIcon} from '@heroicons/react/24/outline';

export default function TopNavMegaMenuBasic() {
  return (
    <TopNav
      style={{width: 600, maxWidth: '100%'}}
      label="Main navigation"
      heading={<TopNavHeading heading="DevTools" />}
      startContent={
        <>
          <TopNavItem label="Overview" href="#" isSelected />
          <TopNavMegaMenu
            label="Products"
            items={
              <>
                <TopNavMegaMenuItem
                  title="Deploy"
                  description="Ship to production in seconds"
                  icon={<RocketLaunchIcon width={20} height={20} />}
                  href="#deploy"
                />
                <TopNavMegaMenuItem
                  title="Documentation"
                  description="Guides, references, and tutorials"
                  icon={<BookOpenIcon width={20} height={20} />}
                  href="#docs"
                />
              </>
            }
          />
        </>
      }
    />
  );
}
