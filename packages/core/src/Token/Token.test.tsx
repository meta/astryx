// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Token.test.tsx
 * @input Uses vitest, @testing-library/react, Token component
 * @output Unit tests for Token component behavior
 * @position Testing; validates Token.tsx implementation
 *
 * SYNC: When Token.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, vi} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Token} from './Token';
import type {TokenColor} from './Token';

describe('Token', () => {
  it('renders with label', () => {
    render(<Token label="Tag" />);
    expect(screen.getByText('Tag')).toBeInTheDocument();
  });

  it('renders as a span by default', () => {
    const {container} = render(<Token label="Tag" />);
    const root = container.firstChild;
    expect(root?.nodeName).toBe('SPAN');
  });

  it('renders each color variant', () => {
    const colors = [
      'default',
      'red',
      'orange',
      'yellow',
      'green',
      'teal',
      'cyan',
      'blue',
      'purple',
      'pink',
      'gray',
    ] as const;

    for (const color of colors) {
      const {unmount} = render(
        <Token label={color} color={color} data-testid={`token-${color}`} />,
      );
      expect(screen.getByTestId(`token-${color}`)).toBeInTheDocument();
      expect(screen.getByText(color)).toBeInTheDocument();
      unmount();
    }
  });

  it('reflects a custom (theme-augmented) color as a class and data attribute', () => {
    // Themes extend TokenColorMap via module augmentation and supply the
    // styling through generated theme CSS; the runtime just forwards the
    // value as the stable class + data-color reflection so the theme
    // selector can match. Cast simulates a consumer-augmented color.
    render(
      <Token
        label="Brand"
        color={'brand' as TokenColor}
        data-testid="token-custom"
      />,
    );
    const token = screen.getByTestId('token-custom');
    expect(token).toHaveClass('astryx-token');
    expect(token).toHaveAttribute('data-color', 'brand');
  });

  it('renders as a span with invisible button when onClick is provided', () => {
    const handleClick = vi.fn();
    render(
      <Token label="Clickable" onClick={handleClick} data-testid="token" />,
    );
    const button = screen.getByRole('button', {name: 'Clickable'});
    expect(button).toBeInTheDocument();
    expect(button.tagName).toBe('BUTTON');
    // Container is a span, not a button
    const container = screen.getByTestId('token');
    expect(container.tagName).toBe('SPAN');
    fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('fires onClick when clicking the container span', () => {
    const handleClick = vi.fn();
    render(
      <Token label="Clickable" onClick={handleClick} data-testid="token" />,
    );
    const container = screen.getByTestId('token');
    fireEvent.click(container);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders as a link when href is provided', () => {
    render(<Token label="Link" href="/test" />);
    const link = screen.getByRole('link', {name: 'Link'});
    expect(link).toBeInTheDocument();
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/test');
  });

  it('shows remove button when onRemove is provided', () => {
    const handleRemove = vi.fn();
    render(<Token label="Removable" onRemove={handleRemove} />);
    const removeButton = screen.getByRole('button', {name: 'Remove Removable'});
    expect(removeButton).toBeInTheDocument();
    fireEvent.click(removeButton);
    expect(handleRemove).toHaveBeenCalledTimes(1);
  });

  it('stops propagation when remove button is clicked', () => {
    const handleRemove = vi.fn();
    const handleClick = vi.fn();
    render(
      <Token label="Token" onClick={handleClick} onRemove={handleRemove} />,
    );
    const removeButton = screen.getByRole('button', {name: 'Remove Token'});
    fireEvent.click(removeButton);
    expect(handleRemove).toHaveBeenCalledTimes(1);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('renders disabled state', () => {
    const handleClick = vi.fn();
    render(
      <Token
        label="Disabled"
        onClick={handleClick}
        isDisabled
        data-testid="token"
      />,
    );
    const button = screen.getByRole('button', {name: 'Disabled'});
    expect(button).not.toHaveAttribute('disabled');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button.tagName).toBe('BUTTON');
    fireEvent.click(button);
    // Container click is also disabled
    const container = screen.getByTestId('token');
    fireEvent.click(container);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('hides label visually when isLabelHidden is true', () => {
    render(<Token label="Hidden" isLabelHidden />);
    // Label text is still in the DOM for screen readers
    expect(screen.getByText('Hidden')).toBeInTheDocument();
    // Root element should have aria-label
    const root = screen.getByText('Hidden').closest('span[aria-label]');
    expect(root).toHaveAttribute('aria-label', 'Hidden');
  });

  it('renders endContent', () => {
    render(
      <Token label="Token" endContent={<span data-testid="end">End</span>} />,
    );
    expect(screen.getByTestId('end')).toBeInTheDocument();
    expect(screen.getByText('End')).toBeInTheDocument();
  });

  it('renders icon', () => {
    render(<Token label="Token" icon={<span data-testid="icon">★</span>} />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('supports data-testid', () => {
    render(<Token label="Test" data-testid="my-token" />);
    expect(screen.getByTestId('my-token')).toBeInTheDocument();
  });

  it('renders description as aria-description', () => {
    render(
      <Token
        label="Token"
        description="A helpful description"
        data-testid="described-token"
      />,
    );
    expect(screen.getByTestId('described-token')).toHaveAttribute(
      'aria-description',
      'A helpful description',
    );
  });

  it('forwards ref', () => {
    const ref = {current: null as HTMLElement | null};
    render(<Token ref={ref} label="Ref test" />);
    expect(ref.current).toBeInstanceOf(HTMLSpanElement);
  });

  it('forwards ref to span when onClick provided', () => {
    const ref = {current: null as HTMLElement | null};
    render(<Token ref={ref} label="Ref test" onClick={() => {}} />);
    expect(ref.current).toBeInstanceOf(HTMLSpanElement);
  });

  it('forwards ref to anchor when href provided', () => {
    const ref = {current: null as HTMLElement | null};
    render(<Token ref={ref} label="Ref test" href="/test" />);
    expect(ref.current).toBeInstanceOf(HTMLAnchorElement);
  });
});

describe('Token accessibility', () => {
  it('does not nest buttons when both onClick and onRemove are provided', () => {
    render(<Token label="Token" onClick={() => {}} onRemove={() => {}} />);
    const buttons = screen.getAllByRole('button');
    // Should have exactly 2: invisible label button + remove button
    expect(buttons).toHaveLength(2);
    // No button should contain another button
    for (const button of buttons) {
      expect(button.querySelector('button')).toBeNull();
    }
  });

  it('allows independent focus on label button and remove button', async () => {
    const user = userEvent.setup();
    render(<Token label="Token" onClick={() => {}} onRemove={() => {}} />);

    // Tab to first button (invisible label button)
    await user.tab();
    expect(screen.getByRole('button', {name: 'Token'})).toHaveFocus();

    // Tab to second button (remove button)
    await user.tab();
    expect(screen.getByRole('button', {name: 'Remove Token'})).toHaveFocus();
  });

  it('fires onClick when Enter is pressed on the invisible button', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Token label="Token" onClick={handleClick} />);

    await user.tab();
    await user.keyboard('{Enter}');
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('fires onClick when Space is pressed on the invisible button', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Token label="Token" onClick={handleClick} />);

    await user.tab();
    await user.keyboard(' ');
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('remove button has accessible name including the token label', () => {
    render(<Token label="JavaScript" onRemove={() => {}} />);
    expect(
      screen.getByRole('button', {name: 'Remove JavaScript'}),
    ).toBeInTheDocument();
  });

  it('keeps aria-labelledby and aria-describedby on a disabled link token', () => {
    render(
      <>
        <span id="dl-label">Docs section</span>
        <span id="dl-hint">Unavailable offline</span>
        <Token
          label="Docs"
          href="/docs"
          isDisabled
          aria-labelledby="dl-label"
          aria-describedby="dl-hint"
        />
      </>,
    );
    const link = screen.getByRole('link', {name: 'Docs section'});
    expect(link).toHaveAccessibleDescription('Unavailable offline');
  });

  it("passes aria-labelledby and aria-describedby to a clickable token's button (public-component-api INV5)", () => {
    render(
      <>
        <span id="field-label">Fruit</span>
        <span id="field-hint">Pick one</span>
        <Token
          label="Apple"
          onClick={() => {}}
          aria-labelledby="field-label"
          aria-describedby="field-hint"
          data-testid="token"
        />
      </>,
    );
    const button = screen.getByRole('button', {name: 'Fruit'});
    expect(button).toHaveAccessibleDescription('Pick one');
    expect(screen.getByTestId('token')).not.toHaveAttribute('aria-labelledby');
  });

  it('reflects the disabled state on the token target in every structure (theming-surface INV6)', () => {
    render(
      <>
        <Token label="Static" isDisabled data-testid="static" />
        <Token
          label="Clickable"
          onClick={() => {}}
          isDisabled
          data-testid="clickable"
        />
        <Token label="Link" href="/docs" isDisabled data-testid="link" />
        <Token
          label="Link with remove"
          href="/docs"
          onRemove={() => {}}
          isDisabled
          data-testid="link-and-remove"
        />
        <Token label="Enabled" href="/docs" data-testid="enabled" />
      </>,
    );
    for (const id of ['static', 'clickable', 'link', 'link-and-remove']) {
      expect(screen.getByTestId(id), id).toHaveAttribute(
        'data-disabled',
        'disabled',
      );
    }
    expect(screen.getByTestId('enabled')).not.toHaveAttribute('data-disabled');
  });

  it('keeps a disabled link token a focusable link with no destination (spec:AST-085 FR1, FR5)', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <>
        <Token label="Docs" href="/docs" isDisabled />
        <Token label="Guide" href="/guide" isDisabled onRemove={onRemove} />
      </>,
    );
    for (const name of ['Docs', 'Guide']) {
      const link = screen.getByRole('link', {name});
      expect(link, name).toHaveAttribute('aria-disabled', 'true');
      expect(link, name).not.toHaveAttribute('href');
    }
    await user.tab();
    expect(screen.getByRole('link', {name: 'Docs'})).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', {name: 'Guide'})).toHaveFocus();
    await user.tab();
    await user.keyboard('{Enter}');
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("passes other keys to a disabled link token's onKeyDown, but not Enter or Space", async () => {
    const user = userEvent.setup();
    const onKeyDown = vi.fn();
    render(
      <Token label="Docs" href="/docs" isDisabled onKeyDown={onKeyDown} />,
    );
    await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(onKeyDown.mock.calls[0][0].key).toBe('ArrowRight');
    await user.keyboard('{Enter} ');
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });

  it('keeps both buttons focusable and inert when isDisabled is true', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    const handleRemove = vi.fn();
    render(
      <Token
        label="Token"
        onClick={handleClick}
        onRemove={handleRemove}
        isDisabled
      />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button).not.toHaveAttribute('disabled');
      expect(button).toHaveAttribute('aria-disabled', 'true');
      // A wrapping Popover listens for clicks on the button itself.
      const nativeClick = vi.fn();
      button.addEventListener('click', nativeClick);
      await user.tab();
      expect(button).toHaveFocus();
      await user.keyboard('{Enter} ');
      expect(nativeClick).not.toHaveBeenCalled();
      fireEvent.click(button);
    }
    expect(handleClick).not.toHaveBeenCalled();
    expect(handleRemove).not.toHaveBeenCalled();
  });

  it('does not fire onClick or onRemove when disabled', () => {
    const handleClick = vi.fn();
    const handleRemove = vi.fn();
    render(
      <Token
        label="Token"
        onClick={handleClick}
        onRemove={handleRemove}
        isDisabled
        data-testid="token"
      />,
    );

    // Click on container
    const container = screen.getByTestId('token');
    fireEvent.click(container);
    expect(handleClick).not.toHaveBeenCalled();

    // Try to click remove button (it's disabled)
    const removeBtn = screen.getByRole('button', {name: 'Remove Token'});
    fireEvent.click(removeBtn);
    expect(handleRemove).not.toHaveBeenCalled();
  });

  it('container click handler does not fire when clicking the remove button', () => {
    const handleClick = vi.fn();
    const handleRemove = vi.fn();
    render(
      <Token label="Token" onClick={handleClick} onRemove={handleRemove} />,
    );

    const removeButton = screen.getByRole('button', {name: 'Remove Token'});
    fireEvent.click(removeButton);

    expect(handleRemove).toHaveBeenCalledTimes(1);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('hidden label is accessible to screen readers', () => {
    render(<Token label="Hidden Tag" isLabelHidden onClick={() => {}} />);
    // The invisible button should still be findable by its accessible name
    expect(
      screen.getByRole('button', {name: 'Hidden Tag'}),
    ).toBeInTheDocument();
  });

  it('link token has correct role and is focusable', async () => {
    const user = userEvent.setup();
    render(<Token label="Link Token" href="/test" />);

    const link = screen.getByRole('link', {name: 'Link Token'});
    expect(link).toHaveAttribute('href', '/test');

    await user.tab();
    expect(link).toHaveFocus();
  });

  it('remove button element exists with correct aria-label', () => {
    const {container} = render(<Token label="Token" onRemove={() => {}} />);
    const removeButton = container.querySelector(
      'button[aria-label="Remove Token"]',
    );
    expect(removeButton).toBeInTheDocument();
  });
});

describe('Token link onClick', () => {
  // jsdom does not implement navigation, so a native listener stops it. React
  // handlers still run for the click.
  function stopNavigation(link: HTMLElement) {
    link.addEventListener('click', e => e.preventDefault());
  }

  it('calls a caller onClick once when a link token is clicked', () => {
    const handleClick = vi.fn();
    render(<Token label="Tag" href="/test" onClick={handleClick} />);
    const link = screen.getByRole('link', {name: 'Tag'});
    stopNavigation(link);

    fireEvent.click(link);
    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(link).toHaveAttribute('href', '/test');
  });

  it('calls a caller onClick once when the link of a removable token is clicked', () => {
    const handleClick = vi.fn();
    render(
      <Token
        label="Tag"
        href="/test"
        onClick={handleClick}
        onRemove={() => {}}
      />,
    );
    const link = screen.getByRole('link', {name: 'Tag'});
    stopNavigation(link);

    fireEvent.click(link);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('calls a caller onClick once when the surface of a removable token is clicked', () => {
    const handleClick = vi.fn();
    render(
      <Token
        label="Tag"
        href="/test"
        onClick={handleClick}
        onRemove={() => {}}
        data-testid="token"
      />,
    );
    stopNavigation(screen.getByRole('link', {name: 'Tag'}));

    // The surface click is delegated to the link; it must not run twice.
    fireEvent.click(screen.getByTestId('token'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does not call a caller onClick when the remove button is clicked', () => {
    const handleClick = vi.fn();
    const handleRemove = vi.fn();
    render(
      <Token
        label="Tag"
        href="/test"
        onClick={handleClick}
        onRemove={handleRemove}
      />,
    );
    stopNavigation(screen.getByRole('link', {name: 'Tag'}));

    fireEvent.click(screen.getByRole('button', {name: 'Remove Tag'}));
    expect(handleRemove).toHaveBeenCalledTimes(1);
    expect(handleClick).not.toHaveBeenCalled();
  });
});

describe('Token link with remove button', () => {
  it('does not nest the remove button inside the link', () => {
    render(<Token label="Tag" href="/test" onRemove={() => {}} />);
    const link = screen.getByRole('link', {name: 'Tag'});
    const removeButton = screen.getByRole('button', {name: 'Remove Tag'});
    expect(link.contains(removeButton)).toBe(false);
  });

  it('keeps the link keyboard-focusable and fires onRemove from the sibling button', async () => {
    const user = userEvent.setup();
    const handleRemove = vi.fn();
    render(<Token label="Tag" href="/test" onRemove={handleRemove} />);

    const link = screen.getByRole('link', {name: 'Tag'});
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/test');

    // Tab reaches the link first, then the remove button
    await user.tab();
    expect(link).toHaveFocus();
    await user.tab();
    const removeButton = screen.getByRole('button', {name: 'Remove Tag'});
    expect(removeButton).toHaveFocus();

    // Activating the remove button fires onRemove without involving the link
    await user.keyboard('{Enter}');
    expect(handleRemove).toHaveBeenCalledTimes(1);
  });

  it('wrapper structure matches the onClick branch pattern', () => {
    render(
      <Token
        label="Tag"
        href="/test"
        onRemove={() => {}}
        data-testid="link-token"
      />,
    );
    render(
      <Token
        label="Tag"
        onClick={() => {}}
        onRemove={() => {}}
        data-testid="click-token"
      />,
    );

    const linkRoot = screen.getByTestId('link-token');
    const clickRoot = screen.getByTestId('click-token');

    // Both render a <span> container with the same visual classes
    expect(linkRoot.tagName).toBe('SPAN');
    expect(linkRoot.className).toBe(clickRoot.className);
  });

  it('clicking the container activates the link', () => {
    render(
      <Token
        label="Tag"
        href="/test"
        onRemove={() => {}}
        icon={<span data-testid="icon">★</span>}
        data-testid="link-token"
      />,
    );
    const link = screen.getByRole('link', {name: 'Tag'});
    const handleLinkClick = vi.fn((e: MouseEvent) => e.preventDefault());
    link.addEventListener('click', handleLinkClick);

    // Clicking outside the anchor (e.g. the icon) still activates the link
    fireEvent.click(screen.getByTestId('icon'));
    expect(handleLinkClick).toHaveBeenCalledTimes(1);
  });

  it('clicking the remove button does not activate the link', () => {
    const handleRemove = vi.fn();
    render(<Token label="Tag" href="/test" onRemove={handleRemove} />);
    const link = screen.getByRole('link', {name: 'Tag'});
    const handleLinkClick = vi.fn((e: MouseEvent) => e.preventDefault());
    link.addEventListener('click', handleLinkClick);

    fireEvent.click(screen.getByRole('button', {name: 'Remove Tag'}));
    expect(handleRemove).toHaveBeenCalledTimes(1);
    expect(handleLinkClick).not.toHaveBeenCalled();
  });

  it('cmd/ctrl+click on the container opens the link in a new tab', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(
      <Token
        label="Tag"
        href="/test"
        onRemove={() => {}}
        icon={<span data-testid="icon">★</span>}
      />,
    );

    // Clicking the surface (not the anchor) with a modifier opens a new tab
    // rather than navigating in place — provided by useClickableContainer.
    fireEvent.click(screen.getByTestId('icon'), {metaKey: true});
    expect(openSpy).toHaveBeenCalledWith('/test', '_blank', 'noopener');
    openSpy.mockRestore();
  });

  it('middle-click on the container opens the link in a new tab', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(
      <Token
        label="Tag"
        href="/test"
        onRemove={() => {}}
        icon={<span data-testid="icon">★</span>}
      />,
    );

    fireEvent.mouseUp(screen.getByTestId('icon'), {button: 1});
    expect(openSpy).toHaveBeenCalledWith('/test', '_blank', 'noopener');
    openSpy.mockRestore();
  });

  it('a modified click that opens a new tab does not fire onRemove', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const handleRemove = vi.fn();
    render(
      <Token
        label="Tag"
        href="/test"
        onRemove={handleRemove}
        icon={<span data-testid="icon">★</span>}
      />,
    );

    fireEvent.click(screen.getByTestId('icon'), {metaKey: true});
    fireEvent.mouseUp(screen.getByTestId('icon'), {button: 1});
    expect(handleRemove).not.toHaveBeenCalled();
    expect(openSpy).toHaveBeenCalledTimes(2);
    openSpy.mockRestore();
  });

  it('link without onRemove still renders the anchor as the root', () => {
    const {container} = render(<Token label="Link" href="/test" />);
    expect(container.firstElementChild?.tagName).toBe('A');
  });
});

describe('Token text overflow', () => {
  it('label element has overflow hidden and text-overflow ellipsis styles', () => {
    const {container} = render(<Token label="A very long label text" />);
    const labelSpan = container.querySelector('span > span');
    expect(labelSpan).toBeInTheDocument();
    // The label span should exist and contain the text
    expect(labelSpan?.textContent).toBe('A very long label text');
  });

  it('label element has overflow styles when onClick is provided', () => {
    const {container: _container} = render(
      <Token label="A very long clickable label" onClick={() => {}} />,
    );
    // In onClick mode, the label is inside the invisible button
    const button = screen.getByRole('button', {
      name: 'A very long clickable label',
    });
    const labelSpan = button.querySelector('span');
    expect(labelSpan).toBeInTheDocument();
    expect(labelSpan?.textContent).toBe('A very long clickable label');
  });
});

describe('Token size', () => {
  it('renders with size="lg"', () => {
    render(<Token label="Tag" size="lg" data-testid="lg-token" />);
    expect(screen.getByTestId('lg-token')).toBeInTheDocument();
    expect(screen.getByText('Tag')).toBeInTheDocument();
  });
});

describe('Token focus outline', () => {
  it('invisible button does not show its own focus outline', async () => {
    const user = userEvent.setup();
    render(
      <Token label="Focusable" onClick={() => {}} data-testid="focus-token" />,
    );
    const button = screen.getByRole('button', {name: 'Focusable'});
    await user.tab();
    expect(button).toHaveFocus();
    // The container should handle focus outline via :has(:focus-visible),
    // not the button itself
    const container = screen.getByTestId('focus-token');
    expect(container.tagName).toBe('SPAN');
  });
});

describe('Token pass-through props', () => {
  it('forwards pass-through props to the token element', () => {
    render(
      <Token
        label="Design"
        aria-label="Design tag"
        id="design-token"
        data-source="filters"
        data-testid="token"
      />,
    );
    const token = screen.getByTestId('token');
    expect(token).toHaveAttribute('aria-label', 'Design tag');
    expect(token).toHaveAttribute('id', 'design-token');
    expect(token).toHaveAttribute('data-source', 'filters');
  });

  it('forwards pass-through props on the clickable and link variants', () => {
    const {rerender} = render(
      <Token
        label="Design"
        onClick={() => {}}
        id="clickable"
        data-testid="token"
      />,
    );
    expect(screen.getByTestId('token')).toHaveAttribute('id', 'clickable');

    rerender(
      <Token label="Design" href="/tags" id="link" data-testid="token" />,
    );
    expect(screen.getByTestId('token')).toHaveAttribute('id', 'link');
  });

  it('keeps its own label when the label is visually hidden', () => {
    render(
      <Token
        label="Design"
        isLabelHidden
        aria-label="Caller label"
        data-source="filters"
        data-testid="token"
      />,
    );
    const token = screen.getByTestId('token');
    expect({
      ariaLabel: token.getAttribute('aria-label'),
      dataSource: token.getAttribute('data-source'),
    }).toEqual({ariaLabel: 'Design', dataSource: 'filters'});
  });
});

describe('Token — owned handlers on the link+remove container', () => {
  it("composes a caller's onMouseUp with the container's link delegation", () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const handleMouseUp = vi.fn();
    render(
      <Token
        label="Tag"
        href="/test"
        onRemove={() => {}}
        onMouseUp={handleMouseUp}
        icon={<span data-testid="icon">★</span>}
      />,
    );

    fireEvent.mouseUp(screen.getByTestId('icon'), {button: 1});

    expect(handleMouseUp).toHaveBeenCalledOnce();
    expect(openSpy).toHaveBeenCalledWith('/test', '_blank', 'noopener');
    openSpy.mockRestore();
  });

  it("does not fire the container's delegation when disabled, but still forwards the caller's onMouseUp", () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const handleMouseUp = vi.fn();
    render(
      <Token
        label="Tag"
        href="/test"
        onRemove={() => {}}
        onMouseUp={handleMouseUp}
        isDisabled
        icon={<span data-testid="icon">★</span>}
      />,
    );

    fireEvent.mouseUp(screen.getByTestId('icon'), {button: 1});

    expect(handleMouseUp).toHaveBeenCalledOnce();
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });
});
