// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useLinkComponent.disabled.test.tsx
 * @input Public link resolver, strict router stand-ins, SSR and DOM events
 * @output Disabled navigation-boundary lifecycle and compatibility regressions
 * @position Testing; validates the private disabled opt-in used by link controls
 */

import {
  StrictMode,
  createRef,
  useState,
  type ComponentPropsWithRef,
} from 'react';
import {renderToString} from 'react-dom/server';
import {hydrateRoot} from 'react-dom/client';
import {act, fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {useLinkComponent} from './useLinkComponent';
import type {LinkComponentType} from './types';

const navigate = vi.fn();
function RequiredHrefRouter({
  href,
  onClick,
  ...props
}: ComponentPropsWithRef<'a'>) {
  if (href == null) {
    throw new Error('A router destination is required');
  }
  return (
    <a
      {...props}
      href={href}
      data-router="true"
      onClick={event => {
        navigate();
        onClick?.(event);
        event.preventDefault();
      }}
    />
  );
}

function Consumer({
  disabled,
  href = '/first',
  to,
  component = RequiredHrefRouter,
  linkRef,
  ...props
}: ComponentPropsWithRef<'a'> & {
  disabled: boolean;
  to?: unknown;
  component?: LinkComponentType;
  linkRef?: React.Ref<HTMLAnchorElement>;
}) {
  const Component = useLinkComponent(component);
  return (
    <Component
      {...props}
      href={href}
      to={to}
      _isDisabled={disabled}
      role="link"
      aria-disabled={disabled || undefined}
      tabIndex={0}
      ref={linkRef}
      data-testid="link">
      Destination
    </Component>
  );
}

describe('useLinkComponent disabled boundary', () => {
  it('initial disabled SSR never invokes a required-href router or emits a destination', () => {
    const router = vi.fn(RequiredHrefRouter);
    const html = renderToString(
      <Consumer disabled component={router} target="_blank" rel="external" />,
    );
    expect(router).not.toHaveBeenCalled();
    expect(html).not.toContain('href=');
    expect(html).not.toContain('target=');
    expect(html).not.toContain('rel=');
    expect(html).not.toContain('_isDisabled');
    expect(html).toContain('aria-disabled="true"');
  });

  it('hydrates initially disabled markup without a router or destination', async () => {
    const router = vi.fn(RequiredHrefRouter);
    const fixture = <Consumer disabled component={router} />;
    const container = document.createElement('div');
    const markup = new DOMParser().parseFromString(
      renderToString(fixture),
      'text/html',
    );
    container.append(...markup.body.childNodes);
    const node = container.firstElementChild;
    const onRecoverableError = vi.fn();
    const root = hydrateRoot(container, fixture, {onRecoverableError});
    await act(async () => {});
    expect(container.firstElementChild).toBe(node);
    expect(node).not.toHaveAttribute('href');
    expect(router).not.toHaveBeenCalled();
    expect(onRecoverableError).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it('mounts the router on first enable and retains that node for later disablement', () => {
    const {rerender} = render(<Consumer disabled />);
    expect(screen.getByTestId('link')).not.toHaveAttribute('data-router');
    rerender(<Consumer disabled={false} />);
    const node = screen.getByTestId('link');
    expect(node).toHaveAttribute('data-router', 'true');
    node.focus();
    rerender(<Consumer disabled />);
    expect(screen.getByTestId('link')).toBe(node);
    expect(node).toHaveFocus();
    expect(node).not.toHaveAttribute('href');
    rerender(<Consumer disabled={false} />);
    expect(screen.getByTestId('link')).toBe(node);
    expect(node).toHaveAttribute('href', '/first');
  });

  it('blocks custom and caller activation handlers, including native/programmatic activation', () => {
    navigate.mockClear();
    const onClick = vi.fn();
    const onClickCapture = vi.fn();
    const onAuxClick = vi.fn();
    const onKeyDown = vi.fn();
    const onKeyDownCapture = vi.fn();
    const props = {
      onClick,
      onClickCapture,
      onAuxClick,
      onKeyDown,
      onKeyDownCapture,
    };
    const {rerender} = render(<Consumer disabled={false} {...props} />);
    const node = screen.getByTestId('link');
    rerender(<Consumer disabled {...props} />);
    const nativeClick = vi.fn();
    node.addEventListener('click', nativeClick);
    node.click();
    expect(fireEvent.click(node, {ctrlKey: true})).toBe(false);
    expect(fireEvent.click(node, {metaKey: true})).toBe(false);
    expect(
      fireEvent(
        node,
        new MouseEvent('auxclick', {
          button: 1,
          bubbles: true,
          cancelable: true,
        }),
      ),
    ).toBe(false);
    expect(fireEvent.contextMenu(node)).toBe(false);
    expect(fireEvent.dragStart(node)).toBe(false);
    expect(fireEvent.keyDown(node, {key: 'Enter'})).toBe(false);
    expect(fireEvent.keyDown(node, {key: ' '})).toBe(false);
    expect(fireEvent.keyUp(node, {key: 'Enter'})).toBe(false);
    expect(fireEvent.keyUp(node, {key: ' '})).toBe(false);
    expect(fireEvent.doubleClick(node)).toBe(false);
    for (const handler of [
      navigate,
      onClick,
      onClickCapture,
      onAuxClick,
      onKeyDown,
      onKeyDownCapture,
      nativeClick,
    ]) {
      expect(handler).not.toHaveBeenCalled();
    }
    fireEvent.keyDown(node, {key: 'Tab'});
    expect(onKeyDown).toHaveBeenCalledOnce();
    expect(onKeyDownCapture).toHaveBeenCalledOnce();
    rerender(<Consumer disabled={false} {...props} />);
    fireEvent.click(node);
    expect(navigate).toHaveBeenCalledOnce();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('preserves the latest href through disabled prop updates', async () => {
    const {rerender} = render(<Consumer disabled={false} />);
    const node = screen.getByTestId('link');
    rerender(<Consumer disabled />);
    rerender(<Consumer disabled href="/second" />);
    await act(async () => {});
    expect(node).not.toHaveAttribute('href');
    rerender(<Consumer disabled={false} href="/second" />);
    expect(node).toHaveAttribute('href', '/second');
  });

  it('keeps structured destinations and explicit to precedence across disablement', () => {
    const first = {pathname: '/first', search: '?q=1', hash: '#top'};
    const second = {pathname: '/second', search: '?q=2', hash: '#next'};
    const router = vi.fn(
      ({
        href: _href,
        to,
        ...props
      }: Omit<ComponentPropsWithRef<'a'>, 'href'> & {
        href: typeof first;
        to: typeof first;
      }) => <a {...props} href={`${to.pathname}${to.search}${to.hash}`} />,
    );
    function Structured({
      disabled,
      destination,
    }: {
      disabled: boolean;
      destination: typeof first;
    }) {
      const Component = useLinkComponent(router);
      return (
        <Component
          href={first}
          to={destination}
          _isDisabled={disabled}
          data-testid="link"
        />
      );
    }
    const {rerender} = render(
      <Structured disabled={false} destination={first} />,
    );
    const node = screen.getByTestId('link');
    rerender(<Structured disabled destination={second} />);
    expect(node).not.toHaveAttribute('href');
    expect(router.mock.lastCall?.[0].href).toBe(first);
    expect(router.mock.lastCall?.[0].to).toBe(second);
    rerender(<Structured disabled={false} destination={second} />);
    expect(screen.getByTestId('link')).toBe(node);
    expect(node).toHaveAttribute('href', '/second?q=2#next');
  });

  it('does not restore stale target or rel removed while disabled', () => {
    const {rerender} = render(
      <Consumer disabled={false} target="_blank" rel="external" />,
    );
    const node = screen.getByTestId('link');
    rerender(<Consumer disabled target="_blank" rel="external" />);
    rerender(<Consumer disabled />);
    rerender(<Consumer disabled={false} />);
    expect(node).toHaveAttribute('href', '/first');
    expect(node).not.toHaveAttribute('target');
    expect(node).not.toHaveAttribute('rel');
  });

  it('cleans object refs when replaced and on unmount without detaching on toggles', () => {
    const first = createRef<HTMLAnchorElement>();
    const second = createRef<HTMLAnchorElement>();
    const {rerender, unmount} = render(
      <Consumer disabled={false} linkRef={first} />,
    );
    const node = first.current;
    rerender(<Consumer disabled linkRef={first} />);
    expect(first.current).toBe(node);
    rerender(<Consumer disabled linkRef={second} />);
    expect(first.current).toBeNull();
    expect(second.current).toBe(node);
    expect(node).not.toHaveAttribute('href');
    rerender(<Consumer disabled={false} linkRef={second} />);
    expect(second.current).toBe(node);
    expect(node).toHaveAttribute('href', '/first');
    unmount();
    expect(second.current).toBeNull();
  });

  it('guards router-owned destination updates and node replacements while disabled', async () => {
    let update: (value: number) => void = () => {};
    function StatefulRouter(props: ComponentPropsWithRef<'a'>) {
      const [revision, setRevision] = useState(0);
      update = setRevision;
      return (
        <a
          key={revision > 1 ? 'replacement' : 'original'}
          {...props}
          href={`/route-${revision}`}
        />
      );
    }
    const {rerender} = render(
      <Consumer disabled={false} component={StatefulRouter} />,
    );
    const original = screen.getByTestId('link');
    rerender(<Consumer disabled component={StatefulRouter} />);
    await act(async () => update(1));
    expect(screen.getByTestId('link')).toBe(original);
    expect(original).not.toHaveAttribute('href');
    await act(async () => update(2));
    const replacement = screen.getByTestId('link');
    expect(replacement).not.toBe(original);
    expect(replacement).not.toHaveAttribute('href');
    original.setAttribute('href', '/detached');
    await act(async () => {});
    expect(original).toHaveAttribute('href', '/detached');
    rerender(<Consumer disabled={false} component={StatefulRouter} />);
    expect(replacement).toHaveAttribute('href', '/route-2');
  });

  it('keeps callback refs stable on toggles and releases guards on unmount under StrictMode', async () => {
    const cleanup = vi.fn();
    const ref = vi.fn(() => cleanup);
    const fixture = (disabled: boolean) => (
      <StrictMode>
        <Consumer disabled={disabled} linkRef={ref} />
      </StrictMode>
    );
    const {rerender, unmount} = render(fixture(false));
    const node = screen.getByTestId('link');
    ref.mockClear();
    cleanup.mockClear();
    rerender(fixture(true));
    expect(ref).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
    unmount();
    expect(cleanup).toHaveBeenCalledOnce();
    node.setAttribute('href', '/detached');
    await act(async () => {});
    expect(node).toHaveAttribute('href', '/detached');
    expect(fireEvent.click(node)).toBe(true);
  });

  it.each([
    {href: 'javascript:alert(1)'},
    {href: '/safe', to: 'data:text/html,unsafe'},
    {href: '/safe', to: {protocol: 'vbscript:', pathname: 'unsafe'}},
  ])(
    'never invokes a rejected router, including after an enabled render: %j',
    destination => {
      const router = vi.fn(RequiredHrefRouter);
      const {rerender} = render(
        <Consumer disabled={false} component={router} />,
      );
      router.mockClear();
      rerender(<Consumer disabled component={router} {...destination} />);
      expect(router).not.toHaveBeenCalled();
      expect(screen.getByTestId('link')).not.toHaveAttribute('href');
      rerender(
        <Consumer disabled={false} component={router} {...destination} />,
      );
      expect(router).not.toHaveBeenCalled();
      rerender(<Consumer disabled component={router} href="/safe-again" />);
      expect(router).not.toHaveBeenCalled();
      expect(screen.getByTestId('link')).not.toHaveAttribute('href');
      rerender(
        <Consumer disabled={false} component={router} href="/safe-again" />,
      );
      expect(router).toHaveBeenCalled();
      expect(screen.getByTestId('link')).toHaveAttribute('href', '/safe-again');
    },
  );
});
