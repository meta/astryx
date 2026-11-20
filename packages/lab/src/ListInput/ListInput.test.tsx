// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListInput.test.tsx
 * @input Uses Vitest, Testing Library, and the controlled ListInput API
 * @output Behavioral coverage for list editing, pointer-stable adding,
 *   tokenized mutation motion, validation, focus, and reordering. Reordering
 *   goes through core List's reorder handle at each record's end, with keys
 *   here. The handle is the one element it adds to a record, and it comes
 *   with the owner's object. The a11y Chromium specs cover it in a real
 *   browser
 * @position Lab tests; validates ListInput.tsx
 *
 * SYNC: When ListInput.tsx behavior changes, update these tests.
 */

import {readFileSync} from 'node:fs';
import path from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {useMemo, useState} from 'react';
import userEvent from '@testing-library/user-event';
import {createReorderable} from '@astryxdesign/core';
import {
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {useAnnounce, useContainerReveal} from '@astryxdesign/core/hooks';
import {TextInput} from '@astryxdesign/core/TextInput';
import {
  ListInput,
  type ListInputColumn,
  type ListInputProps,
} from './ListInput';

type Guest = {
  id: string;
  name: string;
};

const guests: Guest[] = [
  {id: 'ada', name: 'Ada'},
  {id: 'grace', name: 'Grace'},
];

const createdGuest: Guest = {id: 'linus', name: 'Linus'};

const columns = [
  {
    key: 'name',
    header: 'Name',
    renderInput: ({
      item,
      label,
      isLabelHidden,
      status,
      statusVariant,
      isDisabled,
      isLoading,
      updateItem,
    }) => (
      <label>
        <span hidden={isLabelHidden}>{label}</span>
        <input
          aria-invalid={status?.type === 'error' || undefined}
          aria-label={label}
          data-label-hidden={String(isLabelHidden)}
          data-status-type={status?.type}
          data-status-message={status?.message}
          data-status-variant={statusVariant}
          disabled={isDisabled || isLoading}
          value={item.name}
          onChange={event =>
            updateItem({...item, name: event.currentTarget.value}, 'name')
          }
        />
      </label>
    ),
  },
] satisfies ListInputColumn<Guest>[];

const nativeStatusColumns = [
  {
    key: 'name',
    header: 'Name',
    renderInput: ({
      item,
      label,
      isLabelHidden,
      status,
      statusVariant,
      isDisabled,
      isLoading,
      updateItem,
    }) => (
      <TextInput
        label={label}
        isLabelHidden={isLabelHidden}
        value={item.name}
        status={status}
        statusVariant={statusVariant}
        isDisabled={isDisabled}
        isLoading={isLoading}
        onChange={name => updateItem({...item, name}, 'name')}
      />
    ),
  },
] satisfies ListInputColumn<Guest>[];

function renderListInput(overrides: Partial<ListInputProps<Guest>> = {}) {
  const props: ListInputProps<Guest> = {
    label: 'Guests',
    itemName: 'guest',
    value: guests,
    onChange: () => {},
    getItemKey: guest => guest.id,
    createItem: () => createdGuest,
    columns,
    ...overrides,
  };

  return render(<ListInput<Guest> {...props} />);
}

/** A reorderable object whose moves go to `onReorder` and nowhere else. */
function reorderableFor(
  onReorder: (move: {key: string | number; to: number}) => void = () => {},
) {
  return createReorderable({onReorder});
}

/**
 * A reorderable ListInput whose owner applies each move it is handed to its
 * value, as an app does.
 */
function OwnedList({
  onReorder,
  isReorderable,
  ...props
}: Partial<ListInputProps<Guest>> & {
  onReorder?: (move: {key: string | number; to: number}) => void;
  isReorderable?: (key: string | number) => boolean;
}) {
  const [value, setValue] = useState(props.value ?? guests);
  const reorderable = useMemo(
    () =>
      createReorderable({
        onReorder: move => {
          onReorder?.(move);
          setValue(current => {
            const moved = current.find(guest => guest.id === move.key);
            if (moved == null) {
              return current;
            }
            const rest = current.filter(guest => guest !== moved);
            return [...rest.slice(0, move.to), moved, ...rest.slice(move.to)];
          });
        },
        isReorderable,
      }),
    [onReorder, isReorderable],
  );
  return (
    <ListInput<Guest>
      label="Guests"
      itemName="guest"
      getItemKey={guest => guest.id}
      createItem={() => createdGuest}
      columns={columns}
      reorderable={reorderable}
      {...props}
      value={value}
      onChange={(nextValue, change) => {
        props.onChange?.(nextValue, change);
        setValue(nextValue);
      }}
    />
  );
}

const isNotAda = (key: string | number) => key !== 'ada';

const HINT =
  'Drag to move this item, or press Space or Enter, then the arrow keys to move it one place at a time. Press Escape when you are done.';

const shownNames = () =>
  screen
    .getAllByRole('textbox')
    .map(input => (input as HTMLInputElement).value);

function classTokens(element: Element | null): string[] {
  return element?.getAttribute('class')?.split(/\s+/).filter(Boolean) ?? [];
}

// The reveal is CSS-only, so jsdom can only prove the wiring: each element
// carries the classes the hook hands out for its role. The browser proves the
// pixels (Storybook).
function revealClasses() {
  const {result} = renderHook(() => useContainerReveal());
  const reveal = result.current;
  const tokensOf = (props: {className?: string}) =>
    props.className?.split(/\s+/).filter(Boolean) ?? [];
  const container = tokensOf(reveal.getContainerProps());
  const grip = tokensOf(
    reveal.getContentRevealProps({isLayoutPreserved: true}),
  );
  const containerInactive = tokensOf(
    reveal.getContainerProps({forceState: 'inactive'}),
  );
  const gripShown = tokensOf(
    reveal.getContentRevealProps({
      isLayoutPreserved: true,
      forceVisibility: 'shown',
    }),
  );
  return {
    container,
    grip,
    onlyInactive: containerInactive.filter(token => !container.includes(token)),
    onlyShown: gripShown.filter(token => !grip.includes(token)),
  };
}

const originalAnimateDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'animate',
);
const originalScrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollIntoView',
);

