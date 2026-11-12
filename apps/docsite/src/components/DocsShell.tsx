// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file DocsShell.tsx
 * @input Route metadata, the server-built docs nav model, and the AppShell header
 * @output Docs navigation with a stable sidebar offset before hydration
 * @position Docsite-only shell
 */

import {useState, useMemo} from 'react';
import {usePathname} from 'next/navigation';
import {Search, FlaskConical} from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import {AppShell} from '@astryxdesign/core/AppShell';
import {SideNav, SideNavItem, SideNavSection} from '@astryxdesign/core/SideNav';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Icon} from '@astryxdesign/core/Icon';
import {SharedTopNav} from './SharedTopNav';
import {HeaderHeightSeed} from './HeaderHeightSeed';
import {DocsBanner} from './InternalDocsPrompt';
import type {
  DocsNav,
  DocsNavEntry,
  DocsNavGroup,
  DocsNavItem,
  DocsNavPackage,
} from './docsNav';
import {docsSidebarGroups} from './docsSidebarData';
import {DocsSidebarItems} from './DocsSidebarItems';

interface DocsShellProps {
  children: React.ReactNode;
  nav: DocsNav;
}

const styles = stylex.create({
  canaryMarker: {
    alignItems: 'center',
    display: 'inline-flex',
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
});

// A component and the group of its hooks can share a name.
// Sibling rows with one key outlive the list that rendered them, so the two
// kinds of row never share a key.
const entryKey = (entry: DocsNavEntry) =>
  `entry:${entry.packageName}:${entry.name}`;
const groupKey = (group: DocsNavGroup) =>
  `group:${group.packageName}:${group.label}`;

function CanaryCategoryMarker() {
  return (
    <span {...stylex.props(styles.canaryMarker)}>
      <Icon icon={FlaskConical} label="Canary" size="sm" />
    </span>
  );
}

// ── Shell ──────────────────────────────────────────────────────────────

export function DocsShell({children, nav}: DocsShellProps) {
  const pathname = usePathname();
  const [componentQuery, setComponentQuery] = useState('');

  const {packages, docTopics, componentItems, utilities, canaryCategories} =
    nav;

  const q = componentQuery.trim().toLowerCase();

  // When searching, flatten every readiness category to individual entries so
  // results are all at the same level with no nesting.
  const flatSearchResults = useMemo<DocsNavEntry[]>(() => {
    if (!q) {
      return [];
    }
    const allItems = [
      ...componentItems,
      ...canaryCategories.flatMap(category => category.componentItems),
    ];
    return allItems.flatMap(item => {
      if (item.type === 'entry') {
        return item.displayName.toLowerCase().includes(q) ? [item] : [];
      }
      return item.entries.filter(e => e.displayName.toLowerCase().includes(q));
    });
  }, [canaryCategories, componentItems, q]);

  const filteredUtilities = useMemo(() => {
    const allUtilities = [
      ...utilities,
      ...canaryCategories.flatMap(category => category.utilities),
    ];
    return q
      ? allUtilities.filter(u => u.displayName.toLowerCase().includes(q))
      : utilities;
  }, [canaryCategories, utilities, q]);

  // Classify packages
  const isTheme = (p: DocsNavPackage) => p.name.includes('theme-');
  const libraryPackages = packages.filter(p => !isTheme(p) && !p.canaryOnly);
  const canaryPackages = packages.filter(p => !isTheme(p) && p.canaryOnly);

  // Classify doc topics by category (from data).
  const {guide: guideItems, foundations: foundationItems} =
    docsSidebarGroups(docTopics);

  // True for the /components index AND every /components/[name] detail page.
  // On these routes we hide every non-Components section so the sidebar is
  // focused on the component library — the top nav handles cross-area
  // navigation.
  const isOnComponentsRoute = pathname.startsWith('/components');

  const componentSearch = (
    <TextInput
      label="Search components"
      isLabelHidden
      value={componentQuery}
      onChange={setComponentQuery}
      placeholder="Search components…"
      startIcon={Search}
      hasClear
    />
  );

  const renderComponentItems = (items: DocsNavItem[]) =>
    items.map(item =>
      item.type === 'entry' ? (
        <SideNavItem
          key={entryKey(item)}
          label={item.displayName}
          href={item.href}
          isSelected={pathname === item.href}
        />
      ) : (
        <SideNavItem
          key={groupKey(item)}
          label={item.displayName}
          collapsible={{
            defaultIsCollapsed: !item.entries.some(e => pathname === e.href),
          }}>
          {item.entries.map(entry => (
            <SideNavItem
              key={entryKey(entry)}
              label={entry.displayName}
              href={entry.href}
              isSelected={pathname === entry.href}
            />
          ))}
        </SideNavItem>
      ),
    );

  return (
    <AppShell
      className="astryx-docs-shell"
      variant="surface"
      height="auto"
      banner={<DocsBanner />}
      topNav={
        <>
          <SharedTopNav />
          <HeaderHeightSeed />
        </>
      }
      sideNav={
        <SideNav topContent={isOnComponentsRoute ? componentSearch : undefined}>
          {!isOnComponentsRoute && (
            <>
              {/* Getting Started */}
              <SideNavSection title="Documentation" isHeaderHidden>
                <SideNavItem
                  label="Getting Started"
                  href="/docs/getting-started"
                  isSelected={pathname === '/docs/getting-started'}
                />
                <SideNavItem
                  label="What's New"
                  href="/changelog"
                  isSelected={pathname === '/changelog'}
                />
              </SideNavSection>

              {/* Guide */}
              <SideNavSection title="Guide" isHeaderHidden>
                <SideNavItem
                  label="Guide"
                  collapsible={{defaultIsCollapsed: false}}>
                  <DocsSidebarItems items={guideItems} pathname={pathname} />
                </SideNavItem>
              </SideNavSection>

              {/* Foundations */}
              <SideNavSection title="Foundations" isHeaderHidden>
                <SideNavItem
                  label="Foundations"
                  collapsible={{defaultIsCollapsed: false}}>
                  <DocsSidebarItems
                    items={foundationItems}
                    pathname={pathname}
                  />
                </SideNavItem>
              </SideNavSection>

              {/* Stable libraries */}
              <SideNavSection title="Libraries" isHeaderHidden>
                <SideNavItem
                  label="Libraries"
                  collapsible={{defaultIsCollapsed: false}}>
                  {libraryPackages.map(p => (
                    <SideNavItem
                      key={p.name}
                      label={p.name}
                      href={`/docs/${p.name.replace('@astryxdesign/', '')}`}
                      isSelected={
                        pathname ===
                        `/docs/${p.name.replace('@astryxdesign/', '')}`
                      }
                    />
                  ))}
                </SideNavItem>
              </SideNavSection>

              {canaryPackages.length > 0 && (
                <SideNavSection title="Canary libraries" isHeaderHidden>
                  {canaryPackages.map(p => (
                    <SideNavItem
                      key={p.name}
                      label={p.displayName}
                      endContent={<CanaryCategoryMarker />}
                      href={`/docs/${p.name.replace('@astryxdesign/', '')}`}
                      isSelected={
                        pathname ===
                        `/docs/${p.name.replace('@astryxdesign/', '')}`
                      }
                    />
                  ))}
                </SideNavSection>
              )}
            </>
          )}

          {/* Components — only shown on /components routes */}
          {isOnComponentsRoute && (
            <>
              <SideNavSection title="Components" isHeaderHidden>
                {!q && (
                  <SideNavItem
                    label="Overview"
                    href="/components"
                    isSelected={pathname === '/components'}
                  />
                )}
                {q
                  ? flatSearchResults.map(item => (
                      <SideNavItem
                        key={entryKey(item)}
                        label={item.displayName}
                        href={item.href}
                        isSelected={pathname === item.href}
                      />
                    ))
                  : renderComponentItems(componentItems)}
                {/* Utilities — secondary list rendered below the main Components
                    section. Always starts collapsed; users can expand on demand. */}
                {filteredUtilities.length > 0 &&
                  (q ? (
                    filteredUtilities.map(comp => (
                      <SideNavItem
                        key={entryKey(comp)}
                        label={comp.displayName}
                        href={comp.href}
                        isSelected={pathname === comp.href}
                      />
                    ))
                  ) : (
                    <SideNavItem
                      label="Utilities"
                      collapsible={{defaultIsCollapsed: true}}>
                      {utilities.map(comp => (
                        <SideNavItem
                          key={entryKey(comp)}
                          label={comp.displayName}
                          href={comp.href}
                          isSelected={pathname === comp.href}
                        />
                      ))}
                    </SideNavItem>
                  ))}
              </SideNavSection>

              {!q && canaryCategories.length > 0 && (
                <SideNavSection title="Canary components" isHeaderHidden>
                  {canaryCategories.map(category => (
                    <SideNavItem
                      key={category.packageName}
                      label={category.displayName}
                      endContent={<CanaryCategoryMarker />}
                      collapsible={{
                        defaultIsCollapsed: ![
                          ...category.componentItems.flatMap(item =>
                            item.type === 'entry' ? [item] : item.entries,
                          ),
                          ...category.utilities,
                        ].some(entry => pathname === entry.href),
                      }}>
                      {renderComponentItems(category.componentItems)}
                      {category.utilities.length > 0 && (
                        <SideNavItem
                          label="Utilities"
                          collapsible={{defaultIsCollapsed: true}}>
                          {category.utilities.map(comp => (
                            <SideNavItem
                              key={entryKey(comp)}
                              label={comp.displayName}
                              href={comp.href}
                              isSelected={pathname === comp.href}
                            />
                          ))}
                        </SideNavItem>
                      )}
                    </SideNavItem>
                  ))}
                </SideNavSection>
              )}
            </>
          )}
        </SideNav>
      }>
      {children}
    </AppShell>
  );
}
