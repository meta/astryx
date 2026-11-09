// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ComplexSelector.test.tsx
 * @input Uses vitest, Testing Library, user-event, and ComplexSelector
 * @output Unit tests for selection, trigger variants, positioning, the imperative handle, and the disabled reason
 * @position Tests; validates the ComplexSelector public interaction contract
 *
 * SYNC: When ComplexSelector.tsx API changes, update these tests.
 */

import React, {useLayoutEffect} from 'react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Button} from '../Button/Button';
import * as stylex from '@stylexjs/stylex';
import {focusVars} from '../theme/tokens.stylex';
import {ComplexSelector, type ComplexSelectorHandle} from './ComplexSelector';
import {readAnchorNames} from '../Layer/anchorName';

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

  it('blocks a commit helper kept from an enabled render once disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const kept: {current: ((value: string) => void) | null} = {current: null};
    const renderSelector = (isDisabled: boolean) => (
      <ComplexSelector
        label="Fruit"
        value="Apple"
        isDisabled={isDisabled}
        onChange={onChange}>
        {(_value, commit) => {
          kept.current ??= commit;
          return <span>Choices</span>;
        }}
      </ComplexSelector>
    );
    const {rerender} = render(renderSelector(false));
    await user.click(screen.getByRole('combobox', {name: 'Fruit'}));
    expect(kept.current).not.toBeNull();
    rerender(renderSelector(true));
    act(() => kept.current?.('Banana'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('blocks a commit from content in the render that disables it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    function CommitOnDisable({
      isDisabled,
      commit,
    }: {
      isDisabled: boolean;
      commit: (value: string) => void;
    }) {
      useLayoutEffect(() => {
        if (isDisabled) {
          commit('Banana');
        }
      }, [isDisabled, commit]);
      return <span>Choices</span>;
    }
    const renderSelector = (isDisabled: boolean) => (
      <ComplexSelector
        label="Fruit"
        value="Apple"
        isDisabled={isDisabled}
        onChange={onChange}>
        {(_value, commit) => (
          <CommitOnDisable isDisabled={isDisabled} commit={commit} />
        )}
      </ComplexSelector>
    );
    const {rerender} = render(renderSelector(false));
    await user.click(screen.getByRole('combobox', {name: 'Fruit'}));
    rerender(renderSelector(true));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('commits through a helper kept from a disabled render once enabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const kept: {current: ((value: string) => void) | null} = {current: null};
    const renderSelector = (isDisabled: boolean) => (
      <ComplexSelector
        label="Fruit"
        value="Apple"
        isDisabled={isDisabled}
        onChange={onChange}>
        {(_value, commit) => {
          kept.current ??= commit;
          return <span>Choices</span>;
        }}
      </ComplexSelector>
    );
    const {rerender} = render(renderSelector(true));
    expect(kept.current).not.toBeNull();
    rerender(renderSelector(false));
    await user.click(screen.getByRole('combobox', {name: 'Fruit'}));
    act(() => kept.current?.('Banana'));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('Banana');
  });

  it('blocks commits when disabled while open and allows them after re-enabling', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const changeAction = vi.fn();
    const renderSelector = (isDisabled: boolean) => (
      <ComplexSelector
        label="Fruit"
        value="Apple"
        isDisabled={isDisabled}
        onChange={onChange}
        changeAction={changeAction}>
        {(_value, commit) => (
          <button type="button" onClick={() => commit('Banana')}>
            Select Banana
          </button>
        )}
      </ComplexSelector>
    );
    const {rerender} = render(renderSelector(false));
    await user.click(screen.getByRole('combobox', {name: 'Fruit'}));
    const choice = screen.getByRole('button', {name: 'Select Banana', ...h});

    rerender(renderSelector(true));
    await user.click(choice);
    expect(onChange).not.toHaveBeenCalled();
    expect(changeAction).not.toHaveBeenCalled();

    rerender(renderSelector(false));
    await user.click(choice);
    expect(onChange).toHaveBeenCalledExactlyOnceWith('Banana');
    expect(changeAction).toHaveBeenCalledExactlyOnceWith('Banana');
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

    // Closed, the surface carries no dialog role, so find the layer itself.
    const popover = document.querySelector('[popover]');
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

  it('names the built-in trigger with the field label when the caller gives no name', () => {
    render(
      <ComplexSelector label="Destination" value={[]}>
        {() => <button type="button">Apply</button>}
      </ComplexSelector>,
    );
    const trigger = screen.getByRole('combobox', {name: 'Destination'});
    const labelId = trigger.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId!)).toHaveTextContent('Destination');
    expect(trigger).not.toHaveAttribute('aria-label');
  });

  it("lets a caller's aria-label name the built-in trigger instead of the field label (family:input-fields FR10)", () => {
    render(
      <ComplexSelector
        label="Destination"
        aria-label="Trip destination"
        value={[]}>
        {() => <button type="button">Apply</button>}
      </ComplexSelector>,
    );
    const trigger = screen.getByRole('combobox', {name: 'Trip destination'});
    expect(trigger).toHaveAttribute('aria-label', 'Trip destination');
    expect(trigger).not.toHaveAttribute('aria-labelledby');
  });

  it("lets a caller's aria-labelledby replace the field label on the built-in trigger (family:input-fields FR10)", () => {
    render(
      <>
        <span id="trip-heading">Where to next</span>
        <ComplexSelector
          label="Destination"
          aria-labelledby="trip-heading"
          value={[]}>
          {() => <button type="button">Apply</button>}
        </ComplexSelector>
      </>,
    );
    const trigger = screen.getByRole('combobox', {name: 'Where to next'});
    expect(trigger).toHaveAttribute('aria-labelledby', 'trip-heading');
  });

  // WCAG 2.5.3 Label in Name (axe `label-content-name-mismatch`) applies to
  // controls named from their content. A button named by `aria-labelledby`
  // while showing the chosen value failed it, and hid the value from the
  // accessibility tree. As a combobox the label is the name and the text it
  // shows is the value, as on `Selector`.
  it('names the trigger by its label and shows the chosen value as its content', () => {
    render(
      <ComplexSelector
        label="Supplier"
        value="1"
        onChange={() => {}}
        triggerLabel="Acme Ltd">
        {() => <p>Choose a supplier</p>}
      </ComplexSelector>,
    );
    // A combobox takes no name from its content, so the value is not in the
    // name and Label in Name has nothing to compare it with.
    expect(screen.queryByRole('button', {name: /Supplier/})).toBeNull();
    const trigger = screen.getByRole('combobox', {name: 'Supplier'});
    expect(trigger).toHaveTextContent('Acme Ltd');
    expect(trigger).toHaveAccessibleName('Supplier');
  });

  it('keeps the field label as the name when the trigger shows the placeholder', () => {
    render(
      <ComplexSelector
        label="Supplier"
        value=""
        onChange={() => {}}
        placeholder="Choose a supplier">
        {() => <p>Pick one</p>}
      </ComplexSelector>,
    );
    const trigger = screen.getByRole('combobox', {name: 'Supplier'});
    expect(trigger).toHaveTextContent('Choose a supplier');
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

  describe('focus on close', () => {
    function lightDismiss(): void {
      const popover = screen
        .getByRole('dialog', {hidden: true})
        .closest('[popover]') as HTMLElement;
      act(() => {
        popover.dispatchEvent(
          Object.assign(new Event('toggle'), {
            oldState: 'open',
            newState: 'closed',
          }),
        );
      });
    }

    it('Escape and a close from the content return focus to the trigger', async () => {
      const user = userEvent.setup();
      const trigger = renderSelector(() => {});
      await user.click(trigger);
      await user.keyboard('{Escape}');
      expect(trigger).toHaveFocus();
      await user.click(trigger);
      await user.click(screen.getByRole('button', {name: 'Apply', ...h}));
      expect(trigger).toHaveFocus();
    });

    it('a light dismiss onto another control leaves focus there; onto nothing focusable it returns to the trigger', async () => {
      const user = userEvent.setup();
      render(
        <>
          <ComplexSelector label="View options" value={[]}>
            {() => <button type="button">Apply</button>}
          </ComplexSelector>
          <input aria-label="Notes" />
        </>,
      );
      const trigger = screen.getByRole('combobox', {name: 'View options'});
      const notes = screen.getByRole('textbox', {name: 'Notes'});
      await user.click(trigger);
      act(() => notes.focus());
      lightDismiss();
      expect(notes).toHaveFocus();

      await user.click(trigger);
      act(() => (document.activeElement as HTMLElement | null)?.blur());
      lightDismiss();
      expect(trigger).toHaveFocus();
    });

    it('a caller-rendered control gets focus back even after a light dismiss onto another control', async () => {
      const user = userEvent.setup();
      render(
        <>
          <ComplexSelector
            label="View options"
            value={[]}
            renderTrigger={props => (
              <button type="button" {...props}>
                Options
              </button>
            )}>
            {() => <button type="button">Apply</button>}
          </ComplexSelector>
          <input aria-label="Notes" />
        </>,
      );
      const opener = screen.getByRole('combobox', {name: 'View options'});
      await user.click(opener);
      act(() => screen.getByRole('textbox', {name: 'Notes'}).focus());
      lightDismiss();
      expect(opener).toHaveFocus();
    });
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

    it('shows the status icon in place of the chevron with attached status, and the chevron with detached', () => {
      const {container, rerender} = render(
        <ComplexSelector
          label="Filter"
          value={[]}
          status={{type: 'error', message: 'Required'}}>
          {() => <button type="button">Apply</button>}
        </ComplexSelector>,
      );
      const controlBox = screen.getByRole('combobox', {name: 'Filter'})
        .parentElement as HTMLElement;
      expect(
        controlBox.querySelector('.astryx-input-status-icon'),
      ).toBeInTheDocument();
      // A plain icon, not a control: the combobox stays the one tab stop.
      expect(within(controlBox).queryAllByRole('button')).toHaveLength(0);
      // It takes the chevron's place, as in Selector.
      expect(
        controlBox.querySelector('.astryx-complex-selector-indicator-icon'),
      ).not.toBeInTheDocument();
      rerender(
        <ComplexSelector
          label="Filter"
          value={[]}
          status={{type: 'error', message: 'Required'}}
          statusVariant="detached">
          {() => <button type="button">Apply</button>}
        </ComplexSelector>,
      );
      const detachedBox = screen.getByRole('combobox', {name: 'Filter'})
        .parentElement as HTMLElement;
      expect(
        detachedBox.querySelector('.astryx-input-status-icon'),
      ).not.toBeInTheDocument();
      expect(
        detachedBox.querySelector('.astryx-complex-selector-indicator-icon'),
      ).toBeInTheDocument();
      // The detached message box shows its own icon.
      expect(
        container.querySelector('.astryx-field-status'),
      ).toBeInTheDocument();
    });

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

    // family:input-fields FR8: tooltip placement keeps the message reachable.
    it('puts the tooltip-placement message in a focusable info-tip that describes the trigger', async () => {
      const user = userEvent.setup();
      render(
        <ComplexSelector
          label="Filter"
          value={[]}
          status={{type: 'error', message: 'Required'}}
          statusVariant="tooltip">
          {() => <button type="button">Apply</button>}
        </ComplexSelector>,
      );
      const trigger = screen.getByRole('combobox', {name: 'Filter'});
      const tip = screen.getByRole('button', {name: 'Error details'});
      // Every id the trigger points at exists, and the status message is
      // among them.
      const ids = trigger.getAttribute('aria-describedby')?.split(' ') ?? [];
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) {
        expect(document.getElementById(id)).not.toBeNull();
      }
      expect(trigger).toHaveAccessibleDescription('Required');
      // The info-tip takes the chevron's place, as in Selector.
      expect(
        document.querySelector('.astryx-complex-selector-indicator-icon'),
      ).not.toBeInTheDocument();

      // Focusing the info-tip reveals the message without opening the popup.
      await user.tab();
      await user.tab();
      expect(tip).toHaveFocus();
      expect(tip).toHaveAccessibleDescription('Required');
      await user.click(tip);
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    // architecture:interaction-modality INV3: the info-tip rings itself, so
    // the control box rings only for the trigger, not for any focused child.
    it('rings the control box for the trigger only, not for the info-tip', () => {
      render(
        <ComplexSelector
          label="Filter"
          value={[]}
          status={{type: 'error', message: 'Required'}}
          statusVariant="tooltip">
          {() => <button type="button">Apply</button>}
        </ComplexSelector>,
      );
      const box = screen.getByRole('combobox', {name: 'Filter'}).parentElement!;
      // The same declarations as the shared any-descendant ring, with null
      // defaults so only its `:has(:focus-visible)` atoms are compared (the
      // default atoms are shared with the combobox-only ring).
      /* eslint-disable @astryx/focus-outline-shared -- a test oracle that
         mirrors the shared ring's conditional atoms; it paints nothing. */
      const anyDescendantRing = stylex.create({
        ring: {
          outlineWidth: {
            default: null,
            ':has(:focus-visible)': focusVars['--focus-outline-width'],
          },
          outlineStyle: {
            default: null,
            ':has(:focus-visible)': focusVars['--focus-outline-style'],
          },
        },
      });
      /* eslint-enable @astryx/focus-outline-shared */
      const anyFocusAtoms = stylex
        .props(anyDescendantRing.ring)
        .className!.split(' ')
        .filter(name => name.includes('x') && !name.includes('__'));
      expect(anyFocusAtoms.length).toBeGreaterThan(0);
      for (const name of anyFocusAtoms) {
        expect(box).not.toHaveClass(name);
      }
    });

    it('opens no popup when the info-tip message bubble is pressed', async () => {
      const user = userEvent.setup();
      render(
        <ComplexSelector
          label="Filter"
          value={[]}
          status={{type: 'error', message: 'Required'}}
          statusVariant="tooltip">
          {() => <button type="button">Apply</button>}
        </ComplexSelector>,
      );
      const trigger = screen.getByRole('combobox', {name: 'Filter'});
      const tip = screen.getByRole('button', {name: 'Error details'});
      act(() => {
        tip.focus();
      });
      const bubble = await screen.findByRole('tooltip', {hidden: true});
      await user.click(bubble);
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    it('keeps the attached message box and adds no info-tip', () => {
      render(
        <ComplexSelector
          label="Filter"
          value={[]}
          status={{type: 'error', message: 'Required'}}>
          {() => <button type="button">Apply</button>}
        </ComplexSelector>,
      );
      expect(screen.queryByRole('button', {name: 'Error details'})).toBeNull();
      expect(
        screen.getByRole('combobox', {name: 'Filter'}),
      ).toHaveAccessibleDescription('Required');
    });
  });
});

// The reason tooltip opens through the same Popover API, so count only the
// show calls made on the selector popup itself.
describe('ComplexSelector disabledMessage', () => {
  // `data-testid` reaches the trigger button; the tooltip and the popup
  // anchor on the control box around it.
  const controlBox = (trigger: HTMLElement): HTMLElement => {
    const box = trigger.closest<HTMLElement>('.astryx-complex-selector');
    if (box == null) {
      throw new Error('ComplexSelector control box not found');
    }
    return box;
  };

  it("keeps a caller's aria-disabled on an enabled trigger", () => {
    render(
      <ComplexSelector
        label="View options"
        value={[]}
        aria-disabled="true"
        data-testid="view-options">
        {() => <button type="button">Apply</button>}
      </ComplexSelector>,
    );
    expect(screen.getByTestId('view-options')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('marks a disabled trigger aria-disabled, with or without a reason', () => {
    const {rerender} = render(
      <ComplexSelector
        label="View options"
        value={[]}
        isDisabled
        data-testid="view-options">
        {() => <button type="button">Apply</button>}
      </ComplexSelector>,
    );
    const trigger = screen.getByTestId('view-options');
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    expect(trigger).not.toHaveAttribute('disabled');
    rerender(
      <ComplexSelector
        label="View options"
        value={[]}
        isDisabled
        disabledMessage="You need the Editor role"
        data-testid="view-options">
        {() => <button type="button">Apply</button>}
      </ComplexSelector>,
    );
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
  });

  it('shows the reason tooltip on hover when disabled with a reason', async () => {
    render(
      <ComplexSelector
        label="View options"
        value={[]}
        isDisabled
        disabledMessage="You need the Editor role"
        data-testid="view-options">
        {() => <button type="button">Apply</button>}
      </ComplexSelector>,
    );

    const container = controlBox(screen.getByTestId('view-options'));
    const tooltip = screen.getByRole('tooltip', h);
    expect(tooltip).toHaveTextContent('You need the Editor role');

    fireEvent.mouseEnter(within(container).getByRole('combobox'));
    await waitFor(() => {
      expect(tooltip).toHaveAttribute('popover-open');
    });

    fireEvent.mouseLeave(within(container).getByRole('combobox'));
    await waitFor(() => {
      expect(tooltip).not.toHaveAttribute('popover-open');
    });
  });

  it('shows the reason tooltip on keyboard focus', async () => {
    const user = userEvent.setup();
    render(
      <ComplexSelector
        label="View options"
        value={[]}
        isDisabled
        disabledMessage="You need the Editor role">
        {() => <button type="button">Apply</button>}
      </ComplexSelector>,
    );

    const tooltip = screen.getByRole('tooltip', h);
    await user.tab();
    expect(screen.getByRole('combobox', {name: 'View options'})).toHaveFocus();
    await waitFor(() => {
      expect(tooltip).toHaveAttribute('popover-open');
    });
  });

  it('does not render a tooltip when not disabled', () => {
    render(
      <ComplexSelector
        label="View options"
        value={[]}
        disabledMessage="You need the Editor role">
        {() => <button type="button">Apply</button>}
      </ComplexSelector>,
    );
    expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
  });

  it('does not render a tooltip when disabled without a reason', () => {
    render(
      <ComplexSelector label="View options" value={[]} isDisabled>
        {() => <button type="button">Apply</button>}
      </ComplexSelector>,
    );
    expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
  });

  it('keeps the trigger focusable via aria-disabled when a reason is provided', () => {
    render(
      <ComplexSelector
        label="View options"
        value={[]}
        isDisabled
        disabledMessage="You need the Editor role">
        {() => <button type="button">Apply</button>}
      </ComplexSelector>,
    );
    const trigger = screen.getByRole('combobox', {name: 'View options'});
    expect(trigger).not.toBeDisabled();
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
  });

  it('links the reason tooltip from the trigger via aria-describedby', () => {
    render(
      <ComplexSelector
        label="View options"
        value={[]}
        isDisabled
        disabledMessage="You need the Editor role">
        {() => <button type="button">Apply</button>}
      </ComplexSelector>,
    );
    const trigger = screen.getByRole('combobox', {name: 'View options'});
    const tooltip = screen.getByRole('tooltip', h);
    expect(trigger.getAttribute('aria-describedby')).toContain(tooltip.id);
  });

  it('blocks activation while focusable-disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const handleRef = React.createRef<ComplexSelectorHandle>();
    render(
      <ComplexSelector
        label="View options"
        value={[]}
        onChange={onChange}
        handleRef={handleRef}
        isDisabled
        disabledMessage="You need the Editor role">
        {() => <button type="button">Apply</button>}
      </ComplexSelector>,
    );
    const trigger = screen.getByRole('combobox', {name: 'View options'});

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    await user.keyboard('{ArrowDown}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog', h)).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', h)).not.toBeInTheDocument();

    act(() => handleRef.current?.open());
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(handleRef.current?.isOpen()).toBe(false);
    expect(screen.queryByRole('dialog', h)).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the tab stop without a reason, with no tooltip or description', () => {
    render(
      <ComplexSelector label="View options" value={[]} isDisabled>
        {() => <button type="button">Apply</button>}
      </ComplexSelector>,
    );
    const trigger = screen.getByRole('combobox', {name: 'View options'});
    expect(trigger).not.toBeDisabled();
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    expect(trigger).not.toHaveAttribute('aria-describedby');
  });

  it('never sets native disabled, and treats an empty reason as no reason', () => {
    const tree = (isDisabled: boolean, disabledMessage?: string) => (
      <ComplexSelector
        label="View options"
        value={[]}
        isDisabled={isDisabled}
        disabledMessage={disabledMessage}>
        {() => <button type="button">Apply</button>}
      </ComplexSelector>
    );
    const trigger = () => screen.getByRole('combobox', {name: 'View options'});
    const expectPlainEnabled = () => {
      expect(trigger()).not.toBeDisabled();
      expect(trigger()).not.toHaveAttribute('aria-disabled');
      expect(trigger()).not.toHaveAttribute('aria-describedby');
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    };
    const expectDisabledWithoutReason = () => {
      expect(trigger()).not.toBeDisabled();
      expect(trigger()).toHaveAttribute('aria-disabled', 'true');
      expect(trigger()).not.toHaveAttribute('aria-describedby');
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    };

    const {rerender} = render(tree(false));
    expectPlainEnabled();

    rerender(tree(false, 'You need the Editor role'));
    expectPlainEnabled();

    rerender(tree(true));
    expectDisabledWithoutReason();

    // An empty reason is no reason: nothing to describe, so no tooltip shows.
    rerender(tree(true, ''));
    expectDisabledWithoutReason();

    rerender(tree(true, 'You need the Editor role'));
    expect(trigger()).not.toBeDisabled();
    expect(trigger()).toHaveAttribute('aria-disabled', 'true');
    expect(trigger()).toHaveAttribute(
      'aria-describedby',
      screen.getByRole('tooltip', h).id,
    );
  });

  it('orders aria-describedby as description, status message, then the reason, with every id resolving', () => {
    render(
      <ComplexSelector
        label="View options"
        value={[]}
        description="Pick the columns to show"
        status={{type: 'error', message: 'At least one column is required'}}
        isDisabled
        disabledMessage="You need the Editor role">
        {() => <button type="button">Apply</button>}
      </ComplexSelector>,
    );
    const trigger = screen.getByRole('combobox', {name: 'View options'});
    const tooltip = screen.getByRole('tooltip', h);

    const ids = (trigger.getAttribute('aria-describedby') ?? '').split(/\s+/);
    expect(ids).toHaveLength(3);
    const described = ids.map(id => document.getElementById(id));
    expect(described[0]).toHaveTextContent('Pick the columns to show');
    expect(described[1]).toHaveTextContent('At least one column is required');
    expect(described[2]).toBe(tooltip);
    expect(trigger).toHaveAttribute('aria-invalid', 'true');
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
  });

  it('keeps onOpenChange silent and toggle() a no-op while focusable-disabled', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const handleRef = React.createRef<ComplexSelectorHandle>();
    render(
      <ComplexSelector
        label="View options"
        value={[]}
        handleRef={handleRef}
        onOpenChange={onOpenChange}
        isDisabled
        disabledMessage="You need the Editor role">
        {() => <button type="button">Apply</button>}
      </ComplexSelector>,
    );
    const trigger = screen.getByRole('combobox', {name: 'View options'});

    await user.click(trigger);
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    await user.keyboard('{ArrowDown}');
    act(() => handleRef.current?.toggle());
    act(() => handleRef.current?.open());
    act(() => handleRef.current?.close());

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(handleRef.current?.isOpen()).toBe(false);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog', h)).not.toBeInTheDocument();
  });

  it('re-enabling at runtime drops aria-disabled, the tooltip, and its describedby id without moving focus, and re-disabling restores them', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const tree = (isDisabled: boolean) => (
      <ComplexSelector
        label="View options"
        value={[]}
        description="Pick the columns to show"
        isDisabled={isDisabled}
        disabledMessage="You need the Editor role"
        onOpenChange={onOpenChange}>
        {() => <button type="button">Apply</button>}
      </ComplexSelector>
    );
    const {rerender} = render(tree(true));
    const trigger = screen.getByRole('combobox', {name: 'View options'});
    const tooltipId = screen.getByRole('tooltip', h).id;

    await user.tab();
    expect(trigger).toHaveFocus();
    await waitFor(() => {
      expect(screen.getByRole('tooltip', h)).toHaveAttribute('popover-open');
    });

    rerender(tree(false));
    expect(trigger).toHaveFocus();
    expect(trigger).not.toBeDisabled();
    expect(trigger).not.toHaveAttribute('aria-disabled');
    expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    const ids = (trigger.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter(Boolean);
    expect(ids).not.toContain(tooltipId);
    for (const id of ids) {
      expect(document.getElementById(id)).not.toBeNull();
    }

    await user.keyboard('{ArrowDown}');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(onOpenChange.mock.calls).toEqual([[true]]);
    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();

    rerender(tree(true));
    expect(trigger).toHaveFocus();
    expect(trigger).not.toBeDisabled();
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    const restored = screen.getByRole('tooltip', h);
    expect(trigger.getAttribute('aria-describedby')).toContain(restored.id);
  });

  it('dismisses only the reason tooltip on Escape, keeping focus on the trigger and the popup closed', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <ComplexSelector
        label="View options"
        value={[]}
        onOpenChange={onOpenChange}
        isDisabled
        disabledMessage="You need the Editor role">
        {() => <button type="button">Apply</button>}
      </ComplexSelector>,
    );
    const trigger = screen.getByRole('combobox', {name: 'View options'});
    const tooltip = screen.getByRole('tooltip', h);

    await user.tab();
    await waitFor(() => {
      expect(tooltip).toHaveAttribute('popover-open');
    });

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(tooltip).not.toHaveAttribute('popover-open');
    });
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog', h)).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    // Dismissing the tip does not strip the description.
    expect(trigger.getAttribute('aria-describedby')).toContain(tooltip.id);

    // A second Escape has nothing left to dismiss and touches nothing.
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('hides the reason tooltip when keyboard focus leaves the trigger', async () => {
    const user = userEvent.setup();
    render(
      <>
        <ComplexSelector
          label="View options"
          value={[]}
          isDisabled
          disabledMessage="You need the Editor role">
          {() => <button type="button">Apply</button>}
        </ComplexSelector>
        <button type="button">After</button>
      </>,
    );
    const trigger = screen.getByRole('combobox', {name: 'View options'});
    const tooltip = screen.getByRole('tooltip', h);

    await user.tab();
    expect(trigger).toHaveFocus();
    await waitFor(() => {
      expect(tooltip).toHaveAttribute('popover-open');
    });

    // focusout bubbles from the button to the container the tooltip listens
    // on, so leaving the trigger hides the reason.
    await user.tab();
    expect(trigger).not.toHaveFocus();
    await waitFor(() => {
      expect(tooltip).not.toHaveAttribute('popover-open');
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps busy and the disabled reason independent: settling clears only aria-busy', async () => {
    const user = userEvent.setup();
    const settlers: (() => void)[] = [];
    const changeAction = vi.fn(async () => {
      await new Promise<void>(resolve => {
        settlers.push(resolve);
      });
    });
    const initial: FruitValue = {fruit: 'Apple', ripeness: 'Ripe'};
    const tree = (isDisabled: boolean) => (
      <ComplexSelector
        label="Fruit blend"
        value={initial}
        onChange={() => {}}
        changeAction={changeAction}
        triggerLabel="Apple Ripe"
        isDisabled={isDisabled}
        disabledMessage={isDisabled ? 'You need the Editor role' : undefined}
        data-testid="fruit-blend">
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
    const {rerender} = render(tree(false));
    const trigger = screen.getByRole('combobox', {name: 'Fruit blend'});
    const container = controlBox(screen.getByTestId('fruit-blend'));

    await user.click(trigger);
    await user.click(
      screen.getByRole('gridcell', {name: 'Banana Crisp', ...h}),
    );
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-busy', 'true');
    });

    rerender(tree(true));
    expect(trigger).toHaveAttribute('aria-busy', 'true');
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    expect(trigger).not.toBeDisabled();
    const tooltip = screen.getByRole('tooltip', h);
    expect(trigger.getAttribute('aria-describedby')).toContain(tooltip.id);
    fireEvent.mouseEnter(within(container).getByRole('combobox'));
    await waitFor(() => {
      expect(tooltip).toHaveAttribute('popover-open');
    });

    await act(async () => {
      settlers.forEach(settle => settle());
    });
    await waitFor(() => {
      expect(trigger).not.toHaveAttribute('aria-busy');
    });
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    expect(trigger).not.toBeDisabled();
    expect(trigger.getAttribute('aria-describedby')).toContain(tooltip.id);
  });

  it('anchors the reason tooltip to the control box and keeps it, with the open tip, across a rerender', async () => {
    const tree = (triggerLabel: string) => (
      <ComplexSelector
        label="View options"
        value={triggerLabel}
        triggerLabel={triggerLabel}
        isDisabled
        disabledMessage="You need the Editor role"
        data-testid="view-options">
        {() => <button type="button">Apply</button>}
      </ComplexSelector>
    );
    const {rerender} = render(tree('A'));
    const container = controlBox(screen.getByTestId('view-options'));
    const tooltip = screen.getByRole('tooltip', h);
    const anchorOf = (el: Element | null) =>
      /position-anchor:\s*([^;]+)/
        .exec(el?.getAttribute('style') ?? '')?.[1]
        .trim();

    fireEvent.mouseEnter(within(container).getByRole('combobox'));
    await waitFor(() => {
      expect(tooltip).toHaveAttribute('popover-open');
    });

    // The closed popup is not mounted while disabled; the open tooltip
    // anchors to the control box.
    const names = [...readAnchorNames(container)].sort();
    expect(anchorOf(tooltip)).toBeDefined();
    expect(names).toContain(anchorOf(tooltip));

    // The inline composed ref is recreated every render, so React detaches and
    // re-attaches both hooks. That churn must not close the tip, drop an
    // anchor, or lose the hover listeners.
    rerender(tree('B'));
    expect(screen.getByRole('tooltip', h)).toBe(tooltip);
    expect(tooltip).toHaveAttribute('popover-open');
    expect([...readAnchorNames(container)].sort()).toEqual(names);

    fireEvent.mouseLeave(within(container).getByRole('combobox'));
    await waitFor(() => {
      expect(tooltip).not.toHaveAttribute('popover-open');
    });
    fireEvent.mouseEnter(within(container).getByRole('combobox'));
    await waitFor(() => {
      expect(tooltip).toHaveAttribute('popover-open');
    });
  });

  it('restores focus to the aria-disabled trigger when the popup closes after the field was disabled mid-open', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const tree = (isDisabled: boolean) => (
      <ComplexSelector
        label="View options"
        value={[]}
        isDisabled={isDisabled}
        disabledMessage={isDisabled ? 'You need the Editor role' : undefined}
        onOpenChange={onOpenChange}>
        {() => <button type="button">Apply</button>}
      </ComplexSelector>
    );
    const {rerender} = render(tree(false));
    const trigger = screen.getByRole('combobox', {name: 'View options'});

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    // jsdom does not run the popup's autofocus; put focus inside as a browser
    // would, so closing has something to restore from.
    act(() => screen.getByRole('button', {name: 'Apply', ...h}).focus());

    rerender(tree(true));
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    expect(trigger).not.toBeDisabled();

    // A keyboard-driven close restores keyboard focus, which a browser reports
    // as `:focus-visible`. jsdom's answer depends on what earlier tests
    // focused, so stand it up here.
    const realMatches = trigger.matches.bind(trigger);
    vi.spyOn(trigger, 'matches').mockImplementation((selector: string) =>
      selector === ':focus-visible' ? true : realMatches(selector),
    );

    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(onOpenChange.mock.calls).toEqual([[true], [false]]);
    // A natively disabled button could not take this focus restore; the
    // reason-bearing trigger can, and the reason surfaces on that focus.
    expect(trigger).toHaveFocus();
    await waitFor(() => {
      expect(screen.getByRole('tooltip', h)).toHaveAttribute('popover-open');
    });
  });

  it('reveals the reason on a touch tap without opening the popup', () => {
    render(
      <ComplexSelector
        label="View options"
        value={[]}
        isDisabled
        disabledMessage="You need the Editor role"
        data-testid="view-options">
        {() => <button type="button">Apply</button>}
      </ComplexSelector>,
    );
    const trigger = screen.getByRole('combobox', {name: 'View options'});
    const container = controlBox(screen.getByTestId('view-options'));
    const tooltip = screen.getByRole('tooltip', h);

    // A finger's arrival lands on the container (pointerenter does not
    // bubble); the press and the click it produces land on the button and
    // bubble up to the container's listeners.
    fireEvent.pointerEnter(container, {pointerType: 'touch'});
    fireEvent.pointerDown(trigger, {pointerType: 'touch'});
    fireEvent.pointerUp(trigger, {pointerType: 'touch'});
    fireEvent.mouseEnter(within(container).getByRole('combobox'));
    fireEvent.click(trigger);

    // Touch skips the hover delay: the reason is visible synchronously.
    expect(tooltip).toHaveAttribute('popover-open');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog', h)).not.toBeInTheDocument();

    // The next tap toggles the reason away.
    fireEvent.pointerDown(trigger, {pointerType: 'touch'});
    fireEvent.pointerUp(trigger, {pointerType: 'touch'});
    fireEvent.click(trigger);
    expect(tooltip).not.toHaveAttribute('popover-open');
    expect(screen.queryByRole('dialog', h)).not.toBeInTheDocument();
  });

  it('runs no consumer onClick from a disabled trigger, with or without a reason', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const tree = (disabledMessage?: string) => (
      <ComplexSelector
        label="View options"
        value={[]}
        isDisabled
        disabledMessage={disabledMessage}
        onClick={onClick}>
        {() => <button type="button">Apply</button>}
      </ComplexSelector>
    );
    const {rerender} = render(tree());
    const trigger = screen.getByRole('combobox', {name: 'View options'});

    await user.click(trigger);
    rerender(tree('You need the Editor role'));
    await user.click(trigger);
    expect(onClick).not.toHaveBeenCalled();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog', h)).not.toBeInTheDocument();
  });

  it('opens only the status message from the info-tip, not the disabled reason', async () => {
    const user = userEvent.setup();
    render(
      <ComplexSelector
        label="View options"
        value={[]}
        isDisabled
        disabledMessage="You need the Editor role"
        status={{type: 'error', message: 'Required'}}
        statusVariant="tooltip">
        {() => <button type="button">Apply</button>}
      </ComplexSelector>,
    );
    const reason = screen
      .getByText('You need the Editor role')
      .closest<HTMLElement>('[role="tooltip"]');
    expect(reason).not.toBeNull();
    const tip = screen.getByRole('button', {name: 'Error details'});

    await user.hover(tip);
    await user.tab();
    await user.tab();
    expect(tip).toHaveFocus();
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 300));
    });
    expect(reason).not.toHaveAttribute('popover-open');

    // The trigger still shows the reason.
    await user.hover(screen.getByRole('combobox', {name: 'View options'}));
    await waitFor(() => {
      expect(reason).toHaveAttribute('popover-open');
    });
  });

  it('keeps aria-disabled and the reason on the ghost toolbar trigger', async () => {
    const {container} = render(
      <ComplexSelector
        label="View options"
        value={[]}
        variant="ghost"
        startIcon="viewColumns"
        isDisabled
        disabledMessage="You need the Editor role"
        data-testid="view-options">
        {() => <button type="button">Apply</button>}
      </ComplexSelector>,
    );

    expect(container.querySelector('.astryx-complex-selector')).toHaveAttribute(
      'data-variant',
      'ghost',
    );
    const trigger = screen.getByRole('combobox', {name: 'View options'});
    expect(trigger).not.toBeDisabled();
    expect(trigger).toHaveAttribute('aria-disabled', 'true');

    const tooltip = screen.getByRole('tooltip', h);
    fireEvent.mouseEnter(screen.getByTestId('view-options'));
    await waitFor(() => {
      expect(tooltip).toHaveAttribute('popover-open');
    });
  });

  it('warns in development that disabledMessage has no effect with renderTrigger', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      render(
        <ComplexSelector
          label="Assign"
          value={null}
          isDisabled
          disabledMessage="You need the Editor role"
          renderTrigger={props => (
            <button type="button" {...props}>
              Assign
            </button>
          )}>
          {() => <button type="button">Apply</button>}
        </ComplexSelector>,
      );
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
      expect(
        warn.mock.calls.some(([message]) =>
          String(message).includes(
            '`disabledMessage` has no effect with `renderTrigger`',
          ),
        ),
      ).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });
});