function createRect(top: number): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    right: 400,
    bottom: top + 40,
    left: 0,
    width: 400,
    height: 40,
    toJSON: () => {},
  };
}

function mockMutationAnimations(events: string[] = []) {
  const animate = vi.fn(function (
    this: HTMLElement,
    _keyframes: Keyframe[],
    _options?: number | KeyframeAnimationOptions,
  ) {
    events.push('animate');
    return {
      cancel: vi.fn(),
      finished: new Promise(() => {}),
    } as unknown as Animation;
  });
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value: animate,
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      if (this.dataset.listInputMotionKey == null) {
        return createRect(0);
      }
      const group = this.closest('[role="group"]');
      const motionElements = Array.from(
        group?.querySelectorAll<HTMLElement>('[data-list-input-motion-key]') ??
          [],
      ).filter(candidate => candidate.closest('[role="group"]') === group);
      return createRect(Math.max(0, motionElements.indexOf(this)) * 40);
    },
  );
  return animate;
}

afterEach(() => {
  vi.restoreAllMocks();
  // The shared live regions outlive each test, and a test that stubs
  // requestAnimationFrame can strand an announcement's frame. An empty
  // announcement clears what is still waiting, so it is not joined into the
  // next test's announcements (spec:AST-086 FR9).
  const announcer = renderHook(() => useAnnounce());
  announcer.result.current('');
  announcer.unmount();
  if (originalAnimateDescriptor == null) {
    Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  } else {
    Object.defineProperty(
      HTMLElement.prototype,
      'animate',
      originalAnimateDescriptor,
    );
  }
  if (originalScrollIntoViewDescriptor == null) {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  } else {
    Object.defineProperty(
      HTMLElement.prototype,
      'scrollIntoView',
      originalScrollIntoViewDescriptor,
    );
  }
});

