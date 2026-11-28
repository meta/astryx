// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file nestedControlPress.test.tsx
 * @input vitest (jsdom), React Testing Library, ClickableCard,
 *   SelectableCard, Item, TreeList, Token and Thumbnail
 * @output Checks the press rule of every container, for a finger, a pen and
 *   a mouse: a finger's press that starts on a nested control paints no press
 *   on the container, and a mouse's or a pen's turns off the container's
 *   `:active` paint until the press ends; a press on the container's own surface or its
 *   own action leaves it on; a row whose root is a link keeps its press. The
 *   paint itself is checked in a real browser
 *   (__tests__/NestedControlPress.a11y.chromium.spec.ts)
 * @position Testing; validates cancelNestedPress (hooks/useClickableContainer)
 *   through each container that composes it
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {useRef, type ReactNode} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {PRESS_ONSET_MS} from '../utils/pressGesture';
import {PRESSED_ATTRIBUTE} from '../utils/pressFeedback';
import {ClickableCard} from '../ClickableCard/ClickableCard';
import {SelectableCard} from '../SelectableCard/SelectableCard';
import {Item} from '../Item/Item';
import {TreeList} from '../TreeList/TreeList';
import {Token} from '../Token/Token';
import {Thumbnail} from '../Thumbnail/Thumbnail';

const PAINT = '--_nested-press-paint';

function Nested() {
  return (
    <button type="button" aria-label="Nested">
      ⋯
    </button>
  );
}

interface Case {
  name: string;
  render: () => ReactNode;
  /** The element whose press paint the rule turns off. */
  container: (nested: HTMLElement) => HTMLElement;
  /** An element on the container's own surface. */
  surface: () => HTMLElement;
}

function closestOrThrow(element: Element, selector: string): HTMLElement {
  const found = element.closest(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`no ${selector} around the element`);
  }
  return found;
}

const CASES: Case[] = [
  {
    name: 'ClickableCard',
    render: () => (
      <ClickableCard label="Open billing" onClick={() => {}}>
        <span>Surface</span>
        <Nested />
      </ClickableCard>
    ),
    container: nested => closestOrThrow(nested, '[data-pressable-container]'),
    surface: () => screen.getByText('Surface'),
  },
  {
    name: 'SelectableCard',
    render: () => (
      <SelectableCard label="Plan" isSelected={false} onChange={() => {}}>
        <span>Surface</span>
        <Nested />
      </SelectableCard>
    ),
    container: nested => closestOrThrow(nested, '[data-pressable-container]'),
    surface: () => screen.getByText('Surface'),
  },
  {
    name: 'Item with onClick',
    render: () => (
      <Item label="Surface" onClick={() => {}} endContent={<Nested />} />
    ),
    container: nested => closestOrThrow(nested, '.astryx-item'),
    surface: () => screen.getByText('Surface'),
  },
  {
    name: 'Item with href',
    render: () => <Item label="Surface" href="#row" endContent={<Nested />} />,
    container: nested => closestOrThrow(nested, '.astryx-item'),
    surface: () => screen.getByText('Surface'),
  },
  {
    name: 'TreeList row',
    render: () => (
      <TreeList
        items={[
          {
            id: 'row',
            label: 'Surface',
            onClick: () => {},
            endContent: <Nested />,
          },
        ]}
      />
    ),
    container: nested => closestOrThrow(nested, '.astryx-tree-list-item'),
    surface: () => screen.getByText('Surface'),
  },
  {
    name: 'Token with a remove button',
    render: () => (
      <Token label="Surface" onClick={() => {}} onRemove={() => {}} />
    ),
    container: nested => closestOrThrow(nested, '.astryx-token'),
    surface: () => screen.getByText('Surface'),
  },
  {
    name: 'Thumbnail with a remove button',
    render: () => (
      <Thumbnail
        src="/photo.jpg"
        alt="Surface"
        onClick={() => {}}
        onRemove={() => {}}
        showRemoveOn="always"
      />
    ),
    // The remove button presses on its own, so the container is the
    // pressable element around its slot.
    container: nested =>
      closestOrThrow(nested.parentElement ?? nested, '[data-astryx-pressable]'),
    surface: () => screen.getByRole('img', {name: 'Surface'}),
  },
];

function nestedOf(name: string): HTMLElement {
  return name.startsWith('Token') || name.startsWith('Thumbnail')
    ? screen.getByRole('button', {name: /remove/i})
    : screen.getByRole('button', {name: 'Nested'});
}

afterEach(() => {
  vi.useRealTimers();
});

