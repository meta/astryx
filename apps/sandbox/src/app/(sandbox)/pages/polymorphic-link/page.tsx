// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {
  useState,
  forwardRef,
  type AnchorHTMLAttributes,
  type ReactNode,
} from 'react';

import {VStack} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Divider} from '@astryxdesign/core';
import {TopNav, TopNavHeading, TopNavItem} from '@astryxdesign/core/TopNav';
import {SideNav, SideNavItem} from '@astryxdesign/core/SideNav';
import {Breadcrumbs, BreadcrumbItem} from '@astryxdesign/core/Breadcrumbs';
import {TabList, Tab} from '@astryxdesign/core/TabList';
import {Link, LinkProvider} from '@astryxdesign/core/Link';
import * as stylex from '@stylexjs/stylex';

// =============================================================================
// Simulated framework link components
// =============================================================================

const styles = stylex.create({
  container: {
    maxWidth: 960,
  },
  navWrapper: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#e0e0e0',
    borderRadius: 8,
    overflow: 'hidden',
  },
  log: {
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    backgroundColor: '#f5f5f5',
    padding: '0.75rem 1rem',
    borderRadius: 6,
    maxHeight: 200,
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
  },
  customLinkIndicator: {
    outline: '2px dashed #3b82f6',
    outlineOffset: -2,
  },
  sidenavWrapper: {
    width: 240,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#e0e0e0',
    borderRadius: 8,
    overflow: 'hidden',
  },
});

/**
 * Simulated Next.js-like Link for demo purposes.
 * Intercepts navigation and logs to console instead of full page reload.
 * Renders with a blue dashed outline to visually identify it.
 */
const SimulatedNextLink = forwardRef<
  HTMLAnchorElement,
  AnchorHTMLAttributes<HTMLAnchorElement> & {children?: ReactNode}
>(function SimulatedNextLink({href, onClick, children, ...props}, ref) {
  return (
    <a
      ref={ref}
      href={href}
      onClick={e => {
        e.preventDefault();

        console.log(`[SimulatedNextLink] Client-side navigate to: ${href}`);
        onClick?.(e);
      }}
      {...stylex.props(styles.customLinkIndicator)}
      {...props}>
      {children}
    </a>
  );
});

/**
 * Another custom link for demonstrating per-component `as` override.
 * Renders with a green dashed outline.
 */
const GreenLink = forwardRef<
  HTMLAnchorElement,
  AnchorHTMLAttributes<HTMLAnchorElement> & {children?: ReactNode}
>(function GreenLink({href, onClick, children, style, ...props}, ref) {
  return (
    <a
      ref={ref}
      href={href}
      onClick={e => {
        e.preventDefault();

        console.log(`[GreenLink] Navigate to: ${href}`);
        onClick?.(e);
      }}
      style={{...style, outline: '2px dashed #22c55e', outlineOffset: -2}}
      {...props}>
      {children}
    </a>
  );
});

// =============================================================================
// Demo page
// =============================================================================

