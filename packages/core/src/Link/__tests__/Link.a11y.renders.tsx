// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/** Stable Link renders shared by jsdom, Storybook, and Chromium. */

import type {ComponentProps, MouseEvent, ReactElement} from 'react';
import {Icon} from '../../Icon';
import {Link} from '../Link';
import {LinkProvider} from '../LinkProvider';
import {LINK_A11Y_DESTINATION, type LinkA11yRow} from './Link.a11y.states';

interface NavigationWindow extends Window {
  __a11yLinkNavigations?: number;
}

/**
 * A minimal client-side router link. It takes over activation the way router
 * links do — cancel the browser navigation, then navigate itself — and counts
 * each navigation on the window, where the browser binding reads it.
 */
function RouterLink({onClick, children, ...props}: ComponentProps<'a'>) {
  const navigate = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) {
      return;
    }
    event.preventDefault();
    const target = window as NavigationWindow;
    target.__a11yLinkNavigations = (target.__a11yLinkNavigations ?? 0) + 1;
  };
  return (
    // eslint-disable-next-line @astryx/no-hardcoded-anchor -- this stands in for a third-party router's own anchor, which Link receives through LinkProvider and `as`.
    <a {...props} data-a11y-link-router onClick={navigate}>
      {children}
    </a>
  );
}

/** A tab stop after the link, so focus has somewhere to go when it leaves. */
function Frame({children}: {children: ReactElement}) {
  return (
    <div>
      {children}
      <button type="button">After</button>
    </div>
  );
}

export const LINK_A11Y_RENDERS: Readonly<
  Record<LinkA11yRow['id'], () => ReactElement>
> = {
  'text-native': () => (
    <Frame>
      <Link data-a11y-link href={LINK_A11Y_DESTINATION}>
        Documentation
      </Link>
    </Frame>
  ),
  'icon-labelled': () => (
    <Frame>
      <Link data-a11y-link href={LINK_A11Y_DESTINATION} label="Close dialog">
        <Icon icon="close" />
      </Link>
    </Frame>
  ),
  'current-page': () => (
    <Frame>
      <Link aria-current="page" data-a11y-link href={LINK_A11Y_DESTINATION}>
        Overview
      </Link>
    </Frame>
  ),
  'external-new-tab': () => (
    <Frame>
      <Link data-a11y-link href={LINK_A11Y_DESTINATION} isExternalLink>
        GitHub
      </Link>
    </Frame>
  ),
  'provider-router': () => (
    <LinkProvider component={RouterLink}>
      <Frame>
        <Link data-a11y-link href="/projects">
          Projects
        </Link>
      </Frame>
    </LinkProvider>
  ),
  'as-router': () => (
    <Frame>
      <Link as={RouterLink} data-a11y-link href="/settings">
        Settings
      </Link>
    </Frame>
  ),
};
