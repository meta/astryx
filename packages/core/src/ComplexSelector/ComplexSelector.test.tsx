// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ComplexSelector.test.tsx
 * @input Uses vitest, Testing Library, user-event, and ComplexSelector
 * @output Unit tests for selection, trigger variants, positioning, and the imperative handle
 * @position Tests; validates the ComplexSelector public interaction contract
 *
 * SYNC: When ComplexSelector.tsx API changes, update these tests.
 */

import React from 'react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Button} from '../Button/Button';
import {ComplexSelector, type ComplexSelectorHandle} from './ComplexSelector';

const originalMatches = HTMLElement.prototype.matches;

// Mock the Popover API, which jsdom does not implement.
beforeEach(() => {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    this.setAttribute('popover-open', '');
    const event = new Event('toggle');
    Object.defineProperty(event, 'newState', {value: 'open'});
    this.dispatchEvent(event);
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    this.removeAttribute('popover-open');
    const event = new Event('toggle');
    Object.defineProperty(event, 'newState', {value: 'closed'});
    this.dispatchEvent(event);
  });
  Object.defineProperty(HTMLElement.prototype, 'matches', {
    configurable: true,
    value: function (this: HTMLElement, selector: string): boolean {
      if (selector === ':popover-open') {
        return this.hasAttribute('popover-open');
      }
      return originalMatches.call(this, selector);
    },
  });
});

type FruitValue = {
  fruit: 'Apple' | 'Banana';
  ripeness: 'Crisp' | 'Ripe' | 'Juicy';
};

const FRUITS = ['Apple', 'Banana'] as const;
const RIPENESS = ['Crisp', 'Ripe', 'Juicy'] as const;
const h = {hidden: true} as const;

function FruitGrid({
  value,
  onChange,
}: {
  value: FruitValue;
  onChange: (value: FruitValue) => void;
}) {
  return (
    <div role="grid" aria-label="Fruit blend choices">
      {FRUITS.flatMap(fruit =>
        RIPENESS.map(ripeness => {
          const isSelected =
            value.fruit === fruit && value.ripeness === ripeness;
          return (
            <button
              key={`${fruit}-${ripeness}`}
              type="button"
              role="gridcell"
              aria-label={`${fruit} ${ripeness}`}
              aria-selected={isSelected || undefined}
              onClick={() => onChange({fruit, ripeness})}>
              {fruit} {ripeness}
            </button>
          );
        }),
      )}
    </div>
  );
}

function FruitComplexSelector({
  value,
  onChange,
  changeAction,
}: {
  value: FruitValue;
  onChange: (value: FruitValue) => void;
  changeAction?: (value: FruitValue) => void | Promise<void>;
}) {
  return (
    <ComplexSelector
      label="Fruit blend"
      value={value}
      onChange={onChange}
      changeAction={changeAction}
      triggerLabel={`${value.fruit} ${value.ripeness}`}>
      {(value, onChange, close) => (
        <FruitGrid
          value={value}
          onChange={nextValue => {
            onChange(nextValue);
            close();
          }}
        />
      )}
    </ComplexSelector>
  );
}

