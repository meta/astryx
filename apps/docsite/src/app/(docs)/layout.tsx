// Copyright (c) Meta Platforms, Inc. and affiliates.

import {DocsShell} from '../../components/DocsShell';
import {SiteFooter} from '../../components/SiteFooter';
import {getCopyrightYear} from '../../lib/copyrightYear';
import {getDocsNav} from '../../components/docsNav';

export default async function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const year = await getCopyrightYear();

  return (
    <DocsShell nav={getDocsNav()}>
      {children}
      <SiteFooter year={year} />
    </DocsShell>
  );
}
