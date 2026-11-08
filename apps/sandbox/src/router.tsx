// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Browser router facade for Sandbox navigation and Astryx LinkProvider.
 * @input React Router basename and relative pathname.
 * @output Base-path-aware href links and pathname/navigation hooks.
 * @position Keeps authored pages base-path-agnostic under root and /sandbox/.
 */

'use client';

import {forwardRef, type ComponentPropsWithoutRef} from 'react';
import {Link, useLocation, useNavigate} from 'react-router-dom';

export const basePath = (import.meta.env.BASE_URL as string).replace(/\/$/, '');

function isExternal(href: string) {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(href);
}

export const SandboxLink = forwardRef<
  HTMLAnchorElement,
  Omit<ComponentPropsWithoutRef<'a'>, 'href'> & {href: string}
>(function SandboxLink({href, ...props}, ref) {
  if (isExternal(href)) {
    return <a ref={ref} href={href} {...props} />;
  }
  // React Router prepends the BrowserRouter basename exactly once. Keep
  // authored hrefs unprefixed; native external/hash links remain untouched.
  return <Link ref={ref} to={href} {...props} />;
});

export default SandboxLink;

export function usePathname() {
  return useLocation().pathname;
}

export function useRouter() {
  const navigate = useNavigate();
  return {push: (href: string) => navigate(href)};
}
