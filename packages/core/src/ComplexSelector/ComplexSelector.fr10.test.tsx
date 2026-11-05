// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ComplexSelector.fr10.test.tsx
 * @input Uses vitest, Testing Library, the shared FR10 suites, and ComplexSelector
 * @output Tests that ComplexSelector's base props, container*, and control* reach
 *   their family:input-fields FR10 targets
 * @position Tests; ComplexSelector's FR10 conformance alongside ComplexSelector.test.tsx
 */

import {beforeEach, describe, expect, it, vi} from 'vitest';
import {fireEvent, render, screen} from '@testing-library/react';
import {expectFieldInputProps} from '../Field/fieldInputFamily.testing';
import {describeFieldInputParts} from '../Field/fieldInputFamily.render-testing';
import {ComplexSelector, type ComplexSelectorProps} from './ComplexSelector';

const VALUE = 'Apple';
const content = () => <p>Pick a fruit</p>;

// jsdom has no Popover API; reflect open state the way the browser does.
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
});

describe('ComplexSelector props type (family:input-fields FR10)', () => {
  it('accepts container* and control* and no root styling', () => {
    expectFieldInputProps<ComplexSelectorProps<string>>();
  });
});

describeFieldInputParts('ComplexSelector', {
  renderMember: props => (
    <ComplexSelector label="Fruit" value={VALUE} onChange={() => {}} {...props}>
      {content}
    </ComplexSelector>
  ),
  getControl: () => screen.getByRole('combobox', {name: 'Fruit'}),
  // No shipped InputGroup support (family:input-fields adoption table).
  inGroup: false,
});

describe('ComplexSelector FR10 targets', () => {
  it('keeps a caller aria-describedby alongside the field description', () => {
    render(
      <ComplexSelector
        label="Fruit"
        value={VALUE}
        onChange={() => {}}
        description="Pick one"
        aria-describedby="caller-help">
        {content}
      </ComplexSelector>,
    );
    const ids = (
      screen
        .getByRole('combobox', {name: 'Fruit'})
        .getAttribute('aria-describedby') ?? ''
    ).split(' ');
    expect(ids).toContain('caller-help');
    expect(
      ids.map(id => document.getElementById(id)?.textContent ?? '').join(' '),
    ).toContain('Pick one');
  });

  it('puts control* on the bordered control box around the trigger, not on the trigger or the popup', () => {
    render(
      <ComplexSelector
        label="Fruit"
        value={VALUE}
        onChange={() => {}}
        controlClassName="fr10-control"
        containerClassName="fr10-container">
        {content}
      </ComplexSelector>,
    );
    const trigger = screen.getByRole('combobox', {name: 'Fruit'});
    const controlBox = document.querySelector('.fr10-control') as HTMLElement;
    expect(controlBox).toHaveClass('astryx-complex-selector');
    expect(controlBox).toContainElement(trigger);
    expect(trigger).not.toHaveClass('fr10-control');

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(document.querySelectorAll('.fr10-control')).toHaveLength(1);
    expect(document.querySelectorAll('.fr10-container')).toHaveLength(1);
    expect(screen.getByRole('dialog', {hidden: true})).not.toHaveClass(
      'fr10-control',
    );
  });

  it('lets a caller onClick on the trigger cancel opening, as before', () => {
    const targets: EventTarget[] = [];
    const {container} = render(
      <ComplexSelector
        label="Fruit"
        value={VALUE}
        onChange={() => {}}
        controlClassName="fr10-control"
        onClick={event => {
          targets.push(event.currentTarget);
          event.preventDefault();
        }}>
        {content}
      </ComplexSelector>,
    );
    const trigger = screen.getByRole('combobox', {name: 'Fruit'});
    fireEvent.click(trigger);
    expect(targets).toEqual([trigger]);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    // A press elsewhere in the control box goes through the trigger too.
    fireEvent.click(container.querySelector('.fr10-control') as HTMLElement);
    expect(targets).toEqual([trigger, trigger]);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens once per press when a caller onClick does not cancel', () => {
    const onClick = vi.fn();
    render(
      <ComplexSelector
        label="Fruit"
        value={VALUE}
        onChange={() => {}}
        onClick={onClick}>
        {content}
      </ComplexSelector>,
    );
    const trigger = screen.getByRole('combobox', {name: 'Fruit'});
    fireEvent.click(trigger);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('opens from a press on the control box outside the trigger button', () => {
    const {container} = render(
      <ComplexSelector
        label="Fruit"
        value={VALUE}
        onChange={() => {}}
        controlClassName="fr10-control">
        {content}
      </ComplexSelector>,
    );
    const controlBox = container.querySelector('.fr10-control') as HTMLElement;
    fireEvent.click(controlBox);
    expect(screen.getByRole('combobox', {name: 'Fruit'})).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('keeps the built-in keyboard model and still hands every key to a caller onKeyDown', () => {
    const keys: string[] = [];
    const targets: EventTarget[] = [];
    render(
      <ComplexSelector
        label="Fruit"
        value={VALUE}
        onChange={() => {}}
        onKeyDown={event => {
          keys.push(event.key);
          targets.push(event.currentTarget);
        }}>
        {content}
      </ComplexSelector>,
    );
    const trigger = screen.getByRole('combobox', {name: 'Fruit'});
    fireEvent.keyDown(trigger, {key: 'ArrowDown'});
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    // The caller still sees the ArrowDown the trigger used to open the popup.
    expect(keys).toEqual(['ArrowDown']);
    expect(targets).toEqual([trigger]);
  });
});

describe('ComplexSelector FR10 renderTrigger', () => {
  it('runs a newly forwarded onClick after the built-in toggle, without cancelling it', () => {
    render(
      <ComplexSelector
        label="Fruit"
        value={VALUE}
        onChange={() => {}}
        onClick={event => event.preventDefault()}
        renderTrigger={props => (
          <button type="button" {...props}>
            Open
          </button>
        )}>
        {content}
      </ComplexSelector>,
    );
    const opener = screen.getByRole('combobox', {name: 'Fruit'});
    fireEvent.click(opener);
    expect(opener).toHaveAttribute('aria-expanded', 'true');
  });

  it('forwards base props and the ref to the caller-rendered control', () => {
    const ref = {current: null as HTMLElement | null};
    const onClick = vi.fn();
    render(
      <ComplexSelector
        label="Fruit"
        value={VALUE}
        onChange={() => {}}
        ref={ref}
        data-testid="opener"
        aria-details="details-id"
        onClick={onClick}
        renderTrigger={props => (
          <button type="button" {...props}>
            Open
          </button>
        )}>
        {content}
      </ComplexSelector>,
    );
    const opener = screen.getByRole('combobox', {name: 'Fruit'});
    expect(opener).toHaveAttribute('data-testid', 'opener');
    expect(opener).toHaveAttribute('aria-details', 'details-id');
    expect(ref.current).toBe(opener);
    fireEvent.click(opener);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(opener).toHaveAttribute('aria-expanded', 'true');
  });

  it('warns that container* and control* have no effect', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {container} = render(
      <ComplexSelector
        label="Fruit"
        value={VALUE}
        onChange={() => {}}
        controlClassName="fr10-control"
        renderTrigger={props => (
          <button type="button" {...props}>
            Open
          </button>
        )}>
        {content}
      </ComplexSelector>,
    );
    expect(container.querySelector('.fr10-control')).toBeNull();
    expect(
      warn.mock.calls.some(call =>
        String(call[0]).startsWith(
          'ComplexSelector: `container*` and `control*`',
        ),
      ),
    ).toBe(true);
    warn.mockRestore();
  });
});
