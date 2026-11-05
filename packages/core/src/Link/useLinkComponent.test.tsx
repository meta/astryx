// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useLinkComponent.test.tsx
 * @input Uses vitest, @testing-library/react, useLinkComponent, LinkProvider
 * @output Unit tests for useLinkComponent hook and LinkProvider
 * @position Testing; validates polymorphic link resolution and `to` prop injection
 */

import {describe, it, expect, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import {useLinkComponent} from './useLinkComponent';
import {LinkProvider} from './LinkProvider';
import type {LinkComponentType} from './types';

// Helper component that renders the resolved link component
function TestConsumer({as}: {as?: LinkComponentType}) {
  const LinkComponent = useLinkComponent(as);
  return (
    <LinkComponent href="/test" data-testid="resolved-link">
      Link
    </LinkComponent>
  );
}

function CustomLink({
  children,
  ref,
  ...props
}: React.ComponentPropsWithRef<'a'>) {
  return (
    <a ref={ref} data-custom-link {...props}>
      {children}
    </a>
  );
}

function AnotherLink({
  children,
  ref,
  ...props
}: React.ComponentPropsWithRef<'a'>) {
  return (
    <a ref={ref} data-another-link {...props}>
      {children}
    </a>
  );
}

/**
 * A mock "to"-based router link that reads `to` instead of `href`.
 * Simulates React Router / TanStack Router behavior.
 */
function ToBasedRouterLink({
  to,
  children,
  ref,
  ...props
}: {
  to?: string;
  href?: string;
  children?: React.ReactNode;
  ref?: React.Ref<HTMLAnchorElement>;
  [key: string]: unknown;
}) {
  return (
    <a ref={ref} href={to} data-router-link data-to={to} {...props}>
      {children}
    </a>
  );
}

// =============================================================================
// useLinkComponent
// =============================================================================

describe('useLinkComponent', () => {
  it('returns native <a> by default (no provider, no as)', () => {
    render(<TestConsumer />);
    const link = screen.getByTestId('resolved-link');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/test');
    expect(link).not.toHaveAttribute('data-custom-link');
  });

  it('returns as prop when provided', () => {
    render(<TestConsumer as={CustomLink} />);
    const link = screen.getByTestId('resolved-link');
    expect(link).toHaveAttribute('data-custom-link');
    expect(link).toHaveAttribute('href', '/test');
  });

  it('returns provider component when wrapped in LinkProvider', () => {
    render(
      <LinkProvider component={CustomLink}>
        <TestConsumer />
      </LinkProvider>,
    );
    const link = screen.getByTestId('resolved-link');
    expect(link).toHaveAttribute('data-custom-link');
  });

  it('as prop overrides provider', () => {
    render(
      <LinkProvider component={AnotherLink}>
        <TestConsumer as={CustomLink} />
      </LinkProvider>,
    );
    const link = screen.getByTestId('resolved-link');
    expect(link).toHaveAttribute('data-custom-link');
    expect(link).not.toHaveAttribute('data-another-link');
  });
});

// =============================================================================
// `to` prop injection
// =============================================================================

describe('useLinkComponent — to prop', () => {
  it('passes `to` equal to `href` for custom components via provider', () => {
    const spy = vi.fn(
      ({
        children,
        ...props
      }: {
        children?: React.ReactNode;
        [key: string]: unknown;
      }) => (
        <a
          data-testid="spy-link"
          data-to={props.to as string}
          href={props.href as string}>
          {children}
        </a>
      ),
    );
    function SpyLink(props: {
      children?: React.ReactNode;
      [key: string]: unknown;
    }) {
      return spy(props);
    }

    render(
      <LinkProvider component={SpyLink}>
        <TestConsumer />
      </LinkProvider>,
    );

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({href: '/test', to: '/test'}),
    );
  });

  it('passes `to` equal to `href` for custom components via `as` prop', () => {
    const spy = vi.fn(
      ({
        children,
        ...props
      }: {
        children?: React.ReactNode;
        [key: string]: unknown;
      }) => (
        <a data-testid="spy-link" href={props.href as string}>
          {children}
        </a>
      ),
    );
    function SpyLink(props: {
      children?: React.ReactNode;
      [key: string]: unknown;
    }) {
      return spy(props);
    }

    render(<TestConsumer as={SpyLink} />);

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({href: '/test', to: '/test'}),
    );
  });

  it('does NOT pass `to` for native <a> (no provider, no as)', () => {
    render(<TestConsumer />);
    const link = screen.getByTestId('resolved-link');
    // Native <a> doesn't use `to`, and we don't wrap it
    expect(link).toHaveAttribute('href', '/test');
    expect(link).not.toHaveAttribute('to');
  });

  it('works with to-based router links (e.g. React Router)', () => {
    render(
      <LinkProvider component={ToBasedRouterLink}>
        <TestConsumer />
      </LinkProvider>,
    );
    const link = screen.getByTestId('resolved-link');
    expect(link).toHaveAttribute('data-router-link');
    expect(link).toHaveAttribute('data-to', '/test');
    expect(link).toHaveAttribute('href', '/test');
  });

  it('to-based router works with as prop override', () => {
    render(<TestConsumer as={ToBasedRouterLink} />);
    const link = screen.getByTestId('resolved-link');
    expect(link).toHaveAttribute('data-router-link');
    expect(link).toHaveAttribute('data-to', '/test');
  });
});

