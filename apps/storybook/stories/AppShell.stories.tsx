// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {AppShell} from '@astryxdesign/core/AppShell';
import {Banner} from '@astryxdesign/core/Banner';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {Text} from '@astryxdesign/core/Text';
import {MobileNav} from '@astryxdesign/core/MobileNav';
import {TopNav, TopNavHeading, TopNavItem} from '@astryxdesign/core/TopNav';
import {NavIcon} from '@astryxdesign/core/NavIcon';
import {
  SideNav,
  SideNavHeading,
  SideNavItem,
  SideNavSection,
} from '@astryxdesign/core/SideNav';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';
import * as stylex from '@stylexjs/stylex';
import {
  HomeIcon,
  Cog6ToothIcon,
  ChartBarIcon,
  UserGroupIcon,
  FolderIcon,
  BellIcon,
  QuestionMarkCircleIcon,
  UserCircleIcon,
  Bars3Icon,
  CubeIcon,
  DocumentTextIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import {
  HomeIcon as HomeIconSolid,
  ChartBarIcon as ChartBarIconSolid,
  Cog6ToothIcon as Cog6ToothIconSolid,
  UserGroupIcon as UserGroupIconSolid,
  FolderIcon as FolderIconSolid,
  DocumentTextIcon as DocumentTextIconSolid,
  ShieldCheckIcon as ShieldCheckIconSolid,
} from '@heroicons/react/24/solid';

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  longContent: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 16,
  },
  fieldStack: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 32,
  },
});

// =============================================================================
// Helpers
// =============================================================================

function MockContent({paragraphs = 3}: {paragraphs?: number}) {
  return (
    <>
      <Text type="large">Page Content</Text>
      <div {...stylex.props(styles.longContent)}>
        {Array.from({length: paragraphs}, (_, i) => (
          <Text type="body" key={i}>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do
            eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim
            ad minim veniam, quis nostrud exercitation ullamco laboris.
          </Text>
        ))}
      </div>
    </>
  );
}

// =============================================================================
// Shared nav elements
// =============================================================================

/**
 * Standard TopNav used across multiple stories.
 * Provides app identity (logo + heading) and top-level navigation.
 */
function AppTopNav({
  endContent,
  heading = 'Acme App',
}: {
  endContent?: React.ReactNode;
  heading?: string;
}) {
  return (
    <TopNav
      label="Main navigation"
      heading={
        <TopNavHeading
          heading={heading}
          logo={<NavIcon icon={<CubeIcon style={{width: 16, height: 16}} />} />}
        />
      }
      startContent={
        <>
          <TopNavItem label="Home" href="#" isSelected />
          <TopNavItem label="Products" href="#" />
          <TopNavItem label="Docs" href="#" />
        </>
      }
      endContent={
        endContent ?? (
          <Button
            label="Profile"
            variant="ghost"
            icon={<UserCircleIcon style={{width: 16, height: 16}} />}
            isIconOnly
          />
        )
      }
    />
  );
}

/**
 * SideNav WITHOUT header — for use alongside a TopNav.
 * The TopNav already displays the app name, so the SideNav omits its header
 * to avoid doubling the identity.
 */
function SideNavWithoutHeader({
  collapsible,
}: {
  collapsible?: React.ComponentProps<typeof SideNav>['collapsible'];
}) {
  return (
    <SideNav collapsible={collapsible}>
      <SideNavSection title="Main" isHeaderHidden>
        <SideNavItem
          label="Dashboard"
          icon={HomeIcon}
          selectedIcon={HomeIconSolid}
          isSelected
          href="#"
        />
        <SideNavItem
          label="Analytics"
          icon={ChartBarIcon}
          selectedIcon={ChartBarIconSolid}
          href="#"
        />
        <SideNavItem
          label="Projects"
          icon={FolderIcon}
          selectedIcon={FolderIconSolid}
          href="#"
          endContent={<Badge label={12} />}
        />
      </SideNavSection>
      <SideNavSection title="Organization">
        <SideNavItem
          label="Team"
          icon={UserGroupIcon}
          selectedIcon={UserGroupIconSolid}
          href="#"
        />
        <SideNavItem
          label="Settings"
          icon={Cog6ToothIcon}
          selectedIcon={Cog6ToothIconSolid}
          href="#"
        />
      </SideNavSection>
    </SideNav>
  );
}

