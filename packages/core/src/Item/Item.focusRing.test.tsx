// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Item.focusRing.test.tsx
 * @input vitest (jsdom), React Testing Library, the StyleX rules injected at
 *   runtime, Item in each interaction mode, Button, VisuallyHidden,
 *   CheckboxList and RadioList option rows, and a reorderable List
 * @output Counts the elements that paint a visible focus ring for one focus
 *   move. A delegated row leaves the ring to a nested Button, which rings
 *   itself. It rings for a control that shows no ring, such as one inside
 *   VisuallyHidden, and a disabled row rings for any focused control. Option
 *   rows and reorderable rows leave the ring to an end Button. Rows with their
 *   own action and option rows keep their own ring, and pointer focus on a
 *   Button paints none
 * @position Testing; validates Item's focus-within ring
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {useRef} from 'react';
import {describe, expect, it} from 'vitest';
import {Button} from '../Button/Button';
import {CheckboxList} from '../CheckboxList/CheckboxList';
import {CheckboxListItem} from '../CheckboxList/CheckboxListItem';
import {List} from '../List/List';
import {ListItem} from '../List/ListItem';
import {RadioList} from '../RadioList/RadioList';
import {RadioListItem} from '../RadioList/RadioListItem';
import {createReorderable} from '../reorderable/createReorderable';
import {VisuallyHidden} from '../VisuallyHidden/VisuallyHidden';
import {Item} from './Item';

// jsdom's getComputedStyle reports no outline on a keyboard-focused Button.
// So these helpers read the StyleX rules that match an element instead.

/** The rules that style `element` through one of its own classes. */
function ownRules(element: Element): CSSStyleRule[] {
  const classes = new Set(Array.from(element.classList));
  const rules: CSSStyleRule[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    for (const rule of Array.from(sheet.cssRules)) {
      if (!(rule instanceof CSSStyleRule)) {
        continue;
      }
      const owner = /^\.([\w-]+)/.exec(rule.selectorText)?.[1];
      if (
        owner != null &&
        classes.has(owner) &&
        !rule.selectorText.includes('::')
      ) {
        rules.push(rule);
      }
    }
  }
  return rules;
}

/**
 * Whether `element` paints an outline now. Each StyleX outline property rests
 * at `none` or `0` and takes its visible value only under a focus condition.
 * So a matching rule with a visible style and width is the painted outline.
 */
function paintsRing(element: Element): boolean {
  const matching = ownRules(element).filter(rule =>
    element.matches(rule.selectorText),
  );
  const declares = (property: string, isVisible: (value: string) => boolean) =>
    matching.some(rule => isVisible(rule.style.getPropertyValue(property)));
  return (
    declares('outline-style', value => value !== '' && value !== 'none') &&
    declares('outline-width', value => value !== '' && !/^0(px)?$/.test(value))
  );
}

/** Whether a rule that matches `element` clips it to an empty rectangle. */
function isClippedAway(element: Element): boolean {
  return ownRules(element).some(
    rule =>
      element.matches(rule.selectorText) &&
      /^rect\(0(px)?,? 0(px)?,? 0(px)?,? 0(px)?\)$/.test(
        rule.style.getPropertyValue('clip'),
      ),
  );
}

/**
 * Every element under `root`, `root` included, that paints an outline a
 * person can see now. An outline inside clipped content does not show.
 */
function ringedElements(root: Element): Element[] {
  return [root, ...Array.from(root.querySelectorAll('*'))].filter(
    element =>
      paintsRing(element) &&
      !isClippedAway(element) &&
      !Array.from(root.querySelectorAll('*')).some(
        ancestor => ancestor.contains(element) && isClippedAway(ancestor),
      ),
  );
}

// jsdom decides `:focus-visible` from the last key or mouse event before the
// focus. Each helper sends that event, then checks the result.
function focusWithKeyboard(element: HTMLElement) {
  fireEvent.keyDown(document.body, {key: 'Tab'});
  act(() => element.focus());
  expect(element).toHaveFocus();
  expect(element.matches(':focus-visible')).toBe(true);
}