// =============================================================================
// href scheme rule
// =============================================================================

describe('useLinkComponent — href scheme rule', () => {
  // Kept in a const so the JSX stays lint-clean — the test is ABOUT this URL.
  const scriptUrl = 'javascript:alert(1)';

  function HrefConsumer({href}: {href: string}) {
    const LinkComponent = useLinkComponent();
    return (
      <LinkComponent href={href} data-testid="resolved-link">
        Link
      </LinkComponent>
    );
  }

  function propSpy() {
    return vi.fn(
      ({
        children,
        ...props
      }: {
        children?: React.ReactNode;
        [key: string]: unknown;
      }) => (
        <a data-testid="spy-link" href={props.href as string}>
          {children}
        </a>
      ),
    );
  }

  it('forwards ordinary hrefs to a custom component untouched', () => {
    const spy = propSpy();
    function SpyLink(props: {[key: string]: unknown}) {
      return spy(props);
    }
    render(
      <LinkProvider component={SpyLink}>
        <HrefConsumer href="/docs/button" />
      </LinkProvider>,
    );
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({href: '/docs/button', to: '/docs/button'}),
    );
  });

  it('withholds a script-scheme href from a custom component (href and to alike)', () => {
    const spy = propSpy();
    function SpyLink(props: {[key: string]: unknown}) {
      return spy(props);
    }
    render(
      <LinkProvider component={SpyLink}>
        {/* eslint-disable-next-line @eslint-react/dom-no-script-url -- the test proves this URL never navigates */}
        <HrefConsumer href={scriptUrl} />
      </LinkProvider>,
    );
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByTestId('resolved-link')).not.toHaveAttribute('href');
  });

  it('an explicit `to` passes the same check instead of riding through ...rest', () => {
    const spy = propSpy();
    function SpyLink(props: {[key: string]: unknown}) {
      return spy(props);
    }
    function ToConsumer({to}: {to: string}) {
      const LinkComponent = useLinkComponent();
      return (
        <LinkComponent href="/fallback" to={to} data-testid="resolved-link">
          Link
        </LinkComponent>
      );
    }
    render(
      <LinkProvider component={SpyLink}>
        {/* eslint-disable-next-line @eslint-react/dom-no-script-url -- the test proves this URL never reaches the router */}
        <ToConsumer to={scriptUrl} />
      </LinkProvider>,
    );
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByTestId('resolved-link')).not.toHaveAttribute('href');
  });

  it('an ordinary explicit `to` keeps its precedence over href', () => {
    const spy = propSpy();
    function SpyLink(props: {[key: string]: unknown}) {
      return spy(props);
    }
    function ToConsumer() {
      const LinkComponent = useLinkComponent();
      return (
        <LinkComponent
          href="/fallback"
          to="/routed"
          data-testid="resolved-link">
          Link
        </LinkComponent>
      );
    }
    render(
      <LinkProvider component={SpyLink}>
        <ToConsumer />
      </LinkProvider>,
    );
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({href: '/fallback', to: '/routed'}),
    );
  });
});