/**
 * SideNav WITH header — for standalone use without a TopNav.
 * The heading provides app identity (icon + heading) since there's no TopNav.
 */
function SideNavWithHeader() {
  return (
    <SideNav
      header={
        <SideNavHeading
          icon={<NavIcon icon={<CubeIcon style={{width: 16, height: 16}} />} />}
          heading="Acme App"
          headingHref="#"
        />
      }>
      <SideNavSection title="Main" isHeaderHidden>
        <SideNavItem
          label="Dashboard"
          icon={HomeIcon}
          selectedIcon={HomeIconSolid}
          isSelected
          href="#"
        />
        <SideNavItem
          label="Analytics"
          icon={ChartBarIcon}
          selectedIcon={ChartBarIconSolid}
          href="#"
        />
        <SideNavItem
          label="Projects"
          icon={FolderIcon}
          selectedIcon={FolderIconSolid}
          href="#"
          endContent={<Badge label={12} />}
        />
      </SideNavSection>
      <SideNavSection title="Organization">
        <SideNavItem
          label="Team"
          icon={UserGroupIcon}
          selectedIcon={UserGroupIconSolid}
          href="#"
        />
        <SideNavItem
          label="Settings"
          icon={Cog6ToothIcon}
          selectedIcon={Cog6ToothIconSolid}
          href="#"
        />
      </SideNavSection>
    </SideNav>
  );
}

// =============================================================================
// Meta
// =============================================================================

const meta: Meta<typeof AppShell> = {
  title: 'Core/AppShell',
  component: AppShell,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    // AppShell sizes itself to the viewport: no story gutter around it.
    pageFrame: true,
  },
  argTypes: {
    height: {
      control: 'radio',
      options: ['fill', 'auto'],
    },
    variant: {
      control: 'radio',
      options: ['wash', 'surface', 'section', 'elevated'],
      description: 'Navigation background style',
    },
  },
};

export default meta;
type Story = StoryObj<typeof AppShell>;

// =============================================================================
// Playground (interactive controls)
// =============================================================================

/**
 * Interactive playground with controls for toggling top nav and side nav.
 * When top nav is turned off, the side nav automatically shows a header
 * with the app title since there's no top bar to display it.
 */
export const Playground: StoryObj<typeof AppShell> = {
  argTypes: {
    variant: {
      control: 'radio',
      options: ['wash', 'surface', 'section', 'elevated'],
      description: 'Navigation background style',
    },
    height: {
      control: 'radio',
      options: ['fill', 'auto'],
    },
  },
  args: {
    variant: 'elevated',
    height: 'fill',
  },
  render: function PlaygroundStory(args) {
    return (
      <AppShell
        contentPadding={6}
        topNav={<AppTopNav />}
        sideNav={<SideNavWithoutHeader />}
        variant={args.variant}
        height={args.height}>
        <MockContent />
      </AppShell>
    );
  },
};

// =============================================================================
// Stories
// =============================================================================

/**
 * The most common layout: TopNav provides app identity, SideNav provides
 * page-level navigation. The SideNav omits its header to avoid doubling
 * the app name that's already in the TopNav.
 */
export const TopNavWithSideNav: Story = {
  render: () => (
    <AppShell
      contentPadding={6}
      topNav={<AppTopNav />}
      sideNav={<SideNavWithoutHeader />}>
      <MockContent />
    </AppShell>
  ),
};

/**
 * A long app name on a phone. The heading truncates with an ellipsis so the
 * end content and the menu toggle stay inside the bar.
 */
export const LongHeadingOnMobile: Story = {
  globals: {viewport: {value: 'mobile1', isRotated: false}},
  render: () => (
    <AppShell
      contentPadding={6}
      topNav={
        <AppTopNav
          heading="Northwind Internal Usage Analytics"
          endContent={
            <>
              <Button
                label="Notifications"
                variant="ghost"
                icon={<BellIcon style={{width: 16, height: 16}} />}
                isIconOnly
              />
              <Button
                label="Profile"
                variant="ghost"
                icon={<UserCircleIcon style={{width: 16, height: 16}} />}
                isIconOnly
              />
            </>
          }
        />
      }
      sideNav={<SideNavWithoutHeader />}>
      <MockContent />
    </AppShell>
  ),
};

