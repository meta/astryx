// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Layout of the changelog routes.
 * @input Generated package changelogs
 * @output The What's New title and the package tabs around each changelog page
 * @position Shared by /changelog and every package's release pages
 */

import type {ReactNode} from 'react';
import {ChangelogFrame} from '../../../components/ChangelogView';
import {changelogEntries} from '../../../lib/changelogData';
import {
  changelogPackages,
  defaultChangelogSlug,
} from '../../../lib/changelogPages';

export default function ChangelogLayout({children}: {children: ReactNode}) {
  return (
    <ChangelogFrame
      packages={changelogPackages(changelogEntries)}
      defaultSlug={defaultChangelogSlug(changelogEntries)}>
      {children}
    </ChangelogFrame>
  );
}
