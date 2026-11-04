// Copyright (c) Meta Platforms, Inc. and affiliates.

import {AppShell} from '@astryxdesign/core/AppShell';
import {SharedTopNav} from '../../components/SharedTopNav';
import {DocsBanner} from '../../components/InternalDocsPrompt';
import {SiteFooter} from '../../components/SiteFooter';
import {getCopyrightYear} from '../../lib/copyrightYear';
import styles from './layout.module.css';

export default async function MarketingLayout({
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
      <div className={styles.shell}>
        <div className={styles.main}>{children}</div>
        <div className={styles.footer}>
          <SiteFooter year={year} />
        </div>
      </div>
    </AppShell>
  );
}
