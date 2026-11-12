// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The decorative previews the docsite renders once, at build time.
 * @input The templates card's slugs (templatePreviewRows), their components
 *   from TEMPLATE_COMPONENTS, and the Butter theme showcase content.
 * @output PREVIEW_SNAPSHOT_SOURCES: one React element per preview id.
 * @position Read only by scripts/generate-preview-snapshots.mjs. Never import
 *   it from page code: that ships every template to the browser.
 *   SYNC: the pages that pass the themes store to ThemesPreview read the
 *   'themes-store' id.
 */

import type {ReactElement} from 'react';
import {
  AppShellMobileContext,
  type AppShellMobileContextValue,
} from '@astryxdesign/core/AppShell';
import {Theme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral/built';
import {ThemeShowcaseStore} from '../../../../../../packages/cli/assets/templates/pages/theme-showcase/page';
import {TEMPLATE_COMPONENTS} from '../../../components/templateComponents';
import {getThemeShowcaseContent} from '../../../components/themeShowcaseContent';
import {themeObjects} from '../../../generated/themeRegistry';
import {TEMPLATE_PREVIEW_ROWS} from './templatePreviewRows';

// The store template's internal responsive grids read useAppShellMobile().
// The store is rendered at a fixed 1000px desktop width and scaled down to a
// miniature, so isMobile:false keeps its product grid in the 3-column desktop
// layout.
const FORCE_DESKTOP_MOBILE_CONTEXT: AppShellMobileContextValue = {
  isMobile: false,
  isMobileNavOpen: false,
  toggleMobileNav: () => {},
  openMobileNav: () => {},
  closeMobileNav: () => {},
  isMobileNavEnabled: false,
  hasAutoToggle: false,
};

function templatePreview(slug: string): ReactElement {
  if (!Object.hasOwn(TEMPLATE_COMPONENTS, slug)) {
    throw new Error(`No page template "${slug}" in TEMPLATE_COMPONENTS.`);
  }
  const Page = TEMPLATE_COMPONENTS[slug];
  return (
    <Theme theme={neutralTheme}>
      <Page />
    </Theme>
  );
}

export const PREVIEW_SNAPSHOT_SOURCES: Readonly<Record<string, ReactElement>> =
  {
    ...Object.fromEntries(
      TEMPLATE_PREVIEW_ROWS.flat().map(slug => [slug, templatePreview(slug)]),
    ),
    'themes-store': (
      <Theme theme={themeObjects['@astryxdesign/theme-butter']}>
        <AppShellMobileContext.Provider value={FORCE_DESKTOP_MOBILE_CONTEXT}>
          <ThemeShowcaseStore {...getThemeShowcaseContent('butter')} />
        </AppShellMobileContext.Provider>
      </Theme>
    ),
  };