/**
 * SideNav with its own heading (icon + heading) and no TopNav.
 * Use this layout for simpler apps where a full top bar isn't needed.
 * The SideNav header provides the app identity instead.
 */
export const SideNavOnly: Story = {
  render: () => (
    <AppShell contentPadding={6} sideNav={<SideNavWithHeader />}>
      <MockContent />
    </AppShell>
  ),
};

/**
 * TopNav with no side navigation. Suitable for landing pages,
 * simple apps, or pages that don't need secondary navigation.
 */
export const TopNavOnly: Story = {
  render: () => (
    <AppShell contentPadding={6} topNav={<AppTopNav />}>
      <MockContent paragraphs={5} />
    </AppShell>
  ),
};

/**
 * Kitchen sink: TopNav + SideNav with sections, nested items, badges,
 * footer icons, and a banner. Demonstrates all AppShell zones working
 * together.
 *
 * Note: The SideNav has no header because the TopNav already shows
 * the app identity.
 */
export const FullFeatured: Story = {
  render: () => (
    <AppShell
      contentPadding={6}
      topNav={<AppTopNav />}
      sideNav={
        <SideNav
          footerIcons={
            <>
              <Button
                label="Help"
                variant="ghost"
                icon={
                  <QuestionMarkCircleIcon style={{width: 16, height: 16}} />
                }
                isIconOnly
              />
              <Button
                label="Notifications"
                variant="ghost"
                icon={<BellIcon style={{width: 16, height: 16}} />}
                isIconOnly
              />
              <Button
                label="Profile"
                variant="ghost"
                icon={<UserCircleIcon style={{width: 16, height: 16}} />}
                isIconOnly
              />
            </>
          }>
          <SideNavSection title="Main" isHeaderHidden>
            <SideNavItem
              label="Dashboard"
              icon={HomeIcon}
              selectedIcon={HomeIconSolid}
              isSelected
              href="#"
            />
            <SideNavItem
              label="Analytics"
              icon={ChartBarIcon}
              selectedIcon={ChartBarIconSolid}
              href="#"
              endContent={<Badge variant="info" label="New" />}
            />
            <SideNavItem
              label="Projects"
              icon={FolderIcon}
              selectedIcon={FolderIconSolid}
              href="#"
              endContent={<Badge label={12} />}
            />
          </SideNavSection>
          <SideNavSection title="Organization">
            <SideNavItem
              label="Team"
              icon={UserGroupIcon}
              selectedIcon={UserGroupIconSolid}
              href="#"
            />
            <SideNavItem
              label="Settings"
              icon={Cog6ToothIcon}
              selectedIcon={Cog6ToothIconSolid}
              href="#">
              <SideNavItem label="General" href="#" />
              <SideNavItem label="Security" href="#" />
              <SideNavItem label="Integrations" href="#" />
            </SideNavItem>
          </SideNavSection>
          <SideNavSection title="Resources">
            <SideNavItem
              label="Documentation"
              icon={DocumentTextIcon}
              selectedIcon={DocumentTextIconSolid}
              href="#"
            />
            <SideNavItem
              label="Compliance"
              icon={ShieldCheckIcon}
              selectedIcon={ShieldCheckIconSolid}
              href="#"
              isDisabled
            />
          </SideNavSection>
        </SideNav>
      }
      banner={
        <Banner
          status="info"
          container="section"
          title="System maintenance scheduled"
          description="The system will undergo maintenance tonight at 10pm UTC."
          isDismissable
        />
      }>
      <MockContent />
    </AppShell>
  ),
};

/**
 * Auto height mode — the shell grows with content instead of filling
 * the viewport. Uses TopNav + SideNav (no SideNav header).
 */
export const AutoHeight: Story = {
  render: () => (
    <AppShell
      contentPadding={6}
      topNav={<AppTopNav />}
      sideNav={<SideNavWithoutHeader />}
      height="auto">
      <MockContent paragraphs={20} />
    </AppShell>
  ),
};

