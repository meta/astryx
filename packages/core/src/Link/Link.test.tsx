// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Link.test.tsx
 * @input Uses vitest, @testing-library/react, Link component
 * @output Unit tests for Link component behavior
 * @position Testing; validates Link.tsx implementation
 *
 * SYNC: When Link.tsx changes, update tests to match new behavior
 */

import {Component, StrictMode, useRef} from 'react';
import {describe, it, expect, vi} from 'vitest';
import {fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {hasPressedArm} from '../__tests__/pressState';
import {Link} from './Link';
import {LinkProvider} from './LinkProvider';

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

describe('Link', () => {
  it('renders children as link text', () => {
    render(<Link href="/test">Click me</Link>);
    expect(screen.getByRole('link', {name: 'Click me'})).toBeInTheDocument();
  });

  it('renders with href attribute', () => {
    render(<Link href="/destination">Link</Link>);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/destination');
  });

  it('renders as a button when href is undefined', () => {
    render(<Link>Action</Link>);
    expect(screen.getByRole('button', {name: 'Action'})).toBeInTheDocument();
  });

  it('renders as a button when href is explicitly undefined', () => {
    render(<Link href={undefined}>Action</Link>);
    expect(screen.getByRole('button', {name: 'Action'})).toBeInTheDocument();
  });

  it('button fallback fires onClick', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Link onClick={handleClick}>Click me</Link>);

    await user.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('button fallback stays focusable and inert when isDisabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Link isDisabled onClick={onClick}>
        Disabled Action
      </Link>,
    );
    const button = screen.getByRole('button');
    expect(button).not.toHaveAttribute('disabled');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    const nativeClick = vi.fn();
    button.addEventListener('click', nativeClick);
    await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard('{Enter} ');
    expect(nativeClick).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('button fallback has type="button"', () => {
    render(<Link>Action</Link>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('button fallback supports aria-label via label prop', () => {
    render(
      <Link label="Close dialog">
        <span aria-hidden="true">✕</span>
      </Link>,
    );
    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-label',
      'Close dialog',
    );
  });

  it('does not render aria-label when label is omitted', () => {
    render(<Link href="/test">Visible text</Link>);
    expect(screen.getByRole('link')).not.toHaveAttribute('aria-label');
  });

  it('renders aria-label when label prop is provided', () => {
    render(
      <Link label="Accessible label" href="/test">
        <span aria-hidden="true">🏠</span>
      </Link>,
    );
    expect(screen.getByRole('link')).toHaveAttribute(
      'aria-label',
      'Accessible label',
    );
  });

  it('renders with different color values', () => {
    const {rerender} = render(
      <Link href="/test" color="accent">
        Accent
      </Link>,
    );
    expect(screen.getByRole('link')).toBeInTheDocument();

    rerender(
      <Link href="/test" color="secondary">
        Secondary
      </Link>,
    );
    expect(screen.getByRole('link')).toBeInTheDocument();

    rerender(
      <Link href="/test" color="inherit">
        Inherit
      </Link>,
    );
    expect(screen.getByRole('link')).toBeInTheDocument();
  });

  it('defaults the inner text type to body', () => {
    render(<Link href="/test">Body link</Link>);
    expect(screen.getByText('Body link')).toHaveClass('astryx-text');
    expect(screen.getByText('Body link')).toHaveAttribute('data-type', 'body');
  });

  it('forwards type="inherit" so the link adopts the surrounding text type', () => {
    render(
      <Link href="/test" type="inherit">
        Inline link
      </Link>,
    );
    // The inner Text renders with the `inherit` type, so font-size/line-height
    // inherit from the surrounding text rather than imposing the body type.
    const text = screen.getByText('Inline link');
    expect(text).toHaveClass('astryx-text');
    expect(text).toHaveAttribute('data-type', 'inherit');
    expect(text).not.toHaveAttribute('data-type', 'body');
  });

  it('applies hasUnderline style when true', () => {
    render(
      <Link href="/test" hasUnderline>
        Underlined Link
      </Link>,
    );
    expect(screen.getByRole('link')).toBeInTheDocument();
  });

  it('applies isDisabled state correctly', () => {
    render(
      <Link href="/test" isDisabled>
        Disabled Link
      </Link>,
    );
    // The href-less anchor keeps a Tab stop and an explicit link role.
    const link = screen.getByRole('link', {name: 'Disabled Link'});
    expect(link).toHaveAttribute('aria-disabled', 'true');
    expect(link).toHaveAttribute('tabIndex', '0');
    // Visual classes are preserved in the disabled state.
    expect(link?.className).toContain('astryx-link');
  });

  it('disabled link has no href attribute', () => {
    render(
      <Link href="/test" isDisabled>
        Disabled Link
      </Link>,
    );
    const link = screen.getByText('Disabled Link').closest('a');
    expect(link).not.toBeNull();
    expect(link).not.toHaveAttribute('href');
  });

  it('clicking a disabled link cancels default navigation', () => {
    render(
      <Link href="/test" isDisabled>
        Disabled Link
      </Link>,
    );
    const link = screen.getByText('Disabled Link').closest('a');
    expect(link).not.toBeNull();
    // fireEvent bypasses pointer-events, simulating programmatic/AT
    // activation. It returns false when preventDefault was called, i.e.
    // any default navigation behavior is cancelled.
    const notCancelled = fireEvent.click(link as HTMLAnchorElement);
    expect(notCancelled).toBe(false);
  });

  it('disabled link with onClick fires neither navigation nor the consumer onClick', () => {
    const handleClick = vi.fn();
    const {container} = render(
      <Link href="/test" isDisabled onClick={handleClick}>
        Disabled Link
      </Link>,
    );
    // A disabled href link keeps its link role but no live destination.
    const el = container.firstElementChild as HTMLElement;
    expect(el).not.toHaveAttribute('href');
    fireEvent.click(el);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('disabled link omits target and rel', () => {
    render(
      <Link href="https://example.com" isDisabled isExternalLink>
        Disabled External
      </Link>,
    );
    const link = screen.getByText('Disabled External').closest('a');
    expect(link).not.toBeNull();
    expect(link).not.toHaveAttribute('target');
    expect(link).not.toHaveAttribute('rel');
  });

  it('disabled link renders a plain anchor, not the custom LinkComponent', () => {
    render(
      <LinkProvider component={CustomLink}>
        <Link href="/custom" as={CustomLink} isDisabled>
          Disabled Custom
        </Link>
      </LinkProvider>,
    );
    const link = screen.getByText('Disabled Custom').closest('a');
    expect(link).not.toBeNull();
    expect(link).not.toHaveAttribute('data-custom-link');
    expect(link).not.toHaveAttribute('href');
  });

  it('keeps a focused href link with onClick inert and reachable across disablement', async () => {
    const user = userEvent.setup();
    const ref = vi.fn();
    const onClick = vi.fn();
    const fixture = (isDisabled: boolean) => (
      <>
        <Link
          href="#destination"
          onClick={onClick}
          isDisabled={isDisabled}
          aria-describedby="reason"
          ref={ref}>
          Destination
        </Link>
        <span id="reason">Unavailable reason</span>
        <button type="button">After</button>
      </>
    );
    const {rerender} = render(fixture(false));
    await user.tab();
    expect(screen.getByRole('link')).toHaveFocus();

    rerender(fixture(true));
    const link = screen.getByRole('link');
    expect(link).toHaveFocus();
    expect(link).toHaveAttribute('aria-disabled', 'true');
    expect(link).not.toHaveAttribute('href');
    expect(link).toHaveAccessibleDescription('Unavailable reason');
    await user.keyboard('{Enter} ');
    expect(fireEvent.click(link)).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
    await user.tab();
    expect(screen.getByRole('button', {name: 'After'})).toHaveFocus();
    await user.tab({shift: true});
    expect(link).toHaveFocus();

    rerender(fixture(false));
    const enabled = screen.getByRole('link');
    expect(enabled).toHaveFocus();
    expect(enabled).toHaveAttribute('href', '#destination');
    expect(ref).toHaveBeenLastCalledWith(enabled);
  });

  it('keeps a focused provider link and its explicit negative tabIndex when disabled', async () => {
    function RouterLink({
      href,
      ref: _ref,
      ...props
    }: React.ComponentPropsWithRef<'a'>) {
      if (href == null) {
        throw new Error('RouterLink requires a destination');
      }
      return <a {...props} data-router="true" href={href} />;
    }
    const user = userEvent.setup();
    const fixture = (isDisabled: boolean) => (
      <LinkProvider component={RouterLink}>
        <button type="button">Before</button>
        <Link href="#destination" tabIndex={-1} isDisabled={isDisabled}>
          Destination
        </Link>
        <button type="button">After</button>
      </LinkProvider>
    );
    const {rerender} = render(fixture(false));
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('data-router', 'true');
    link.focus();
    rerender(fixture(true));
    const disabled = screen.getByRole('link');
    expect(disabled).toHaveFocus();
    expect(disabled).not.toHaveAttribute('href');
    expect(disabled).toHaveAttribute('tabindex', '-1');
    screen.getByRole('button', {name: 'Before'}).focus();
    await user.tab();
    expect(screen.getByRole('button', {name: 'After'})).toHaveFocus();

    disabled.focus();
    rerender(fixture(false));
    expect(screen.getByRole('link')).toHaveFocus();
    expect(screen.getByRole('link')).toHaveAttribute('href', '#destination');
  });

  it('restores navigation with an ordinary composed callback ref', () => {
    function Router({ref, ...props}: React.ComponentPropsWithRef<'a'>) {
      const internalRef = useRef<HTMLAnchorElement | null>(null);
      return (
        <a
          {...props}
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
    const onClick = vi.fn();
    const fixture = (isDisabled: boolean) => (
      <StrictMode>
        <Link
          as={Router}
          href="#destination"
          isDisabled={isDisabled}
          onClick={onClick}>
          Destination
        </Link>
      </StrictMode>
    );
    const {rerender} = render(fixture(false));
    screen.getByRole('link').focus();
    rerender(fixture(true));
    expect(screen.getByRole('link')).toHaveFocus();
    rerender(fixture(false));
    const enabled = screen.getByRole('link');
    expect(enabled).toHaveFocus();
    expect(enabled).toHaveAttribute('href', '#destination');
    fireEvent.click(enabled);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('keeps class adapters compatible with disabled transitions', () => {
    class Router extends Component<React.ComponentPropsWithoutRef<'a'>> {
      render() {
        return <a {...this.props} />;
      }
    }
    const fixture = (isDisabled: boolean) => (
      <Link as={Router} href="#destination" isDisabled={isDisabled}>
        Destination
      </Link>
    );
    const {rerender} = render(fixture(false));
    screen.getByRole('link').focus();
    rerender(fixture(true));
    expect(screen.getByRole('link')).toHaveFocus();
    expect(screen.getByRole('link')).not.toHaveAttribute('href');
    rerender(fixture(false));
    expect(screen.getByRole('link')).toHaveFocus();
    expect(screen.getByRole('link')).toHaveAttribute('href', '#destination');
  });

  it('does not invoke a custom router capture action while disabled', () => {
    const navigate = vi.fn();
    function Router({
      onClickCapture,
      ...props
    }: React.ComponentPropsWithRef<'a'>) {
      return (
        <a
          {...props}
          onClickCapture={event => {
            navigate();
            onClickCapture?.(event);
          }}
        />
      );
    }
    const fixture = (isDisabled: boolean) => (
      <Link as={Router} href="#destination" isDisabled={isDisabled}>
        Destination
      </Link>
    );
    const {rerender} = render(fixture(false));
    screen.getByRole('link').focus();
    rerender(fixture(true));
    expect(screen.getByRole('link')).toHaveFocus();
    expect(fireEvent.click(screen.getByRole('link'))).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    rerender(fixture(false));
    fireEvent.click(screen.getByRole('link'));
    expect(navigate).toHaveBeenCalledOnce();
  });

  it('does not take focus from another control during a disabled transition', () => {
    let moveFocusOnDetach = false;
    const ref = (node: HTMLAnchorElement | HTMLButtonElement | null) => {
      if (!node && moveFocusOnDetach) {
        document.getElementById('other')?.focus();
      }
    };
    const fixture = (isDisabled: boolean) => (
      <>
        <Link href="#destination" ref={ref} isDisabled={isDisabled}>
          Destination
        </Link>
        <button id="other" type="button">
          Other
        </button>
      </>
    );
    const {rerender} = render(fixture(false));
    const other = screen.getByRole('button', {name: 'Other'});
    other.focus();
    rerender(fixture(true));
    expect(other).toHaveFocus();
    rerender(fixture(false));
    expect(other).toHaveFocus();
    screen.getByRole('link').focus();
    moveFocusOnDetach = true;
    rerender(fixture(true));
    expect(other).toHaveFocus();
  });

  it('renders external link with icon and target="_blank"', () => {
    render(
      <Link href="https://example.com" isExternalLink>
        External Link
      </Link>,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link.querySelector('svg')).toBeInTheDocument();
  });

  it('announces the new-tab context via screen-reader text (obs-4)', () => {
    render(
      <Link href="https://example.com" isExternalLink>
        Docs
      </Link>,
    );
    // The link's accessible name includes the new-tab hint (the icon is
    // decorative).
    expect(
      screen.getByRole('link', {name: 'Docs (opens in new tab)'}),
    ).toBeInTheDocument();
  });

  it('supports a custom newTabLabel for localization', () => {
    render(
      <Link
        href="https://example.com"
        isExternalLink
        newTabLabel="(new window)">
        Docs
      </Link>,
    );
    expect(
      screen.getByRole('link', {name: 'Docs (new window)'}),
    ).toBeInTheDocument();
  });

  it('does not add new-tab text to non-external links', () => {
    render(<Link href="/internal">Internal</Link>);
    expect(screen.getByRole('link', {name: 'Internal'})).toBeInTheDocument();
  });

  it('renders external link with existing rel merged', () => {
    render(
      <Link href="https://example.com" isExternalLink rel="sponsored">
        External Link
      </Link>,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('rel', 'sponsored noopener noreferrer');
  });

  it('renders with custom target without isExternalLink', () => {
    render(
      <Link href="/test" target="_parent">
        Parent Link
      </Link>,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('target', '_parent');
  });

  it('adds safe rel tokens for explicit target="_blank"', () => {
    render(
      <Link href="/test" target="_blank">
        Blank Link
      </Link>,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('preserves existing rel tokens for explicit target="_blank"', () => {
    render(
      <Link href="/test" target="_blank" rel="sponsored noopener">
        Blank Link
      </Link>,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('rel', 'sponsored noopener noreferrer');
  });

  it('handles click events', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn((e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
    });
    render(
      <Link href="/test" onClick={handleClick}>
        Click me
      </Link>,
    );

    await user.click(screen.getByRole('link'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(
      <Link href="/test" ref={ref}>
        Test
      </Link>,
    );
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLAnchorElement));
  });

  it('renders standalone link', () => {
    render(
      <Link href="/standalone" isStandalone>
        Standalone Link
      </Link>,
    );
    expect(screen.getByRole('link')).toBeInTheDocument();
  });

  it('renders link with tooltip', () => {
    render(
      <Link href="/settings" tooltip="Configure settings">
        Settings
      </Link>,
    );
    const link = screen.getByRole('link', {name: 'Settings'});
    expect(link).toBeInTheDocument();
  });

  it('renders custom component when as is provided', () => {
    render(
      <Link href="/custom" as={CustomLink}>
        Custom Link
      </Link>,
    );
    const link = screen.getByRole('link', {name: 'Custom Link'});
    expect(link).toHaveAttribute('data-custom-link');
    expect(link).toHaveAttribute('href', '/custom');
  });

  it('renders custom component from LinkProvider', () => {
    render(
      <LinkProvider component={CustomLink}>
        <Link href="/provider">Provider Link</Link>
      </LinkProvider>,
    );
    const link = screen.getByRole('link', {name: 'Provider Link'});
    expect(link).toHaveAttribute('data-custom-link');
  });

  it('as prop overrides LinkProvider', () => {
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
    render(
      <LinkProvider component={AnotherLink}>
        <Link href="/override" as={CustomLink}>
          Override Link
        </Link>
      </LinkProvider>,
    );
    const link = screen.getByRole('link', {name: 'Override Link'});
    expect(link).toHaveAttribute('data-custom-link');
    expect(link).not.toHaveAttribute('data-another-link');
  });

  it('renders astryx-* class names for theme targeting', () => {
    render(
      <Link href="/test" color="secondary">
        Themed Link
      </Link>,
    );
    const link = screen.getByRole('link', {name: 'Themed Link'});
    expect(link.className).toContain('astryx-link');
    expect(link).toHaveAttribute('data-color', 'secondary');
  });
});

describe('pressed state', () => {
  it('paints the pressed overlay behind a link while it is pressed', () => {
    render(<Link href="/docs">Docs</Link>);
    expect(hasPressedArm(screen.getByRole('link', {name: 'Docs'}))).toBe(true);
  });

  it('paints it on the button form too', () => {
    render(<Link onClick={() => {}}>Open</Link>);
    expect(hasPressedArm(screen.getByRole('button', {name: 'Open'}))).toBe(
      true,
    );
  });

  it('does not press a disabled link', () => {
    render(
      <Link href="/docs" isDisabled>
        Docs
      </Link>,
    );
    expect(hasPressedArm(screen.getByText('Docs').closest('a')!)).toBe(false);
  });
});
