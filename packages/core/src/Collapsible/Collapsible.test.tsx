// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Collapsible.test.tsx
 * @input Uses vitest, @testing-library/react, Collapsible + CollapsibleGroup
 * @output Characterization coverage for Collapsible behavior
 * @position Testing; validates Collapsible.tsx (disclosure primitive)
 *
 * SYNC: When Collapsible.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, vi} from 'vitest';
import {render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {hasPressedArm} from '../__tests__/pressState';
import {Collapsible} from './Collapsible';
import {CollapsibleGroup} from './CollapsibleGroup';

/**
 * Resolves the content region a trigger controls via aria-controls, so tests
 * assert the real disclosure linkage rather than guessing at DOM structure.
 */
function contentFor(trigger: HTMLElement): HTMLElement {
  const id = trigger.getAttribute('aria-controls');
  expect(id).toBeTruthy();
  const el = document.getElementById(id as string);
  expect(el).not.toBeNull();
  return el as HTMLElement;
}

describe('Collapsible', () => {
  describe('structure and rendering', () => {
    it('renders the trigger content inside a button', () => {
      render(
        <Collapsible trigger="Details">
          <p>Body</p>
        </Collapsible>,
      );
      const button = screen.getByRole('button');
      expect(button).toHaveTextContent('Details');
      expect(button.tagName).toBe('BUTTON');
    });

    it('renders the trigger button with an explicit type="button"', () => {
      // Prevents implicit form submission when used inside a <form>.
      render(<Collapsible trigger="T">c</Collapsible>);
      expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
    });

    it('renders children inside the controlled content region', () => {
      render(
        <Collapsible trigger="Section">
          <span data-testid="child">Hello</span>
        </Collapsible>,
      );
      const content = contentFor(screen.getByRole('button'));
      expect(within(content).getByTestId('child')).toBeInTheDocument();
    });

    it('renders the stable astryx-collapsible class on the root', () => {
      render(
        <Collapsible trigger="T" data-testid="root">
          c
        </Collapsible>,
      );
      expect(screen.getByTestId('root')).toHaveClass('astryx-collapsible');
    });

    it('renders the stable astryx-collapsible-trigger class on the trigger button', () => {
      render(<Collapsible trigger="T">c</Collapsible>);
      expect(screen.getByRole('button')).toHaveClass(
        'astryx-collapsible-trigger',
      );
    });

    it('renders the stable astryx-collapsible-content class on the content area', () => {
      render(<Collapsible trigger="T">c</Collapsible>);
      const content = contentFor(screen.getByRole('button'));
      expect(content).toHaveClass('astryx-collapsible-content');
    });

    it('renders a ReactNode trigger, not just a string', () => {
      render(
        <Collapsible trigger={<span data-testid="rich">Rich</span>}>
          c
        </Collapsible>,
      );
      expect(screen.getByTestId('rich')).toBeInTheDocument();
    });
  });

  describe('uncontrolled open state', () => {
    it('rotates the chevron indicator between open and closed states', async () => {
      const user = userEvent.setup();
      render(<Collapsible trigger="T">Body</Collapsible>);
      const button = screen.getByRole('button');
      // The chevron lives in the last span of the trigger button.
      const chevron = button.querySelectorAll('span')[1];
      const openClass = chevron.getAttribute('class');

      await user.click(button);
      const closedClass = chevron.getAttribute('class');
      expect(closedClass).not.toEqual(openClass);
    });
  });

  describe('controlled open state', () => {
    it('reflects the isOpen prop', () => {
      const {rerender} = render(
        <Collapsible trigger="T" isOpen={false}>
          Body
        </Collapsible>,
      );
      expect(screen.getByRole('button')).toHaveAttribute(
        'aria-expanded',
        'false',
      );

      rerender(
        <Collapsible trigger="T" isOpen={true}>
          Body
        </Collapsible>,
      );
      expect(screen.getByRole('button')).toHaveAttribute(
        'aria-expanded',
        'true',
      );
    });

    it('calls onOpenChange with the negated state on click', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      render(
        <Collapsible trigger="T" isOpen={false} onOpenChange={onOpenChange}>
          Body
        </Collapsible>,
      );
      await user.click(screen.getByRole('button'));
      expect(onOpenChange).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(true);
    });

    it('does not self-update when controlled without onOpenChange', async () => {
      // A controlled instance is driven entirely by the isOpen prop; a click
      // must not flip the visual state on its own.
      const user = userEvent.setup();
      render(
        <Collapsible trigger="T" isOpen={false}>
          Body
        </Collapsible>,
      );
      const button = screen.getByRole('button');
      await user.click(button);
      expect(button).toHaveAttribute('aria-expanded', 'false');
    });

    it('stays put until the parent updates isOpen', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      const {rerender} = render(
        <Collapsible trigger="T" isOpen={false} onOpenChange={onOpenChange}>
          Body
        </Collapsible>,
      );
      const button = screen.getByRole('button');
      await user.click(button);
      // Still closed — parent hasn't re-rendered with the new value yet.
      expect(button).toHaveAttribute('aria-expanded', 'false');

      rerender(
        <Collapsible trigger="T" isOpen={true} onOpenChange={onOpenChange}>
          Body
        </Collapsible>,
      );
      expect(button).toHaveAttribute('aria-expanded', 'true');
    });
  });

  describe('disabled state', () => {
    it('marks the trigger aria-disabled and drops it from the tab order', () => {
      render(
        <Collapsible trigger="T" isDisabled>
          Body
        </Collapsible>,
      );
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).toHaveAttribute('tabindex', '-1');
      // Never the native disabled attribute — it stays focusable/perceivable.
      expect(button).not.toBeDisabled();
    });

    it('is enabled by default (no aria-disabled, stays in tab order)', () => {
      render(<Collapsible trigger="T">Body</Collapsible>);
      const button = screen.getByRole('button');
      expect(button).not.toHaveAttribute('aria-disabled');
      expect(button).not.toHaveAttribute('tabindex', '-1');
    });

    it('does not toggle when the trigger is clicked while disabled', async () => {
      const user = userEvent.setup();
      render(
        <Collapsible trigger="T" isDisabled defaultIsOpen>
          Body
        </Collapsible>,
      );
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-expanded', 'true');
      await user.click(button);
      expect(button).toHaveAttribute('aria-expanded', 'true');
    });

    it('does not fire onOpenChange while disabled', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      render(
        <Collapsible trigger="T" isDisabled onOpenChange={onOpenChange}>
          Body
        </Collapsible>,
      );
      await user.click(screen.getByRole('button'));
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('does not collapse an already-open item — content stays visible', () => {
      render(
        <Collapsible trigger="T" isDisabled defaultIsOpen>
          Body
        </Collapsible>,
      );
      const content = contentFor(screen.getByRole('button'));
      expect(content).not.toHaveStyle({display: 'none'});
    });

    it('does not toggle its group item when disabled', async () => {
      const user = userEvent.setup();
      render(
        <CollapsibleGroup type="single">
          <Collapsible trigger="A" value="a" isDisabled>
            Body A
          </Collapsible>
          <Collapsible trigger="B" value="b">
            Body B
          </Collapsible>
        </CollapsibleGroup>,
      );
      const triggerA = screen.getByRole('button', {name: /A/});
      await user.click(triggerA);
      expect(triggerA).toHaveAttribute('aria-expanded', 'false');
    });
  });

  describe('prop forwarding', () => {
    it('forwards a ref to the root element', () => {
      const ref = vi.fn();
      render(
        <Collapsible ref={ref} trigger="T">
          c
        </Collapsible>,
      );
      expect(ref).toHaveBeenCalledWith(expect.any(HTMLDivElement));
    });

    it('passes through data-testid and other DOM props to the root', () => {
      render(
        <Collapsible trigger="T" data-testid="root" data-custom="x">
          c
        </Collapsible>,
      );
      const root = screen.getByTestId('root');
      expect(root).toHaveAttribute('data-custom', 'x');
    });

    it('exposes a displayName for devtools', () => {
      expect(Collapsible.displayName).toBe('Collapsible');
    });
  });

  describe('inside CollapsibleGroup (single mode)', () => {
    it('opens the item matching defaultValue and closes the rest', () => {
      render(
        <CollapsibleGroup type="single" defaultValue="b">
          <Collapsible trigger="A" value="a">
            Body A
          </Collapsible>
          <Collapsible trigger="B" value="b">
            Body B
          </Collapsible>
        </CollapsibleGroup>,
      );
      const [a, b] = screen.getAllByRole('button');
      expect(a).toHaveAttribute('aria-expanded', 'false');
      expect(b).toHaveAttribute('aria-expanded', 'true');
    });

    it('opening one item closes the previously open item', async () => {
      const user = userEvent.setup();
      render(
        <CollapsibleGroup type="single" defaultValue="a">
          <Collapsible trigger="A" value="a">
            Body A
          </Collapsible>
          <Collapsible trigger="B" value="b">
            Body B
          </Collapsible>
        </CollapsibleGroup>,
      );
      const [a, b] = screen.getAllByRole('button');
      expect(a).toHaveAttribute('aria-expanded', 'true');

      await user.click(b);
      expect(a).toHaveAttribute('aria-expanded', 'false');
      expect(b).toHaveAttribute('aria-expanded', 'true');
    });

    it('clicking the open item closes it (single mode allows all-closed)', async () => {
      const user = userEvent.setup();
      render(
        <CollapsibleGroup type="single" defaultValue="a">
          <Collapsible trigger="A" value="a">
            Body A
          </Collapsible>
        </CollapsibleGroup>,
      );
      const a = screen.getByRole('button');
      await user.click(a);
      expect(a).toHaveAttribute('aria-expanded', 'false');
    });

    it('fires the group onChange with the newly opened value', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <CollapsibleGroup type="single" onChange={onChange}>
          <Collapsible trigger="A" value="a">
            Body A
          </Collapsible>
        </CollapsibleGroup>,
      );
      await user.click(screen.getByRole('button'));
      expect(onChange).toHaveBeenCalledWith('a');
    });
  });

  describe('inside CollapsibleGroup (multiple mode)', () => {
    it('allows several items open at once', async () => {
      const user = userEvent.setup();
      render(
        <CollapsibleGroup type="multiple" defaultValue={['a']}>
          <Collapsible trigger="A" value="a">
            Body A
          </Collapsible>
          <Collapsible trigger="B" value="b">
            Body B
          </Collapsible>
        </CollapsibleGroup>,
      );
      const [a, b] = screen.getAllByRole('button');
      expect(a).toHaveAttribute('aria-expanded', 'true');
      expect(b).toHaveAttribute('aria-expanded', 'false');

      await user.click(b);
      // Opening B does not close A in multiple mode.
      expect(a).toHaveAttribute('aria-expanded', 'true');
      expect(b).toHaveAttribute('aria-expanded', 'true');
    });

    it('fires onChange with the full array of open values', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <CollapsibleGroup
          type="multiple"
          defaultValue={['a']}
          onChange={onChange}>
          <Collapsible trigger="A" value="a">
            Body A
          </Collapsible>
          <Collapsible trigger="B" value="b">
            Body B
          </Collapsible>
        </CollapsibleGroup>,
      );
      const [, b] = screen.getAllByRole('button');
      await user.click(b);
      expect(onChange).toHaveBeenCalledWith(['a', 'b']);
    });
  });

  describe('group presentation (dividers + density)', () => {
    it('reflects group density as a data attribute on items when dividers are enabled', () => {
      render(
        <CollapsibleGroup type="single" hasDividers density="compact">
          <Collapsible trigger="A" value="a" data-testid="item-a">
            Body A
          </Collapsible>
        </CollapsibleGroup>,
      );
      const item = screen.getByTestId('item-a');
      expect(item).toHaveAttribute('data-density', 'compact');
    });

    it('omits density data attribute when standalone (no group)', () => {
      render(
        <Collapsible trigger="A" data-testid="item">
          Body
        </Collapsible>,
      );
      const item = screen.getByTestId('item');
      expect(item).not.toHaveAttribute('data-density');
    });

    it('reflects the visual axes and states on their owning theme targets', () => {
      render(
        <>
          <CollapsibleGroup
            type="single"
            hasDividers
            density="compact"
            chevronPosition="start"
            defaultValue="open">
            <Collapsible trigger="Open" value="open" data-testid="open-item">
              Open body
            </Collapsible>
            <Collapsible
              trigger="Disabled"
              value="disabled"
              isDisabled
              data-testid="disabled-item">
              Disabled body
            </Collapsible>
          </CollapsibleGroup>
          <Collapsible
            trigger="Standalone"
            defaultIsOpen={false}
            data-testid="standalone-item">
            Standalone body
          </Collapsible>
        </>,
      );

      const openRoot = screen.getByTestId('open-item');
      const openTrigger = within(openRoot).getByRole('button');
      const openContent = contentFor(openTrigger);
      expect(openRoot).toHaveAttribute('data-density', 'compact');
      expect(openRoot).toHaveAttribute('data-divided', 'divided');
      expect(openTrigger).toHaveAttribute('data-density', 'compact');
      expect(openTrigger).toHaveAttribute('data-chevron-position', 'start');
      expect(openTrigger).toHaveAttribute('data-open', 'open');
      expect(openTrigger).not.toHaveAttribute('data-disabled');
      expect(openContent).toHaveAttribute('data-density', 'compact');
      expect(openContent).toHaveAttribute('data-open', 'open');

      const disabledRoot = screen.getByTestId('disabled-item');
      const disabledTrigger = within(disabledRoot).getByRole('button');
      expect(disabledTrigger).toHaveAttribute('data-disabled', 'disabled');
      expect(disabledTrigger).not.toHaveAttribute('data-open');
      expect(contentFor(disabledTrigger)).not.toHaveAttribute('data-open');

      const standaloneRoot = screen.getByTestId('standalone-item');
      const standaloneTrigger = within(standaloneRoot).getByRole('button');
      const standaloneContent = contentFor(standaloneTrigger);
      expect(standaloneRoot).not.toHaveAttribute('data-density');
      expect(standaloneRoot).not.toHaveAttribute('data-divided');
      expect(standaloneTrigger).toHaveAttribute('data-chevron-position', 'end');
      expect(standaloneTrigger).not.toHaveAttribute('data-density');
      expect(standaloneTrigger).not.toHaveAttribute('data-open');
      expect(standaloneTrigger).not.toHaveAttribute('data-disabled');
      expect(standaloneContent).not.toHaveAttribute('data-density');
      expect(standaloneContent).not.toHaveAttribute('data-open');
    });
  });

  describe('chevron position', () => {
    /**
     * Placement is a DOM order question. Both the label and the chevron render
     * as spans, so they are told apart by what they hold — the chevron is the
     * one carrying the svg — and compared by position rather than tag.
     */
    function triggerParts(testId: string) {
      const button = within(screen.getByTestId(testId)).getByRole('button');
      const children = [...button.children];
      return {
        chevronIndex: children.findIndex(el => el.querySelector('svg')),
        labelIndex: children.findIndex(el => el.textContent?.trim() !== ''),
        glyph: button.querySelector('svg')?.innerHTML,
      };
    }

    it('puts the chevron after the label by default', () => {
      render(
        <Collapsible trigger="A" data-testid="item">
          Body
        </Collapsible>,
      );
      const {chevronIndex, labelIndex} = triggerParts('item');
      expect(chevronIndex).toBeGreaterThan(labelIndex);
    });

    it('puts the chevron before the label when position is start', () => {
      render(
        <Collapsible trigger="A" chevronPosition="start" data-testid="item">
          Body
        </Collapsible>,
      );
      const {chevronIndex, labelIndex} = triggerParts('item');
      expect(chevronIndex).toBeLessThan(labelIndex);
    });

    it('swaps the glyph with the side, not just the position', () => {
      // A leading arrow points into the row and turns down; a trailing one
      // points down and flips up. Reusing one glyph for both would leave a
      // closed leading chevron pointing the wrong way, so the two positions
      // must not render the same art.
      render(
        <>
          <Collapsible trigger="A" data-testid="at-end">
            Body
          </Collapsible>
          <Collapsible
            trigger="A"
            chevronPosition="start"
            data-testid="at-start">
            Body
          </Collapsible>
        </>,
      );
      const endGlyph = triggerParts('at-end').glyph;
      const startGlyph = triggerParts('at-start').glyph;
      expect(endGlyph).toBeTruthy();
      expect(startGlyph).toBeTruthy();
      expect(startGlyph).not.toBe(endGlyph);
    });

    it('takes the position from the surrounding group', () => {
      render(
        <CollapsibleGroup type="single" chevronPosition="start">
          <Collapsible trigger="A" value="a" data-testid="item">
            Body
          </Collapsible>
        </CollapsibleGroup>,
      );
      const {chevronIndex, labelIndex} = triggerParts('item');
      expect(chevronIndex).toBeLessThan(labelIndex);
    });

    it('lets an item override the group position', () => {
      render(
        <CollapsibleGroup type="single" chevronPosition="start">
          <Collapsible
            trigger="A"
            value="a"
            chevronPosition="end"
            data-testid="item">
            Body
          </Collapsible>
        </CollapsibleGroup>,
      );
      const {chevronIndex, labelIndex} = triggerParts('item');
      expect(chevronIndex).toBeGreaterThan(labelIndex);
    });

    it('gives the label the rest of the row when the chevron leads', () => {
      // The trigger is `space-between`. With the chevron trailing that is what
      // separates the two, but with it leading there is nothing to absorb the
      // free space, so an unfilled label would be thrown to the far edge with
      // a gap behind the arrow. It also has to grow for a trigger that spreads
      // its own contents to have a row to spread across.
      render(
        <Collapsible trigger="A" chevronPosition="start" data-testid="item">
          Body
        </Collapsible>,
      );
      const button = within(screen.getByTestId('item')).getByRole('button');
      const label = [...button.children].find(
        el => el.textContent?.trim() !== '',
      );
      expect(label).toHaveStyle({flexGrow: 1});
    });

    it('does not leak the group position into a nested collapsible', () => {
      // Collapsible resets the presentation context around its children, so a
      // collapsible nested in an item's body keeps its own default.
      render(
        <CollapsibleGroup
          type="single"
          defaultValue="a"
          chevronPosition="start">
          <Collapsible trigger="A" value="a" data-testid="outer">
            <Collapsible trigger="B" data-testid="inner">
              Body
            </Collapsible>
          </Collapsible>
        </CollapsibleGroup>,
      );
      const {chevronIndex, labelIndex} = triggerParts('inner');
      expect(chevronIndex).toBeGreaterThan(labelIndex);
    });
  });
});