describe('ComplexSelector', () => {
  it('defaults to md and reflects explicit trigger sizes', () => {
    const {container, rerender} = render(
      <ComplexSelector label="Fruit blend" value="Apple">
        {() => <div>Options</div>}
      </ComplexSelector>,
    );

    const getSelector = () =>
      container.querySelector('.astryx-complex-selector');

    expect(getSelector()).toHaveAttribute('data-size', 'md');

    rerender(
      <ComplexSelector label="Fruit blend" value="Apple" size="sm">
        {() => <div>Options</div>}
      </ComplexSelector>,
    );

    expect(getSelector()).toHaveAttribute('data-size', 'sm');

    rerender(
      <ComplexSelector label="Fruit blend" value="Apple" size="lg">
        {() => <div>Options</div>}
      </ComplexSelector>,
    );

    expect(getSelector()).toHaveAttribute('data-size', 'lg');
  });

  it('renders custom content with value and commits through onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <FruitComplexSelector
        value={{fruit: 'Apple', ripeness: 'Ripe'}}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('combobox', {name: 'Fruit blend'}));
    await user.click(
      screen.getByRole('gridcell', {name: 'Banana Juicy', ...h}),
    );

    expect(onChange).toHaveBeenCalledWith({fruit: 'Banana', ripeness: 'Juicy'});
    expect(screen.getByRole('combobox', {name: 'Fruit blend'})).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('gives the popup clearance on the edge facing the trigger, which a flip carries to the other side (#4803)', async () => {
    const user = userEvent.setup();
    render(
      <FruitComplexSelector
        value={{fruit: 'Apple', ripeness: 'Ripe'}}
        onChange={() => {}}
      />,
    );
    await user.click(screen.getByRole('combobox', {name: 'Fruit blend'}));
    const popup = document.querySelector('[popover]') as HTMLElement;
    expect(popup).not.toBeNull();
    // The clearance rides the edge facing the trigger and the viewport gutter
    // the far edge; a position-try flip swaps the two with the area, so the
    // gap survives opening upward (spec:AST-059 FR1, FR4). jsdom resolves
    // neither the var indirection nor logical margins, so read the
    // debug-mode declarations it emits.
    const blockStart = popup.style.getPropertyValue('--x-marginBlockStart');
    expect(blockStart).not.toBe('');
    expect(popup.style.getPropertyValue('--x-marginBlockEnd')).toBe('');
    expect(popup.className).toContain('useLayer__styles.placementBelow');
  });

  it('runs changeAction through the provided onChange helper', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const changeAction = vi.fn();

    render(
      <FruitComplexSelector
        value={{fruit: 'Apple', ripeness: 'Ripe'}}
        onChange={onChange}
        changeAction={changeAction}
      />,
    );

    await user.click(screen.getByRole('combobox', {name: 'Fruit blend'}));
    await user.click(
      screen.getByRole('gridcell', {name: 'Banana Crisp', ...h}),
    );

    expect(onChange).toHaveBeenCalledWith({fruit: 'Banana', ripeness: 'Crisp'});
    await waitFor(() => {
      expect(changeAction).toHaveBeenCalledWith({
        fruit: 'Banana',
        ripeness: 'Crisp',
      });
    });
  });

  it('passes a close helper to composed content', async () => {
    const user = userEvent.setup();

    render(
      <ComplexSelector label="Fruit blend" value="Apple" triggerLabel="Apple">
        {(_value, _onChange, close) => (
          <button type="button" onClick={close}>
            Done
          </button>
        )}
      </ComplexSelector>,
    );

    const trigger = screen.getByRole('combobox', {name: 'Fruit blend'});
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByRole('button', {name: 'Done', ...h}));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders a ghost toolbar trigger with a start icon', () => {
    const {container} = render(
      <ComplexSelector
        label="View options"
        value={['name']}
        variant="ghost"
        startIcon="viewColumns"
        status={{type: 'warning', message: 'Unsaved changes'}}
        data-testid="view-options">
        {() => <div>Columns</div>}
      </ComplexSelector>,
    );

    expect(container.querySelector('.astryx-complex-selector')).toHaveAttribute(
      'data-variant',
      'ghost',
    );
    expect(container.querySelector('.astryx-field-status')).toHaveAttribute(
      'data-variant',
      'detached',
    );
    expect(
      screen
        .getByTestId('view-options')
        .closest('.astryx-complex-selector')
        ?.querySelectorAll('svg'),
    ).toHaveLength(2);
  });

  it('applies distinct trigger chrome to the secondary variant', () => {
    // data-testid reaches the native control; the variant is on the trigger root.
    const triggerRoot = () =>
      screen
        .getByTestId('view-options')
        .closest('.astryx-complex-selector') as HTMLElement;
    const {rerender} = render(
      <ComplexSelector
        label="View options"
        value={['name']}
        variant="input"
        data-testid="view-options">
        {() => <div>Columns</div>}
      </ComplexSelector>,
    );
    const inputClasses = triggerRoot().className;

    rerender(
      <ComplexSelector
        label="View options"
        value={['name']}
        variant="secondary"
        data-testid="view-options">
        {() => <div>Columns</div>}
      </ComplexSelector>,
    );
    const secondary = triggerRoot();
    const secondaryClasses = secondary.className;
    expect(secondary).toHaveAttribute('data-variant', 'secondary');

    rerender(
      <ComplexSelector
        label="View options"
        value={['name']}
        variant="ghost"
        data-testid="view-options">
        {() => <div>Columns</div>}
      </ComplexSelector>,
    );
    const ghostClasses = triggerRoot().className;

    expect(secondaryClasses).not.toBe(inputClasses);
    expect(secondaryClasses).not.toBe(ghostClasses);
  });

  it('supports end-aligned popup positioning', () => {
    render(
      <ComplexSelector label="View options" value={[]} alignment="end">
        {() => <div>Columns</div>}
      </ComplexSelector>,
    );

    const popover = screen
      .getByRole('dialog', {hidden: true})
      .closest('[popover]');
    expect(popover?.getAttribute('style')).toContain(
      'position-area: self-block-end span-self-inline-start',
    );
  });

  it('exposes imperative open, close, toggle, and isOpen via handleRef', async () => {
    const handleRef = React.createRef<ComplexSelectorHandle>();
    render(
      <ComplexSelector label="View options" value={[]} handleRef={handleRef}>
        {() => <button type="button">Apply</button>}
      </ComplexSelector>,
    );
    const trigger = screen.getByRole('combobox', {name: 'View options'});
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(handleRef.current?.isOpen()).toBe(false);

    act(() => {
      handleRef.current?.open();
    });
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });
    expect(handleRef.current?.isOpen()).toBe(true);

    act(() => {
      handleRef.current?.close();
    });
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });
    expect(handleRef.current?.isOpen()).toBe(false);

    act(() => {
      handleRef.current?.toggle();
    });
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });

    act(() => {
      handleRef.current?.toggle();
    });
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });
  });

  it('does not open via the imperative handle when disabled', async () => {
    const handleRef = React.createRef<ComplexSelectorHandle>();
    render(
      <ComplexSelector
        label="View options"
        value={[]}
        isDisabled
        handleRef={handleRef}>
        {() => <button type="button">Apply</button>}
      </ComplexSelector>,
    );
    const trigger = screen.getByRole('combobox', {name: 'View options'});

    act(() => {
      handleRef.current?.open();
    });
    act(() => {
      handleRef.current?.toggle();
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(handleRef.current?.isOpen()).toBe(false);
  });

  it('does not reopen from the trigger click that follows light dismiss', async () => {
    const user = userEvent.setup();
    render(
      <ComplexSelector label="View options" value={[]}>
        {() => <button type="button">Apply</button>}
      </ComplexSelector>,
    );
    const trigger = screen.getByRole('combobox', {name: 'View options'});

    await user.click(trigger);
    const popover = screen
      .getByRole('dialog', {hidden: true})
      .closest('[popover]');
    expect(popover).not.toBeNull();

    fireEvent.pointerDown(trigger);
    const closeEvent = new Event('toggle');
    Object.defineProperty(closeEvent, 'newState', {value: 'closed'});
    fireEvent(popover as HTMLElement, closeEvent);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    const showCallCount = vi.mocked(HTMLElement.prototype.showPopover).mock
      .calls.length;
    fireEvent.click(trigger);
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalledTimes(
      showCallCount,
    );
  });
});

