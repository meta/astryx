// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Shared resizable and collapsible sandbox navigation.
 * @input Current route, sandbox navigation registry, and theme controls.
 * @output Grouped SideNav for the AppShell's Sandbox and Audits sections.
 * @position Persistent navigation for the sandbox route group.
 */

'use client';

import {useEffect, useRef, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {usePathname} from '../router';
import Link from '../router';
import {
  SideNav,
  SideNavHeading,
  SideNavItem,
  SideNavSection,
} from '@astryxdesign/core/SideNav';
import {DropdownMenu} from '@astryxdesign/core/DropdownMenu';
import {useThemeControls, SANDBOX_THEMES} from './providers';
import type {ThemeMode} from '@astryxdesign/core/theme';
import type {IconName, IconType} from '@astryxdesign/core/Icon';
import {auditPages, categories, homePage} from './sandboxPages';
import {
  HomeIcon,
  WrenchIcon,
  PaletteIcon,
  SunIcon,
  MoonIcon,
  BoxIcon,
  AppWindowIcon,
  BlocksIcon,
} from './icons';

const categoryIcons: Record<
  string,
  React.ComponentType<React.SVGProps<SVGSVGElement>>
> = {
  'components-patterns': BoxIcon,
  templates: AppWindowIcon,
  blocks: BlocksIcon,
  themes: PaletteIcon,
  tools: WrenchIcon,
};

/**
 * Icons for persistent nav pages, kept here so sandboxPages stays JSX-free —
 * the same split the categories already use.
 *
 * These are icon *types* and semantic *names*, never rendered elements.
 * `SideNavItem` passes its icon through `renderIconSlot`, which applies the
 * nav's `size: 'sm'` and its selected/disabled colour to a component type or a
 * registry name — but hands a ReactNode straight to the DOM untouched. An
 * `<Icon />` element here therefore renders unsized and uncoloured: a ~400px
 * black glyph over the whole sidebar. `scores` is a registry name (T17), not a
 * hand-written SVG.
 */
const navPageIcons: Record<string, IconType | IconName> = {
  home: HomeIcon,
  templates: AppWindowIcon,
  scores: 'checkDouble',
};

const styles = stylex.create({
  controls: {
    display: 'flex',
    gap: 2,
  },
});

function SandboxHeader() {
  const {setThemeName, mode, setMode} = useThemeControls();

  const themeItems = SANDBOX_THEMES.map(({id, label}) => ({
    label,
    onClick: () => setThemeName(id),
  }));

  const modeItems = [
    {label: 'Light', onClick: () => setMode('light' as ThemeMode)},
    {label: 'Dark', onClick: () => setMode('dark' as ThemeMode)},
  ];

  return (
    <SideNavHeading
      heading="Sandbox"
      icon={<BoxIcon width={20} height={20} />}
      headerEndContent={
        <div {...stylex.props(styles.controls)}>
          <DropdownMenu
            button={{
              label: 'Theme',
              icon: (
                <PaletteIcon
                  width={16}
                  height={16}
                  style={{color: 'var(--color-icon-secondary)'}}
                />
              ),
              variant: 'ghost',
              size: 'sm',
              isIconOnly: true,
            }}
            menuWidth={160}
            items={themeItems}
          />
          <DropdownMenu
            button={{
              label: mode === 'dark' ? 'Dark mode' : 'Light mode',
              icon:
                mode === 'dark' ? (
                  <MoonIcon
                    width={16}
                    height={16}
                    style={{color: 'var(--color-icon-secondary)'}}
                  />
                ) : (
                  <SunIcon
                    width={16}
                    height={16}
                    style={{color: 'var(--color-icon-secondary)'}}
                  />
                ),
              variant: 'ghost',
              size: 'sm',
              isIconOnly: true,
            }}
            menuWidth={160}
            items={modeItems}
          />
        </div>
      }
    />
  );
}

/**
 * Tools that carry their own page navigation. Entering one collapses this rail
 * so the two nav levels are not competing for the same edge of the screen; it
 * is a one-shot on entry rather than a lock, so expanding it back inside the
 * tool works and sticks.
 */
const SELF_NAVIGATING_TOOLS = ['/pages/motion-lab'];

export function SandboxNav() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const wasInTool = useRef(false);

  const isInTool = SELF_NAVIGATING_TOOLS.some(p => pathname.startsWith(p));

  useEffect(() => {
    // Only on the transition, so a manual expand inside the tool is not undone
    // on the next route change within it.
    if (isInTool !== wasInTool.current) {
      setIsCollapsed(isInTool);
      wasInTool.current = isInTool;
    }
  }, [isInTool]);

  return (
    <SideNav
      header={<SandboxHeader />}
      collapsible={{isCollapsed, onCollapsedChange: setIsCollapsed}}
      resizable={{
        defaultWidth: 300,
        minWidth: 220,
        maxWidth: 420,
        autoSaveId: 'sandbox-side-nav',
      }}>
      <SideNavSection title="Sandbox">
        <SideNavItem
          label={homePage.label}
          href={homePage.href}
          isSelected={pathname === homePage.href}
          as={Link}
          icon={navPageIcons[homePage.icon]}
        />
        {categories
          .filter(c => c.slug !== 'templates')
          .map(category => {
            const href = '/' + category.slug + '/';
            const IconComponent = categoryIcons[category.slug];
            return (
              <SideNavItem
                key={category.slug}
                label={category.label}
                href={href}
                isSelected={pathname === href}
                as={Link}
                icon={IconComponent}
              />
            );
          })}
      </SideNavSection>
      <SideNavSection title="Audits">
        {auditPages.map(page => (
          <SideNavItem
            key={page.href}
            label={page.label}
            href={page.href}
            isSelected={
              page.matchesChildren
                ? pathname.startsWith(page.href)
                : pathname === page.href
            }
            as={Link}
            icon={navPageIcons[page.icon]}
          />
        ))}
      </SideNavSection>
    </SideNav>
  );
}
