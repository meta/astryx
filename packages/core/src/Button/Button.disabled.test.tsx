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

  it('preserves an explicit negative button tabIndex', () => {
    render(<Button label="Save" isDisabled tabIndex={-1} />);
    const control = screen.getByRole('button');
    expect(control).not.toHaveAttribute('disabled');
    expect(control).toHaveAttribute('tabindex', '-1');
    act(() => control.focus());
    expect(control).toHaveFocus();
  });

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

  it('blocks disabled submission and excludes its submitter value', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: React.SyntheticEvent) =>
      event.preventDefault(),
    );
    const view = (isDisabled: boolean) => (
      <form aria-label="Editor" onSubmit={onSubmit}>
        <input aria-label="Title" name="title" defaultValue="Kept" />
        <Button
          label="Save"
          type="submit"
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
    const form = screen.getByRole<HTMLFormElement>('form');
    expect(Array.from(new FormData(form).entries())).toEqual([
      ['title', 'Kept'],
    ]);
    expect(new FormData(form, button).has('intent')).toBe(false);
    rerender(view(false));
    expect(button).toHaveAttribute('name', 'intent');
    await user.click(button);
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('blocks disabled reset without losing focus or changing the field value', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    const view = (isDisabled: boolean) => (
      <form onReset={onReset}>
        <input aria-label="Title" defaultValue="Original" />
        <Button label="Reset" type="reset" isDisabled={isDisabled} />
      </form>
    );
    const {rerender} = render(view(false));
    const title = screen.getByRole('textbox');
    await user.clear(title);
    await user.type(title, 'Kept');
    const button = screen.getByRole('button');
    button.focus();
    rerender(view(true));
    expect(button).toHaveFocus();
    await user.keyboard('{Enter} ');
    await user.click(button);
    fireEvent.click(button);
    expect(onReset).not.toHaveBeenCalled();
    expect(title).toHaveValue('Kept');
    rerender(view(false));
    await user.click(button);
    expect(onReset).toHaveBeenCalledOnce();
    expect(title).toHaveValue('Original');
  });

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

  it('keeps native link focus and explicit Tab eligibility across disablement', async () => {
    const user = userEvent.setup();
    const ref = createRef<HTMLButtonElement>();
    const view = (isDisabled: boolean) => (
      <>
        <Button
          ref={ref}
          label="Docs"
          href="#docs"
          isDisabled={isDisabled}
          tabIndex={-1}
        />
        <button type="button">After</button>
      </>
    );
    const {rerender} = render(view(false));
    act(() => screen.getByRole('link').focus());
    rerender(view(true));
    const disabled = screen.getByRole('link');
    expect(disabled).toHaveFocus();
    expect(ref.current).toBe(disabled);
    expect(disabled).toHaveAttribute('tabindex', '-1');
    expect(disabled).not.toHaveAttribute('href');
    await user.tab();
    expect(screen.getByRole('button', {name: 'After'})).toHaveFocus();
    rerender(view(false));
    expect(screen.getByRole('button', {name: 'After'})).toHaveFocus();
    expect(screen.getByRole('link')).toHaveAttribute('href', '#docs');
  });

  it('keeps focus without requiring a provider router to forward its ref', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const clickAction = vi.fn();
    const router = vi.fn(
      ({ref: _ref, ...props}: ComponentPropsWithRef<'a'>) => (
        <RouterLink {...props} />
      ),
    );
    const view = (isDisabled: boolean) => (
      <LinkProvider component={router}>
        <Button
          label="Docs"
          href="#docs"
          isDisabled={isDisabled}
          onClick={onClick}
          onContextMenu={onClick}
          onDragStart={onClick}
          clickAction={clickAction}
        />
      </LinkProvider>
    );
    const {rerender} = render(view(false));
    await user.tab();
    expect(screen.getByRole('link')).toHaveFocus();
    router.mockClear();
    rerender(view(true));
    const disabled = screen.getByRole('link');
    expect(disabled).toHaveFocus();
    expect(disabled).toHaveAttribute('aria-disabled', 'true');
    expect(disabled).not.toHaveAttribute('href');
    expect(router).not.toHaveBeenCalled();
    await user.keyboard('{Enter} ');
    await user.click(disabled);
    fireEvent.click(disabled, {ctrlKey: true});
    const auxiliary = new MouseEvent('auxclick', {
      button: 1,
      bubbles: true,
      cancelable: true,
    });
    fireEvent(disabled, auxiliary);
    expect(auxiliary.defaultPrevented).toBe(true);
    expect(fireEvent.contextMenu(disabled)).toBe(false);
    expect(fireEvent.dragStart(disabled)).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
    expect(clickAction).not.toHaveBeenCalled();
    rerender(view(false));
    const enabled = screen.getByRole('link');
    expect(enabled).toHaveFocus();
    expect(enabled).toHaveAttribute('data-router-destination', '#docs');
    await user.click(enabled);
    expect(onClick).toHaveBeenCalledOnce();
    expect(clickAction).toHaveBeenCalledOnce();
  });

  it('bypasses an as router while busy and restores the current destination and ref', () => {
    const ref = createRef<HTMLButtonElement>();
    const router = vi.fn(RouterLink);
    const view = (isLoading: boolean, href: string) => (
      <Button
        ref={ref}
        label="Docs"
        href={href}
        as={router}
        target="_blank"
        rel="external"
        isLoading={isLoading}
      />
    );
    const {rerender} = render(view(false, '#first'));
    act(() => screen.getByRole('link').focus());
    router.mockClear();
    rerender(view(true, '#first'));
    const disabled = screen.getByRole('link');
    expect(disabled).toHaveFocus();
    expect(ref.current).toBe(disabled);
    expect(disabled).toHaveAttribute('aria-busy', 'true');
    expect(disabled).not.toHaveAttribute('href');
    expect(disabled).not.toHaveAttribute('target');
    expect(disabled).not.toHaveAttribute('rel');
    expect(router).not.toHaveBeenCalled();
    rerender(view(true, '#second'));
    expect(screen.getByRole('link')).toBe(disabled);
    expect(disabled).toHaveFocus();
    rerender(view(false, '#second'));
    const enabled = screen.getByRole('link');
    expect(enabled).toHaveFocus();
    expect(ref.current).toBe(enabled);
    expect(enabled).toHaveAttribute('href', '#second');
    expect(enabled).toHaveAttribute('data-router-destination', '#second');
    expect(enabled).toHaveAttribute('target', '_blank');
    expect(enabled).toHaveAttribute('rel', 'external');
  });

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
