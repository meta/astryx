// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListInput.test.tsx
 * @input Uses Vitest, Testing Library, and the controlled ListInput API
 * @output Behavioral coverage for list editing, pointer-stable adding, tokenized mutation motion, validation, focus, the hover-revealed reorder grip that hangs beside the first field, and free-floating stationary-list reordering
 * @position Lab tests; validates ListInput.tsx
 *
 * SYNC: When ListInput.tsx behavior changes, update these tests.
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {useState} from 'react';
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
    await waitFor(() => {
      expect(
        Array.from(document.querySelectorAll('[aria-live="polite"]')).some(
          node => node.textContent === 'Removed guest 1.',
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

  it('hangs the grip beside the first field and reveals it on hover or focus', () => {
    const reveal = revealClasses();
    const {container} = renderListInput({isReorderable: true});
    const row = container.querySelector<HTMLElement>('[data-list-input-row]');
    const handle = screen.getByRole('button', {name: 'Reorder guest 1'});
    const remove = screen.getByRole('button', {name: 'Remove guest 1'});
    const [firstField] = within(row!).getAllByRole('textbox');

    // The grip is the record's first control in reading and tab order. It sits
    // in the first field's cell but hangs in the inline-start gutter, out of the
    // flow, so the fields keep their columns.
    expect(within(row!).getAllByRole('button')).toEqual([handle, remove]);
    expect(row!.querySelector('[data-list-input-cell="0"]')).toContainElement(
      handle,
    );
    expect(
      handle.compareDocumentPosition(firstField) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // The row is the reveal container; the grip fades with opacity alone, so
    // at rest it stays mounted, named, and focusable.
    expect(reveal.container.length).toBeGreaterThan(0);
    expect(classTokens(row)).toEqual(expect.arrayContaining(reveal.container));
    expect(classTokens(handle.parentElement)).toEqual(
      expect.arrayContaining(reveal.grip),
    );
    expect(handle).toBeEnabled();
    expect(handle).not.toHaveAttribute('tabindex', '-1');
  });

  it('reveals Remove on hover or focus, with or without reordering', () => {
    const reveal = revealClasses();
    for (const isReorderable of [false, true]) {
      const {container, unmount} = renderListInput({isReorderable});
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

  it('keeps the moving grip shown and quiets other rows during a pointer drag', () => {
    const reveal = revealClasses();
    expect(reveal.onlyShown.length).toBeGreaterThan(0);
    expect(reveal.onlyInactive.length).toBeGreaterThan(0);
    const {container} = renderListInput({isReorderable: true});
    const rows = container.querySelectorAll<HTMLElement>(
      '[data-list-input-row]',
    );
    const handle = screen.getByRole('button', {name: 'Reorder guest 1'});
    const hasAll = (element: Element | null, tokens: string[]) =>
      tokens.every(token => classTokens(element).includes(token));
    const hasAny = (element: Element | null, tokens: string[]) =>
      tokens.some(token => classTokens(element).includes(token));

    fireEvent.pointerDown(handle, {
      button: 0,
      pointerId: 4,
      clientX: 10,
      clientY: 10,
    });

    expect(hasAll(handle.parentElement, reveal.onlyShown)).toBe(true);
    expect(hasAny(rows[0], reveal.onlyInactive)).toBe(false);
    expect(hasAll(rows[1], reveal.onlyInactive)).toBe(true);
    // The duplicate under the pointer shows its grip too.
    const previewGrip = document.querySelector(
      '[data-list-input-drag-preview] [data-list-input-cell="0"] button',
    );
    expect(hasAll(previewGrip?.parentElement ?? null, reveal.onlyShown)).toBe(
      true,
    );

    fireEvent.pointerUp(handle, {pointerId: 4, clientX: 10, clientY: 10});

    expect(hasAny(handle.parentElement, reveal.onlyShown)).toBe(false);
    expect(hasAny(rows[1], reveal.onlyInactive)).toBe(false);
  });

  it('keeps a lifted grip shown without quieting rows during keyboard reorder', () => {
    const reveal = revealClasses();
    const {container} = renderListInput({isReorderable: true});
    const handle = screen.getByRole('button', {name: 'Reorder guest 1'});
    const otherRow = container.querySelectorAll('[data-list-input-row]')[1];

    handle.focus();
    fireEvent.keyDown(handle, {key: ' ', code: 'Space'});
    expect(classTokens(handle.parentElement)).toEqual(
      expect.arrayContaining(reveal.onlyShown),
    );
    expect(
      classTokens(otherRow).some(token => reveal.onlyInactive.includes(token)),
    ).toBe(false);

    fireEvent.keyDown(handle, {key: 'Escape'});
    expect(
      classTokens(handle.parentElement).some(token =>
        reveal.onlyShown.includes(token),
      ),
    ).toBe(false);
  });

  it('focuses the first field of an added record, not its grip', () => {
    function ReorderableList() {
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
          isReorderable
        />
      );
    }

    render(<ReorderableList />);
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

    expect(screen.getByRole('button', {name: 'Add guest'})).toBeDisabled();
    const remove = screen.getByRole('button', {name: 'Remove guest 1'});
    expect(remove).toBeEnabled();

    fireEvent.click(remove);
    expect(onChange).toHaveBeenCalledWith([guests[1]], {
      type: 'remove',
      item: guests[0],
      index: 0,
    });
  });

  it('moves a focused handle with arrow keys without showing a tooltip', () => {
    const onChange = vi.fn();

    function ArrowReorderList() {
      const [value, setValue] = useState(guests);
      return (
        <ListInput<Guest>
          label="Guests"
          itemName="guest"
          value={value}
          onChange={(nextValue, change) => {
            onChange(nextValue, change);
            setValue(nextValue);
          }}
          getItemKey={guest => guest.id}
          createItem={() => createdGuest}
          columns={columns}
          isReorderable
        />
      );
    }

    render(<ArrowReorderList />);
    const handle = screen.getByRole('button', {name: 'Reorder guest 1'});
    expect(handle).toHaveAttribute('type', 'button');
    expect(
      screen
        .queryAllByRole('tooltip', {hidden: true})
        .some(tooltip => tooltip.textContent === 'Reorder guest 1'),
    ).toBe(false);
    expect(handle).toHaveAccessibleDescription(
      'Use Arrow Up or Arrow Down to move this item one position. Press Space or Enter to pick it up for extended keyboard reordering.',
    );

    handle.focus();
    fireEvent.keyDown(handle, {key: 'ArrowDown', altKey: true});
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.keyDown(handle, {key: 'ArrowUp'});
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.keyDown(handle, {key: 'ArrowDown'});
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([guests[1], guests[0]], {
      type: 'reorder',
      item: guests[0],
      fromIndex: 0,
      toIndex: 1,
    });
    expect(
      screen
        .getAllByRole('textbox')
        .map(input => (input as HTMLInputElement).value),
    ).toEqual(['Grace', 'Ada']);
    expect(handle).toHaveFocus();
    expect(handle).toHaveAccessibleName('Reorder guest 2');
    expect(
      document.querySelector('[data-list-input-reorder-source]'),
    ).not.toBeInTheDocument();
  });

  it('commits a keyboard reorder with change metadata', () => {
    const onChange = vi.fn();
    renderListInput({isReorderable: true, onChange});
    const handle = screen.getByRole('button', {name: 'Reorder guest 1'});
    expect(handle.querySelectorAll('circle')).toHaveLength(6);

    handle.focus();
    fireEvent.keyDown(handle, {key: ' ', code: 'Space'});
    let source = document.querySelector('[data-list-input-reorder-source]');
    expect(source?.closest('li')).toHaveAttribute('aria-posinset', '1');
    expect(source?.querySelector('input')).toHaveValue('Ada');

    fireEvent.keyDown(handle, {key: 'ArrowDown'});
    source = document.querySelector('[data-list-input-reorder-source]');
    expect(source?.closest('li')).toHaveAttribute('aria-posinset', '2');
    expect(source?.querySelector('input')).toHaveValue('Ada');

    fireEvent.keyDown(handle, {key: 'Enter'});

    expect(onChange).toHaveBeenCalledWith([guests[1], guests[0]], {
      type: 'reorder',
      item: guests[0],
      fromIndex: 0,
      toIndex: 1,
    });
    expect(
      document.querySelector('[data-list-input-reorder-source]'),
    ).not.toBeInTheDocument();
  });

  it('keeps pointer order stationary, follows both pointer axes, and commits once', () => {
    const onChange = vi.fn();
    const {container} = renderListInput({
      isReorderable: true,
      onChange,
      value: [...guests, createdGuest],
    });
    const rows = container.querySelectorAll<HTMLElement>(
      '[data-list-input-row]',
    );
    vi.spyOn(rows[0], 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 400,
      bottom: 40,
      left: 0,
      width: 400,
      height: 40,
      toJSON: () => {},
    });
    vi.spyOn(rows[1], 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 40,
      top: 40,
      right: 400,
      bottom: 80,
      left: 0,
      width: 400,
      height: 40,
      toJSON: () => {},
    });
    vi.spyOn(rows[2], 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 80,
      top: 80,
      right: 400,
      bottom: 120,
      left: 0,
      width: 400,
      height: 40,
      toJSON: () => {},
    });
    const remove = screen.getByRole('button', {name: 'Remove guest 2'});
    const handle = screen.getByRole('button', {name: 'Reorder guest 2'});
    expect(within(rows[1]).getAllByRole('button')).toEqual([handle, remove]);

    fireEvent.pointerDown(handle, {
      button: 0,
      pointerId: 7,
      clientX: 300,
      clientY: 50,
    });

    const source = container.querySelector<HTMLElement>(
      '[data-list-input-reorder-source]',
    );
    const preview = document.querySelector<HTMLElement>(
      '[data-list-input-drag-preview]',
    );
    const previewLayer = preview?.closest<HTMLElement>('[popover="manual"]');
    expect(source).toBe(rows[1]);
    expect(getComputedStyle(source!).opacity).toBe('0.5');
    expect(container).toContainElement(preview);
    expect(preview).toBeInTheDocument();
    expect(previewLayer).toBeInTheDocument();
    expect(getComputedStyle(previewLayer!).opacity).toBe('0.5');
    expect(preview).toHaveAttribute('aria-hidden', 'true');
    expect(preview?.querySelector('input')).toHaveValue('Grace');
    expect(previewLayer!.style.getPropertyValue('--x-transform')).toBe(
      'translate3d(0px, 40px, 0)',
    );
    expect(
      container.querySelector('[data-list-input-drop-target]'),
    ).not.toBeInTheDocument();

    fireEvent.pointerMove(handle, {pointerId: 7, clientX: 345, clientY: 5});
    expect(previewLayer!.style.getPropertyValue('--x-transform')).toBe(
      'translate3d(45px, -5px, 0)',
    );
    expect([
      ...container.querySelectorAll<HTMLElement>('[data-list-input-row]'),
    ]).toEqual([...rows]);
    expect(
      screen
        .getAllByRole('textbox')
        .map(input => (input as HTMLInputElement).value),
    ).toEqual(['Ada', 'Grace', 'Linus']);
    expect(onChange).not.toHaveBeenCalled();
    expect(rows[0].closest('li')).toHaveAttribute(
      'data-list-input-drop-target',
      'before',
    );

    fireEvent.pointerMove(handle, {pointerId: 7, clientX: 245, clientY: 115});
    expect(previewLayer!.style.getPropertyValue('--x-transform')).toBe(
      'translate3d(-55px, 105px, 0)',
    );
    expect(rows[0].closest('li')).not.toHaveAttribute(
      'data-list-input-drop-target',
    );
    expect(rows[2].closest('li')).toHaveAttribute(
      'data-list-input-drop-target',
      'after',
    );
    expect([
      ...container.querySelectorAll<HTMLElement>('[data-list-input-row]'),
    ]).toEqual([...rows]);
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.pointerUp(handle, {pointerId: 7, clientX: 245, clientY: 115});
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(
      [guests[0], createdGuest, guests[1]],
      {
        type: 'reorder',
        item: guests[1],
        fromIndex: 1,
        toIndex: 2,
      },
    );
    expect(
      document.querySelector('[data-list-input-drop-target]'),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector('[data-list-input-drag-preview]'),
    ).not.toBeInTheDocument();
  });

  it('cancels a pointer reorder when a second pointer lands, as a pinch does', () => {
    const onChange = vi.fn();
    const {container} = renderListInput({isReorderable: true, onChange});
    const handle = screen.getByRole('button', {name: 'Reorder guest 1'});

    fireEvent.pointerDown(handle, {
      button: 0,
      pointerId: 8,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerMove(handle, {pointerId: 8, clientX: 10, clientY: 34});
    expect(
      container.querySelector('[data-list-input-reorder-source]'),
    ).toBeInTheDocument();

    // The second finger of a pinch lands elsewhere on the page.
    fireEvent.pointerDown(document.body, {pointerId: 9, clientX: 200});
    expect(
      container.querySelector('[data-list-input-reorder-source]'),
    ).not.toBeInTheDocument();

    fireEvent.pointerUp(handle, {pointerId: 8, clientX: 10, clientY: 90});
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clears a sub-threshold pointer drag without reordering', () => {
    const onChange = vi.fn();
    const {container} = renderListInput({isReorderable: true, onChange});
    const handle = screen.getByRole('button', {name: 'Reorder guest 1'});

    fireEvent.pointerDown(handle, {
      button: 0,
      pointerId: 8,
      clientX: 10,
      clientY: 10,
    });
    expect(
      fireEvent.pointerMove(handle, {
        pointerId: 8,
        clientX: 14,
        clientY: 10,
      }),
    ).toBe(true);

    expect(
      container.querySelector('[data-list-input-reorder-source]'),
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-list-input-drag-preview]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-list-input-drop-target]'),
    ).not.toBeInTheDocument();

    fireEvent.pointerUp(handle, {pointerId: 8, clientX: 14, clientY: 10});

    expect(onChange).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-list-input-reorder-source]'),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector('[data-list-input-drag-preview]'),
    ).not.toBeInTheDocument();
  });

  it('activates a pointer drag after horizontal threshold movement', async () => {
    const onChange = vi.fn();
    renderListInput({isReorderable: true, onChange});
    const rows = document.querySelectorAll<HTMLElement>(
      '[data-list-input-row]',
    );
    vi.spyOn(rows[1], 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 40,
      top: 40,
      right: 400,
      bottom: 80,
      left: 0,
      width: 400,
      height: 40,
      toJSON: () => {},
    });

    const handle = screen.getByRole('button', {name: 'Reorder guest 1'});

    fireEvent.pointerDown(handle, {
      button: 0,
      pointerId: 9,
      clientX: 10,
      clientY: 10,
    });

    expect(
      fireEvent.pointerMove(handle, {
        pointerId: 9,
        clientX: 15,
        clientY: 10,
      }),
    ).toBe(false);

    fireEvent.pointerUp(handle, {pointerId: 9, clientX: 15, clientY: 10});

    expect(onChange).not.toHaveBeenCalled();
    // The grab and the return land in the same frame, so they are spoken
    // together, in order (spec:AST-086 FR9).
    await waitFor(() => {
      expect(
        Array.from(document.querySelectorAll('[aria-live="polite"]')).some(
          node =>
            node.textContent ===
            'guest 1 grabbed. Use arrow keys to move, Space or Enter to drop, and Escape to cancel. guest returned to position 1.',
        ),
      ).toBe(true);
    });
  });

  it('cancels a keyboard reorder with Escape', () => {
    const onChange = vi.fn();
    renderListInput({isReorderable: true, onChange});
    const handle = screen.getByRole('button', {name: 'Reorder guest 1'});

    handle.focus();
    fireEvent.keyDown(handle, {key: 'Enter'});
    fireEvent.keyDown(handle, {key: 'ArrowDown'});
    fireEvent.keyDown(handle, {key: 'Escape'});

    expect(onChange).not.toHaveBeenCalled();
    expect(
      document.querySelector('[data-list-input-reorder-source]'),
    ).not.toBeInTheDocument();
    expect(
      screen
        .getAllByRole('textbox')
        .map(input => (input as HTMLInputElement).value),
    ).toEqual(['Ada', 'Grace']);
  });

  it('locks every field and mutation control when isDisabled is set', () => {
    const onChange = vi.fn();
    renderListInput({isDisabled: true, isReorderable: true, onChange});

    const group = screen.getByRole('group');
    expect(group).toHaveAttribute('aria-disabled', 'true');
    expect(group).not.toHaveAttribute('aria-busy');

    for (const field of screen.getAllByRole('textbox')) {
      expect(field).toBeDisabled();
    }
    expect(screen.getByRole('button', {name: /add guest/i})).toBeDisabled();
    expect(
      screen.getByRole('button', {name: 'Reorder guest 1'}),
    ).toBeDisabled();
    // Remove carries a tooltip, so it is disabled via aria and stays focusable
    // rather than dropping out of the tab order with its explanation.
    expect(
      screen.getByRole('button', {name: 'Remove guest 1'}),
    ).toHaveAttribute('aria-disabled', 'true');

    // The values stay readable — a disabled list still communicates content.
    expect(screen.getAllByRole('textbox')[0]).toHaveValue('Ada');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('marks the list busy and locks the same controls when isLoading is set', () => {
    renderListInput({isLoading: true, isReorderable: true});

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
    ).toBeDisabled();
    expect(
      screen.getByRole('button', {name: 'Remove guest 1'}),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('cancels an in-flight keyboard reorder when the list becomes busy', () => {
    const onChange = vi.fn();
    const {rerender} = render(
      <ListInput<Guest>
        label="Guests"
        itemName="guest"
        value={guests}
        onChange={onChange}
        getItemKey={guest => guest.id}
        createItem={() => createdGuest}
        columns={columns}
        isReorderable
      />,
    );

    const handle = screen.getByRole('button', {name: 'Reorder guest 1'});
    handle.focus();
    fireEvent.keyDown(handle, {key: ' ', code: 'Space'});
    expect(
      document.querySelector('[data-list-input-reorder-source]'),
    ).toBeInTheDocument();

    rerender(
      <ListInput<Guest>
        label="Guests"
        itemName="guest"
        value={guests}
        onChange={onChange}
        getItemKey={guest => guest.id}
        createItem={() => createdGuest}
        columns={columns}
        isReorderable
        isLoading
      />,
    );

    // The pick-up is abandoned rather than committed, so no order change escapes.
    expect(
      document.querySelector('[data-list-input-reorder-source]'),
    ).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
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

  it('moves a picked-up record to the first and last positions with Home and End', () => {
    const onChange = vi.fn();
    const threeGuests = [...guests, createdGuest];
    render(
      <ListInput<Guest>
        label="Guests"
        itemName="guest"
        value={threeGuests}
        onChange={onChange}
        getItemKey={guest => guest.id}
        createItem={() => createdGuest}
        columns={columns}
        isReorderable
      />,
    );

    const handle = screen.getByRole('button', {name: 'Reorder guest 3'});
    handle.focus();
    fireEvent.keyDown(handle, {key: ' ', code: 'Space'});

    fireEvent.keyDown(handle, {key: 'Home'});
    expect(
      document.querySelector('[data-list-input-reorder-source]')?.closest('li'),
    ).toHaveAttribute('aria-posinset', '1');

    fireEvent.keyDown(handle, {key: 'End'});
    expect(
      document.querySelector('[data-list-input-reorder-source]')?.closest('li'),
    ).toHaveAttribute('aria-posinset', '3');

    fireEvent.keyDown(handle, {key: 'Home'});
    fireEvent.keyDown(handle, {key: 'Enter'});
    expect(onChange).toHaveBeenCalledWith(
      [createdGuest, guests[0], guests[1]],
      {type: 'reorder', item: createdGuest, fromIndex: 2, toIndex: 0},
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
