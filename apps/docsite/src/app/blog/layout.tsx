// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Page type: blog layout
 * Standalone shell with the shared top nav and NO sidebar (issue #2896:
 * "Avoid traditional blog sidebars"). Mirrors the craft/playground layout.
 */

import {AppShell} from '@astryxdesign/core/AppShell';
import {SharedTopNav} from '../../components/SharedTopNav';
import {DocsBanner} from '../../components/InternalDocsPrompt';
import {SiteFooter} from '../../components/SiteFooter';
import {getCopyrightYear} from '../../lib/copyrightYear';

export default async function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const year = await getCopyrightYear();

  return (
    <AppShell
      variant="surface"
      height="auto"
      mobileNav={false}
      banner={<DocsBanner />}
      topNav={<SharedTopNav />}>
      {children}
      <SiteFooter year={year} />
    </AppShell>
  );
}
