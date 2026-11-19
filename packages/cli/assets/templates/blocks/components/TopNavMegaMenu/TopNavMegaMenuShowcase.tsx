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
  RocketIcon,
  BookIcon,
  CodeIcon,
  ShieldIcon,
  SearchIcon,
} from '@astryxdesign/template-icons';

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
                  icon={<RocketIcon width={20} height={20} />}
                  href="#deploy"
                />
                <TopNavMegaMenuItem
                  title="Documentation"
                  description="Guides, references, and tutorials"
                  icon={<BookIcon width={20} height={20} />}
                  href="#docs"
                />
                <TopNavMegaMenuItem
                  title="API"
                  description="Programmatic access to all features"
                  icon={<CodeIcon width={20} height={20} />}
                  href="#api"
                />
                <TopNavMegaMenuItem
                  title="Security"
                  description="Enterprise-grade protection"
                  icon={<ShieldIcon width={20} height={20} />}
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
      endContent={<SearchIcon width={20} height={20} />}
    />
  );
}