describe('ComplexSelector popup theme target', () => {
  it('puts astryx-complex-selector-popup on the surface that paints, not the content box', async () => {
    const user = userEvent.setup();
    render(
      <ComplexSelector label="Fruit blend" value="Apple" triggerLabel="Apple">
        {() => <button type="button">Done</button>}
      </ComplexSelector>,
    );
    await user.click(screen.getByRole('combobox', {name: 'Fruit blend'}));

    const popup = document.querySelector(
      '.astryx-complex-selector-popup',
    ) as HTMLElement;
    expect(popup).not.toBeNull();

    // The surface is the element usePopover renders: it carries the dialog
    // role and the shared surface class, and the component's content box —
    // the one with the padding and the scroll — sits INSIDE it. A target on
    // that inner box cannot paint the popup's background or radius, which is
    // what a theme reaches for this class to do.
    expect(popup).toHaveAttribute('role', 'dialog');
    expect(popup).toHaveClass('astryx-popover');
    expect(popup.querySelector('[id]')).not.toBeNull();
    expect(popup).toContainElement(
      screen.getByRole('button', {name: 'Done', ...h}),
    );

    // And it is not the bare positioning layer either.
    const layer = document.querySelector('[popover]') as HTMLElement;
    expect(popup).not.toBe(layer);
    expect(layer.contains(popup)).toBe(true);
  });

  it('keeps the target when the consumer also passes contentXstyle', async () => {
    const user = userEvent.setup();
    render(
      <ComplexSelector
        label="Fruit blend"
        value="Apple"
        triggerLabel="Apple"
        contentXstyle={{}}>
        {() => <button type="button">Done</button>}
      </ComplexSelector>,
    );
    await user.click(screen.getByRole('combobox', {name: 'Fruit blend'}));

    expect(
      document.querySelector('.astryx-complex-selector-popup'),
    ).not.toBeNull();
  });

  it('stays closed when the trigger click follows its own light dismiss (#5004)', async () => {
    const user = userEvent.setup();
    render(
      <ComplexSelector label="Fruit blend" value="Apple" triggerLabel="Apple">
        {() => <button type="button">Done</button>}
      </ComplexSelector>,
    );
    const trigger = screen.getByRole('combobox', {name: 'Fruit blend'});
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // The browser dismissed the popup on pointerup and queued the toggle. When
    // that event lands before the click — WebKit, or any engine under load —
    // the click used to read a closed popup and reopen it.
    fireEvent.pointerDown(trigger);
    const popover = document.querySelector('[popover]') as HTMLElement;
    act(() => {
      popover.dispatchEvent(
        Object.assign(new Event('toggle'), {
          oldState: 'open',
          newState: 'closed',
        }),
      );
    });
    // Synchronously: the click falls inside the one gesture the guard covers,
    // as it does in a browser a few milliseconds behind the dismissal.
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('ComplexSelector trigger render prop', () => {
  it('renders the caller control instead of the field and button', () => {
    render(
      <ComplexSelector
        label="View options"
        value={[]}
        renderTrigger={props => (
          <button type="button" {...props}>
            Options
          </button>
        )}>
        {() => <button type="button">Apply</button>}
      </ComplexSelector>,
    );
    const opener = screen.getByRole('combobox', {name: 'View options'});
    expect(opener).toHaveAttribute('aria-haspopup', 'dialog');
    expect(opener).toHaveAttribute('aria-expanded', 'false');
    expect(opener).toHaveAttribute('aria-controls');
    expect(screen.queryByText('View options')).toBeNull();
    expect(screen.queryByRole('button', {name: 'View options'})).toBeNull();
  });

  it('opens against the caller control and returns focus to it on close', async () => {
    const user = userEvent.setup();
    const handleRef = React.createRef<ComplexSelectorHandle>();
    render(
      <ComplexSelector
        label="View options"
        value={[]}
        handleRef={handleRef}
        renderTrigger={props => (
          <button type="button" {...props}>
            Options
          </button>
        )}>
        {(_value, _onChange, close) => (
          <button type="button" onClick={close}>
            Apply
          </button>
        )}
      </ComplexSelector>,
    );
    const opener = screen.getByRole('combobox', {name: 'View options'});
    await user.click(opener);
    expect(opener).toHaveAttribute('aria-expanded', 'true');
    expect(handleRef.current?.isOpen()).toBe(true);
    const content = document.getElementById(
      opener.getAttribute('aria-controls')!,
    );
    expect(content).not.toBeNull();

    await user.click(screen.getByRole('button', {name: 'Apply', hidden: true}));
    await waitFor(() => {
      expect(opener).toHaveAttribute('aria-expanded', 'false');
    });
    // Focus return lands after the attribute flips, so it needs its own
    // wait: asserting it synchronously passes alone and fails in a full-file
    // run, where the surrounding work shifts the timing.
    await waitFor(() => {
      expect(opener).toHaveFocus();
    });
  });

  it('ArrowDown on the caller control opens the popup', async () => {
    render(
      <ComplexSelector
        label="View options"
        value={[]}
        renderTrigger={props => (
          <button type="button" {...props}>
            Options
          </button>
        )}>
        {() => <button type="button">Apply</button>}
      </ComplexSelector>,
    );
    const opener = screen.getByRole('combobox', {name: 'View options'});
    fireEvent.keyDown(opener, {key: 'ArrowDown'});
    await waitFor(() => {
      expect(opener).toHaveAttribute('aria-expanded', 'true');
    });
  });
});

describe('ComplexSelector trigger semantics', () => {
  it('exposes the built-in trigger as a combobox that carries required state', () => {
    render(
      <ComplexSelector label="Destination" value={[]} isRequired>
        {() => <button type="button">Apply</button>}
      </ComplexSelector>,
    );
    const trigger = screen.getByRole('combobox', {name: /Destination/});
    expect(trigger).toHaveAttribute('aria-required', 'true');
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('spreads the combobox role, required, and disabled state onto a caller control', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <ComplexSelector
        label="Assignee"
        value={[]}
        isRequired
        isDisabled
        onClick={onClick}
        renderTrigger={props => (
          <button type="button" {...props}>
            Assign
          </button>
        )}>
        {() => <button type="button">Apply</button>}
      </ComplexSelector>,
    );
    const opener = screen.getByRole('combobox', {name: 'Assignee'});
    expect(opener).toHaveAttribute('aria-required', 'true');
    expect(opener).toHaveAttribute('aria-disabled', 'true');
    expect(opener).not.toHaveAttribute('disabled');
    await user.click(opener);
    opener.focus();
    await user.keyboard('{ArrowDown}');
    expect(opener).toHaveAttribute('aria-expanded', 'false');
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('ComplexSelector trigger semantics with a Button control', () => {
  it('keeps the disabled and busy state on an Astryx Button control', () => {
    render(
      <ComplexSelector
        label="Assignee"
        value={[]}
        isDisabled
        isLoading
        renderTrigger={props => <Button label="Assign" {...props} />}>
        {() => <button type="button">Apply</button>}
      </ComplexSelector>,
    );
    const opener = screen.getByRole('combobox', {name: 'Assignee'});
    expect(opener).toHaveAttribute('aria-disabled', 'true');
    expect(opener).toHaveAttribute('aria-busy', 'true');
  });
});

describe('ComplexSelector onOpenChange', () => {
  function renderSelector(onOpenChange: (isOpen: boolean) => void) {
    render(
      <ComplexSelector
        label="View options"
        value={[]}
        onOpenChange={onOpenChange}>
        {(_value, _onChange, close) => (
          <button type="button" onClick={close}>
            Apply
          </button>
        )}
      </ComplexSelector>,
    );
    return screen.getByRole('combobox', {name: 'View options'});
  }

  it('reports the open and the close of a trigger toggle', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const trigger = renderSelector(onOpenChange);

    await user.click(trigger);
    expect(onOpenChange.mock.calls).toEqual([[true]]);

    await user.click(trigger);
    expect(onOpenChange.mock.calls).toEqual([[true], [false]]);
  });

  it('reports an open from ArrowDown', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const trigger = renderSelector(onOpenChange);

    trigger.focus();
    await user.keyboard('{ArrowDown}');

    expect(onOpenChange.mock.calls).toEqual([[true]]);
  });

  it('reports a close from Escape', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const trigger = renderSelector(onOpenChange);

    await user.click(trigger);
    onOpenChange.mockClear();
    await user.keyboard('{Escape}');

    expect(onOpenChange.mock.calls).toEqual([[false]]);
  });

  it('reports a close the browser performed (light dismiss)', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const trigger = renderSelector(onOpenChange);

    await user.click(trigger);
    onOpenChange.mockClear();

    const popover = screen
      .getByRole('dialog', {hidden: true})
      .closest('[popover]') as HTMLElement;
    const closeEvent = new Event('toggle');
    Object.defineProperty(closeEvent, 'newState', {value: 'closed'});
    fireEvent(popover, closeEvent);

    expect(onOpenChange.mock.calls).toEqual([[false]]);
  });

  it('reports a gesture light dismiss once without reopening from its click', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const trigger = renderSelector(onOpenChange);

    await user.click(trigger);
    onOpenChange.mockClear();

    const popover = screen
      .getByRole('dialog', {hidden: true})
      .closest('[popover]') as HTMLElement;
    fireEvent.pointerDown(trigger);
    fireEvent(
      popover,
      Object.assign(new Event('toggle'), {
        oldState: 'open',
        newState: 'closed',
      }),
    );
    fireEvent.click(trigger);

    expect(onOpenChange.mock.calls).toEqual([[false]]);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('reports a close from content calling close()', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const trigger = renderSelector(onOpenChange);

    await user.click(trigger);
    onOpenChange.mockClear();
    await user.click(screen.getByRole('button', {name: 'Apply', ...h}));

    expect(onOpenChange.mock.calls).toEqual([[false]]);
  });

  it('reports opens and closes driven through the imperative handle', () => {
    const onOpenChange = vi.fn();
    const handleRef = React.createRef<ComplexSelectorHandle>();
    render(
      <ComplexSelector
        label="View options"
        value={[]}
        handleRef={handleRef}
        onOpenChange={onOpenChange}>
        {() => <button type="button">Apply</button>}
      </ComplexSelector>,
    );

    act(() => handleRef.current?.open());
    act(() => handleRef.current?.close());
    act(() => handleRef.current?.toggle());

    expect(onOpenChange.mock.calls).toEqual([[true], [false], [true]]);
  });

  it('does not report a state it is already in', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const handleRef = React.createRef<ComplexSelectorHandle>();
    render(
      <ComplexSelector
        label="View options"
        value={[]}
        handleRef={handleRef}
        onOpenChange={onOpenChange}>
        {() => <button type="button">Apply</button>}
      </ComplexSelector>,
    );
    const trigger = screen.getByRole('combobox', {name: 'View options'});

    act(() => handleRef.current?.close());
    expect(onOpenChange).not.toHaveBeenCalled();

    await user.click(trigger);
    act(() => handleRef.current?.open());
    expect(onOpenChange.mock.calls).toEqual([[true]]);
  });

  describe('statusVariant forwarding', () => {
    it('defaults to attached (status renders with data-variant="attached")', () => {
      const {container} = render(
        <ComplexSelector
          label="Filter"
          value={[]}
          status={{type: 'error', message: 'Required'}}>
          {() => <button type="button">Apply</button>}
        </ComplexSelector>,
      );
      expect(container.querySelector('.astryx-field-status')).toHaveAttribute(
        'data-variant',
        'attached',
      );
    });

    it('forwards statusVariant="detached" to the underlying Field status', () => {
      const {container} = render(
        <ComplexSelector
          label="Filter"
          value={[]}
          status={{type: 'error', message: 'Required'}}
          statusVariant="detached">
          {() => <button type="button">Apply</button>}
        </ComplexSelector>,
      );
      expect(container.querySelector('.astryx-field-status')).toHaveAttribute(
        'data-variant',
        'detached',
      );
    });

    it.each(['secondary', 'ghost'] as const)(
      'forces detached when variant="%s" even if statusVariant="attached"',
      variant => {
        const {container} = render(
          <ComplexSelector
            label="Filter"
            value={[]}
            variant={variant}
            status={{type: 'error', message: 'Required'}}
            statusVariant="attached">
            {() => <button type="button">Apply</button>}
          </ComplexSelector>,
        );
        expect(container.querySelector('.astryx-field-status')).toHaveAttribute(
          'data-variant',
          'detached',
        );
      },
    );

    it('renders no message box for statusVariant="tooltip"', () => {
      const {container} = render(
        <ComplexSelector
          label="Filter"
          value={[]}
          status={{type: 'error', message: 'Required'}}
          statusVariant="tooltip">
          {() => <button type="button">Apply</button>}
        </ComplexSelector>,
      );
      expect(
        container.querySelector('.astryx-field-status'),
      ).not.toBeInTheDocument();
    });
  });
});
