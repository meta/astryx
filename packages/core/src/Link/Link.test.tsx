// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Link.test.tsx
 * @input Uses vitest, @testing-library/react, Link component
 * @output Unit tests for Link component behavior
 * @position Testing; validates Link.tsx implementation
 *
 * SYNC: When Link.tsx changes, update tests to match new behavior
 */

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
    // With onClick present, a disabled Link renders as a disabled <button>
    // (useInteractiveRole excludes a disabled href). Either way the rendered
    // root must carry no live href and never invoke the consumer handler.
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

  it('keeps the reflected data-color when a caller passes its own', () => {
    const callerProps = {'data-color': 'danger'};
    render(
      <>
        <Link href="/test" color="secondary" {...callerProps}>
          Anchor Link
        </Link>
        <Link color="secondary" onClick={() => {}} {...callerProps}>
          Button Link
        </Link>
        <Link href="/test" color="secondary" isDisabled {...callerProps}>
          Disabled Link
        </Link>
      </>,
    );
    expect(screen.getByRole('link', {name: 'Anchor Link'})).toHaveAttribute(
      'data-color',
      'secondary',
    );
    expect(screen.getByRole('button', {name: 'Button Link'})).toHaveAttribute(
      'data-color',
      'secondary',
    );
    expect(screen.getByRole('link', {name: 'Disabled Link'})).toHaveAttribute(
      'data-color',
      'secondary',
    );
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

// =============================================================================
// Display: an ancestor clamp (<Text maxLines>) can only truncate an anchor
// that participates in the surrounding line boxes, so the plain anchor must
// be `inline`; flex layout is reserved for the icon/button forms (#6021).
// =============================================================================

/**
 * Extracts class-name tokens from a CSS selector (e.g. the selectorText of
 * a CSSStyleRule), so callers can match against an element's classList by
 * exact token rather than by substring. Handles compound selectors
 * (`.a.b:hover`) and comma-separated selector lists (`.a, .b`).
 */
function classTokensFromSelector(selectorText: string): string[] {
  const tokens: string[] = [];
  const classRegex = /\.([-_a-zA-Z0-9]+)/g;
  let match: RegExpExecArray | null;
  while ((match = classRegex.exec(selectorText)) !== null) {
    tokens.push(match[1]);
  }
  return tokens;
}

/**
 * Recursively collects every CSSStyleRule from a rule list, descending into
 * grouping rules (e.g. `@media`) so declarations nested in a condition are
 * not missed.
 */
function collectStyleRules(rules: CSSRuleList, out: CSSStyleRule[]): void {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) {
      out.push(rule);
    } else if ('cssRules' in rule && rule.cssRules) {
      collectStyleRules((rule as CSSGroupingRule).cssRules, out);
    }
  }
}

/**
 * Returns the `display` value of every injected CSS rule that targets `el`,
 * matched via the CSSOM (real selector tokens + real class list) rather than
 * substring checks on raw selector/body text — a hashed atomic class like
 * `x1a` can be a substring of an unrelated class like `x1a2b3c4`, so
 * string-based matching can both false-positive and false-negative.
 */
function displayDeclarationsFor(el: Element): string[] {
  const classes = new Set(Array.from(el.classList));
  const styleRules: CSSStyleRule[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    collectStyleRules(rules, styleRules);
  }

  const declarations: string[] = [];
  for (const rule of styleRules) {
    const matchesElement = classTokensFromSelector(rule.selectorText).some(
      token => classes.has(token),
    );
    if (!matchesElement) {
      continue;
    }
    const display = rule.style.getPropertyValue('display');
    if (display) {
      declarations.push(display.trim());
    }
  }
  return declarations;
}

describe('Link display', () => {
  it('renders a plain anchor inline so an ancestor clamp can reach it', () => {
    const {container} = render(<Link href="/docs">Documentation</Link>);
    const anchor = container.querySelector('a')!;
    expect(displayDeclarationsFor(anchor)).toContain('inline');
    expect(displayDeclarationsFor(anchor)).not.toContain('inline-flex');
  });

  it('keeps flex layout for the external-link icon form', () => {
    const {container} = render(
      <Link href="https://example.com" isExternalLink>
        External docs
      </Link>,
    );
    const anchor = container.querySelector('a')!;
    expect(displayDeclarationsFor(anchor)).toContain('inline-flex');
  });

  it('keeps the flex root (visible focus box) for display="block" links', () => {
    const {container} = render(
      <Link href="/docs" display="block">
        Documentation
      </Link>,
    );
    expect(displayDeclarationsFor(container.querySelector('a')!)).toContain(
      'inline-flex',
    );
  });

  it('keeps the flex root for links clamping themselves via maxLines', () => {
    const {container} = render(
      <Link href="/docs" maxLines={2}>
        Documentation
      </Link>,
    );
    expect(displayDeclarationsFor(container.querySelector('a')!)).toContain(
      'inline-flex',
    );
  });

  it('keeps flex layout for the button-rendered form', () => {
    const {container} = render(
      <Link onClick={() => {}} role="button">
        Action
      </Link>,
    );
    const button = container.querySelector('button')!;
    expect(displayDeclarationsFor(button)).toContain('inline-flex');
  });
});
