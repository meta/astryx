// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {
  TopNav,
  TopNavHeading,
  TopNavItem,
  TopNavMegaMenu,
  TopNavMegaMenuItem,
} from '@astryxdesign/core/TopNav';
import {RocketIcon, BookIcon} from '@astryxdesign/template-icons';

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
                  icon={<RocketIcon width={20} height={20} />}
                  href="#deploy"
                />
                <TopNavMegaMenuItem
                  title="Documentation"
                  description="Guides, references, and tutorials"
                  icon={<BookIcon width={20} height={20} />}
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
