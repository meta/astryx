// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {
  TopNav,
  TopNavHeading,
  TopNavItem,
  TopNavMenu,
  TopNavMegaMenu,
  TopNavMegaMenuItem,
  TopNavMegaMenuFeaturedCard,
} from '@astryxdesign/core/TopNav';
import {NavIcon} from '@astryxdesign/core/NavIcon';
import {Button} from '@astryxdesign/core/Button';
import {
  CubeIcon,
  ChartBarIcon,
  ShieldCheckIcon,
  BoltIcon,
  CodeBracketIcon,
  GlobeAltIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';

// =============================================================================
// TopNavMenu Stories
// =============================================================================

const menuMeta: Meta<typeof TopNavMenu> = {
  title: 'Core/TopNavMenu',
  component: TopNavMenu,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
};

export default menuMeta;
type Story = StoryObj<typeof TopNavMenu>;

/**
 * Basic hover-triggered nav menu with 4 items, each with icon, title,
 * and description.
 */
export const Default: Story = {
  render: () => (
    <TopNav
      label="Main navigation"
      heading={
        <TopNavHeading
          heading="My App"
          logo={<NavIcon icon={<CubeIcon style={{width: 16, height: 16}} />} />}
          headingHref="#"
        />
      }
      startContent={
        <>
          <TopNavItem label="Home" href="#" isSelected />
          <TopNavMenu
            label="Products"
            items={[
              {
                title: 'Analytics',
                description: 'Track and analyze user behavior',
                icon: <ChartBarIcon style={{width: 20, height: 20}} />,
                href: '#analytics',
              },
              {
                title: 'Security',
                description: 'Enterprise-grade protection',
                icon: <ShieldCheckIcon style={{width: 20, height: 20}} />,
                href: '#security',
              },
              {
                title: 'Automation',
                description: 'Streamline your workflows',
                icon: <BoltIcon style={{width: 20, height: 20}} />,
                href: '#automation',
              },
              {
                title: 'Developer Tools',
                description: 'APIs, SDKs, and CLI tools',
                icon: <CodeBracketIcon style={{width: 20, height: 20}} />,
                href: '#dev-tools',
              },
            ]}
          />
          <TopNavItem label="Pricing" href="#" />
        </>
      }
      endContent={
        <Button
          label="Profile"
          variant="ghost"
          icon={<UserCircleIcon style={{width: 16, height: 16}} />}
          isIconOnly
        />
      }
    />
  ),
};

/**
 * A nav menu of action items (no destinations): each runs its `onClick`.
 */
export const ActionItems: Story = {
  render: () => (
    <TopNav
      label="Main navigation"
      heading={<TopNavHeading heading="My App" headingHref="#" />}
      startContent={
        <TopNavMenu
          label="Actions"
          items={[
            {
              title: 'Invite teammates',
              description: 'Send an invite by email',
              icon: <UserCircleIcon style={{width: 20, height: 20}} />,
              onClick: () => {},
            },
            {
              title: 'Run automation',
              description: 'Start the default workflow',
              icon: <BoltIcon style={{width: 20, height: 20}} />,
              onClick: () => {},
            },
          ]}
        />
      }
    />
  ),
};

/**
 * Multiple nav menus side by side. Hovering one closes the other
 * (standard hover-menu behavior).
 */
export const MultipleMenus: Story = {
  name: 'Multiple Menus',
  render: () => (
    <TopNav
      label="Main navigation"
      heading={<TopNavHeading heading="Platform" headingHref="#" />}
      startContent={
        <>
          <TopNavMenu
            label="Products"
            items={[
              {
                title: 'Analytics',
                description: 'Track behavior',
                icon: <ChartBarIcon style={{width: 20, height: 20}} />,
                href: '#',
              },
              {
                title: 'Security',
                description: 'Enterprise protection',
                icon: <ShieldCheckIcon style={{width: 20, height: 20}} />,
                href: '#',
              },
            ]}
          />
          <TopNavMenu
            label="Resources"
            items={[
              {title: 'Documentation', href: '#'},
              {title: 'API Reference', href: '#'},
              {title: 'Community Forum', href: '#'},
            ]}
          />
          <TopNavItem label="Pricing" href="#" />
        </>
      }
    />
  ),
};

// =============================================================================
// TopNavMegaMenu Stories — Composed Children API
// =============================================================================

/**
 * Full-width mega menu with composed children API.
 */
export const MegaMenu: Story = {
  name: 'Mega Menu',
  render: function MegaMenuStory() {
    const [, setMenuOpen] = useState(false);

    return (
      <div style={{position: 'relative'}}>
        <TopNav
          label="Marketing navigation"
          heading={
            <TopNavHeading
              heading="Acme"
              logo={
                <NavIcon icon={<CubeIcon style={{width: 16, height: 16}} />} />
              }
              headingHref="#"
            />
          }
          startContent={
            <>
              <TopNavMegaMenu
                label="Products"
                onOpenChange={setMenuOpen}
                items={
                  <>
                    <TopNavMegaMenuItem
                      title="Analytics"
                      description="Track and analyze user behavior across your apps"
                      icon={<ChartBarIcon style={{width: 20, height: 20}} />}
                      href="#analytics"
                    />
                    <TopNavMegaMenuItem
                      title="Security"
                      description="Enterprise-grade protection for your data"
                      icon={<ShieldCheckIcon style={{width: 20, height: 20}} />}
                      href="#security"
                    />
                    <TopNavMegaMenuItem
                      title="Automation"
                      description="Streamline workflows with intelligent tools"
                      icon={<BoltIcon style={{width: 20, height: 20}} />}
                      href="#automation"
                    />
                    <TopNavMegaMenuItem
                      title="Developer Tools"
                      description="APIs, SDKs, and CLI for integration"
                      icon={<CodeBracketIcon style={{width: 20, height: 20}} />}
                      href="#dev-tools"
                    />
                    <TopNavMegaMenuItem
                      title="Global Network"
                      description="Low-latency edge infra in 40+ regions"
                      icon={<GlobeAltIcon style={{width: 20, height: 20}} />}
                      href="#network"
                    />
                  </>
                }
                featured={
                  <TopNavMegaMenuFeaturedCard
                    title="What's new in v4.0"
                    description="AI-powered analytics and real-time collaboration."
                    image="https://images.unsplash.com/photo-1551434678-e076c223a692?w=560&h=280&fit=crop"
                    imageAlt="Team collaboration"
                    linkLabel="Read the announcement"
                    linkHref="#announcement"
                  />
                }
              />
              <TopNavItem label="Pricing" href="#" />
              <TopNavItem label="Docs" href="#" />
            </>
          }
          endContent={
            <>
              <Button label="Sign in" variant="ghost" />
              <Button label="Get started" variant="primary" />
            </>
          }
        />
      </div>
    );
  },
};

/**
 * Mega menu without the featured content area — just the items grid.
 */
export const MegaMenuSimple: Story = {
  name: 'Mega Menu (Simple)',
  render: () => (
    <div style={{position: 'relative'}}>
      <TopNav
        label="Simple navigation"
        heading={<TopNavHeading heading="App" headingHref="#" />}
        startContent={
          <>
            <TopNavItem label="Home" href="#" isSelected />
            <TopNavMegaMenu
              label="Features"
              items={
                <>
                  <TopNavMegaMenuItem
                    title="Dashboard"
                    description="Overview of your key metrics"
                    icon={<ChartBarIcon style={{width: 20, height: 20}} />}
                    href="#"
                  />
                  <TopNavMegaMenuItem
                    title="Integrations"
                    description="Connect with your favorite tools"
                    icon={<CodeBracketIcon style={{width: 20, height: 20}} />}
                    href="#"
                  />
                  <TopNavMegaMenuItem
                    title="API Access"
                    description="Programmatic access to all features"
                    icon={<GlobeAltIcon style={{width: 20, height: 20}} />}
                    href="#"
                  />
                </>
              }
            />
          </>
        }
        endContent={<Button label="Sign in" variant="primary" />}
      />
    </div>
  ),
};