function focusWithPointer(element: HTMLElement) {
  fireEvent.mouseDown(element);
  act(() => element.focus());
  expect(element).toHaveFocus();
  expect(element.matches(':focus-visible')).toBe(false);
}

function RowDelegatingToButton() {
  const openRef = useRef<HTMLButtonElement | null>(null);
  return (
    <Item
      data-testid="row"
      label="Invoice 42"
      description="Due in 3 days"
      interactiveRef={openRef}
      endContent={
        <Button ref={openRef} label="Open" size="sm" onClick={() => {}} />
      }
    />
  );
}

function RowDelegatingToHiddenControl() {
  const selectRef = useRef<HTMLButtonElement | null>(null);
  return (
    <Item
      data-testid="row"
      label="Invoice 42"
      interactiveRef={selectRef}
      startContent={
        <VisuallyHidden>
          <button ref={selectRef} type="button">
            Select Invoice 42
          </button>
        </VisuallyHidden>
      }
    />
  );
}

function RowDelegatingToHiddenButton() {
  const selectRef = useRef<HTMLButtonElement | null>(null);
  return (
    <Item
      data-testid="row"
      label="Invoice 42"
      interactiveRef={selectRef}
      startContent={
        <VisuallyHidden>
          <Button
            ref={selectRef}
            label="Select Invoice 42"
            onClick={() => {}}
          />
        </VisuallyHidden>
      }
    />
  );
}

/** The Item row around `element`, found by the row's theme class. */
function optionRowOf(element: Element): Element {
  const row = element.closest('.astryx-item');
  if (row == null) {
    throw new Error('the element has no option row');
  }
  return row;
}