// =============================================================================
// structured router `to`
// =============================================================================

describe('useLinkComponent — structured router `to`', () => {
  const scriptUrl = 'javascript:alert(1)';

  function propSpy() {
    return vi.fn(
      ({
        children,
        ...props
      }: {
        children?: React.ReactNode;
        [key: string]: unknown;
      }) => (
        <a data-testid="spy-link" href={props.href as string}>
          {children}
        </a>
      ),
    );
  }

  function ToConsumer({to}: {to: unknown}) {
    const LinkComponent = useLinkComponent();
    return (
      <LinkComponent href="/fallback" to={to} data-testid="resolved-link">
        Link
      </LinkComponent>
    );
  }

  it('preserves a structured destination for the router (no crash, same object)', () => {
    const spy = propSpy();
    function SpyLink(props: {[key: string]: unknown}) {
      return spy(props);
    }
    const to = {pathname: '/docs', search: '?q=1', hash: '#top'};
    render(
      <LinkProvider component={SpyLink}>
        <ToConsumer to={to} />
      </LinkProvider>,
    );
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({href: '/fallback', to}),
    );
    expect(spy.mock.calls[0][0].to).toBe(to);
  });

  it('preserves a structured destination that carries no pathname', () => {
    const spy = propSpy();
    function SpyLink(props: {[key: string]: unknown}) {
      return spy(props);
    }
    const to = {search: '?page=2'};
    render(
      <LinkProvider component={SpyLink}>
        <ToConsumer to={to} />
      </LinkProvider>,
    );
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({to}));
  });

  it('withholds a structured destination whose pathname is a script scheme', () => {
    const spy = propSpy();
    function SpyLink(props: {[key: string]: unknown}) {
      return spy(props);
    }
    render(
      <LinkProvider component={SpyLink}>
        <ToConsumer to={{pathname: scriptUrl}} />
      </LinkProvider>,
    );
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByTestId('resolved-link')).not.toHaveAttribute('href');
  });

  it('withholds a structured destination whose href is a script scheme', () => {
    const spy = propSpy();
    function SpyLink(props: {[key: string]: unknown}) {
      return spy(props);
    }
    render(
      <LinkProvider component={SpyLink}>
        <ToConsumer to={{href: scriptUrl}} />
      </LinkProvider>,
    );
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByTestId('resolved-link')).not.toHaveAttribute('href');
  });
});

// =============================================================================
// Shared native and router boundary
// =============================================================================

