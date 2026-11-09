// Copyright (c) Meta Platforms, Inc. and affiliates.

import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import NextLink from 'next/link';
import {describe, expect, it} from 'vitest';
import {LinkProvider} from '../../../../packages/core/src/Link/LinkProvider';
import {useLinkComponent} from '../../../../packages/core/src/Link/useLinkComponent';

function Navigation({href, to}: {href: unknown; to?: unknown}) {
  const Link = useLinkComponent();
  return createElement(Link, {href, to, 'data-testid': 'destination'}, 'Go');
}

function renderNavigation(href: unknown, to?: unknown) {
  return renderToStaticMarkup(
    createElement(LinkProvider, {
      component: NextLink,
      children: createElement(Navigation, {href, to}),
    }),
  );
}

describe('LinkProvider with the actual Next.js Link during SSR', () => {
  it.each([
    'javascript:alert(1)',
    'vbscript:MsgBox(1)',
    'data:text/html,<b>x</b>',
    {protocol: 'javascript:', pathname: 'alert(1)'},
    {protocol: 'javascript', pathname: 'alert(1)'},
    {protocol: 'data:', pathname: 'text/html,<b>x</b>'},
    {protocol: 'vbscript:', pathname: 'MsgBox(1)'},
  ])(
    'renders rejected %j inertly instead of passing undefined to Next',
    href => {
      expect(renderNavigation(href)).toBe(
        '<a data-testid="destination">Go</a>',
      );
    },
  );

  it('does not fall back to a safe href when an explicit to is rejected', () => {
    expect(
      renderNavigation('/safe', {
        protocol: 'javascript:',
        pathname: 'alert(1)',
      }),
    ).toBe('<a data-testid="destination">Go</a>');
  });

  it.each([
    ['/docs', '/docs'],
    ['#section', '#section'],
    ['https://example.com/docs', 'https://example.com/docs'],
    ['mailto:a@example.com', 'mailto:a@example.com'],
    ['tel:+1234567890', 'tel:+1234567890'],
    ['custom:document', 'custom:document'],
    [
      {protocol: 'https:', hostname: 'example.com', pathname: '/docs'},
      'https://example.com/docs',
    ],
    [{pathname: '/docs', query: {page: '2'}, hash: 'top'}, '/docs?page=2#top'],
  ])('retains Next navigation for %j', (href, expected) => {
    expect(renderNavigation(href)).toContain(`href="${expected}"`);
  });
});
