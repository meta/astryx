// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file NavHeadingMenuItem.test.tsx
 * @input Public NavMenu exports and browser-like user interaction
 * @output Regression coverage for disabled navigation and interaction
 * @position Component-local tests for NavHeadingMenuItem
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  Component,
  StrictMode,
  createRef,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type ComponentPropsWithoutRef,
  type KeyboardEventHandler,
  type Ref,
} from 'react';
import {renderToString} from 'react-dom/server';
import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {LinkProvider} from '../Link/LinkProvider';
import {NavHeadingCloseContext} from './NavMenuContext';
import {NavHeadingMenu} from './NavHeadingMenu';
import {NavHeadingMenuItem} from './NavHeadingMenuItem';

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

function NavigationExample({
  isDisabled,
  itemRef,
}: {
  isDisabled: boolean;
  itemRef?: Ref<HTMLElement>;
}) {
  const [selection, setSelection] = useState('None');
  const [isOpen, setIsOpen] = useState(true);
  const closeContext = useMemo(() => ({closeMenu: () => setIsOpen(false)}), []);
  return (
    <>
      <NavHeadingCloseContext value={closeContext}>
        {isOpen && (
          <NavHeadingMenu>
            <NavHeadingMenuItem
              ref={itemRef}
              label="Destination"
              href="#destination"
              isDisabled={isDisabled}
              aria-describedby="unavailable-reason"
              onClick={() => setSelection('Destination')}
            />
            <NavHeadingMenuItem label="Settings" />
          </NavHeadingMenu>
        )}
      </NavHeadingCloseContext>
      <output aria-label="Selection">{selection}</output>
      <p id="unavailable-reason">Access is unavailable.</p>
    </>
  );
}