describe('Item focus ring', () => {
  it('leaves the ring to the Button a delegated row gives its keyboard access to', () => {
    render(<RowDelegatingToButton />);
    const row = screen.getByTestId('row');
    const open = screen.getByRole('button', {name: 'Open'});

    focusWithKeyboard(open);

    expect(ringedElements(row)).toEqual([open]);
  });

  it('rings a delegated row whose control draws no ring of its own', () => {
    render(<RowDelegatingToHiddenControl />);
    const row = screen.getByTestId('row');

    focusWithKeyboard(screen.getByRole('button', {name: 'Select Invoice 42'}));

    expect(ringedElements(row)).toEqual([row]);
  });

  it('rings a delegated row whose Button sits inside VisuallyHidden', () => {
    render(<RowDelegatingToHiddenButton />);
    const row = screen.getByTestId('row');

    focusWithKeyboard(screen.getByRole('button', {name: 'Select Invoice 42'}));

    expect(ringedElements(row)).toEqual([row]);
  });

  it('keeps the ring of a disabled delegated row, which dims its Button', () => {
    function DisabledRow() {
      const openRef = useRef<HTMLButtonElement | null>(null);
      return (
        <Item
          data-testid="row"
          label="Invoice 42"
          isDisabled
          interactiveRef={openRef}
          endContent={
            <Button
              ref={openRef}
              label="Open"
              size="sm"
              isDisabled
              onClick={() => {}}
            />
          }
        />
      );
    }
    render(<DisabledRow />);
    const row = screen.getByTestId('row');

    focusWithKeyboard(screen.getByRole('button', {name: 'Open'}));

    expect(paintsRing(row)).toBe(true);
  });

  it('paints no ring for pointer focus on the Button of a delegated row', () => {
    render(<RowDelegatingToButton />);
    const row = screen.getByTestId('row');

    focusWithPointer(screen.getByRole('button', {name: 'Open'}));

    expect(ringedElements(row)).toEqual([]);
  });

  it('rings an onClick row, and only the row, for its own button', () => {
    render(
      <Item data-testid="row" label="Quarterly report" onClick={() => {}} />,
    );
    const row = screen.getByTestId('row');

    focusWithKeyboard(screen.getByRole('button', {name: 'Quarterly report'}));

    expect(ringedElements(row)).toEqual([row]);
  });

  it('rings an href row, and only the row, for its own link', () => {
    render(<Item data-testid="row" label="Quarterly report" href="#report" />);
    const row = screen.getByTestId('row');
    // A role query reads the link's computed style. After that, jsdom keeps
    // a wrong `:focus-visible` answer for the link, so find it by its text.
    const link = screen.getByText('Quarterly report').closest('a');
    if (link == null) {
      throw new Error('the row renders no link');
    }

    focusWithKeyboard(link);

    expect(ringedElements(row)).toEqual([row]);
  });

  it('leaves the ring to a Button in the end content of an onClick row', () => {
    render(
      <Item
        data-testid="row"
        label="Quarterly report"
        onClick={() => {}}
        endContent={<Button label="Share" size="sm" onClick={() => {}} />}
      />,
    );
    const row = screen.getByTestId('row');
    const share = screen.getByRole('button', {name: 'Share'});

    focusWithKeyboard(share);

    expect(ringedElements(row)).toEqual([share]);
  });

  it('leaves the ring to a Button in the end content of a reorderable List row', () => {
    render(
      <List reorderable={createReorderable({onReorder: () => {}})}>
        <ListItem
          itemKey="report"
          label="Quarterly report"
          endContent={<Button label="Share" size="sm" onClick={() => {}} />}
        />
      </List>,
    );
    const share = screen.getByRole('button', {name: 'Share'});
    const row = share.closest('li');
    if (row == null) {
      throw new Error('the Button has no list row');
    }

    focusWithKeyboard(share);

    expect(ringedElements(row)).toEqual([share]);
  });

  it('keeps the ring of a disabled reorderable List row for its end Button', () => {
    render(
      <List reorderable={createReorderable({onReorder: () => {}})}>
        <ListItem
          itemKey="report"
          label="Quarterly report"
          isDisabled
          endContent={<Button label="Share" size="sm" onClick={() => {}} />}
        />
      </List>,
    );
    const share = screen.getByRole('button', {name: 'Share'});

    focusWithKeyboard(share);

    expect(paintsRing(optionRowOf(share))).toBe(true);
  });

  it('keeps the row ring of a CheckboxList option for its checkbox', () => {
    render(
      <CheckboxList label="Notifications" value={[]} onChange={() => {}}>
        <CheckboxListItem label="Email" value="email" />
      </CheckboxList>,
    );
    const checkbox = screen.getByRole('checkbox', {name: 'Email'});

    focusWithKeyboard(checkbox);

    expect(paintsRing(optionRowOf(checkbox))).toBe(true);
  });

  it('keeps the row ring of a RadioList option for its radio', () => {
    render(
      <RadioList label="Plan" value="free" onChange={() => {}}>
        <RadioListItem label="Free" value="free" />
      </RadioList>,
    );
    const radio = screen.getByRole('radio', {name: 'Free'});

    focusWithKeyboard(radio);

    expect(paintsRing(optionRowOf(radio))).toBe(true);
  });

  it('leaves the ring to a Button in the end content of a CheckboxList option row', () => {
    render(
      <CheckboxList label="Notifications" value={[]} onChange={() => {}}>
        <CheckboxListItem
          label="Email"
          value="email"
          endContent={<Button label="Edit" size="sm" onClick={() => {}} />}
        />
      </CheckboxList>,
    );
    const edit = screen.getByRole('button', {name: 'Edit'});

    focusWithKeyboard(edit);

    expect(ringedElements(optionRowOf(edit))).toEqual([edit]);
  });

  it('leaves the ring to a Button in the end content of a RadioList option row', () => {
    render(
      <RadioList label="Plan" value="free" onChange={() => {}}>
        <RadioListItem
          label="Pro"
          value="pro"
          endContent={<Button label="Edit" size="sm" onClick={() => {}} />}
        />
      </RadioList>,
    );
    const edit = screen.getByRole('button', {name: 'Edit'});

    focusWithKeyboard(edit);

    expect(ringedElements(optionRowOf(edit))).toEqual([edit]);
  });
});