describe('useLinkComponent — rejected destinations are inert', () => {
  function Consumer({
    href,
    to,
    as,
    onClick,
    linkRef,
  }: {
    href?: unknown;
    to?: unknown;
    as?: LinkComponentType;
    onClick?: () => void;
    linkRef?: React.Ref<HTMLAnchorElement>;
  }) {
    const Component = useLinkComponent(as);
    return (
      <Component
        href={href}
        to={to}
        ref={linkRef}
        onClick={onClick}
        className="consumer-class"
        aria-label="Destination"
        data-testid="destination">
        Go
      </Component>
    );
  }

  for (const mode of ['native', 'provider', 'as'] as const) {
    it.each([
      {href: 'javascript:alert(1)'},
      {href: 'vbscript:MsgBox(1)'},
      {href: 'data:text/html,<b>x</b>'},
      {href: 'java\nscript:alert(1)'},
      {href: '/safe', to: 'javascript:alert(1)'},
      {href: 'vbscript:MsgBox(1)', to: '/safe'},
      {href: {protocol: 'javascript:', pathname: 'alert(1)'}},
      {href: '/safe', to: {protocol: 'data:', pathname: 'text/html,x'}},
    ])(`${mode}: rejects %j without calling a router`, props => {
      const router = vi.fn(() => {
        throw new Error('rejected router invoked');
      });
      const onClick = vi.fn();
      const linkRef = vi.fn();
      render(
        <LinkProvider component={mode === 'provider' ? router : 'a'}>
          <Consumer
            {...props}
            as={mode === 'as' ? router : undefined}
            onClick={onClick}
            linkRef={linkRef}
          />
        </LinkProvider>,
      );
      const node = screen.getByTestId('destination');
      expect(router).not.toHaveBeenCalled();
      expect(node.tagName).toBe('A');
      expect(node).not.toHaveAttribute('href');
      expect(node).not.toHaveAttribute('to');
      expect(node).not.toHaveAttribute('aria-disabled');
      expect(node).toHaveAttribute('aria-label', 'Destination');
      expect(node).toHaveClass('consumer-class');
      expect(linkRef.mock.calls[0][0]).toBe(node);
      node.click();
      expect(onClick).toHaveBeenCalledOnce();
    });
  }

  it.each([
    '/relative',
    '#fragment',
    'https://example.com',
    'http://example.com',
    'mailto:a@example.com',
    'tel:+1234567890',
    'custom:document',
    'data:text/plain,download',
  ])('preserves native href and download affordances for %s', href => {
    function Download() {
      const Component = useLinkComponent();
      return (
        <Component
          href={href}
          download="note.txt"
          target="_blank"
          rel="noopener"
          data-testid="download">
          Download
        </Component>
      );
    }
    render(<Download />);
    const node = screen.getByTestId('download');
    expect(node).toHaveAttribute('href', href);
    expect(node).toHaveAttribute('download', 'note.txt');
    expect(node).toHaveAttribute('target', '_blank');
    expect(node).toHaveAttribute('rel', 'noopener');
  });

  it('preserves both structured prop identities and safe explicit precedence', () => {
    const router = vi.fn<(props: {href?: unknown; to?: unknown}) => null>(
      () => null,
    );
    const href = {
      protocol: 'https:',
      hostname: 'example.com',
      pathname: '/docs',
    };
    const to = {pathname: '/next', search: '?q=1', hash: '#top'};
    render(<Consumer as={router} href={href} to={to} />);
    expect(router.mock.calls[0][0].href).toBe(href);
    expect(router.mock.calls[0][0].to).toBe(to);
  });

  it('keeps the native node stable while accepted props update', () => {
    const {rerender} = render(<Consumer href="/first" />);
    const node = screen.getByTestId('destination');
    rerender(<Consumer href="/second" />);
    expect(screen.getByTestId('destination')).toBe(node);
    expect(node).toHaveAttribute('href', '/second');
  });
});

// =============================================================================
// LinkProvider
// =============================================================================

describe('LinkProvider', () => {
  it('children can access the link component via the hook', () => {
    render(
      <LinkProvider component={CustomLink}>
        <TestConsumer />
      </LinkProvider>,
    );
    const link = screen.getByTestId('resolved-link');
    expect(link).toHaveAttribute('data-custom-link');
    expect(link).toHaveAttribute('href', '/test');
  });

  it('nested providers — inner overrides outer', () => {
    render(
      <LinkProvider component={AnotherLink}>
        <LinkProvider component={CustomLink}>
          <TestConsumer />
        </LinkProvider>
      </LinkProvider>,
    );
    const link = screen.getByTestId('resolved-link');
    expect(link).toHaveAttribute('data-custom-link');
    expect(link).not.toHaveAttribute('data-another-link');
  });
});