describe('pressed state', () => {
  it('paints the pressed overlay on the trigger row while it is pressed', () => {
    render(
      <Collapsible trigger="Details">
        <p>Body</p>
      </Collapsible>,
    );
    expect(hasPressedArm(screen.getByRole('button'))).toBe(true);
  });

  it('does not press a disabled trigger', () => {
    render(
      <Collapsible trigger="Details" isDisabled>
        <p>Body</p>
      </Collapsible>,
    );
    expect(hasPressedArm(screen.getByRole('button'))).toBe(false);
  });
});

describe('Collapsible close focus (AR4)', () => {
  function Example({isOpen}: {isOpen: boolean}) {
    return (
      <>
        <Collapsible trigger="Details" isOpen={isOpen} onOpenChange={() => {}}>
          <button type="button">Inside</button>
        </Collapsible>
        <button type="button">Elsewhere</button>
      </>
    );
  }

  it('moves focus inside the content to the trigger when it closes', () => {
    const {rerender} = render(<Example isOpen />);
    screen.getByRole('button', {name: 'Inside'}).focus();
    rerender(<Example isOpen={false} />);
    expect(screen.getByRole('button', {name: 'Details'})).toHaveFocus();
  });

  it('moves no focus that is outside the content', () => {
    const {rerender} = render(<Example isOpen />);
    const elsewhere = screen.getByRole('button', {name: 'Elsewhere'});
    elsewhere.focus();
    rerender(<Example isOpen={false} />);
    expect(elsewhere).toHaveFocus();
  });

  it('keeps focus on the trigger when the trigger closes it', async () => {
    const user = userEvent.setup();
    render(
      <Collapsible trigger="Details">
        <button type="button">Inside</button>
      </Collapsible>,
    );
    const trigger = screen.getByRole('button', {name: 'Details'});
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('moves no focus when it opens', () => {
    const {rerender} = render(<Example isOpen={false} />);
    const elsewhere = screen.getByRole('button', {name: 'Elsewhere'});
    elsewhere.focus();
    rerender(<Example isOpen />);
    expect(elsewhere).toHaveFocus();
  });
});
