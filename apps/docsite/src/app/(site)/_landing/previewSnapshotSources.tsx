// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The decorative previews the docsite renders once, at build time.
 * @input Page templates from the CLI and the Butter theme showcase content.
 * @output PREVIEW_SNAPSHOT_SOURCES: one React element per preview id.
 * @position Read only by scripts/generate-preview-snapshots.mjs. Never import
 *   it from page code: that ships every template to the browser.
 *   SYNC: TemplatesPreview and the pages that pass the themes store to
 *   ThemesPreview read these ids.
 */

import type {ReactElement} from 'react';
import {
  AppShellMobileContext,
  type AppShellMobileContextValue,
} from '@astryxdesign/core/AppShell';
import {Theme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral/built';
import AiChatLanding from '../../../../../../packages/cli/assets/templates/pages/ai-chat-landing/page';
import Ide from '../../../../../../packages/cli/assets/templates/pages/ide/page';
import LoginSplit from '../../../../../../packages/cli/assets/templates/pages/login-split/page';
import PaymentForm from '../../../../../../packages/cli/assets/templates/pages/payment-form/page';
import ProductDetail from '../../../../../../packages/cli/assets/templates/pages/product-detail/page';
import ProductGallery from '../../../../../../packages/cli/assets/templates/pages/product-gallery/page';
import SettingsSidebar from '../../../../../../packages/cli/assets/templates/pages/settings-sidebar/page';
import {ThemeShowcaseStore} from '../../../../../../packages/cli/assets/templates/pages/theme-showcase/page';
import {getThemeShowcaseContent} from '../../../components/themeShowcaseContent';
import {themeObjects} from '../../../generated/themeRegistry';

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

function templatePreview(Page: () => ReactElement): ReactElement {
  return (
    <Theme theme={neutralTheme}>
      <Page />
    </Theme>
  );
}

export const PREVIEW_SNAPSHOT_SOURCES: Readonly<Record<string, ReactElement>> =
  {
    'product-gallery': templatePreview(ProductGallery),
    ide: templatePreview(Ide),
    'payment-form': templatePreview(PaymentForm),
    'login-split': templatePreview(LoginSplit),
    'settings-sidebar': templatePreview(SettingsSidebar),
    'ai-chat-landing': templatePreview(AiChatLanding),
    'product-detail': templatePreview(ProductDetail),
    'themes-store': (
      <Theme theme={themeObjects['@astryxdesign/theme-butter']}>
        <AppShellMobileContext.Provider value={FORCE_DESKTOP_MOBILE_CONTEXT}>
          <ThemeShowcaseStore {...getThemeShowcaseContent('butter')} />
        </AppShellMobileContext.Provider>
      </Theme>
    ),
  };