describe.each(CASES)('$name', testCase => {
  it.each(['mouse', 'pen'] as const)(
    'turns off its press paint for a %s press on a nested control, until the press ends',
    pointerType => {
      render(testCase.render());
      const nested = nestedOf(testCase.name);
      const container = testCase.container(nested);
      fireEvent.pointerDown(nested, {pointerType, button: 0});
      expect(container.style.getPropertyValue(PAINT)).toBe(
        'var(--_nested-press-rest)',
      );
      fireEvent.pointerUp(nested, {pointerType, button: 0});
      expect(container.style.getPropertyValue(PAINT)).toBe('');
    },
  );

  it('paints no press on the container for a finger press on a nested control, and paints one for a finger on its surface', () => {
    vi.useFakeTimers();
    render(testCase.render());
    const nested = nestedOf(testCase.name);
    const container = testCase.container(nested);
    fireEvent.pointerDown(nested, {
      pointerType: 'touch',
      pointerId: 1,
      button: 0,
    });
    act(() => {
      vi.advanceTimersByTime(PRESS_ONSET_MS * 2);
    });
    expect(container.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
    fireEvent.pointerUp(nested, {
      pointerType: 'touch',
      pointerId: 1,
      button: 0,
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const surface = testCase.surface();
    fireEvent.pointerDown(surface, {
      pointerType: 'touch',
      pointerId: 2,
      button: 0,
    });
    act(() => {
      vi.advanceTimersByTime(PRESS_ONSET_MS * 2);
    });
    expect(container.hasAttribute(PRESSED_ATTRIBUTE)).toBe(true);
    fireEvent.pointerUp(surface, {
      pointerType: 'touch',
      pointerId: 2,
      button: 0,
    });
  });

  it('keeps its press paint for a mouse press on its own surface', () => {
    render(testCase.render());
    const surface = testCase.surface();
    const container = testCase.container(nestedOf(testCase.name));
    fireEvent.pointerDown(surface, {pointerType: 'mouse', button: 0});
    expect(container.style.getPropertyValue(PAINT)).toBe('');
    fireEvent.pointerUp(surface, {pointerType: 'mouse', button: 0});
  });

  it('ends a mark that outlived its press at the next press', () => {
    render(testCase.render());
    const nested = nestedOf(testCase.name);
    const container = testCase.container(nested);
    container.style.setProperty(PAINT, 'var(--_nested-press-rest)');
    fireEvent.pointerDown(testCase.surface(), {
      pointerType: 'mouse',
      button: 0,
    });
    expect(container.style.getPropertyValue(PAINT)).toBe('');
  });
});

describe('the press rule’s other edges', () => {
  it('leaves a secondary button press on a nested control alone', () => {
    render(
      <ClickableCard label="Open billing" onClick={() => {}}>
        <Nested />
      </ClickableCard>,
    );
    const nested = screen.getByRole('button', {name: 'Nested'});
    fireEvent.pointerDown(nested, {pointerType: 'mouse', button: 2});
    expect(
      closestOrThrow(
        nested,
        '[data-pressable-container]',
      ).style.getPropertyValue(PAINT),
    ).toBe('');
  });

  it('keeps the press paint of an Item row for a press on its delegated control', () => {
    function DelegatingRow() {
      const ref = useRef<HTMLInputElement>(null);
      return (
        <Item
          label="Row"
          interactiveRef={ref}
          startContent={
            <input ref={ref} type="checkbox" aria-label="Pick row" />
          }
          endContent={<Nested />}
        />
      );
    }
    render(<DelegatingRow />);
    const checkbox = screen.getByRole('checkbox', {name: 'Pick row'});
    const row = closestOrThrow(checkbox, '.astryx-item');
    fireEvent.pointerDown(checkbox, {pointerType: 'mouse', button: 0});
    expect(row.style.getPropertyValue(PAINT)).toBe('');
    fireEvent.pointerUp(checkbox, {pointerType: 'mouse', button: 0});
    fireEvent.pointerDown(screen.getByRole('button', {name: 'Nested'}), {
      pointerType: 'mouse',
      button: 0,
    });
    expect(row.style.getPropertyValue(PAINT)).toBe('var(--_nested-press-rest)');
  });

  it('keeps the press paint of a Token for a press on its own action', () => {
    render(<Token label="Surface" onClick={() => {}} onRemove={() => {}} />);
    const token = closestOrThrow(screen.getByText('Surface'), '.astryx-token');
    const action = token.querySelector(':scope > button');
    if (!(action instanceof HTMLElement)) {
      throw new Error('no own action in the token');
    }
    fireEvent.pointerDown(action, {pointerType: 'mouse', button: 0});
    expect(token.style.getPropertyValue(PAINT)).toBe('');
  });

  it('paints no press on an Item row for a press on a read-only input, which does not run the row', () => {
    vi.useFakeTimers();
    render(
      <Item
        label="Invoice 42"
        onClick={() => {}}
        endContent={
          <input
            type="checkbox"
            aria-readonly="true"
            aria-label="Paid"
            readOnly
          />
        }
      />,
    );
    const input = screen.getByRole('checkbox', {name: 'Paid'});
    const row = closestOrThrow(input, '.astryx-item');
    fireEvent.pointerDown(input, {pointerType: 'mouse', button: 0});
    expect(row.style.getPropertyValue(PAINT)).toBe('var(--_nested-press-rest)');
    fireEvent.pointerUp(input, {pointerType: 'mouse', button: 0});
    fireEvent.pointerDown(input, {
      pointerType: 'touch',
      pointerId: 1,
      button: 0,
    });
    act(() => {
      vi.advanceTimersByTime(PRESS_ONSET_MS * 2);
    });
    expect(row.hasAttribute(PRESSED_ATTRIBUTE)).toBe(false);
    fireEvent.pointerUp(input, {
      pointerType: 'touch',
      pointerId: 1,
      button: 0,
    });
  });

  it('keeps the press paint of an Item row whose root is a link, since a press on its nested control runs the row', () => {
    function RowLink(props: {href?: string; children?: ReactNode}) {
      return <a {...props} />;
    }
    render(
      <Item as={RowLink} label="Row" href="#row" endContent={<Nested />} />,
    );
    const nested = screen.getByRole('button', {name: 'Nested'});
    fireEvent.pointerDown(nested, {pointerType: 'mouse', button: 0});
    expect(
      closestOrThrow(nested, '.astryx-item').style.getPropertyValue(PAINT),
    ).toBe('');
  });
});
