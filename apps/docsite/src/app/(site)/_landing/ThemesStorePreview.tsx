// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The Butter store that the homepage themes card shows.
 * @input The store template (the build stages a copy with the preview
 *   rewrites), and the /themes page's Butter showcase content and photos.
 * @output ThemesStorePreview: the store at its desktop layout.
 * @position Rendered only by scripts/generate-landing-template-previews.mjs,
 *   at build time. The page shows the result through FrozenPreview, so this
 *   module never ships to the browser.
 */

import type {ComponentType} from 'react';
import {
  AppShellMobileContext,
  type AppShellMobileContextValue,
} from '@astryxdesign/core/AppShell';
import type {ThemeShowcaseProps} from '../../../../../../packages/cli/assets/templates/pages/theme-showcase/page';
import {getThemeShowcaseContent} from '../../../components/themeShowcaseContent';

// Butter's bespoke showcase content (breakfast products + inventory), the
// same source of truth the /themes page feeds ThemeShowcaseStore.
// The card shows the store at about a third of its size, so its photos are
// about 100 px wide. These 320 px WebP copies are sharp at 3x pixel density
// and replace the 704 px PNGs.
const butterContent = {
  ...getThemeShowcaseContent('butter'),
  images: {
    watch: '/landing/themes/butter-watch.webp',
    headphones: '/landing/themes/butter-headphones.webp',
    backpack: '/landing/themes/butter-backpack.webp',
    wallet: '/landing/themes/butter-wallet.webp',
    tumbler: '/landing/themes/butter-tumbler.webp',
    throw_: '/landing/themes/butter-throw.webp',
  },
};

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

export default function ThemesStorePreview({
  Store,
}: {
  /** The store template's ThemeShowcaseStore, from the staged copy. */
  Store: ComponentType<ThemeShowcaseProps>;
}) {
  return (
    <AppShellMobileContext.Provider value={FORCE_DESKTOP_MOBILE_CONTEXT}>
      <Store {...butterContent} />
    </AppShellMobileContext.Provider>
  );
}