describe('NavHeadingMenuItem disabled navigation', () => {
  it('does not become a Tab stop that navigates on Enter when disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <>
        <button type="button">Before</button>
        <NavHeadingMenuItem
          label="Destination"
          href="#probe-destination"
          isDisabled
          onClick={onClick}
        />
        <button type="button">After</button>
      </>,
    );
    screen.getByRole('button', {name: 'Before'}).focus();

    await user.tab();
    await user.keyboard('{Enter}');

    expect(onClick).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('');
    expect(screen.getByRole('button', {name: 'After'})).toHaveFocus();
  });

  it('keeps an unavailable destination focused without navigating or closing the menu', async () => {
    const user = userEvent.setup();
    const {rerender} = render(<NavigationExample isDisabled={false} />);
    screen.getByRole('menuitem', {name: 'Destination'}).focus();

    rerender(<NavigationExample isDisabled />);
    const item = screen.getByRole('menuitem', {name: 'Destination'});
    expect(item).toHaveFocus();
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveAccessibleDescription('Access is unavailable.');
    expect(item).not.toHaveAttribute('href');
    await user.keyboard('{Enter}{ }');
    await user.click(item);
    await user.pointer({target: item, keys: '[MouseMiddle]'});
    expect(window.location.hash).toBe('');
    expect(screen.getByLabelText('Selection')).toHaveTextContent('None');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(item).toHaveFocus();

    rerender(<NavigationExample isDisabled={false} />);
    expect(screen.getByRole('menuitem', {name: 'Destination'})).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(window.location.hash).toBe('#destination'));
    expect(screen.getByLabelText('Selection')).toHaveTextContent('Destination');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('restores custom-router navigation only after the focused destination becomes available', async () => {
    const user = userEvent.setup();
    function Router({
      href,
      to,
      ref: _ref,
      onClickCapture,
      ...props
    }: ComponentPropsWithRef<'a'> & {to?: string}) {
      if (!href || href !== to) {
        throw new Error('The router requires its original destination');
      }
      return (
        <a
          {...props}
          href={to}
          onClickCapture={event => {
            event.preventDefault();
            window.history.pushState(null, '', href);
            onClickCapture?.(event);
          }}
        />
      );
    }
    const {rerender} = render(
      <LinkProvider component={Router}>
        <NavigationExample isDisabled={false} />
      </LinkProvider>,
    );
    screen.getByRole('menuitem', {name: 'Destination'}).focus();
    rerender(
      <LinkProvider component={Router}>
        <NavigationExample isDisabled />
      </LinkProvider>,
    );
    const item = screen.getByRole('menuitem', {name: 'Destination'});
    expect(item).toHaveFocus();
    expect(item).not.toHaveAttribute('href');
    await user.keyboard('{Enter}{ }');
    await user.click(item);
    expect(window.location.hash).toBe('');
    expect(screen.getByLabelText('Selection')).toHaveTextContent('None');
    expect(screen.getByRole('menu')).toBeInTheDocument();

    rerender(
      <LinkProvider component={Router}>
        <NavigationExample isDisabled={false} />
      </LinkProvider>,
    );
    expect(screen.getByRole('menuitem', {name: 'Destination'})).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(window.location.hash).toBe('#destination');
    expect(screen.getByLabelText('Selection')).toHaveTextContent('Destination');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('keeps a class-router destination focused and inactive until it is available', async () => {
    class Router extends Component<
      ComponentPropsWithoutRef<'a'> & {to?: string}
    > {
      render() {
        const {to, ...props} = this.props;
        return <a {...props} href={to} />;
      }
    }
    const user = userEvent.setup();
    const fixture = (isDisabled: boolean) => (
      <LinkProvider component={Router}>
        <NavigationExample isDisabled={isDisabled} />
      </LinkProvider>
    );
    const {rerender} = render(fixture(false));
    screen.getByRole('menuitem', {name: 'Destination'}).focus();
    rerender(fixture(true));
    const disabled = screen.getByRole('menuitem', {name: 'Destination'});
    expect(disabled).toHaveFocus();
    expect(disabled).toHaveAttribute('aria-disabled', 'true');
    expect(disabled).toHaveAttribute('tabindex', '-1');
    expect(disabled).not.toHaveAttribute('href');
    await user.keyboard('{Enter}{ }');
    await user.click(disabled);
    expect(window.location.hash).toBe('');
    expect(screen.getByLabelText('Selection')).toHaveTextContent('None');
    expect(screen.getByRole('menu')).toBeInTheDocument();

    rerender(fixture(false));
    expect(screen.getByRole('menuitem', {name: 'Destination'})).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(window.location.hash).toBe('#destination'));
    expect(screen.getByLabelText('Selection')).toHaveTextContent('Destination');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('restores navigation with a router that composes callback refs without cleanup forwarding', async () => {
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
    const user = userEvent.setup();
    const ref = createRef<HTMLElement>();
    const fixture = (isDisabled: boolean) => (
      <StrictMode>
        <LinkProvider component={Router}>
          <NavigationExample isDisabled={isDisabled} itemRef={ref} />
        </LinkProvider>
      </StrictMode>
    );
    const {rerender} = render(fixture(false));
    screen.getByRole('menuitem', {name: 'Destination'}).focus();
    rerender(fixture(true));
    const disabled = screen.getByRole('menuitem', {name: 'Destination'});
    expect(disabled).toHaveFocus();
    expect(ref.current).toBe(disabled);
    await user.keyboard('{Enter}');
    expect(window.location.hash).toBe('');
    expect(screen.getByLabelText('Selection')).toHaveTextContent('None');

    rerender(fixture(false));
    const enabled = screen.getByRole('menuitem', {name: 'Destination'});
    expect(enabled).toHaveFocus();
    expect(ref.current).toBe(enabled);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(window.location.hash).toBe('#destination'));
    expect(screen.getByLabelText('Selection')).toHaveTextContent('Destination');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(ref.current).toBeNull();
  });

  it('leaves focus with another control, including a caller-directed handoff', async () => {
    const user = userEvent.setup();
    const notesRef = createRef<HTMLInputElement>();
    let handOffFocus = false;
    const itemRef = (node: HTMLElement | null) => {
      if (!node && handOffFocus) {
        notesRef.current?.focus();
      }
    };
    const fixture = (isDisabled: boolean) => (
      <>
        <NavHeadingMenuItem
          ref={itemRef}
          label="Destination"
          href="#destination"
          isDisabled={isDisabled}
        />
        <label>
          Notes
          <input ref={notesRef} />
        </label>
      </>
    );
    const {rerender} = render(fixture(false));
    const notes = screen.getByRole('textbox', {name: 'Notes'});
    await user.click(notes);
    rerender(fixture(true));
    expect(notes).toHaveFocus();
    rerender(fixture(false));
    expect(notes).toHaveFocus();

    screen.getByRole('menuitem', {name: 'Destination'}).focus();
    handOffFocus = true;
    rerender(fixture(true));
    expect(notes).toHaveFocus();
    await user.keyboard('Still editing');
    expect(notes).toHaveValue('Still editing');
    rerender(fixture(false));
    expect(notes).toHaveFocus();
    handOffFocus = false;
  });

  it('renders initially disabled router items without a destination or router invocation', () => {
    const router = vi.fn(() => {
      throw new Error('An initially disabled item must not mount its router');
    });
    const html = renderToString(
      <LinkProvider component={router}>
        <NavHeadingMenuItem
          label="Destination"
          href="/destination"
          isDisabled
        />
      </LinkProvider>,
    );
    expect(router).not.toHaveBeenCalled();
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toContain('href=');
  });

  it('does not turn a rejected destination into a disabled item or invoke its router', async () => {
    const user = userEvent.setup();
    const router = vi.fn();
    const onClick = vi.fn();
    const rejectedHref = 'javascript:alert(1)';
    render(
      <LinkProvider component={router}>
        <NavHeadingMenuItem
          label="Destination"
          // eslint-disable-next-line @eslint-react/dom-no-script-url -- verifies rejection before router handoff
          href={rejectedHref}
          onClick={onClick}
        />
      </LinkProvider>,
    );
    const item = screen.getByRole('menuitem');
    expect(router).not.toHaveBeenCalled();
    expect(item).not.toHaveAttribute('href');
    expect(item).not.toHaveAttribute('aria-disabled');
    await user.click(item);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('blocks link keyboard changes without hiding activation keys from a parent', async () => {
    const user = userEvent.setup();
    function Example({isDisabled}: {isDisabled: boolean}) {
      const [changes, setChanges] = useState(0);
      const [observedKey, setObservedKey] = useState('');
      const applyFromKeyboard: KeyboardEventHandler<HTMLElement> = event => {
        if (event.key === 'Enter' || event.key === ' ') {
          setChanges(value => value + 1);
        }
      };
      return (
        <div
          onKeyDown={event =>
            setObservedKey(event.key === ' ' ? 'Space' : event.key)
          }>
          <NavHeadingMenuItem
            label="Apply change"
            href="#destination"
            isDisabled={isDisabled}
            onKeyDownCapture={applyFromKeyboard}
            onKeyDown={applyFromKeyboard}
            onKeyPressCapture={applyFromKeyboard}
            onKeyPress={applyFromKeyboard}
            onKeyUpCapture={applyFromKeyboard}
            onKeyUp={applyFromKeyboard}
          />
          <output aria-label="Applied changes">{changes}</output>
          <output aria-label="Observed key">{observedKey}</output>
        </div>
      );
    }
    const {rerender} = render(<Example isDisabled={false} />);
    screen.getByRole('menuitem', {name: 'Apply change'}).focus();
    rerender(<Example isDisabled />);
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('Applied changes')).toHaveTextContent(/^0$/);
    expect(screen.getByLabelText('Observed key')).toHaveTextContent('Enter');
    await user.keyboard('{ }');
    expect(screen.getByLabelText('Applied changes')).toHaveTextContent(/^0$/);
    expect(screen.getByLabelText('Observed key')).toHaveTextContent('Space');
    expect(window.location.hash).toBe('');
    expect(screen.getByRole('menuitem', {name: 'Apply change'})).toHaveFocus();

    rerender(<Example isDisabled={false} />);
    expect(screen.getByRole('menuitem', {name: 'Apply change'})).toHaveFocus();
    await user.keyboard('{Enter}{ }');
    expect(screen.getByLabelText('Applied changes')).toHaveTextContent(/^12$/);
    await waitFor(() => expect(window.location.hash).toBe('#destination'));
  });

  it('keeps a focused unavailable action inactive until it is reenabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const onClickCapture = vi.fn();
    const onAuxClick = vi.fn();
    const onAuxClickCapture = vi.fn();
    const onDoubleClick = vi.fn();
    const onDoubleClickCapture = vi.fn();
    const closeMenu = vi.fn();
    const ref = createRef<HTMLElement>();
    const fixture = (isDisabled: boolean) => (
      <NavHeadingCloseContext value={{closeMenu}}>
        <NavHeadingMenu>
          <NavHeadingMenuItem
            ref={ref}
            label="Action"
            isDisabled={isDisabled}
            onClick={onClick}
            onClickCapture={onClickCapture}
            onAuxClick={onAuxClick}
            onAuxClickCapture={onAuxClickCapture}
            onDoubleClick={onDoubleClick}
            onDoubleClickCapture={onDoubleClickCapture}
          />
        </NavHeadingMenu>
      </NavHeadingCloseContext>
    );
    const {rerender, unmount} = render(fixture(false));
    const item = screen.getByRole('menuitem');
    item.focus();
    rerender(fixture(true));
    expect(screen.getByRole('menuitem')).toBe(item);
    expect(ref.current).toBe(item);
    expect(item).toHaveFocus();
    expect(item).toHaveAttribute('tabindex', '-1');
    expect(item).toHaveAttribute('aria-disabled', 'true');
    await user.keyboard('{Enter}{ }');
    await user.click(item);
    await user.pointer({target: item, keys: '[MouseMiddle]'});
    await user.dblClick(item);
    for (const handler of [
      onClick,
      onClickCapture,
      onAuxClick,
      onAuxClickCapture,
      onDoubleClick,
      onDoubleClickCapture,
      closeMenu,
    ]) {
      expect(handler).not.toHaveBeenCalled();
    }
    expect(item).toHaveFocus();
    rerender(fixture(false));
    expect(ref.current).toBe(item);
    expect(item).toHaveFocus();
    await user.keyboard('{Enter}{ }');
    await user.click(item);
    await user.pointer({target: item, keys: '[MouseMiddle]'});
    await user.dblClick(item);
    expect(onClick).toHaveBeenCalledTimes(5);
    expect(onClickCapture).toHaveBeenCalledTimes(5);
    expect(closeMenu).toHaveBeenCalledTimes(5);
    expect(onAuxClick).toHaveBeenCalledOnce();
    expect(onAuxClickCapture).toHaveBeenCalledOnce();
    expect(onDoubleClick).toHaveBeenCalledOnce();
    expect(onDoubleClickCapture).toHaveBeenCalledOnce();
    unmount();
    expect(ref.current).toBeNull();
  });

  it('does not save changes or close the menu when a focused action becomes unavailable', async () => {
    const user = userEvent.setup();
    function Example({isDisabled}: {isDisabled: boolean}) {
      const [status, setStatus] = useState('Unsaved');
      const [isOpen, setIsOpen] = useState(true);
      const [parentKeyDown, setParentKeyDown] = useState('');
      const [parentKeyUp, setParentKeyUp] = useState('');
      const closeContext = useMemo(
        () => ({closeMenu: () => setIsOpen(false)}),
        [],
      );
      const saveFromKeyboard: KeyboardEventHandler<HTMLElement> = event => {
        if (event.key === 'Enter' || event.key === ' ') {
          setStatus('Saved');
        }
      };
      return (
        <>
          <NavHeadingCloseContext value={closeContext}>
            {isOpen && (
              <NavHeadingMenu
                onKeyDown={event =>
                  setParentKeyDown(event.key === ' ' ? 'Space' : event.key)
                }
                onKeyUp={event =>
                  setParentKeyUp(event.key === ' ' ? 'Space' : event.key)
                }>
                <NavHeadingMenuItem
                  label="Save changes"
                  isDisabled={isDisabled}
                  onClick={() => setStatus('Saved')}
                  onKeyDownCapture={saveFromKeyboard}
                  onKeyDown={saveFromKeyboard}
                  onKeyPressCapture={saveFromKeyboard}
                  onKeyPress={saveFromKeyboard}
                  onKeyUpCapture={saveFromKeyboard}
                  onKeyUp={saveFromKeyboard}
                />
              </NavHeadingMenu>
            )}
          </NavHeadingCloseContext>
          <output aria-label="Document status">{status}</output>
          <output aria-label="Menu key down">{parentKeyDown}</output>
          <output aria-label="Menu key up">{parentKeyUp}</output>
        </>
      );
    }
    const {rerender} = render(<Example isDisabled={false} />);
    const item = screen.getByRole('menuitem', {name: 'Save changes'});
    item.focus();
    rerender(<Example isDisabled />);

    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('Document status')).toHaveTextContent(
      'Unsaved',
    );
    expect(screen.getByLabelText('Menu key down')).toHaveTextContent('Enter');
    expect(screen.getByLabelText('Menu key up')).toHaveTextContent('Enter');
    expect(item).toHaveFocus();
    await user.keyboard('{ }');
    expect(screen.getByLabelText('Document status')).toHaveTextContent(
      'Unsaved',
    );
    expect(screen.getByLabelText('Menu key down')).toHaveTextContent('Space');
    expect(screen.getByLabelText('Menu key up')).toHaveTextContent('Space');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(item).toHaveFocus();
    expect(item).toHaveAttribute('tabindex', '-1');

    rerender(<Example isDisabled={false} />);
    expect(item).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('Document status')).toHaveTextContent('Saved');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('blocks standalone keyboard changes while unavailable and restores every accepted phase on reenable', async () => {
    const user = userEvent.setup();
    function Example({isDisabled}: {isDisabled: boolean}) {
      const [changes, setChanges] = useState(0);
      const [inspectedKey, setInspectedKey] = useState('');
      const applyFromKeyboard: KeyboardEventHandler<HTMLElement> = event => {
        if (event.key === 'Enter' || event.key === ' ') {
          setChanges(value => value + 1);
        } else {
          setInspectedKey(event.key);
        }
      };
      return (
        <>
          <NavHeadingMenuItem
            label="Apply change"
            isDisabled={isDisabled}
            onKeyDownCapture={applyFromKeyboard}
            onKeyDown={applyFromKeyboard}
            onKeyPressCapture={applyFromKeyboard}
            onKeyPress={applyFromKeyboard}
            onKeyUpCapture={applyFromKeyboard}
            onKeyUp={applyFromKeyboard}
          />
          <output aria-label="Applied changes">{changes}</output>
          <output aria-label="Inspected key">{inspectedKey}</output>
        </>
      );
    }
    const {rerender} = render(<Example isDisabled={false} />);
    const item = screen.getByRole('menuitem', {name: 'Apply change'});
    item.focus();
    rerender(<Example isDisabled />);
    await user.keyboard('{Enter}{ }');
    expect(screen.getByLabelText('Applied changes')).toHaveTextContent(/^0$/);
    expect(item).toHaveFocus();
    expect(item).toHaveAttribute('tabindex', '-1');

    await user.keyboard('a');
    expect(screen.getByLabelText('Inspected key')).toHaveTextContent('a');
    expect(screen.getByLabelText('Applied changes')).toHaveTextContent(/^0$/);
    rerender(<Example isDisabled={false} />);
    expect(item).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('Applied changes')).toHaveTextContent(/^6$/);
    await user.keyboard('{ }');
    expect(screen.getByLabelText('Applied changes')).toHaveTextContent(/^12$/);
  });

  it('preserves observation events and caller-rendered child activation on a disabled action', async () => {
    const user = userEvent.setup();
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    const onPointerEnter = vi.fn();
    const onPointerLeave = vi.fn();
    const onKeyDown = vi.fn();
    const onClick = vi.fn();
    const onClickCapture = vi.fn();
    const childClick = vi.fn();
    const childAuxClick = vi.fn();
    const childKeyDown = vi.fn();
    const childKeyUp = vi.fn();
    const ancestorClick = vi.fn();
    render(
      <div onClick={ancestorClick}>
        <NavHeadingMenu>
          <NavHeadingMenuItem label="First" />
          <NavHeadingMenuItem
            isDisabled
            label={
              <a
                href="#child-destination"
                onClick={childClick}
                onAuxClick={childAuxClick}
                onKeyDown={childKeyDown}
                onKeyUp={childKeyUp}>
                Child destination
              </a>
            }
            onClick={onClick}
            onClickCapture={onClickCapture}
            onFocus={onFocus}
            onBlur={onBlur}
            onPointerEnter={onPointerEnter}
            onPointerLeave={onPointerLeave}
            onKeyDown={onKeyDown}
          />
          <NavHeadingMenuItem label="Last" />
        </NavHeadingMenu>
      </div>,
    );
    const item = screen.getByRole('menuitem', {name: 'Child destination'});
    item.focus();
    await user.hover(item);
    await user.unhover(item);
    await user.keyboard('{ArrowDown}');
    expect(onFocus).toHaveBeenCalledOnce();
    expect(onBlur).toHaveBeenCalledOnce();
    expect(onPointerEnter).toHaveBeenCalledOnce();
    expect(onPointerLeave).toHaveBeenCalledOnce();
    expect(onKeyDown).toHaveBeenCalledOnce();
    expect(screen.getByRole('menuitem', {name: 'Last'})).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', {name: 'First'})).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(item).toHaveFocus();
    await user.keyboard('f');
    expect(screen.getByRole('menuitem', {name: 'First'})).toHaveFocus();

    const child = screen.getByRole('link', {name: 'Child destination'});
    expect(child).toHaveAttribute('href', '#child-destination');
    await user.click(child);
    await user.pointer({target: child, keys: '[MouseMiddle]'});
    expect(childClick).toHaveBeenCalledOnce();
    expect(childAuxClick).toHaveBeenCalledOnce();
    expect(ancestorClick).toHaveBeenCalledOnce();
    expect(onClick).not.toHaveBeenCalled();
    expect(onClickCapture).not.toHaveBeenCalled();
    onKeyDown.mockClear();
    child.focus();
    await user.keyboard('{Enter}');
    expect(childKeyDown).toHaveBeenCalledOnce();
    expect(childKeyUp).toHaveBeenCalledOnce();
    expect(childClick).toHaveBeenCalledTimes(2);
    expect(ancestorClick).toHaveBeenCalledTimes(2);
    expect(onKeyDown).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(window.location.hash).toBe('#child-destination'),
    );
  });

  it('preserves enabled keyboard cancellation in capture and bubble phases', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const parentDown = vi.fn();
    const parentUp = vi.fn();
    const pressPrevented: boolean[] = [];
    render(
      <div onKeyDown={parentDown} onKeyUp={parentUp}>
        <NavHeadingMenu>
          <NavHeadingMenuItem
            label="Menu action"
            onClick={onClick}
            onKeyDownCapture={event => event.stopPropagation()}
          />
        </NavHeadingMenu>
        <NavHeadingMenuItem
          label="Standalone action"
          onKeyPressCapture={event => event.preventDefault()}
          onKeyPress={event => pressPrevented.push(event.defaultPrevented)}
          onKeyUp={event => event.stopPropagation()}
        />
      </div>,
    );
    screen.getByRole('menuitem', {name: 'Menu action'}).focus();
    await user.keyboard('{Enter}');
    expect(onClick).not.toHaveBeenCalled();
    expect(parentDown).not.toHaveBeenCalled();
    parentUp.mockClear();
    screen.getByRole('menuitem', {name: 'Standalone action'}).focus();
    await user.keyboard('{Enter}{ }');
    expect(pressPrevented).toEqual([true, true]);
    expect(parentUp).not.toHaveBeenCalled();
    expect(parentDown).toHaveBeenCalledTimes(2);
  });

  it('preserves enabled capture composition and consumer cancellation', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const closeMenu = vi.fn();
    const ancestorAuxClick = vi.fn();
    const events: string[] = [];
    const fixture = (cancel: boolean) => (
      <div onAuxClick={ancestorAuxClick}>
        <NavHeadingCloseContext value={{closeMenu}}>
          <NavHeadingMenu>
            <NavHeadingMenuItem
              label="Action"
              onClick={onClick}
              onClickCapture={event => {
                events.push('capture');
                if (cancel) {
                  event.stopPropagation();
                }
              }}
              onAuxClickCapture={event => {
                events.push(
                  `aux-capture:${event.currentTarget.getAttribute('role')}`,
                );
                event.preventDefault();
              }}
              onAuxClick={event => {
                events.push(`aux:${event.defaultPrevented}`);
                event.stopPropagation();
              }}
            />
          </NavHeadingMenu>
        </NavHeadingCloseContext>
      </div>
    );
    const {rerender} = render(fixture(true));
    const item = screen.getByRole('menuitem');
    await user.click(item);
    expect(events).toEqual(['capture']);
    expect(onClick).not.toHaveBeenCalled();
    expect(closeMenu).not.toHaveBeenCalled();
    rerender(fixture(false));
    await user.click(item);
    expect(onClick).toHaveBeenCalledOnce();
    expect(closeMenu).toHaveBeenCalledOnce();
    await user.pointer({target: item, keys: '[MouseMiddle]'});
    expect(events).toEqual([
      'capture',
      'capture',
      'aux-capture:menuitem',
      'aux:true',
    ]);
    expect(ancestorAuxClick).not.toHaveBeenCalled();
  });
});