export default function PolymorphicLinkPage() {
  const [tab, setTab] = useState('overview');

  return (
    <div {...stylex.props(styles.container)}>
      <VStack gap={6}>
        <VStack gap={2}>
          <Heading level={1}>Polymorphic Link</Heading>
          <Text type="body" color="secondary">
            Astryx components that render links can use a custom link component
            instead of native {'<a>'}. Set it globally via LinkProvider or
            per-component via the{' '}
            <Text type="body" weight="bold">
              as
            </Text>{' '}
            prop.
          </Text>
        </VStack>

        <Divider />

        {/* ================================================================= */}
        {/* Section 1: Provider Demo */}
        {/* ================================================================= */}
        <VStack gap={3}>
          <Heading level={2}>Provider Demo</Heading>
          <Text type="body" color="secondary">
            All components below are wrapped in{' '}
            <Text type="body" weight="bold">
              LinkProvider
            </Text>{' '}
            with a simulated Next.js Link (blue dashed outline). Open the
            browser console to see navigation logs.
          </Text>

          <LinkProvider component={SimulatedNextLink}>
            <VStack gap={4}>
              {/* TopNav */}
              <VStack gap={1}>
                <Text type="supporting" weight="bold">
                  TopNav
                </Text>
                <div {...stylex.props(styles.navWrapper)}>
                  <TopNav
                    label="Provider demo navigation"
                    heading={<TopNavHeading heading="My App" />}
                    startContent={
                      <>
                        <TopNavItem label="Home" href="/" isSelected />
                        <TopNavItem label="Products" href="/products" />
                        <TopNavItem label="About" href="/about" />
                      </>
                    }
                  />
                </div>
              </VStack>

              {/* Breadcrumbs */}
              <VStack gap={1}>
                <Text type="supporting" weight="bold">
                  Breadcrumbs
                </Text>
                <Breadcrumbs label="Provider breadcrumbs">
                  <BreadcrumbItem href="/">Home</BreadcrumbItem>
                  <BreadcrumbItem href="/products">Products</BreadcrumbItem>
                  <BreadcrumbItem isCurrent>Widget</BreadcrumbItem>
                </Breadcrumbs>
              </VStack>

              {/* TabList */}
              <VStack gap={1}>
                <Text type="supporting" weight="bold">
                  TabList (with href)
                </Text>
                <TabList value={tab} onChange={setTab}>
                  <Tab value="overview" label="Overview" href="/overview" />
                  <Tab value="details" label="Details" href="/details" />
                  <Tab value="reviews" label="Reviews" href="/reviews" />
                </TabList>
              </VStack>

              {/* SideNav */}
              <VStack gap={1}>
                <Text type="supporting" weight="bold">
                  SideNav
                </Text>
                <div {...stylex.props(styles.sidenavWrapper)}>
                  <SideNav aria-label="Provider sidenav">
                    <SideNavItem
                      label="Dashboard"
                      href="/dashboard"
                      isSelected
                    />
                    <SideNavItem label="Settings" href="/settings" />
                    <SideNavItem label="Profile" href="/profile" />
                  </SideNav>
                </div>
              </VStack>

              {/* Link */}
              <VStack gap={1}>
                <Text type="supporting" weight="bold">
                  Link
                </Text>
                <Link href="/docs">Go to documentation</Link>
              </VStack>
            </VStack>
          </LinkProvider>
        </VStack>

        <Divider />

        {/* ================================================================= */}
        {/* Section 2: Per-component `as` override */}
        {/* ================================================================= */}
        <VStack gap={3}>
          <Heading level={2}>Per-Component Override</Heading>
          <Text type="body" color="secondary">
            The{' '}
            <Text type="body" weight="bold">
              as
            </Text>{' '}
            prop overrides the provider for a single component. Below, the
            provider sets the blue link, but &quot;Products&quot; uses a green
            link via{' '}
            <Text type="body" weight="bold">
              as={'{GreenLink}'}
            </Text>
            .
          </Text>

          <LinkProvider component={SimulatedNextLink}>
            <div {...stylex.props(styles.navWrapper)}>
              <TopNav
                label="Override demo navigation"
                heading={<TopNavHeading heading="Override Demo" />}
                startContent={
                  <>
                    <TopNavItem label="Home" href="/" isSelected />
                    <TopNavItem
                      label="Products"
                      href="/products"
                      as={GreenLink}
                    />
                    <TopNavItem label="About" href="/about" />
                  </>
                }
              />
            </div>
          </LinkProvider>
        </VStack>

        <Divider />

        {/* ================================================================= */}
        {/* Section 3: Default behavior (no provider) */}
        {/* ================================================================= */}
        <VStack gap={3}>
          <Heading level={2}>Default Behavior</Heading>
          <Text type="body" color="secondary">
            Without a provider or{' '}
            <Text type="body" weight="bold">
              as
            </Text>{' '}
            prop, components render native {'<a>'} elements as usual.
          </Text>

          <div {...stylex.props(styles.navWrapper)}>
            <TopNav
              label="Default navigation"
              heading={<TopNavHeading heading="Default" />}
              startContent={
                <>
                  <TopNavItem label="Home" href="#home" isSelected />
                  <TopNavItem label="Products" href="#products" />
                  <TopNavItem label="About" href="#about" />
                </>
              }
            />
          </div>

          <Breadcrumbs label="Default breadcrumbs">
            <BreadcrumbItem href="#home">Home</BreadcrumbItem>
            <BreadcrumbItem href="#products">Products</BreadcrumbItem>
            <BreadcrumbItem isCurrent>Current Page</BreadcrumbItem>
          </Breadcrumbs>
        </VStack>
      </VStack>
    </div>
  );
}
