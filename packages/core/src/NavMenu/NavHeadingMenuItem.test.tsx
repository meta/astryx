// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file NavHeadingMenuItem.test.tsx
 * @input Public NavMenu exports and browser-like user interaction
 * @output Regression coverage for disabled navigation and interaction
 * @position Component-local tests for NavHeadingMenuItem
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  StrictMode,
  createRef,
  useRef,
  type ComponentPropsWithRef,
  type KeyboardEventHandler,
} from 'react';
import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {LinkProvider} from '../Link/LinkProvider';
import {NavHeadingCloseContext} from './NavMenuContext';
import {NavHeadingMenu} from './NavHeadingMenu';
import {NavHeadingMenuItem} from './NavHeadingMenuItem';

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('NavHeadingMenuItem disabled navigation', () => {
  it('keeps a non-forwarding router destination focused and inert until reenabled', async () => {
    function Router({
      href,
      to,
      ref: _ref,
      ...props
    }: ComponentPropsWithRef<'a'> & {to?: string}) {
      if (!href || href !== to) {
        throw new Error('The router requires its original destination');
      }
      return <a {...props} href={to} />;
    }
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onKeyDown = vi.fn();
    const closeMenu = vi.fn();
    const fixture = (isDisabled: boolean) => (
      <LinkProvider component={Router}>
        <NavHeadingCloseContext value={{closeMenu}}>
          <NavHeadingMenu>
            <NavHeadingMenuItem
              label="Destination"
              href="#destination"
              isDisabled={isDisabled}
              onClick={onSelect}
              onKeyDown={onKeyDown}
            />
          </NavHeadingMenu>
        </NavHeadingCloseContext>
      </LinkProvider>
    );
    const {rerender} = render(fixture(false));
    screen.getByRole('menuitem').focus();
    rerender(fixture(true));
    const disabled = screen.getByRole('menuitem');
    expect(disabled).toHaveFocus();
    await user.keyboard('{Enter}{ }');
    await user.click(disabled);
    expect(onSelect).not.toHaveBeenCalled();
    expect(onKeyDown).not.toHaveBeenCalled();
    expect(closeMenu).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('');

    rerender(fixture(false));
    expect(screen.getByRole('menuitem')).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(window.location.hash).toBe('#destination'));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(closeMenu).toHaveBeenCalledOnce();
  });

  it('preserves focus and the caller ref when a router drops composed-ref cleanup', () => {
    function Router({
      ref,
      to,
      ...props
    }: ComponentPropsWithRef<'a'> & {to?: string}) {
      const internalRef = useRef<HTMLAnchorElement | null>(null);
      return (
        <a
          {...props}
          href={to}
          ref={node => {
            internalRef.current = node;
            if (typeof ref === 'function') {
              ref(node);
            } else if (ref) {
              ref.current = node;
            }
          }}
        />
      );
    }
    const ref = createRef<HTMLElement>();
    const fixture = (isDisabled: boolean) => (
      <StrictMode>
        <LinkProvider component={Router}>
          <NavHeadingMenuItem
            ref={ref}
            label="Destination"
            href="#destination"
            isDisabled={isDisabled}
          />
        </LinkProvider>
      </StrictMode>
    );
    const {rerender, unmount} = render(fixture(false));
    screen.getByRole('menuitem').focus();
    rerender(fixture(true));
    expect(ref.current).toBe(screen.getByRole('menuitem'));
    expect(ref.current).toHaveFocus();
    rerender(fixture(false));
    expect(ref.current).toBe(screen.getByRole('menuitem'));
    expect(ref.current).toHaveFocus();
    unmount();
    expect(ref.current).toBeNull();
  });

  it('honors a focus handoff from the caller root ref', () => {
    const notes = createRef<HTMLInputElement>();
    const ref = (node: HTMLElement | null) => {
      if (!node) {
        notes.current?.focus();
      }
    };
    const fixture = (isDisabled: boolean) => (
      <>
        <NavHeadingMenuItem
          ref={ref}
          label="Destination"
          href="#destination"
          isDisabled={isDisabled}
        />
        <input aria-label="Notes" ref={notes} />
      </>
    );
    const {rerender} = render(fixture(false));
    screen.getByRole('menuitem').focus();
    rerender(fixture(true));
    expect(notes.current).toHaveFocus();
    rerender(fixture(false));
    expect(notes.current).toHaveFocus();
  });

  it('suppresses disabled pointer callbacks and restores enabled capture cancellation', async () => {
    const user = userEvent.setup();
    const activate = vi.fn();
    const select = vi.fn();
    const closeMenu = vi.fn();
    const fixture = (isDisabled: boolean, cancel = false) => (
      <NavHeadingCloseContext value={{closeMenu}}>
        <NavHeadingMenu>
          <NavHeadingMenuItem
            label="Action"
            isDisabled={isDisabled}
            onClick={select}
            onClickCapture={
              cancel ? event => event.stopPropagation() : activate
            }
            onAuxClickCapture={activate}
            onAuxClick={activate}
            onDoubleClickCapture={activate}
            onDoubleClick={activate}
          />
        </NavHeadingMenu>
      </NavHeadingCloseContext>
    );
    const {rerender} = render(fixture(false));
    const item = screen.getByRole('menuitem');
    item.focus();
    rerender(fixture(true));
    await user.dblClick(item);
    await user.pointer({target: item, keys: '[MouseMiddle]'});
    expect(activate).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
    expect(closeMenu).not.toHaveBeenCalled();
    expect(item).toHaveFocus();

    rerender(fixture(false));
    await user.dblClick(item);
    await user.pointer({target: item, keys: '[MouseMiddle]'});
    expect(activate).toHaveBeenCalledTimes(6);
    expect(select).toHaveBeenCalledTimes(2);
    expect(closeMenu).toHaveBeenCalledTimes(2);
    select.mockClear();
    closeMenu.mockClear();
    rerender(fixture(false, true));
    await user.click(item);
    expect(select).not.toHaveBeenCalled();
    expect(closeMenu).not.toHaveBeenCalled();
  });

  it('filters only disabled Enter/Space callbacks across all keyboard phases', async () => {
    const user = userEvent.setup();
    const onKey = vi.fn();
    const parent = vi.fn<KeyboardEventHandler<HTMLDivElement>>();
    const fixture = (isDisabled: boolean, cancel = false) => (
      <div onKeyDown={parent} onKeyUp={parent}>
        <NavHeadingMenuItem
          label="Action"
          isDisabled={isDisabled}
          onKeyDownCapture={event => {
            onKey(event);
            if (cancel) {
              event.stopPropagation();
            }
          }}
          onKeyDown={onKey}
          onKeyPressCapture={onKey}
          onKeyPress={onKey}
          onKeyUpCapture={onKey}
          onKeyUp={onKey}
        />
      </div>
    );
    const {rerender} = render(fixture(false));
    const item = screen.getByRole('menuitem');
    item.focus();
    rerender(fixture(true));
    await user.keyboard('{Enter}{ }');
    expect(onKey).not.toHaveBeenCalled();
    expect(parent.mock.calls.map(([event]) => event.key)).toEqual([
      'Enter',
      'Enter',
      ' ',
      ' ',
    ]);
    await user.keyboard('a');
    expect(onKey).toHaveBeenCalledTimes(6);
    expect(item).toHaveFocus();

    onKey.mockClear();
    rerender(fixture(false));
    await user.keyboard('{Enter}{ }');
    expect(onKey).toHaveBeenCalledTimes(12);
    parent.mockClear();
    rerender(fixture(false, true));
    await user.keyboard('{Enter}');
    expect(parent.mock.calls.map(([event]) => event.type)).toEqual(['keyup']);
  });

  it('keeps observation and caller-owned child events on a disabled item', async () => {
    const user = userEvent.setup();
    const focus = vi.fn();
    const blur = vi.fn();
    const enter = vi.fn();
    const leave = vi.fn();
    const activate = vi.fn();
    const childClick = vi.fn();
    const childKey = vi.fn();
    const ancestorClick = vi.fn();
    render(
      <div onClick={ancestorClick}>
        <NavHeadingMenuItem
          isDisabled
          label={
            <a href="#child" onClick={childClick} onKeyDown={childKey}>
              Child destination
            </a>
          }
          onClick={activate}
          onClickCapture={activate}
          onKeyDownCapture={activate}
          onKeyDown={activate}
          onFocus={focus}
          onBlur={blur}
          onPointerEnter={enter}
          onPointerLeave={leave}
        />
        <button type="button">Elsewhere</button>
      </div>,
    );
    const item = screen.getByRole('menuitem');
    item.focus();
    await user.hover(item);
    await user.unhover(item);
    screen.getByRole('button').focus();
    expect(focus).toHaveBeenCalledOnce();
    expect(blur).toHaveBeenCalledOnce();
    expect(enter).toHaveBeenCalledOnce();
    expect(leave).toHaveBeenCalledOnce();

    const child = screen.getByRole('link');
    await user.click(child);
    child.focus();
    await user.keyboard('{Enter}');
    expect(childClick).toHaveBeenCalledTimes(2);
    expect(childKey).toHaveBeenCalledOnce();
    expect(ancestorClick).toHaveBeenCalledTimes(2);
    expect(activate).not.toHaveBeenCalled();
    await waitFor(() => expect(window.location.hash).toBe('#child'));
  });
});