/**
 * Auto height mode with Field-based inputs. Scroll the inputs under the
 * sticky header — the header must stay above the input surfaces. Field
 * contains its local stacking layers at its own surface (AST-027), so the
 * header needs no escalated z-index: the detached variant's input wrapper
 * z-index is local to the field and cannot compete with page-level stacking.
 */
export const AutoHeightWithFields: Story = {
  render: () => (
    <AppShell contentPadding={6} topNav={<AppTopNav />} height="auto">
      <div {...stylex.props(styles.fieldStack)}>
        <TextArea label="Question" value="" onChange={() => {}} />
        <TextArea
          label="Detached question"
          statusVariant="detached"
          value=""
          onChange={() => {}}
        />
        <TextInput
          label="Detached name"
          statusVariant="detached"
          value=""
          onChange={() => {}}
        />
        <MockContent paragraphs={20} />
      </div>
    </AppShell>
  ),
};

/**
 * Controlled collapse with external state.
 *
 * The toggle button lives in the TopNav. The sidebar auto-collapses
 * at the configured breakpoint. AppShell handles collapse and mobile
 * overlay internally based on viewport size.
 */
export const ControlledCollapse: Story = {
  render: function ControlledCollapseStory() {
    const [isCollapsed, setIsCollapsed] = useState(false);
    return (
      <AppShell
        contentPadding={6}
        topNav={
          <TopNav
            label="Main navigation"
            heading={<TopNavHeading heading="Acme App" />}
            endContent={
              <Button
                label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                variant="ghost"
                icon={<Bars3Icon style={{width: 16, height: 16}} />}
                isIconOnly
                onClick={() => setIsCollapsed(collapsed => !collapsed)}
              />
            }
          />
        }
        sideNav={
          <SideNavWithoutHeader
            collapsible={{
              isCollapsed,
              onCollapsedChange: setIsCollapsed,
              hasButton: false,
            }}
          />
        }>
        <MockContent />
      </AppShell>
    );
  },
};

/** Placeholder page text only: long lines that rewrap as the rail moves. */
function PlaceholderPageText() {
  return (
    <div {...stylex.props(styles.longContent)}>
      <Text type="large">Quarterly planning</Text>
      <Text type="body">
        Twelve projects are active this quarter and three are archived. Each
        card shows its owner, its last update and its next milestone, so a long
        description wraps to the width of the page.
      </Text>
      <Text type="body">
        Collapse the side navigation and the page gets wider: these sentences
        rewrap. The old wrapping fades out while the new one fades in, as both
        slide with the rail on one motion. Expand it again and they slide back.
      </Text>
      <Text type="body">
        Nothing animates a width: the layout takes its final size at once, the
        rail covers or reveals its labels with a clip, and it ends in the real
        collapsed state, icons only.
      </Text>
    </div>
  );
}

/**
 * The rail-collapse stories' code as an app writes it, for the docs' code
 * panel (Storybook's own source would show the story object around it).
 * SYNC: When modified, update the render of RailCollapseMotion and
 * RailCollapseMotionPhone, which run exactly this.
 */
const RAIL_COLLAPSE_CODE = `function App() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  return (
    <AppShell
      contentPadding={6}
      mobileNav={{breakpoint: 'none'}}
      sideNav={
        <SideNav collapsible={{isCollapsed, onCollapsedChange: setIsCollapsed}}>
          <SideNavSection title="Main" isHeaderHidden>
            <SideNavItem
              label="Dashboard"
              icon={HomeIcon}
              selectedIcon={HomeIconSolid}
              isSelected
              href="#"
            />
            <SideNavItem
              label="Analytics"
              icon={ChartBarIcon}
              selectedIcon={ChartBarIconSolid}
              href="#"
            />
            <SideNavItem
              label="Projects"
              icon={FolderIcon}
              selectedIcon={FolderIconSolid}
              href="#"
              endContent={<Badge label={12} />}
            />
          </SideNavSection>
          <SideNavSection title="Organization">
            <SideNavItem
              label="Team"
              icon={UserGroupIcon}
              selectedIcon={UserGroupIconSolid}
              href="#"
            />
            <SideNavItem
              label="Settings"
              icon={Cog6ToothIcon}
              selectedIcon={Cog6ToothIconSolid}
              href="#"
            />
          </SideNavSection>
        </SideNav>
      }>
      <PlaceholderPageText />
    </AppShell>
  );
}`;

