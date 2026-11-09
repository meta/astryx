// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CollapsibleGroup.test.tsx
 * @input Uses vitest, @testing-library/react, Collapsible, CollapsibleGroup
 * @output Unit tests for Collapsible and CollapsibleGroup
 * @position Testing; validates collapsible primitive and group coordination
 *
 * SYNC: When Collapsible.tsx or CollapsibleGroup.tsx changes, update tests
 */

import {memo, use} from 'react';
import {describe, it, expect, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Collapsible} from './Collapsible';
import {CollapsibleGroup} from './CollapsibleGroup';
import {CollapsibleGroupContext} from './CollapsibleGroupContext';

// =============================================================================
// Collapsible — standalone behavior
// =============================================================================

describe('Collapsible', () => {
  it('renders trigger and children', () => {
    render(
      <Collapsible trigger="My Trigger">
        <p>Content</p>
      </Collapsible>,
    );
    expect(screen.getByText('My Trigger')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('respects controlled isOpen/onOpenChange', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    const {rerender} = render(
      <Collapsible
        trigger="Controlled"
        isOpen={true}
        onOpenChange={onOpenChange}>
        <p>Controlled content</p>
      </Collapsible>,
    );

    const trigger = screen.getByRole('button', {name: /Controlled/});
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Controlled content')).toBeVisible();

    // Click should call onOpenChange, not change internal state
    await user.click(trigger);
    expect(onOpenChange).toHaveBeenCalledWith(false);

    // Rerender with isOpen=false to actually close
    rerender(
      <Collapsible
        trigger="Controlled"
        isOpen={false}
        onOpenChange={onOpenChange}>
        <p>Controlled content</p>
      </Collapsible>,
    );
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Controlled content')).not.toBeVisible();
  });

  it('self-toggles in uncontrolled mode even when onOpenChange is supplied', async () => {
    // Regression: passing onOpenChange without isOpen must NOT make the
    // component behave as controlled. Internal state should still drive
    // visibility, and the callback should fire in addition.
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Collapsible trigger="Uncontrolled" onOpenChange={onOpenChange}>
        <p>Uncontrolled content</p>
      </Collapsible>,
    );

    const trigger = screen.getByRole('button', {name: /Uncontrolled/});
    // Starts open (defaultIsOpen defaults to true).
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Uncontrolled content')).toBeVisible();

    // Click collapses via internal state AND notifies.
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Uncontrolled content')).not.toBeVisible();
    expect(onOpenChange).toHaveBeenNthCalledWith(1, false);

    // Click again re-expands — proving the component isn't stuck.
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Uncontrolled content')).toBeVisible();
    expect(onOpenChange).toHaveBeenNthCalledWith(2, true);
  });

  it('renders chevron indicator', () => {
    render(
      <Collapsible trigger="With Chevron">
        <p>Content</p>
      </Collapsible>,
    );

    const trigger = screen.getByRole('button', {name: /With Chevron/});
    const svg = trigger.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('aria-hidden');
  });
});

// =============================================================================
// CollapsibleGroup — coordination context
// =============================================================================

describe('CollapsibleGroup', () => {
  it('renders children without wrapper DOM', () => {
    render(
      <CollapsibleGroup>
        <Collapsible trigger="Item 1" value="1">
          <p>Content 1</p>
        </Collapsible>
      </CollapsibleGroup>,
    );

    expect(screen.getByText('Content 1')).toBeInTheDocument();
  });

  describe('single mode', () => {
    it('only allows one item open at a time', async () => {
      const user = userEvent.setup();
      render(
        <CollapsibleGroup type="single" defaultValue="a">
          <Collapsible trigger="Item A" value="a">
            <p>Content A</p>
          </Collapsible>
          <Collapsible trigger="Item B" value="b">
            <p>Content B</p>
          </Collapsible>
          <Collapsible trigger="Item C" value="c">
            <p>Content C</p>
          </Collapsible>
        </CollapsibleGroup>,
      );

      // A starts open
      expect(screen.getByText('Content A')).toBeVisible();
      expect(screen.getByText('Content B')).not.toBeVisible();
      expect(screen.getByText('Content C')).not.toBeVisible();

      // Open B — A should close
      await user.click(screen.getByRole('button', {name: /Item B/}));
      expect(screen.getByText('Content A')).not.toBeVisible();
      expect(screen.getByText('Content B')).toBeVisible();
      expect(screen.getByText('Content C')).not.toBeVisible();

      // Open C — B should close
      await user.click(screen.getByRole('button', {name: /Item C/}));
      expect(screen.getByText('Content A')).not.toBeVisible();
      expect(screen.getByText('Content B')).not.toBeVisible();
      expect(screen.getByText('Content C')).toBeVisible();
    });

    it('closes the open item when clicking it again', async () => {
      const user = userEvent.setup();
      render(
        <CollapsibleGroup type="single" defaultValue="a">
          <Collapsible trigger="Item A" value="a">
            <p>Content A</p>
          </Collapsible>
        </CollapsibleGroup>,
      );

      expect(screen.getByText('Content A')).toBeVisible();
      await user.click(screen.getByRole('button', {name: /Item A/}));
      expect(screen.getByText('Content A')).not.toBeVisible();
    });
  });

  describe('multiple mode', () => {
    it('allows multiple items to be open simultaneously', async () => {
      const user = userEvent.setup();
      render(
        <CollapsibleGroup type="multiple" defaultValue={['a']}>
          <Collapsible trigger="Item A" value="a">
            <p>Content A</p>
          </Collapsible>
          <Collapsible trigger="Item B" value="b">
            <p>Content B</p>
          </Collapsible>
        </CollapsibleGroup>,
      );

      expect(screen.getByText('Content A')).toBeVisible();
      expect(screen.getByText('Content B')).not.toBeVisible();

      // Open B — A should stay open
      await user.click(screen.getByRole('button', {name: /Item B/}));
      expect(screen.getByText('Content A')).toBeVisible();
      expect(screen.getByText('Content B')).toBeVisible();

      // Close A — B should stay open
      await user.click(screen.getByRole('button', {name: /Item A/}));
      expect(screen.getByText('Content A')).not.toBeVisible();
      expect(screen.getByText('Content B')).toBeVisible();
    });
  });

  describe('controlled mode', () => {
    it('respects value and onChange', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();

      const {rerender} = render(
        <CollapsibleGroup type="single" value="a" onChange={onChange}>
          <Collapsible trigger="Item A" value="a">
            <p>Content A</p>
          </Collapsible>
          <Collapsible trigger="Item B" value="b">
            <p>Content B</p>
          </Collapsible>
        </CollapsibleGroup>,
      );

      expect(screen.getByText('Content A')).toBeVisible();
      expect(screen.getByText('Content B')).not.toBeVisible();

      // Click B — should call onChange
      await user.click(screen.getByRole('button', {name: /Item B/}));
      expect(onChange).toHaveBeenCalledWith('b');

      // Rerender with new value
      rerender(
        <CollapsibleGroup type="single" value="b" onChange={onChange}>
          <Collapsible trigger="Item A" value="a">
            <p>Content A</p>
          </Collapsible>
          <Collapsible trigger="Item B" value="b">
            <p>Content B</p>
          </Collapsible>
        </CollapsibleGroup>,
      );
      expect(screen.getByText('Content A')).not.toBeVisible();
      expect(screen.getByText('Content B')).toBeVisible();
    });

    it('preserves the context value on an unchanged controlled-string rerender', () => {
      const renderProbe = vi.fn();
      const Probe = memo(function Probe() {
        use(CollapsibleGroupContext);
        renderProbe();
        return null;
      });

      const {rerender} = render(
        <CollapsibleGroup type="single" value="a">
          <Probe />
        </CollapsibleGroup>,
      );
      expect(renderProbe).toHaveBeenCalledTimes(1);

      rerender(
        <CollapsibleGroup type="single" value="a">
          <Probe />
        </CollapsibleGroup>,
      );
      expect(renderProbe).toHaveBeenCalledTimes(1);
    });
  });

  describe('defaultValue', () => {
    it('opens the specified item by default', () => {
      render(
        <CollapsibleGroup defaultValue="b">
          <Collapsible trigger="Item A" value="a">
            <p>Content A</p>
          </Collapsible>
          <Collapsible trigger="Item B" value="b">
            <p>Content B</p>
          </Collapsible>
        </CollapsibleGroup>,
      );

      expect(screen.getByText('Content A')).not.toBeVisible();
      expect(screen.getByText('Content B')).toBeVisible();
    });

    it('opens multiple items by default in multiple mode', () => {
      render(
        <CollapsibleGroup type="multiple" defaultValue={['a', 'c']}>
          <Collapsible trigger="Item A" value="a">
            <p>Content A</p>
          </Collapsible>
          <Collapsible trigger="Item B" value="b">
            <p>Content B</p>
          </Collapsible>
          <Collapsible trigger="Item C" value="c">
            <p>Content C</p>
          </Collapsible>
        </CollapsibleGroup>,
      );

      expect(screen.getByText('Content A')).toBeVisible();
      expect(screen.getByText('Content B')).not.toBeVisible();
      expect(screen.getByText('Content C')).toBeVisible();
    });
  });

  describe('standalone vs group', () => {
    it('collapsible inside group defers to group context', async () => {
      const user = userEvent.setup();
      render(
        <CollapsibleGroup type="single" defaultValue="a">
          <Collapsible trigger="Item A" value="a">
            <p>Content A</p>
          </Collapsible>
          <Collapsible trigger="Item B" value="b">
            <p>Content B</p>
          </Collapsible>
        </CollapsibleGroup>,
      );

      // Opening B should close A (group coordinates)
      await user.click(screen.getByRole('button', {name: /Item B/}));
      expect(screen.getByText('Content A')).not.toBeVisible();
      expect(screen.getByText('Content B')).toBeVisible();
    });

    it('collapsible outside group manages its own state', async () => {
      const user = userEvent.setup();
      render(
        <Collapsible trigger="Standalone">
          <p>Standalone content</p>
        </Collapsible>,
      );

      const trigger = screen.getByRole('button', {name: /Standalone/});
      expect(screen.getByText('Standalone content')).toBeVisible();

      await user.click(trigger);
      expect(screen.getByText('Standalone content')).not.toBeVisible();

      await user.click(trigger);
      expect(screen.getByText('Standalone content')).toBeVisible();
    });
  });

  describe('accessibility', () => {
    it('sets aria-expanded on triggers', () => {
      render(
        <CollapsibleGroup type="single" defaultValue="a">
          <Collapsible trigger="Item A" value="a">
            <p>Content A</p>
          </Collapsible>
          <Collapsible trigger="Item B" value="b">
            <p>Content B</p>
          </Collapsible>
        </CollapsibleGroup>,
      );

      expect(screen.getByRole('button', {name: /Item A/})).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      expect(screen.getByRole('button', {name: /Item B/})).toHaveAttribute(
        'aria-expanded',
        'false',
      );
    });

    it('supports keyboard activation', async () => {
      const user = userEvent.setup();
      render(
        <CollapsibleGroup type="single">
          <Collapsible trigger="Item A" value="a">
            <p>Content A</p>
          </Collapsible>
        </CollapsibleGroup>,
      );

      const trigger = screen.getByRole('button', {name: /Item A/});
      trigger.focus();
      await user.keyboard('{Enter}');
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });
  });

  describe('dividers', () => {
    function getItem(name: RegExp): HTMLElement {
      const root = screen
        .getByRole('button', {name})
        .closest('.astryx-collapsible');
      expect(root).not.toBeNull();
      return root as HTMLElement;
    }

    it('renders no wrapper DOM by default and with hasDividers={false}', () => {
      const {container, rerender} = render(
        <CollapsibleGroup>
          <Collapsible trigger="Item A" value="a">
            <p>Content A</p>
          </Collapsible>
        </CollapsibleGroup>,
      );
      expect(container.querySelector('.astryx-collapsible-group')).toBeNull();

      rerender(
        <CollapsibleGroup hasDividers={false}>
          <Collapsible trigger="Item A" value="a">
            <p>Content A</p>
          </Collapsible>
        </CollapsibleGroup>,
      );
      expect(container.querySelector('.astryx-collapsible-group')).toBeNull();
    });

    it('renders a wrapper with default density when dividers are enabled', () => {
      const {container} = render(
        <CollapsibleGroup hasDividers>
          <Collapsible trigger="Item A" value="a">
            <p>Content A</p>
          </Collapsible>
          <Collapsible trigger="Item B" value="b">
            <p>Content B</p>
          </Collapsible>
        </CollapsibleGroup>,
      );

      const wrapper = container.querySelector('.astryx-collapsible-group');
      expect(wrapper).not.toBeNull();
      // Divided groups default to balanced density
      expect(wrapper).toHaveAttribute('data-density', 'balanced');
      expect(wrapper).toContainElement(getItem(/Item A/));
      expect(wrapper).toContainElement(getItem(/Item B/));
    });

    it('reflects density on each item when dividers are enabled', () => {
      render(
        <CollapsibleGroup hasDividers density="compact">
          <Collapsible trigger="Item A" value="a">
            <p>Content A</p>
          </Collapsible>
        </CollapsibleGroup>,
      );

      expect(getItem(/Item A/)).toHaveAttribute('data-density', 'compact');
    });

    it('does not reflect divider chrome on items without dividers', () => {
      render(
        <CollapsibleGroup>
          <Collapsible trigger="Item A" value="a">
            <p>Content A</p>
          </Collapsible>
        </CollapsibleGroup>,
      );

      expect(getItem(/Item A/)).not.toHaveAttribute('data-density');
    });

    it('applies density without dividers (and without a wrapper)', () => {
      const {container} = render(
        <CollapsibleGroup density="spacious">
          <Collapsible trigger="Item A" value="a">
            <p>Content A</p>
          </Collapsible>
        </CollapsibleGroup>,
      );

      expect(container.querySelector('.astryx-collapsible-group')).toBeNull();
      expect(getItem(/Item A/)).toHaveAttribute('data-density', 'spacious');
    });

    it('does not leak divider chrome into nested collapsibles', () => {
      render(
        <CollapsibleGroup hasDividers defaultValue="outer">
          <Collapsible trigger="Outer" value="outer">
            <Collapsible trigger="Nested">
              <p>Nested content</p>
            </Collapsible>
          </Collapsible>
        </CollapsibleGroup>,
      );

      expect(getItem(/Outer/)).toHaveAttribute('data-density', 'balanced');
      expect(getItem(/Nested/)).not.toHaveAttribute('data-density');
    });

    it('keeps group coordination working with dividers enabled', async () => {
      const user = userEvent.setup();
      render(
        <CollapsibleGroup type="single" hasDividers defaultValue="a">
          <Collapsible trigger="Item A" value="a">
            <p>Content A</p>
          </Collapsible>
          <Collapsible trigger="Item B" value="b">
            <p>Content B</p>
          </Collapsible>
        </CollapsibleGroup>,
      );

      expect(screen.getByText('Content A')).toBeVisible();
      await user.click(screen.getByRole('button', {name: /Item B/}));
      expect(screen.getByText('Content A')).not.toBeVisible();
      expect(screen.getByText('Content B')).toBeVisible();
    });

    it('applies xstyle/className/style to the wrapper in divider mode', () => {
      const {container} = render(
        <CollapsibleGroup
          hasDividers
          className="custom-class"
          data-testid="group">
          <Collapsible trigger="Item A" value="a">
            <p>Content A</p>
          </Collapsible>
        </CollapsibleGroup>,
      );

      const wrapper = container.querySelector('.astryx-collapsible-group');
      expect(wrapper).toHaveClass('custom-class');
      expect(wrapper).toHaveAttribute('data-testid', 'group');
    });

    it('forwards ref to the wrapper in divider mode', () => {
      const ref = {current: null as HTMLElement | null};
      const {container} = render(
        <CollapsibleGroup hasDividers ref={ref}>
          <Collapsible trigger="Item A" value="a">
            <p>Content A</p>
          </Collapsible>
        </CollapsibleGroup>,
      );

      expect(ref.current).toBe(
        container.querySelector('.astryx-collapsible-group'),
      );
    });

    it('explicit density overrides the divider default', () => {
      const {container} = render(
        <CollapsibleGroup hasDividers density="spacious">
          <Collapsible trigger="Item A" value="a">
            <p>Content A</p>
          </Collapsible>
        </CollapsibleGroup>,
      );

      const wrapper = container.querySelector('.astryx-collapsible-group');
      expect(wrapper).toHaveAttribute('data-density', 'spacious');
      expect(getItem(/Item A/)).toHaveAttribute('data-density', 'spacious');
    });

    it('tolerates interleaved non-Collapsible children', async () => {
      const user = userEvent.setup();
      render(
        <CollapsibleGroup type="single" hasDividers defaultValue="a">
          <Collapsible trigger="Item A" value="a">
            <p>Content A</p>
          </Collapsible>
          <hr data-testid="separator" />
          <Collapsible trigger="Item B" value="b">
            <p>Content B</p>
          </Collapsible>
        </CollapsibleGroup>,
      );

      expect(screen.getByTestId('separator')).toBeInTheDocument();
      expect(getItem(/Item A/)).toHaveAttribute('data-density', 'balanced');
      expect(getItem(/Item B/)).toHaveAttribute('data-density', 'balanced');
      await user.click(screen.getByRole('button', {name: /Item B/}));
      expect(screen.getByText('Content A')).not.toBeVisible();
      expect(screen.getByText('Content B')).toBeVisible();
    });

    it('lets a nested group define its own chrome instead of inheriting', () => {
      render(
        <CollapsibleGroup hasDividers defaultValue="outer">
          <Collapsible trigger="Outer" value="outer">
            <CollapsibleGroup type="multiple" hasDividers density="compact">
              <Collapsible trigger="Inner divided" value="in-a">
                <p>Inner content</p>
              </Collapsible>
            </CollapsibleGroup>
            <CollapsibleGroup type="multiple">
              <Collapsible trigger="Inner plain" value="in-b">
                <p>Inner content</p>
              </Collapsible>
            </CollapsibleGroup>
          </Collapsible>
        </CollapsibleGroup>,
      );

      expect(getItem(/Outer/)).toHaveAttribute('data-density', 'balanced');
      expect(getItem(/Inner divided/)).toHaveAttribute(
        'data-density',
        'compact',
      );
      expect(getItem(/Inner plain/)).not.toHaveAttribute('data-density');
    });

    it('keeps controlled coordination and onChange shape with dividers', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const {rerender} = render(
        <CollapsibleGroup
          type="single"
          hasDividers
          value="a"
          onChange={onChange}>
          <Collapsible trigger="Item A" value="a">
            <p>Content A</p>
          </Collapsible>
          <Collapsible trigger="Item B" value="b">
            <p>Content B</p>
          </Collapsible>
        </CollapsibleGroup>,
      );

      await user.click(screen.getByRole('button', {name: /Item B/}));
      expect(onChange).toHaveBeenCalledWith('b');
      // Controlled: nothing opens until the parent passes the new value
      expect(screen.getByText('Content B')).not.toBeVisible();

      rerender(
        <CollapsibleGroup
          type="single"
          hasDividers
          value="b"
          onChange={onChange}>
          <Collapsible trigger="Item A" value="a">
            <p>Content A</p>
          </Collapsible>
          <Collapsible trigger="Item B" value="b">
            <p>Content B</p>
          </Collapsible>
        </CollapsibleGroup>,
      );
      expect(screen.getByText('Content A')).not.toBeVisible();
      expect(screen.getByText('Content B')).toBeVisible();
    });

    it('renders standalone Collapsible without any group chrome', () => {
      render(
        <Collapsible trigger="Alone">
          <p>Standalone content</p>
        </Collapsible>,
      );

      const item = getItem(/Alone/);
      expect(item).not.toHaveAttribute('data-density');
      expect(item.querySelector('.astryx-collapsible-group')).toBeNull();
    });
  });
});
