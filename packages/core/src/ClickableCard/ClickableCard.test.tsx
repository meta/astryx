// Copyright (c) Meta Platforms, Inc. and affiliates.

import {Activity, type ReactNode} from 'react';
import {describe, it, expect, vi} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {ClickableCard} from './ClickableCard';
import {LinkProvider} from '../Link';
import {
  afterPaintsPress,
  hasReleaseFade,
  pressArmsShadowedByDefault,
  readsPressStrength,
} from '../__tests__/pressState';

describe('ClickableCard', () => {
  it('renders children', () => {
    render(
      <ClickableCard label="Test card" onClick={() => {}}>
        <span>Card content</span>
      </ClickableCard>,
    );
    expect(screen.getByText('Card content')).toBeInTheDocument();
  });

  it('renders a hidden button for onClick cards', () => {
    render(
      <ClickableCard label="Test card" onClick={() => {}}>
        <span>Content</span>
      </ClickableCard>,
    );
    const button = screen.getByRole('button', {name: 'Test card'});
    expect(button).toBeInTheDocument();
  });

  it('renders a hidden link for href cards', () => {
    render(
      <ClickableCard label="Nav card" href="/settings">
        Content
      </ClickableCard>,
    );
    const link = screen.getByRole('link', {name: 'Nav card'});
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/settings');
  });

  it('calls onClick when card surface is clicked', () => {
    const handleClick = vi.fn();
    render(
      <ClickableCard label="Test card" onClick={handleClick}>
        <span>Content</span>
      </ClickableCard>,
    );
    // Click the card surface (the text), not the hidden button
    fireEvent.click(screen.getByText('Content'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('calls onClick once when the accessible control itself is clicked', () => {
    const handleClick = vi.fn();
    render(
      <ClickableCard label="Test card" onClick={handleClick}>
        <span>Content</span>
      </ClickableCard>,
    );
    // Pointer activation aimed at the element carrying the role — what
    // speech input, assistive technology, and automation dispatch.
    fireEvent.click(screen.getByRole('button', {name: 'Test card'}));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('passes the card surface as currentTarget for surface clicks', () => {
    const seen: EventTarget[] = [];
    render(
      <ClickableCard
        label="Test card"
        onClick={e => seen.push(e.currentTarget)}>
        <span>Content</span>
      </ClickableCard>,
    );
    fireEvent.click(screen.getByText('Content'));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(screen.getByText('Content').parentElement);
  });

  it('calls onClick exactly once when the surface of an href card is clicked without preventDefault', () => {
    const handleClick = vi.fn();
    render(
      <ClickableCard label="Nav card" href="/settings" onClick={handleClick}>
        <span>Content</span>
      </ClickableCard>,
    );
    // The container hook proxies the surface click to the link with
    // `link.click()`; that synthetic click bubbles back through the card and
    // must not run the consumer callback a second time.
    fireEvent.click(screen.getByText('Content'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onClick when a nested button is clicked', () => {
    const handleCardClick = vi.fn();
    const handleButtonClick = vi.fn();
    render(
      <ClickableCard label="Test card" onClick={handleCardClick}>
        <button type="button" onClick={handleButtonClick}>
          Nested
        </button>
      </ClickableCard>,
    );
    fireEvent.click(screen.getByText('Nested'));
    expect(handleButtonClick).toHaveBeenCalledTimes(1);
    // Card's onClick should NOT fire because click was on a nested interactive
    expect(handleCardClick).not.toHaveBeenCalled();
  });

  it('hidden button has correct aria-label', () => {
    render(
      <ClickableCard label="Settings card" onClick={() => {}}>
        Content
      </ClickableCard>,
    );
    const button = screen.getByRole('button', {name: 'Settings card'});
    expect(button).toHaveAttribute('aria-label', 'Settings card');
  });

  it('hidden link passes target attribute', () => {
    render(
      <ClickableCard
        label="External"
        href="https://example.com"
        target="_blank">
        Content
      </ClickableCard>,
    );
    const link = screen.getByRole('link', {name: 'External'});
    expect(link).toHaveAttribute('target', '_blank');
  });

  describe('aria-current and aria-describedby', () => {
    it('apply to the hidden button, not to the root', () => {
      const {container} = render(
        <>
          <ClickableCard
            label="Settings"
            onClick={() => {}}
            aria-current="page"
            aria-describedby="settings-hint">
            Content
          </ClickableCard>
          <p id="settings-hint">Manage your preferences</p>
        </>,
      );
      const button = screen.getByRole('button', {name: 'Settings'});
      expect(button).toHaveAttribute('aria-current', 'page');
      expect(button).toHaveAccessibleDescription('Manage your preferences');
      const root = container.firstElementChild!;
      expect(root).not.toHaveAttribute('aria-current');
      expect(root).not.toHaveAttribute('aria-describedby');
    });

    it('apply to the hidden link, which keeps its destination and target', () => {
      const {container} = render(
        <>
          <ClickableCard
            label="Settings"
            href="/settings"
            target="_blank"
            aria-current="page"
            aria-describedby="settings-hint">
            Content
          </ClickableCard>
          <p id="settings-hint">Manage your preferences</p>
        </>,
      );
      const link = screen.getByRole('link', {name: 'Settings'});
      expect(link).toHaveAttribute('aria-current', 'page');
      expect(link).toHaveAccessibleDescription('Manage your preferences');
      expect(link).toHaveAttribute('href', '/settings');
      expect(link).toHaveAttribute('target', '_blank');
      const root = container.firstElementChild!;
      expect(root).not.toHaveAttribute('aria-current');
      expect(root).not.toHaveAttribute('aria-describedby');
    });

    it('apply to the hidden control of a disabled card, which stays disabled and focusable', () => {
      render(
        <>
          <ClickableCard
            label="Disabled action"
            onClick={() => {}}
            isDisabled
            aria-current="step"
            aria-describedby="plan-hint">
            Content
          </ClickableCard>
          <ClickableCard
            label="Disabled link"
            href="/settings"
            isDisabled
            aria-current="page"
            aria-describedby="plan-hint">
            Content
          </ClickableCard>
          <p id="plan-hint">Not available on this plan</p>
        </>,
      );
      const button = screen.getByRole('button', {name: 'Disabled action'});
      expect(button).toHaveAttribute('aria-current', 'step');
      expect(button).toHaveAccessibleDescription('Not available on this plan');
      expect(button).toHaveAttribute('aria-disabled', 'true');
      const link = screen.getByRole('link', {name: 'Disabled link'});
      expect(link).toHaveAttribute('aria-current', 'page');
      expect(link).toHaveAccessibleDescription('Not available on this plan');
      expect(link).toHaveAttribute('aria-disabled', 'true');
      expect(link).toHaveAttribute('tabindex', '0');
      expect(link).not.toHaveAttribute('href');
    });

    it('leave data attributes and other props on the root, and nothing else reaches the control', () => {
      const {container} = render(
        <ClickableCard
          label="Settings"
          href="/settings"
          isDisabled
          id="settings-card"
          data-testid="settings-card"
          aria-labelledby="settings-title"
          aria-disabled={false}
          tabIndex={-1}
          aria-current="page">
          <span id="settings-title">Settings</span>
        </ClickableCard>,
      );
      const root = container.firstElementChild!;
      expect(root).toHaveAttribute('id', 'settings-card');
      expect(root).toHaveAttribute('data-testid', 'settings-card');
      expect(root).toHaveAttribute('aria-labelledby', 'settings-title');
      const link = screen.getByRole('link', {name: 'Settings'});
      expect(link).not.toHaveAttribute('id');
      expect(link).not.toHaveAttribute('data-testid');
      expect(link).not.toHaveAttribute('aria-labelledby');
      expect(link).toHaveAttribute('aria-label', 'Settings');
      expect(link).toHaveAttribute('aria-disabled', 'true');
      expect(link).toHaveAttribute('tabindex', '0');
      expect(link).toHaveAttribute('aria-current', 'page');
    });
  });

  describe('aria-expanded and aria-pressed', () => {
    it('apply to the hidden button of a disclosure or toggle card, not to the root', () => {
      const {container} = render(
        <>
          <ClickableCard label="Details" onClick={() => {}} aria-expanded>
            Content
          </ClickableCard>
          <ClickableCard
            label="Favorite"
            onClick={() => {}}
            aria-pressed={false}>
            Content
          </ClickableCard>
        </>,
      );
      expect(
        screen.getByRole('button', {name: 'Details', expanded: true}),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', {name: 'Favorite', pressed: false}),
      ).toBeInTheDocument();
      for (const root of Array.from(container.children)) {
        expect(root).not.toHaveAttribute('aria-expanded');
        expect(root).not.toHaveAttribute('aria-pressed');
      }
    });

    it('apply aria-expanded to the hidden link, which keeps its destination', () => {
      const {container} = render(
        <ClickableCard label="Section" href="/section" aria-expanded={false}>
          Content
        </ClickableCard>,
      );
      const link = screen.getByRole('link', {name: 'Section'});
      expect(link).toHaveAttribute('aria-expanded', 'false');
      expect(link).toHaveAttribute('href', '/section');
      expect(container.firstElementChild).not.toHaveAttribute(
        'aria-expanded',
      );
    });

    it('apply to the hidden control of a disabled card, which stays disabled', () => {
      render(
        <ClickableCard
          label="Disabled toggle"
          onClick={() => {}}
          isDisabled
          aria-pressed>
          Content
        </ClickableCard>,
      );
      const button = screen.getByRole('button', {
        name: 'Disabled toggle',
        pressed: true,
      });
      expect(button).toHaveAttribute('aria-disabled', 'true');
    });
  });

  it('disabled button stays focusable and the surface runs nothing', () => {
    const handleClick = vi.fn();
    render(
      <ClickableCard label="Disabled" onClick={handleClick} isDisabled>
        <span>Content</span>
      </ClickableCard>,
    );
    const button = screen.getByRole('button', {name: 'Disabled'});
    expect(button).not.toHaveAttribute('disabled');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByText('Content'));
    fireEvent.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('disabled link has no live destination, keeps its tab stop, and runs nothing', () => {
    const handleClick = vi.fn();
    render(
      <ClickableCard
        label="Disabled link"
        href="/settings"
        target="_blank"
        onClick={handleClick}
        isDisabled>
        <span>Content</span>
      </ClickableCard>,
    );
    const link = screen.getByRole('link', {name: 'Disabled link'});
    expect(link).toHaveAttribute('aria-disabled', 'true');
    expect(link).toHaveAttribute('tabindex', '0');
    expect(link).not.toHaveAttribute('href');
    expect(link).not.toHaveAttribute('target');
    expect(fireEvent.click(link)).toBe(false);
    fireEvent.click(screen.getByText('Content'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('does not render a disabled link through the router link component', () => {
    function RouterLink({
      href,
      children,
    }: {
      href?: string;
      children?: ReactNode;
    }) {
      if (href == null) {
        throw new Error('Router link requires an href');
      }
      return <a href={href}>{children}</a>;
    }

    render(
      <LinkProvider component={RouterLink}>
        <ClickableCard label="Disabled link" href="/settings" isDisabled>
          <span>Content</span>
        </ClickableCard>
      </LinkProvider>,
    );

    const link = screen.getByRole('link', {name: 'Disabled link'});
    expect(link).toHaveAttribute('aria-disabled', 'true');
    expect(link).not.toHaveAttribute('href');
  });

  it('keeps focus when a focused link card toggles its disabled state', async () => {
    const user = userEvent.setup();
    const {rerender} = render(
      <ClickableCard label="Focus card" href="/settings">
        <span>Content</span>
      </ClickableCard>,
    );

    await user.tab();
    expect(screen.getByRole('link', {name: 'Focus card'})).toHaveFocus();

    rerender(
      <ClickableCard label="Focus card" href="/settings" isDisabled>
        <span>Content</span>
      </ClickableCard>,
    );
    expect(screen.getByRole('link', {name: 'Focus card'})).toHaveFocus();

    rerender(
      <ClickableCard label="Focus card" href="/settings">
        <span>Content</span>
      </ClickableCard>,
    );
    expect(screen.getByRole('link', {name: 'Focus card'})).toHaveFocus();
  });

  it('leaves focus where the person put it when a hidden card is revealed', async () => {
    const user = userEvent.setup();
    function Harness({isHidden}: {isHidden: boolean}) {
      return (
        <>
          <Activity mode={isHidden ? 'hidden' : 'visible'}>
            <ClickableCard label="Hidden card" href="/settings">
              <span>Content</span>
            </ClickableCard>
          </Activity>
          <button type="button">Elsewhere</button>
        </>
      );
    }
    const {rerender} = render(<Harness isHidden={false} />);
    await user.tab();
    expect(screen.getByRole('link', {name: 'Hidden card'})).toHaveFocus();
    rerender(<Harness isHidden />);
    screen.getByRole('button', {name: 'Elsewhere'}).focus();
    rerender(<Harness isHidden={false} />);
    expect(screen.getByRole('button', {name: 'Elsewhere'})).toHaveFocus();
  });

  it('takes focus back without scrolling the page', async () => {
    const user = userEvent.setup();
    const {rerender} = render(
      <ClickableCard label="Scroll card" href="/settings">
        <span>Content</span>
      </ClickableCard>,
    );
    await user.tab();
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    rerender(
      <ClickableCard label="Scroll card" href="/settings" isDisabled>
        <span>Content</span>
      </ClickableCard>,
    );
    expect(focus).toHaveBeenCalledWith({preventScroll: true});
    focus.mockRestore();
  });

  it('runs onClick once from the keyboard via the hidden button', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <ClickableCard label="Test card" onClick={handleClick}>
        <span>Content</span>
      </ClickableCard>,
    );
    await user.tab();
    expect(screen.getByRole('button', {name: 'Test card'})).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(handleClick).toHaveBeenCalledTimes(2);
  });

  it('does NOT call onClick when a nested input is clicked', () => {
    const handleCardClick = vi.fn();
    render(
      <ClickableCard label="Test card" onClick={handleCardClick}>
        <input aria-label="Quantity" readOnly value="1" />
      </ClickableCard>,
    );
    fireEvent.click(screen.getByRole('textbox', {name: 'Quantity'}));
    expect(handleCardClick).not.toHaveBeenCalled();
  });

  it('does NOT call onClick when text inside the card is selected', () => {
    const handleClick = vi.fn();
    render(
      <ClickableCard label="Test card" onClick={handleClick}>
        <span>Selectable body text</span>
      </ClickableCard>,
    );
    const text = screen.getByText('Selectable body text');
    const range = document.createRange();
    range.selectNodeContents(text);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    fireEvent.click(text);
    expect(handleClick).not.toHaveBeenCalled();
    selection.removeAllRanges();
  });

  describe('elevation', () => {
    it('forwards a distinct elevation class to the card for each level', () => {
      const classFor = (elevation: 'none' | 'low' | 'med' | 'high') => {
        const {container} = render(
          <ClickableCard label="Card" elevation={elevation}>
            Content
          </ClickableCard>,
        );
        return container.firstElementChild!.className;
      };
      const classes = new Set([
        classFor('none'),
        classFor('low'),
        classFor('med'),
        classFor('high'),
      ]);
      expect(classes.size).toBe(4);
    });

    it('defaults to flat (elevation none)', () => {
      const {container: def} = render(
        <ClickableCard label="Card">Content</ClickableCard>,
      );
      const {container: none} = render(
        <ClickableCard label="Card" elevation="none">
          Content
        </ClickableCard>,
      );
      expect(def.firstElementChild!.className).toBe(
        none.firstElementChild!.className,
      );
    });
  });
});

describe('ClickableCard pressed state (touch)', () => {
  it('fades the touch press out on the card, whose overlay layer reads its strength', () => {
    const {container} = render(
      <ClickableCard label="Test card" onClick={() => {}}>
        <span>Content</span>
      </ClickableCard>,
    );
    const card = container.querySelector('[data-astryx-pressable]');
    if (card == null) {
      throw new Error('the card carries no pressable marker');
    }
    // The controller writes the card; the card owns the strength and its
    // release, and its `::after` paints the pressed token at that strength
    // as its image on both arms, its hover and mouse colour yielding.
    expect(hasReleaseFade(card)).toBe(true);
    expect(readsPressStrength(card, '[data-astryx-press="on"]')).toBe(true);
    expect(readsPressStrength(card)).toBe(true);
    expect(afterPaintsPress(card, '[data-astryx-press="on"]')).toBe(true);
    expect(afterPaintsPress(card)).toBe(true);
    // No press arm sits on a custom property the card also declares without
    // it: in a layered stylesheet that declaration wins and the press never
    // paints.
    expect(pressArmsShadowedByDefault(card)).toEqual([]);
  });

  it('carries none of it when disabled', () => {
    const {container} = render(
      <ClickableCard label="Test card" onClick={() => {}} isDisabled>
        <span>Content</span>
      </ClickableCard>,
    );
    expect(container.querySelector('[data-astryx-pressable]')).toBeNull();
  });
});
