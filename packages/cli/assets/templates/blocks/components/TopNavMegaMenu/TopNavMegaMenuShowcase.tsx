// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {
  TopNav,
  TopNavHeading,
  TopNavItem,
  TopNavMegaMenu,
  TopNavMegaMenuItem,
  TopNavMegaMenuFeaturedCard,
} from '@astryxdesign/core/TopNav';
import {
  RocketLaunchIcon,
  BookOpenIcon,
  CodeBracketIcon,
  ShieldCheckIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';

export default function TopNavMegaMenuShowcase() {
  return (
    <TopNav
      style={{width: 600, maxWidth: '100%'}}
      label="Mega menu demo"
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
                <TopNavMegaMenuItem
                  title="API"
                  description="Programmatic access to all features"
                  icon={<CodeBracketIcon width={20} height={20} />}
                  href="#api"
                />
                <TopNavMegaMenuItem
                  title="Security"
                  description="Enterprise-grade protection"
                  icon={<ShieldCheckIcon width={20} height={20} />}
                  href="#security"
                />
              </>
            }
            featured={
              <TopNavMegaMenuFeaturedCard
                title="What's New"
                description="Check out our latest features and improvements in the Q2 release."
                linkLabel="Read the changelog"
                linkHref="#changelog"
              />
            }
          />
        </>
      }
      endContent={<MagnifyingGlassIcon width={20} height={20} />}
    />
  );
}
