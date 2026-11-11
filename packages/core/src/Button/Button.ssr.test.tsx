// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Button.ssr.test.tsx
 * @input A disabled or loading submit or reset Button, alone and in a
 *   ButtonGroup or InputGroup, as server markup in a form, used before and
 *   after hydration, and rendered on the client only
 * @output Proves the server markup cannot submit or reset its form, that
 *   hydration matches it, and that the caller's type returns after hydration
 *   with no change to role, name, disabled or busy state
 * @position SSR acceptance test for a disabled or loading submit or reset
 *   Button
 */

import {act} from 'react';
import {render} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {hydrateRoot, type Root} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {Button} from './Button';
import {ButtonGroup} from '../ButtonGroup/ButtonGroup';
import {InputGroup} from '../InputGroup/InputGroup';
import {TextInput} from '../TextInput/TextInput';

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

type Kind = 'submit' | 'reset';

const layouts: [string, (kind: Kind) => React.ReactElement][] = [
  [
    'a disabled Button',
    kind => <Button label="Place order" type={kind} isDisabled />,
  ],
  [
    'a Button in a disabled ButtonGroup',
    kind => (
      <ButtonGroup label="Order actions" isDisabled>
        <Button label="Back" />
        <Button label="Place order" type={kind} />
      </ButtonGroup>
    ),
  ],
  [
    'a loading Button',
    kind => <Button label="Place order" type={kind} isLoading />,
  ],
  [
    'a loading Button in a ButtonGroup',
    kind => (
      <ButtonGroup label="Order actions">
        <Button label="Back" />
        <Button label="Place order" type={kind} isLoading />
      </ButtonGroup>
    ),
  ],
  [
    'a Button in a disabled InputGroup',
    kind => (
      <InputGroup label="Coupon" isDisabled>
        <TextInput label="Code" isLabelHidden value="" onChange={() => {}} />
        <Button label="Place order" type={kind} />
      </InputGroup>
    ),
  ],
];

function inForm(tree: React.ReactElement) {
  return (
    <form aria-label="Order">
      <input aria-label="Note" defaultValue="Ring twice" />
      {tree}
    </form>
  );
}

function serverForm(tree: React.ReactElement) {
  const form = inForm(tree);
  const container = document.createElement('div');
  container.innerHTML = renderToString(form);
  document.body.appendChild(container);
  const formElement = container.querySelector('form')!;
  const submits = vi.fn((event: Event) => event.preventDefault());
  const resets = vi.fn();
  formElement.addEventListener('submit', submits);
  formElement.addEventListener('reset', resets);
  const button = () =>
    Array.from(container.querySelectorAll('button')).find(element =>
      element.textContent?.includes('Place order'),
    )!;
  const note = container.querySelector('input')!;
  return {container, form, submits, resets, button, note};
}

describe.each(layouts)('%s', (_name, layout) => {
  describe.each<Kind>(['submit', 'reset'])('of type %s', kind => {
    it('cannot submit or reset its form from the server markup', () => {
      const {submits, resets, button, note} = serverForm(layout(kind));
      note.value = 'Leave at the door';

      expect(button()).toHaveAttribute('type', 'button');
      expect(button()).toHaveAttribute('aria-disabled', 'true');
      expect(button()).not.toHaveAttribute('disabled');
      button().click();

      expect(submits).not.toHaveBeenCalled();
      expect(resets).not.toHaveBeenCalled();
      expect(note.value).toBe('Leave at the door');
    });

    it('hydrates without a mismatch, then takes the caller type with the same role, name and state', () => {
      const {container, form, submits, resets, button} = serverForm(
        layout(kind),
      );
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      const before = {
        role: button().tagName,
        name: button().textContent,
        disabled: button().getAttribute('aria-disabled'),
        busy: button().getAttribute('aria-busy'),
        label: button().getAttribute('aria-label'),
      };
      act(() => {
        root = hydrateRoot(container, form);
      });

      expect(errors).not.toHaveBeenCalled();
      expect(button()).toHaveAttribute('type', kind);
      expect({
        role: button().tagName,
        name: button().textContent,
        disabled: button().getAttribute('aria-disabled'),
        busy: button().getAttribute('aria-busy'),
        label: button().getAttribute('aria-label'),
      }).toEqual(before);
      expect(button()).not.toHaveAttribute('disabled');

      button().click();
      expect(submits).not.toHaveBeenCalled();
      expect(resets).not.toHaveBeenCalled();
    });
  });

  it('keeps Enter in a field from submitting after hydration', async () => {
    const user = userEvent.setup();
    const {container, form, submits, note} = serverForm(layout('submit'));
    act(() => {
      root = hydrateRoot(container, form);
    });

    await user.click(note);
    await user.keyboard('{Enter}');

    expect(submits).not.toHaveBeenCalled();
  });

  it('renders the caller type at once in a client-only render', () => {
    const {container} = render(inForm(layout('submit')));
    const button = Array.from(container.querySelectorAll('button')).find(
      element => element.textContent?.includes('Place order'),
    );

    expect(button).toHaveAttribute('type', 'submit');
  });
});

describe('an enabled submit Button', () => {
  it('keeps its type in the server markup and submits', () => {
    const {submits, button} = serverForm(
      <Button label="Place order" type="submit" />,
    );

    expect(button()).toHaveAttribute('type', 'submit');
    button().click();

    expect(submits).toHaveBeenCalledTimes(1);
  });
});