/**
 * The side nav's collapse motion (`component:SideNav` FR6,
 * `component:AppShell` FR17): an AppShell with a collapsible SideNav whose
 * collapsed state the app holds. Press the collapse button at the bottom of
 * the rail: the layout snaps, the rail covers or reveals its labels with a
 * clip, and the page's old and new wrapping cross-fade as they slide on one
 * motion. Reduce Motion cross-fades with a finger and changes at once with a
 * mouse.
 */
export const RailCollapseMotion: Story = {
  name: 'Rail collapse motion',
  parameters: {docs: {source: {code: RAIL_COLLAPSE_CODE, language: 'tsx'}}},
  render: function RailCollapseMotionStory() {
    const [isCollapsed, setIsCollapsed] = useState(false);
    return (
      <AppShell
        contentPadding={6}
        mobileNav={{breakpoint: 'none'}}
        sideNav={
          <SideNav
            collapsible={{isCollapsed, onCollapsedChange: setIsCollapsed}}>
            <SideNavSection title="Main" isHeaderHidden>
              <SideNavItem
                label="Dashboard"
                icon={HomeIcon}
                selectedIcon={HomeIconSolid}
                isSelected
                href="#"
              />
              <SideNavItem
                label="Analytics"
                icon={ChartBarIcon}
                selectedIcon={ChartBarIconSolid}
                href="#"
              />
              <SideNavItem
                label="Projects"
                icon={FolderIcon}
                selectedIcon={FolderIconSolid}
                href="#"
                endContent={<Badge label={12} />}
              />
            </SideNavSection>
            <SideNavSection title="Organization">
              <SideNavItem
                label="Team"
                icon={UserGroupIcon}
                selectedIcon={UserGroupIconSolid}
                href="#"
              />
              <SideNavItem
                label="Settings"
                icon={Cog6ToothIcon}
                selectedIcon={Cog6ToothIconSolid}
                href="#"
              />
            </SideNavSection>
          </SideNav>
        }>
        <PlaceholderPageText />
      </AppShell>
    );
  },
};

/**
 * The same motion on a phone: `mobileNav={{breakpoint: 'none'}}` keeps the
 * rail inline at 390 px instead of the mobile drawer.
 */
export const RailCollapseMotionPhone: Story = {
  name: 'Rail collapse motion (phone)',
  globals: {viewport: {value: 'mobile1', isRotated: false}},
  parameters: {docs: {source: {code: RAIL_COLLAPSE_CODE, language: 'tsx'}}},
  render: function RailCollapseMotionPhoneStory() {
    const [isCollapsed, setIsCollapsed] = useState(false);
    return (
      <AppShell
        contentPadding={6}
        mobileNav={{breakpoint: 'none'}}
        sideNav={
          <SideNav
            collapsible={{isCollapsed, onCollapsedChange: setIsCollapsed}}>
            <SideNavSection title="Main" isHeaderHidden>
              <SideNavItem
                label="Dashboard"
                icon={HomeIcon}
                selectedIcon={HomeIconSolid}
                isSelected
                href="#"
              />
              <SideNavItem
                label="Analytics"
                icon={ChartBarIcon}
                selectedIcon={ChartBarIconSolid}
                href="#"
              />
              <SideNavItem
                label="Projects"
                icon={FolderIcon}
                selectedIcon={FolderIconSolid}
                href="#"
                endContent={<Badge label={12} />}
              />
            </SideNavSection>
            <SideNavSection title="Organization">
              <SideNavItem
                label="Team"
                icon={UserGroupIcon}
                selectedIcon={UserGroupIconSolid}
                href="#"
              />
              <SideNavItem
                label="Settings"
                icon={Cog6ToothIcon}
                selectedIcon={Cog6ToothIconSolid}
                href="#"
              />
            </SideNavSection>
          </SideNav>
        }>
        <PlaceholderPageText />
      </AppShell>
    );
  },
};

/**
 * No navigation at all — just content. Useful for full-bleed pages,
 * auth screens, or embedded views.
 */
