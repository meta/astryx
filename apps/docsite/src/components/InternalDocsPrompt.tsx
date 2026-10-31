// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @input Build target, exact-origin reachability, and the current docs view
 * @output The internal-docs banner after reachability, otherwise the public Canary banner
 * @position Root-owned detection; banner content lives in the page shell
 */

import {createContext, Suspense, useContext, type ReactNode} from 'react';
import {usePathname, useSearchParams} from 'next/navigation';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {CURRENT_TARGET, urlForTarget} from '../lib/docsVersions';
import {
  INTERNAL_DOCS_ORIGIN,
  useInternalDocsPrompt,
} from '../lib/useInternalDocsPrompt';

const ReachabilityContext = createContext(false);

export function InternalDocsReachabilityProvider({
  children,
}: {
  children: ReactNode;
}) {
  const isReachable = useInternalDocsPrompt();
  return (
    <ReachabilityContext value={isReachable}>{children}</ReachabilityContext>
  );
}

export function internalDocsHref(pathname: string, search: string): string {
  // Shared route families use the same topic/name/slug semantics. Public-only
  // pages (blog, community, changelog, preview) have no same-path counterpart.
  const hasCounterpart =
    pathname === '/' ||
    /^\/(docs|components|templates)(\/[^/]+)?\/?$/.test(pathname) ||
    /^\/(themes|playground)\/?$/.test(pathname);
  const url = new URL(INTERNAL_DOCS_ORIGIN);
  if (hasCounterpart) {
    url.pathname = pathname;
    url.search = search;
  }
  return url.href;
}

export function DocsBanner() {
  return (
    <Suspense fallback={<CanaryNotice />}>
      <InternalDocsPrompt />
    </Suspense>
  );
}

function CanaryNotice() {
  const pathname = usePathname();
  return CURRENT_TARGET === 'canary' ? (
    <DocsInfoBanner productionHref={urlForTarget('latest', pathname)} />
  ) : null;
}

export function InternalDocsPrompt() {
  const isReachable = useContext(ReachabilityContext);
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const isCanary = CURRENT_TARGET === 'canary';
  const view = `${pathname}${search ? `?${search}` : ''}`;

  return isCanary || isReachable ? (
    <DocsInfoBanner
      key={view}
      internalHref={
        isReachable ? internalDocsHref(pathname, search) : undefined
      }
      productionHref={isCanary ? urlForTarget('latest', view) : null}
    />
  ) : null;
}

function DocsInfoBanner({
  internalHref,
  productionHref,
}: {
  internalHref?: string;
  productionHref: string | null;
}) {
  const isCanary = CURRENT_TARGET === 'canary';
  return (
    <Banner
      role="region"
      aria-label="Documentation notice"
      container="section"
      status={internalHref ? 'info' : 'warning'}
      isDismissable
      dismissLabel="Dismiss documentation notice for this page view"
      title={
        internalHref
          ? 'Working on Meta internal tools?'
          : "You're viewing Canary docs"
      }
      description={
        <>
          {internalHref &&
            'Meta internal docs include Meta-specific components and guidance.'}
          {isCanary && internalHref && <br />}
          {isCanary && (
            <>
              These docs may include unreleased components and props. View
              production docs for the latest stable release.
            </>
          )}
        </>
      }
      endContent={
        <>
          {internalHref && (
            <Button
              label="Meta internal docs"
              variant="secondary"
              href={internalHref}
            />
          )}
          {productionHref && (
            <Button
              label="View production"
              variant="secondary"
              href={productionHref}
            />
          )}
        </>
      }
    />
  );
}