describe('ListInput', () => {
  it('uses list semantics and shows field labels only on the first record', () => {
    renderListInput();

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader')).not.toBeInTheDocument();
    expect(screen.getByRole('list')).toBeInTheDocument();

    const inputs = screen.getAllByRole('textbox');
    expect(inputs[0]).toHaveAttribute('data-label-hidden', 'true');
    expect(inputs[0]).toHaveAccessibleName('Name');
    expect(inputs[1]).toHaveAttribute('data-label-hidden', 'true');
    expect(inputs[1]).toHaveAccessibleName('Name, guest 2 of 2');
    expect(inputs[0]).toHaveAttribute('data-status-variant', 'tooltip');
    const primaryLabel = document.querySelector(
      '[data-list-input-column-label="primary"]',
    );
    const responsiveLabel = document.querySelector(
      '[data-list-input-column-label="responsive"]',
    );
    expect(primaryLabel).toHaveTextContent('Name');
    expect(primaryLabel).toHaveAttribute('aria-hidden', 'true');
    expect(responsiveLabel).toHaveTextContent('Name');
    expect(responsiveLabel).toHaveAttribute('aria-hidden', 'true');
    expect(primaryLabel?.closest('[data-list-input-cell]')).toContainElement(
      inputs[0],
    );
    expect(responsiveLabel?.closest('[data-list-input-cell]')).toContainElement(
      inputs[1],
    );
  });

  it('never renders aria-required on the group, even when isRequired is set (#4958)', () => {
    // aria-required is not an allowed attribute on role="group" (axe
    // aria-allowed-attr, impact critical). The requirement is already
    // surfaced visibly through Field's Required indicator.
    renderListInput({isRequired: true});

    const group = screen.getByRole('group');
    expect(group).not.toHaveAttribute('aria-required');
  });

  it('renders a compact centered EmptyState and keeps Add available', () => {
    const {container} = renderListInput({value: []});

    const emptyState = container.querySelector<HTMLElement>(
      '.astryx-empty-state',
    );
    expect(emptyState).toBeInTheDocument();
    expect(emptyState).toHaveClass('astryx-empty-state');
    expect(emptyState).toHaveAttribute('data-variant', 'compact');
    expect(getComputedStyle(emptyState!).alignItems).toBe('center');
    expect(getComputedStyle(emptyState!).justifyContent).toBe('center');
    expect(getComputedStyle(emptyState!).textAlign).toBe('center');
    expect(
      screen.getByRole('heading', {name: 'No guests yet'}),
    ).toBeInTheDocument();
    expect(screen.getByText('Add a guest to get started.')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Add guest'})).toBeEnabled();
  });

  it('emits add and remove changes with the affected item and index', () => {
    const onChange = vi.fn();
    renderListInput({onChange});

    fireEvent.click(screen.getByRole('button', {name: 'Add guest'}));
    expect(onChange).toHaveBeenCalledWith([...guests, createdGuest], {
      type: 'add',
      item: createdGuest,
      index: 2,
    });

    onChange.mockClear();
    fireEvent.click(screen.getByRole('button', {name: 'Remove guest 1'}));
    expect(onChange).toHaveBeenCalledWith([guests[1]], {
      type: 'remove',
      item: guests[0],
      index: 0,
    });
  });

  it('keeps Add under the pointer in the nearest newly scrollable container', () => {
    function ScrollAnchoredList() {
      const [value, setValue] = useState(guests);
      return (
        <div data-outer-scroll="" style={{height: 240, overflowY: 'auto'}}>
          <div
            data-inner-scroll=""
            style={{
              height: 160,
              overflowY: 'auto',
              scrollBehavior: 'smooth',
            }}>
            <ListInput<Guest>
              label="Guests"
              itemName="guest"
              value={value}
              onChange={setValue}
              getItemKey={guest => guest.id}
              createItem={() => createdGuest}
              columns={columns}
            />
          </div>
        </div>
      );
    }

    const {container} = render(<ScrollAnchoredList />);
    const outerScroll = container.querySelector<HTMLElement>(
      '[data-outer-scroll]',
    )!;
    const innerScroll = container.querySelector<HTMLElement>(
      '[data-inner-scroll]',
    )!;
    Object.defineProperties(outerScroll, {
      clientHeight: {configurable: true, value: 240},
      scrollHeight: {configurable: true, value: 400},
    });
    Object.defineProperties(innerScroll, {
      clientHeight: {configurable: true, value: 160},
      scrollHeight: {
        configurable: true,
        get: () => (screen.getAllByRole('listitem').length >= 3 ? 180 : 160),
      },
    });
    let innerScrollTop = 0;
    Object.defineProperty(innerScroll, 'scrollTop', {
      configurable: true,
      get: () => innerScrollTop,
      set: (nextScrollTop: number) => {
        const maxScrollTop =
          screen.getAllByRole('listitem').length >= 3 ? 20 : 0;
        innerScrollTop = Math.max(0, Math.min(nextScrollTop, maxScrollTop));
      },
    });
    outerScroll.scrollTop = 10;
    const setScrollStyle = vi.spyOn(innerScroll.style, 'setProperty');

    const addButton = screen.getByRole('button', {name: 'Add guest'});
    const addAction = addButton.closest<HTMLElement>(
      '[data-list-input-motion-key="action:add"]',
    )!;
    let anchorFrame: FrameRequestCallback | undefined;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      anchorFrame = callback;
      return 1;
    });
    vi.spyOn(addAction, 'getBoundingClientRect').mockImplementation(() =>
      createRect(
        screen.getAllByRole('listitem').length * 40 -
          innerScroll.scrollTop -
          outerScroll.scrollTop,
      ),
    );
    const initialTop = addAction.getBoundingClientRect().top;

    fireEvent.click(addButton, {detail: 1});

    expect(innerScroll.scrollTop).toBe(20);
    expect(outerScroll.scrollTop).toBe(30);
    expect(setScrollStyle).toHaveBeenCalledWith(
      'scroll-behavior',
      'auto',
      'important',
    );
    expect(innerScroll.style.scrollBehavior).toBe('smooth');
    expect(addAction.getBoundingClientRect().top).toBe(initialTop);
    expect(screen.getByDisplayValue('Linus')).toHaveFocus();

    outerScroll.scrollTop = 25;
    expect(addAction.getBoundingClientRect().top).toBe(initialTop + 5);
    anchorFrame?.(0);
    expect(outerScroll.scrollTop).toBe(30);
    expect(addAction.getBoundingClientRect().top).toBe(initialTop);
  });

  it('anchors from pointer down before blur-driven validation changes layout', () => {
    function BlurGrowingList() {
      const [value, setValue] = useState([guests[0]]);
      const [isTouched, setIsTouched] = useState(false);
      const blurColumns = [
        {
          key: 'name',
          header: 'Name',
          renderInput: ({item, label, updateItem}) => (
            <input
              aria-label={label}
              value={item.name}
              onChange={event =>
                updateItem({...item, name: event.currentTarget.value}, 'name')
              }
              onBlur={() => setIsTouched(true)}
            />
          ),
        },
      ] satisfies ListInputColumn<Guest>[];
      return (
        <div data-blur-scroll="" style={{height: 100, overflowY: 'auto'}}>
          <ListInput<Guest>
            label="Guests"
            itemName="guest"
            value={value}
            onChange={setValue}
            getItemKey={guest => guest.id}
            createItem={() => createdGuest}
            columns={blurColumns}
            getItemStatus={guest =>
              isTouched && guest.id === 'ada'
                ? {type: 'error', message: 'Review this guest'}
                : undefined
            }
          />
        </div>
      );
    }

    const {container} = render(<BlurGrowingList />);
    const scrollRoot =
      container.querySelector<HTMLElement>('[data-blur-scroll]')!;
    Object.defineProperties(scrollRoot, {
      clientHeight: {configurable: true, value: 100},
      scrollHeight: {configurable: true, value: 400},
    });
    const addButton = screen.getByRole('button', {name: 'Add guest'});
    const addAction = addButton.closest<HTMLElement>(
      '[data-list-input-motion-key="action:add"]',
    )!;
    vi.spyOn(addAction, 'getBoundingClientRect').mockImplementation(() =>
      createRect(
        screen.getAllByRole('listitem').length * 40 +
          (screen.queryByText('Review this guest') == null ? 0 : 20) -
          scrollRoot.scrollTop,
      ),
    );
    const initialTop = addAction.getBoundingClientRect().top;
    const firstInput = screen.getByDisplayValue('Ada');
    firstInput.focus();

    fireEvent.pointerDown(addButton, {
      button: 0,
      isPrimary: true,
      pointerId: 21,
    });
    fireEvent.blur(firstInput);
    expect(screen.getByText('Review this guest')).toBeInTheDocument();
    expect(addAction.getBoundingClientRect().top).toBe(initialTop + 20);
    fireEvent.click(addButton, {detail: 1});

    expect(scrollRoot.scrollTop).toBe(60);
    expect(addAction.getBoundingClientRect().top).toBe(initialTop);
    expect(screen.getByDisplayValue('Linus')).toHaveFocus();
  });

  it('checks every clipping ancestor before preserving focused-field visibility', () => {
    function NestedClippingList() {
      const [value, setValue] = useState(guests);
      return (
        <div data-outer-clip="" style={{height: 80, overflowY: 'auto'}}>
          <div data-inner-clip="" style={{height: 160, overflowY: 'auto'}}>
            <ListInput<Guest>
              label="Guests"
              itemName="guest"
              value={value}
              onChange={setValue}
              getItemKey={guest => guest.id}
              createItem={() => createdGuest}
              columns={columns}
            />
          </div>
        </div>
      );
    }

    const {container} = render(<NestedClippingList />);
    const outerClip =
      container.querySelector<HTMLElement>('[data-outer-clip]')!;
    const innerClip =
      container.querySelector<HTMLElement>('[data-inner-clip]')!;
    Object.defineProperties(outerClip, {
      clientHeight: {configurable: true, value: 80},
      scrollHeight: {configurable: true, value: 400},
    });
    Object.defineProperties(innerClip, {
      clientHeight: {configurable: true, value: 160},
      scrollHeight: {configurable: true, value: 400},
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        return this instanceof HTMLInputElement && this.value === 'Linus'
          ? createRect(100)
          : createRect(0);
      },
    );
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    fireEvent.click(screen.getByRole('button', {name: 'Add guest'}), {
      detail: 1,
    });

    expect(scrollIntoView).toHaveBeenCalledWith({
      block: 'nearest',
      inline: 'nearest',
    });
  });

  it('animates live add and removal reflow after the controlled change', async () => {
    const events: string[] = [];
    const animate = mockMutationAnimations(events);

    function ControlledList() {
      const [value, setValue] = useState(guests);
      return (
        <ListInput<Guest>
          label="Guests"
          itemName="guest"
          value={value}
          onChange={(nextValue, change) => {
            events.push(`change:${change.type}`);
            setValue(nextValue);
          }}
          getItemKey={guest => guest.id}
          createItem={() => createdGuest}
          columns={columns}
        />
      );
    }

    render(<ControlledList />);
    fireEvent.click(screen.getByRole('button', {name: 'Add guest'}));

    expect(events[0]).toBe('change:add');
    expect(screen.getByDisplayValue('Linus')).toHaveFocus();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    const addedRow = screen
      .getByDisplayValue('Linus')
      .closest<HTMLElement>('li')!;
    const addedAnimationIndex = animate.mock.contexts.indexOf(addedRow);
    expect(addedAnimationIndex).toBeGreaterThanOrEqual(0);
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.calls[addedAnimationIndex]).toEqual([
      [{transform: 'translateY(0.5rem)'}, {transform: 'translateY(0)'}],
      {
        duration: 230,
        easing: 'cubic-bezier(0.24, 1, 0.4, 1)',
      },
    ]);
    await waitFor(() => {
      expect(
        Array.from(document.querySelectorAll('[aria-live="polite"]')).some(
          node => node.textContent === 'Added guest 3.',
        ),
      ).toBe(true);
    });

    const removeEventStart = events.length;
    const animationCountBeforeRemove = animate.mock.calls.length;
    fireEvent.click(screen.getByRole('button', {name: 'Remove guest 1'}));

    expect(events[removeEventStart]).toBe('change:remove');
    expect(animate.mock.calls.length).toBeGreaterThan(
      animationCountBeforeRemove,
    );
    expect(screen.queryByDisplayValue('Ada')).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Remove guest 1'})).toHaveFocus();
    expect(
      animate.mock.calls
        .slice(animationCountBeforeRemove)
        .some(([keyframes], index) => {
          const context = animate.mock.contexts[
            animationCountBeforeRemove + index
          ] as HTMLElement;
          return (
            context.querySelector('input')?.value === 'Grace' &&
            (keyframes as Keyframe[])[0]?.transform === 'translate(0px, 40px)'
          );
        }),
    ).toBe(true);
    await waitFor(() => {
      expect(
        Array.from(document.querySelectorAll('[aria-live="polite"]')).some(
          node => node.textContent === 'Removed guest 1.',
        ),
      ).toBe(true);
    });
  });

  it('uses instant add and remove changes when reduced motion is requested', async () => {
    const animate = mockMutationAnimations();
    vi.spyOn(window, 'matchMedia').mockImplementation(
      query =>
        ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }) as MediaQueryList,
    );

    function ReducedMotionList() {
      const [value, setValue] = useState([guests[0]]);
      return (
        <ListInput<Guest>
          label="Guests"
          itemName="guest"
          value={value}
          onChange={setValue}
          getItemKey={guest => guest.id}
          createItem={() => createdGuest}
          columns={columns}
        />
      );
    }

    render(<ReducedMotionList />);
    fireEvent.click(screen.getByRole('button', {name: 'Remove guest 1'}));

    expect(animate).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue('Ada')).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Add guest'})).toHaveFocus();
    // The removal and the empty state that appears join in one frame (FR9).
    await waitFor(() => {
      expect(
        Array.from(document.querySelectorAll('[aria-live="polite"]')).some(
          node =>
            node.textContent ===
            'Removed guest 1. No guests yet Add a guest to get started.',
        ),
      ).toBe(true);
    });

    fireEvent.click(screen.getByRole('button', {name: 'Add guest'}));
    expect(animate).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Linus')).toHaveFocus();
  });

  it('renders list/item messages and presents field messages in a tooltip', () => {
    renderListInput({
      columns: nativeStatusColumns,
      status: {type: 'error', message: 'Add at least three guests'},
      getItemStatus: guest =>
        guest.id === 'ada'
          ? {type: 'error', message: 'This guest is duplicated'}
          : undefined,
      getFieldStatus: (guest, columnKey) =>
        guest.id === 'ada' && columnKey === 'name'
          ? {type: 'error', message: 'Enter a different name'}
          : undefined,
    });

    expect(screen.getByText('Add at least three guests')).toBeInTheDocument();
    expect(screen.getByText('This guest is duplicated')).toBeInTheDocument();
    const firstInput = screen.getAllByRole('textbox')[0];
    expect(firstInput).toHaveAttribute('aria-invalid', 'true');
    const tooltip = screen
      .getAllByRole('tooltip', {hidden: true})
      .find(node => node.textContent === 'Enter a different name');
    expect(tooltip).toBeDefined();
    expect(tooltip).toHaveTextContent('Enter a different name');
    expect(firstInput.getAttribute('aria-describedby')).toContain(tooltip!.id);
    const fieldCell = firstInput.closest('[data-list-input-cell]');
    expect(fieldCell?.querySelector('.astryx-field-status')).toBeNull();
    expect(
      within(fieldCell as HTMLElement).getByRole('button', {
        name: /error details/i,
      }),
    ).toBeInTheDocument();
    expect(
      firstInput.closest('[role="group"][aria-invalid="true"]'),
    ).toBeNull();

    const itemStatus = screen
      .getByText('This guest is duplicated')
      .closest('[data-list-input-item-status]');
    const itemRow = document.querySelector('[data-list-input-row="ada"]');
    expect(itemStatus).toBeDefined();
    expect(itemStatus?.parentElement).toBe(itemRow);
    expect(
      screen.getAllByRole('listitem')[0].getAttribute('aria-describedby'),
    ).toContain(itemStatus?.id);
  });

  it('fills the fields track with Add and omits reorder handles by default', () => {
    const {container} = renderListInput({columns: nativeStatusColumns});

    const addContent = container.querySelector('[data-list-input-add-content]');
    const addButton = screen.getByRole('button', {name: 'Add guest'});
    const removeButton = screen.getByRole('button', {
      name: 'Remove guest 1',
    });
    const textInput = container.querySelector('.astryx-text-input');
    expect(addContent).toContainElement(addButton);
    expect(addButton).toHaveAttribute('data-size', 'md');
    expect(removeButton).toHaveAttribute('data-size', 'md');
    expect(textInput).toHaveAttribute('data-size', 'md');
    expect(
      screen.queryByRole('button', {name: 'Reorder guest 1'}),
    ).not.toBeInTheDocument();
  });

  it("ends each record with core List's reorder handle, revealed on hover or focus", () => {
    // A fine pointer (jsdom models a mouse): hover reveals the handle.
    expect(window.matchMedia('(pointer: coarse)').matches).toBe(false);
    const reveal = revealClasses();
    const {container} = renderListInput({reorderable: reorderableFor()});
    const row = container.querySelector<HTMLElement>('[data-list-input-row]');
    const handle = screen.getByRole('button', {name: 'Reorder guest 1'});
    const remove = screen.getByRole('button', {name: 'Remove guest 1'});

    // The handle is the record's last control, after Remove in Remove's
    // cell, as UIKit's reorder control ends an editing row.
    expect(within(row!).getAllByRole('button')).toEqual([remove, handle]);
    expect(handle).toHaveAttribute('data-astryx-list-reorder');
    expect(row!.querySelector('[data-list-input-cell]')?.contains(handle)).toBe(
      false,
    );

    // The row is the reveal container; the controls' cell fades with opacity
    // alone, so at rest the handle stays mounted, named, and focusable.
    const handleCell = [...row!.children].find(child => child.contains(handle));
    expect(classTokens(row)).toEqual(expect.arrayContaining(reveal.container));
    expect(classTokens(handleCell ?? null)).toEqual(
      expect.arrayContaining(reveal.grip),
    );
    expect(handle).toBeEnabled();
    expect(handle).not.toHaveAttribute('tabindex', '-1');
  });

  it('reveals Remove on hover or focus, with or without reordering', () => {
    const reveal = revealClasses();
    for (const reorderable of [undefined, reorderableFor()]) {
      const {container, unmount} = renderListInput({reorderable});
      const rows = container.querySelectorAll<HTMLElement>(
        '[data-list-input-row]',
      );
      rows.forEach((row, index) => {
        const remove = within(row).getByRole('button', {
          name: `Remove guest ${index + 1}`,
        });
        // The row's direct child holding Remove is its control cell. It fades
        // with opacity alone, so the button keeps its column, stays mounted,
        // and stays in the tab order.
        const removeCell = [...row.children].find(child =>
          child.contains(remove),
        );
        expect(classTokens(row)).toEqual(
          expect.arrayContaining(reveal.container),
        );
        expect(classTokens(removeCell ?? null)).toEqual(
          expect.arrayContaining(reveal.grip),
        );
        expect(remove).toBeEnabled();
        expect(remove).not.toHaveAttribute('tabindex', '-1');
      });
      unmount();
    }
  });

  it('focuses the first field of an added record, not its grip', () => {
    render(<OwnedList />);
    fireEvent.click(screen.getByRole('button', {name: 'Add guest'}));

    expect(screen.getByDisplayValue('Linus')).toHaveFocus();
  });

  it('supports consumer-owned validation that appears after blur', () => {
    function BlurValidatedList() {
      const [value, setValue] = useState<Guest[]>([guests[0]]);
      const [touchedItems, setTouchedItems] = useState<ReadonlySet<string>>(
        () => new Set(),
      );
      const blurColumns = [
        {
          key: 'name',
          header: 'Name',
          renderInput: ({
            item,
            label,
            isLabelHidden,
            status,
            statusVariant,
            updateItem,
          }) => (
            <TextInput
              label={label}
              isLabelHidden={isLabelHidden}
              value={item.name}
              status={status}
              statusVariant={statusVariant}
              onChange={name => updateItem({...item, name}, 'name')}
              onBlur={() =>
                setTouchedItems(current => {
                  const next = new Set(current);
                  next.add(item.id);
                  return next;
                })
              }
            />
          ),
        },
      ] satisfies ListInputColumn<Guest>[];

      return (
        <ListInput<Guest>
          label="Guests"
          itemName="guest"
          value={value}
          onChange={nextValue => setValue(nextValue)}
          getItemKey={guest => guest.id}
          createItem={() => ({id: 'blank', name: ''})}
          columns={blurColumns}
          getFieldStatus={(guest, columnKey) =>
            touchedItems.has(guest.id) &&
            columnKey === 'name' &&
            guest.name.trim() === ''
              ? {type: 'error', message: 'Enter a name'}
              : undefined
          }
        />
      );
    }

    render(<BlurValidatedList />);
    fireEvent.click(screen.getByRole('button', {name: 'Add guest'}));

    const addedInput = screen.getByRole('textbox', {
      name: 'Name, guest 2 of 2',
    });
    expect(addedInput).toHaveFocus();
    expect(addedInput).not.toHaveAttribute('aria-invalid');
    expect(
      screen
        .queryAllByRole('tooltip', {hidden: true})
        .some(node => node.textContent === 'Enter a name'),
    ).toBe(false);

    fireEvent.blur(addedInput);

    expect(
      screen.getByRole('textbox', {name: 'Name, guest 2 of 2'}),
    ).toHaveAttribute('aria-invalid', 'true');
    expect(
      screen
        .getAllByRole('tooltip', {hidden: true})
        .some(node => node.textContent === 'Enter a name'),
    ).toBe(true);
  });

  it('disables Add at maxItems while keeping removal available', () => {
    const onChange = vi.fn();

    renderListInput({maxItems: 2, onChange});

    expect(screen.getByRole('button', {name: 'Add guest'})).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    const remove = screen.getByRole('button', {name: 'Remove guest 1'});
    expect(remove).toBeEnabled();

    fireEvent.click(remove);
    expect(onChange).toHaveBeenCalledWith([guests[1]], {
      type: 'remove',
      item: guests[0],
      index: 0,
    });
  });

  it("moves a record in reorder mode with the arrow keys, through the owner's onReorder", async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();
    const onChange = vi.fn();
    render(<OwnedList onReorder={onReorder} onChange={onChange} />);
    const handle = screen.getByRole('button', {name: 'Reorder guest 1'});
    expect(handle).toHaveAttribute('type', 'button');
    expect(handle).toHaveAccessibleDescription(HINT);
    expect(
      screen
        .queryAllByRole('tooltip', {hidden: true})
        .some(tooltip => tooltip.textContent === 'Reorder guest 1'),
    ).toBe(false);

    // Enter turns on reorder mode. Each arrow then moves the record a place.
    // The move is reported in the value's terms: its key and its new index.
    handle.focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{ArrowUp}');
    expect(onReorder).not.toHaveBeenCalled();
    await user.keyboard('{ArrowDown}');
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith({key: 'ada', to: 1});
    expect(shownNames()).toEqual(['Grace', 'Ada']);
    // A move is the owner's, never a ListInput change.
    expect(onChange).not.toHaveBeenCalled();
    expect(handle).toHaveFocus();
    expect(handle).toHaveAccessibleName('Reorder guest 2');
  });

  it('keeps reorder mode through a move that renames the record, and announces it by its new name', async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();
    render(<OwnedList onReorder={onReorder} />);
    const handle = screen.getByRole('button', {name: 'Reorder guest 1'});

    handle.focus();
    await user.keyboard('{Enter}{ArrowDown}');
    // Records are named by their place, so the move renames this one.
    expect(handle).toHaveAccessibleName('Reorder guest 2');
    expect(handle).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() =>
      expect(document.body).toHaveTextContent(
        'guest 2, position 2 of 2, after guest 1, at the end',
      ),
    );
    // Still in the mode: the next arrow moves it back.
    await user.keyboard('{ArrowUp}');
    expect(onReorder).toHaveBeenCalledTimes(2);
    expect(onReorder).toHaveBeenLastCalledWith({key: 'ada', to: 0});
    expect(handle).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() =>
      expect(document.body).toHaveTextContent(
        'guest 1, position 1 of 2, at the top, before guest 2',
      ),
    );
  });

  it('adds one element to each record for reordering: the handle', () => {
    const plain = renderListInput();
    const plainCount = plain.container
      .querySelector('[data-list-input-row]')!
      .querySelectorAll('*').length;
    plain.unmount();
    const {container} = renderListInput({reorderable: reorderableFor()});
    const row = container.querySelector('[data-list-input-row]');
    expect(row).toContainElement(
      screen.getByRole('button', {name: 'Reorder guest 1'}),
    );
    expect(row!.querySelectorAll('*').length - plainCount).toBe(1);
  });

  it('loads no reorder code without reorderable: the handle comes with the object', () => {
    const source = readFileSync(
      path.join(import.meta.dirname, 'ListInput.tsx'),
      'utf8',
    );
    const names =
      /import\s*\{([^}]*)\}\s*from\s*'@astryxdesign\/core\/internal\/reorder';/
        .exec(source)?.[1]
        .split(',')
        .map(name => name.trim())
        .filter(name => name !== '');
    expect(names?.sort()).toEqual(['ListReorderScope', 'useListReorderScope']);
    expect(source).not.toMatch(/ListReorderHandle/);
  });

  it('ends reorder mode with Escape, keeping the moves', async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();
    render(<OwnedList onReorder={onReorder} />);
    const handle = screen.getByRole('button', {name: 'Reorder guest 1'});

    handle.focus();
    await user.keyboard('{Enter}{ArrowDown}{Escape}');
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(shownNames()).toEqual(['Grace', 'Ada']);
    // Out of the mode, an arrow moves nothing.
    await user.keyboard('{ArrowUp}');
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(handle).toHaveFocus();
  });

  it("gives no handle to a record the owner's isReorderable rejects, and moves no record past it at either end", async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();
    render(<OwnedList onReorder={onReorder} isReorderable={isNotAda} />);
    expect(screen.queryByRole('button', {name: 'Reorder guest 1'})).toBeNull();
    const handle = screen.getByRole('button', {name: 'Reorder guest 2'});
    handle.focus();
    await user.keyboard('{Enter}{ArrowUp}{Escape}');
    expect(onReorder).not.toHaveBeenCalled();
    expect(shownNames()).toEqual(['Ada', 'Grace']);
  });

  it('locks every field and mutation control when isDisabled is set', () => {
    const onChange = vi.fn();
    const onReorder = vi.fn();
    renderListInput({
      isDisabled: true,
      reorderable: reorderableFor(onReorder),
      onChange,
    });

    const group = screen.getByRole('group');
    expect(group).toHaveAttribute('aria-disabled', 'true');
    expect(group).not.toHaveAttribute('aria-busy');

    for (const field of screen.getAllByRole('textbox')) {
      expect(field).toBeDisabled();
    }
    expect(screen.getByRole('button', {name: /add guest/i})).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    // The handle stays focusable but moves nothing (spec:AST-085 FR1, FR2).
    const handle = screen.getByRole('button', {name: 'Reorder guest 1'});
    expect(handle).toHaveAttribute('aria-disabled', 'true');
    expect(handle).not.toHaveAttribute('disabled');
    handle.focus();
    fireEvent.keyDown(handle, {key: 'ArrowDown'});
    fireEvent.keyDown(handle, {key: ' '});
    fireEvent.keyDown(handle, {key: 'ArrowDown'});
    expect(handle).toHaveFocus();
    // Remove carries a tooltip, so it is disabled via aria and stays focusable
    // rather than dropping out of the tab order with its explanation.
    expect(
      screen.getByRole('button', {name: 'Remove guest 1'}),
    ).toHaveAttribute('aria-disabled', 'true');

    // The values stay readable — a disabled list still communicates content.
    expect(screen.getAllByRole('textbox')[0]).toHaveValue('Ada');
    expect(onChange).not.toHaveBeenCalled();
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('marks the list busy and locks the same controls when isLoading is set', () => {
    renderListInput({isLoading: true, reorderable: reorderableFor()});

    const group = screen.getByRole('group');
    expect(group).toHaveAttribute('aria-busy', 'true');
    // Loading is not disabled: the values may still change, so the group is
    // never reported as disabled to assistive technology.
    expect(group).not.toHaveAttribute('aria-disabled');

    for (const field of screen.getAllByRole('textbox')) {
      expect(field).toBeDisabled();
    }
    // The add button receives isLoading directly (unlike remove/reorder
    // below, which map ListInput's own loading state onto their isDisabled
    // prop), so it stays focusable while busy per Button's "Disabled vs
    // Busy" contract: aria-disabled, not native disabled, so a keyboard
    // user isn't dropped from the list mid-load.
    const addButton = screen.getByRole('button', {name: /add guest/i});
    expect(addButton).not.toBeDisabled();
    expect(addButton).toHaveAttribute('aria-disabled', 'true');
    expect(addButton).toHaveAttribute('aria-busy', 'true');
    expect(
      screen.getByRole('button', {name: 'Reorder guest 1'}),
    ).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByRole('button', {name: 'Remove guest 1'}),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('abandons reorder mode when the list becomes busy', async () => {
    const user = userEvent.setup();
    const onReorder = vi.fn();
    const reorderable = reorderableFor(onReorder);
    const props: ListInputProps<Guest> = {
      label: 'Guests',
      itemName: 'guest',
      value: guests,
      onChange: () => {},
      getItemKey: guest => guest.id,
      createItem: () => createdGuest,
      columns,
      reorderable,
    };
    const {rerender} = render(<ListInput<Guest> {...props} />);

    const handle = screen.getByRole('button', {name: 'Reorder guest 1'});
    handle.focus();
    await user.keyboard('{Enter}');
    rerender(<ListInput<Guest> {...props} isLoading />);

    // The handle keeps focus but is inert now: no key moves the record, so
    // no order change escapes (spec:AST-085 FR2, FR4).
    expect(handle).toHaveFocus();
    expect(handle).toHaveAttribute('aria-disabled', 'true');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('describes warning and success list statuses from the group', () => {
    const {rerender} = renderListInput({
      status: {type: 'warning', message: 'Two guests share a name.'},
    });

    const describedBy = screen
      .getByRole('group')
      .getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      'Two guests share a name.',
    );

    rerender(
      <ListInput<Guest>
        label="Guests"
        itemName="guest"
        value={guests}
        onChange={() => {}}
        getItemKey={guest => guest.id}
        createItem={() => createdGuest}
        columns={columns}
        status={{type: 'success', message: 'Every guest is confirmed.'}}
      />,
    );
    expect(screen.getByText('Every guest is confirmed.')).toBeInTheDocument();
  });

  it('associates list status with the group and item status with its row', () => {
    renderListInput({
      status: {type: 'error', message: 'Add at least three guests.'},
      getItemStatus: guest =>
        guest.id === 'grace'
          ? {type: 'error', message: 'Grace is already invited.'}
          : undefined,
    });

    const listDescribedBy = screen
      .getByRole('group')
      .getAttribute('aria-describedby');
    expect(document.getElementById(listDescribedBy!)).toHaveTextContent(
      'Add at least three guests.',
    );

    // Row-scoped status belongs to the row, not the list, so a reader on the
    // second record does not inherit the first record's message.
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).not.toHaveAttribute('aria-invalid');
    expect(rows[1]).toHaveAttribute('aria-invalid', 'true');
    const rowDescribedBy = rows[1].getAttribute('aria-describedby');
    expect(document.getElementById(rowDescribedBy!)).toHaveTextContent(
      'Grace is already invited.',
    );
  });

  it('moves focus to the next record after a removal, and to Add when the list empties', async () => {
    function ControlledList() {
      const [value, setValue] = useState(guests);
      return (
        <ListInput<Guest>
          label="Guests"
          itemName="guest"
          value={value}
          onChange={setValue}
          getItemKey={guest => guest.id}
          createItem={() => createdGuest}
          columns={columns}
        />
      );
    }
    render(<ControlledList />);

    // Removing the first of two lands on the record that took its place, so a
    // keyboard user can delete consecutively without re-tabbing.
    fireEvent.click(screen.getByRole('button', {name: 'Remove guest 1'}));
    await waitFor(() => {
      expect(
        screen.getByRole('button', {name: 'Remove guest 1'}),
      ).toHaveFocus();
    });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);

    // Removing the last record leaves nothing to focus, so focus falls back to Add.
    fireEvent.click(screen.getByRole('button', {name: 'Remove guest 1'}));
    await waitFor(() => {
      expect(screen.getByRole('button', {name: /add guest/i})).toHaveFocus();
    });
  });

  it('warns in development when getItemKey returns a duplicate key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderListInput({
      value: [guests[0], {...guests[1], id: guests[0].id}],
    });

    expect(warn.mock.calls.flat().join(' ')).toContain(
      'ListInput: getItemKey returned duplicate key',
    );
  });
});
