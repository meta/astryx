// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import type {AnchorHTMLAttributes} from 'react';
import {Link, LinkProvider} from '@astryxdesign/core/Link';
import {useToast} from '@astryxdesign/core/Toast';

/**
 * A stand-in for a framework router link (e.g. Next.js `Link` or React
 * Router `Link`). Instead of letting the browser do a full-page navigation,
 * it intercepts the click and hands the destination to a custom handler —
 * the same hook real routers use for client-side navigation. Here it just
 * announces the target so the behavior swap is observable in the preview.
 */
function RouterLink({
  href,
  onClick,
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const showToast = useToast();
  return (
    <a
      href={href}
      onClick={e => {
        e.preventDefault();
        onClick?.(e);
        showToast({body: `Demo: your router would navigate to ${href} here`});
      }}
      {...props}>
      {children}
    </a>
  );
}

export default function LinkProviderCustomLink() {
  return (
    <LinkProvider component={RouterLink}>
      <Link href="/dashboard" isStandalone>
        Go to dashboard
      </Link>
    </LinkProvider>
  );
}