export const ContentOnly: Story = {
  render: () => (
    <AppShell contentPadding={6}>
      <MockContent paragraphs={5} />
    </AppShell>
  ),
};

/**
 * Banner with TopNav + SideNav. Shows how the banner sits between
 * the TopNav and the content/sidenav area.
 */
export const WithBanner: Story = {
  render: () => (
    <AppShell
      contentPadding={6}
      topNav={<AppTopNav />}
      sideNav={<SideNavWithoutHeader />}
      banner={
        <Banner
          status="info"
          container="section"
          title="System maintenance scheduled"
          description="The system will undergo maintenance tonight at 10pm UTC."
          isDismissable
        />
      }>
      <MockContent />
    </AppShell>
  ),
};

/**
 * Responsive layout with mobile navigation drawer. Shows the recommended
 * pattern for apps that need to work across desktop and mobile:
 *
 * - Desktop (>768px): Standard AppShell with TopNav + inline SideNav
 * - Mobile (≤768px): SideNav hides, TopNav shows a hamburger button that
 *   opens the `mobileNav` drawer (an MobileNav rendered by AppShell)
 *
 * The nav sections are defined once and shared between `sideNav` and
 * `mobileNav`. AppShell handles rendering the MobileNav internally —
 * you just pass the content and control open/close state.
 *
 * Resize the viewport or use Storybook's viewport addon to see the
 * transition between layouts.
 */
export const WithMobileNav: Story = {
  name: 'With Mobile Nav',
  render: function WithMobileNavStory() {
    const isMobile = useMediaQuery('(max-width: 768px)');
    const [mobileNavOpen, setMobileNavOpen] = useState(false);

    const navSections = (
      <>
        <SideNavSection title="Main" isHeaderHidden>
          <SideNavItem
            label="Dashboard"
            icon={HomeIcon}
            selectedIcon={HomeIconSolid}
            isSelected
            href="#"
          />
          <SideNavItem
            label="Analytics"
            icon={ChartBarIcon}
            selectedIcon={ChartBarIconSolid}
            href="#"
          />
          <SideNavItem
            label="Projects"
            icon={FolderIcon}
            selectedIcon={FolderIconSolid}
            href="#"
            endContent={<Badge label={12} />}
          />
        </SideNavSection>
        <SideNavSection title="Organization">
          <SideNavItem
            label="Team"
            icon={UserGroupIcon}
            selectedIcon={UserGroupIconSolid}
            href="#"
          />
          <SideNavItem
            label="Settings"
            icon={Cog6ToothIcon}
            selectedIcon={Cog6ToothIconSolid}
            href="#"
          />
        </SideNavSection>
      </>
    );

    return (
      <AppShell
        contentPadding={6}
        topNav={
          <TopNav
            label="Main navigation"
            heading={
              <TopNavHeading
                heading="Acme App"
                logo={
                  <NavIcon
                    icon={<CubeIcon style={{width: 16, height: 16}} />}
                  />
                }
              />
            }
            startContent={
              isMobile ? (
                <Button
                  label="Menu"
                  variant="ghost"
                  icon={<Icon icon="menu" color="inherit" />}
                  onClick={() => setMobileNavOpen(true)}
                  isIconOnly
                />
              ) : (
                <>
                  <TopNavItem label="Home" href="#" isSelected />
                  <TopNavItem label="Products" href="#" />
                  <TopNavItem label="Docs" href="#" />
                </>
              )
            }
            endContent={
              <>
                <Button
                  label="Notifications"
                  variant="ghost"
                  icon={<BellIcon style={{width: 16, height: 16}} />}
                  isIconOnly
                />
                <Button
                  label="Profile"
                  variant="ghost"
                  icon={<UserCircleIcon style={{width: 16, height: 16}} />}
                  isIconOnly
                />
              </>
            }
          />
        }
        sideNav={<SideNav>{navSections}</SideNav>}
        mobileNav={
          <MobileNav
            isOpen={mobileNavOpen}
            onOpenChange={open => setMobileNavOpen(open)}
            header="Acme App">
            {navSections}
          </MobileNav>
        }>
        <MockContent />
      </AppShell>
    );
  },
};
