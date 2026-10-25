// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Button.disabled.test.tsx
 * @input Button's public disabled, form, group, tooltip, and link interfaces
 * @output Regression coverage for focus-preserving, non-operable disabled buttons
 * @position Component-local tests; real browser focus is verified separately
 */

import {createRef, type ComponentPropsWithRef} from 'react';
import {renderToString} from 'react-dom/server';
import {act, fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';
import {Button} from './Button';
import {ButtonGroup} from '../ButtonGroup';
import {LinkProvider} from '../Link/LinkProvider';

function RouterLink({
  href,
  to,
  ...props
}: ComponentPropsWithRef<'a'> & {to?: string}) {
  if (href == null) {
    throw new Error('Router requires its original href');
  }
  return <a {...props} href={href} data-router-destination={to} />;
}

describe('Button disabled focus and activation', () => {
  it('keeps the focused ordinary button and its Tab eligibility on disablement', async () => {
    const user = userEvent.setup();
    const ref = createRef<HTMLButtonElement>();
    const view = (isDisabled: boolean) => (
      <>
        <button type="button">Before</button>
        <Button ref={ref} label="Save" isDisabled={isDisabled} />
        <button type="button">After</button>
      </>
    );
    const {rerender} = render(view(false));
    const button = screen.getByRole('button', {name: 'Save'});
    await user.tab();
    await user.tab();
    expect(button).toHaveFocus();

    rerender(view(true));
    expect(ref.current).toBe(button);
    expect(button).not.toHaveAttribute('disabled');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', {name: 'After'})).toHaveFocus();
    await user.tab({shift: true});
    expect(button).toHaveFocus();
  });

  it.each([false, true])(
    'preserves an explicit negative tabIndex (href=%s)',
    href => {
      render(
        <Button
          label="Save"
          href={href ? '#saved' : undefined}
          isDisabled
          tabIndex={-1}
        />,
      );
      const control = screen.getByRole(href ? 'link' : 'button');
      expect(control).not.toHaveAttribute('disabled');
      expect(control).toHaveAttribute('tabindex', '-1');
      act(() => control.focus());
      expect(control).toHaveFocus();
    },
  );

  it('blocks pointer, direct click, Enter and Space callbacks and Actions without a tooltip', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const clickAction = vi.fn();
    const onKeyDown = vi.fn();
    const ancestorClick = vi.fn();
    render(
      <div onClick={ancestorClick}>
        <Button
          label="Save"
          isDisabled
          onClick={onClick}
          clickAction={clickAction}
          onKeyDown={onKeyDown}
        />
      </div>,
    );
    const button = screen.getByRole('button');
    await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard('{Enter} ');
    await user.click(button);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(clickAction).not.toHaveBeenCalled();
    expect(onKeyDown).not.toHaveBeenCalled();
    expect(ancestorClick).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });

  it('blocks capture, keyup, double-click and pointer activation callbacks while preserving inspection', () => {
    const activate = vi.fn();
    const inspect = vi.fn();
    render(
      <Button
        label="Save"
        isDisabled
        onClickCapture={activate}
        onDoubleClick={activate}
        onDoubleClickCapture={activate}
        onAuxClick={activate}
        onPointerDown={activate}
        onPointerUp={activate}
        onMouseDown={activate}
        onMouseUp={activate}
        onTouchStart={activate}
        onTouchEnd={activate}
        onKeyDown={activate}
        onKeyDownCapture={activate}
        onKeyUp={activate}
        onKeyUpCapture={activate}
        onFocus={inspect}
        onBlur={inspect}
        onMouseEnter={inspect}
      />,
    );
    const button = screen.getByRole('button');
    for (const key of ['Enter', ' ']) {
      expect(fireEvent.keyDown(button, {key})).toBe(false);
      expect(fireEvent.keyUp(button, {key})).toBe(false);
    }
    for (const send of [
      fireEvent.click,
      fireEvent.doubleClick,
      fireEvent.pointerDown,
      fireEvent.pointerUp,
      fireEvent.mouseDown,
      fireEvent.mouseUp,
      fireEvent.touchStart,
      fireEvent.touchEnd,
    ]) {
      send(button);
    }
    fireEvent(
      button,
      new MouseEvent('auxclick', {bubbles: true, cancelable: true, button: 1}),
    );
    expect(activate).not.toHaveBeenCalled();
    act(() => button.focus());
    fireEvent.mouseEnter(button);
    act(() => button.blur());
    expect(inspect).toHaveBeenCalledTimes(3);
    fireEvent.keyDown(button, {key: 'Escape'});
    fireEvent.keyUp(button, {key: 'Tab'});
    expect(activate).toHaveBeenCalledTimes(4);
  });

  it.each(['submit', 'reset'] as const)(
    'blocks disabled %s and excludes its submitter value',
    async type => {
      const user = userEvent.setup();
      const onSubmit = vi.fn((event: React.FormEvent) =>
        event.preventDefault(),
      );
      const onReset = vi.fn((event: React.FormEvent) => event.preventDefault());
      const view = (isDisabled: boolean) => (
        <form aria-label="Editor" onSubmit={onSubmit} onReset={onReset}>
          <input aria-label="Title" name="title" defaultValue="Kept" />
          <Button
            label="Save"
            type={type}
            name="intent"
            value="save"
            isDisabled={isDisabled}
          />
        </form>
      );
      const {rerender} = render(view(false));
      const button = screen.getByRole('button');
      button.focus();
      rerender(view(true));
      expect(button).toHaveFocus();
      expect(button).not.toHaveAttribute('name');
      await user.keyboard('{Enter} ');
      await user.click(button);
      fireEvent.click(button);
      expect(onSubmit).not.toHaveBeenCalled();
      expect(onReset).not.toHaveBeenCalled();
      const form = screen.getByRole<HTMLFormElement>('form');
      expect(Array.from(new FormData(form).entries())).toEqual([
        ['title', 'Kept'],
      ]);
      if (type === 'submit') {
        expect(new FormData(form, button).has('intent')).toBe(false);
      }
      rerender(view(false));
      expect(button).toHaveAttribute('name', 'intent');
      await user.click(button);
      expect(type === 'submit' ? onSubmit : onReset).toHaveBeenCalledTimes(1);
    },
  );

  it('keeps a focused group member inert when the group becomes disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const clickAction = vi.fn();
    const view = (isDisabled: boolean) => (
      <ButtonGroup label="Actions" isDisabled={isDisabled}>
        <Button
          label="Save"
          isDisabled={false}
          onClick={onClick}
          clickAction={clickAction}
        />
        <Button label="Cancel" />
      </ButtonGroup>
    );
    const {rerender} = render(view(false));
    const button = screen.getByRole('button', {name: 'Save'});
    await user.tab();
    expect(button).toHaveFocus();
    const tabIndex = button.tabIndex;
    rerender(view(true));
    expect(button).not.toHaveAttribute('disabled');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button.tabIndex).toBe(tabIndex);
    expect(button).toHaveFocus();
    await user.keyboard('{Enter} ');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(clickAction).not.toHaveBeenCalled();
  });

  it.each(['native', 'provider', 'as'])(
    'keeps the href renderer, ref and focus across disablement (%s)',
    async renderer => {
      const user = userEvent.setup();
      const ref = vi.fn();
      const onClick = vi.fn();
      const clickAction = vi.fn();
      const view = (isDisabled: boolean) => {
        const button = (
          <Button
            ref={ref}
            label="Docs"
            href="#docs"
            as={renderer === 'as' ? RouterLink : undefined}
            isDisabled={isDisabled}
            onClick={onClick}
            clickAction={clickAction}
          />
        );
        return renderer === 'provider' ? (
          <LinkProvider component={RouterLink}>{button}</LinkProvider>
        ) : (
          button
        );
      };
      const {rerender} = render(view(false));
      const link = screen.getByRole('link');
      await user.tab();
      expect(link).toHaveFocus();
      ref.mockClear();
      rerender(view(true));
      expect(screen.getByRole('link')).toBe(link);
      expect(ref).not.toHaveBeenCalled();
      expect(link).toHaveFocus();
      expect(link).toHaveAttribute('aria-disabled', 'true');
      expect(link).not.toHaveAttribute('href');
      await user.keyboard('{Enter} ');
      await user.click(link);
      const auxiliary = new MouseEvent('auxclick', {
        button: 1,
        bubbles: true,
        cancelable: true,
      });
      fireEvent(link, auxiliary);
      expect(auxiliary.defaultPrevented).toBe(true);
      expect(onClick).not.toHaveBeenCalled();
      expect(clickAction).not.toHaveBeenCalled();
      rerender(view(false));
      expect(screen.getByRole('link')).toBe(link);
      expect(link).toHaveAttribute('href', '#docs');
      if (renderer !== 'native') {
        expect(link).toHaveAttribute('data-router-destination', '#docs');
      }
      await user.click(link);
      expect(onClick).toHaveBeenCalledOnce();
      expect(clickAction).toHaveBeenCalledOnce();
    },
  );

  it('does not invoke a required-href router or expose a destination in initially disabled SSR', () => {
    const router = vi.fn(RouterLink);
    const html = renderToString(
      <LinkProvider component={router}>
        <Button label="Docs" href="/docs" isDisabled />
      </LinkProvider>,
    );
    expect(router).not.toHaveBeenCalled();
    expect(html).not.toContain('href=');
    expect(html).toContain('role="link"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-disabled="true"');
  });

  it('preserves a disabled tooltip and caller description on the focus owner', async () => {
    const user = userEvent.setup();
    render(
      <>
        <p id="save-help">Save this draft</p>
        <Button
          label="Save"
          isDisabled
          tooltip="Permission required"
          aria-describedby="save-help"
        />
      </>,
    );
    const button = screen.getByRole('button');
    await user.tab();
    expect(button).toHaveFocus();
    // jsdom cannot expose the native popover; Chromium verifies visibility.
    const tooltip = screen.getByRole('tooltip', {hidden: true});
    expect(tooltip).toHaveTextContent('Permission required');
    expect(button.getAttribute('aria-describedby')?.split(' ')).toContain(
      'save-help',
    );
    expect(button.getAttribute('aria-describedby')?.split(' ')).toContain(
      tooltip.id,
    );
  });
});
