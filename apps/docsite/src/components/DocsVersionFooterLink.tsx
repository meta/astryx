// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {usePathname} from 'next/navigation';
import {Link} from '@astryxdesign/core/Link';
import {CURRENT_TARGET, DOCS_VERSIONS, urlForTarget} from '../lib/docsVersions';
import type {DocsTarget} from '../lib/docsVersions';

/**
 * Footer link to the sibling content line: from the Latest (production) site
 * over to the Canary docs, or back again. This is the low-key, persistent way
 * to reach Canary from production; on Canary the docs info banner carries
 * the primary link back to production.
 *
 * Renders nothing when there is no distinct sibling to link to (e.g. a local
 * build where the destination resolves to the current origin).
 */
export function DocsVersionFooterLink() {
  const pathname = usePathname();
  const other: DocsTarget = CURRENT_TARGET === 'latest' ? 'canary' : 'latest';
  const href = urlForTarget(other, pathname);

  if (href == null) {
    return null;
  }

  const label = `${DOCS_VERSIONS[other].label} docs`;

  return (
    <Link href={href} type="supporting" color="secondary" isStandalone>
      {label}
    </Link>
  );
}
