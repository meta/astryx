// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MultiSelector.searchRequired.test.tsx
 * @input Uses MultiSelector, FormLayout, Testing Library
 * @output Tests where a required search MultiSelector states its required
 *   state: never as aria-required on the role-less trigger button, always in
 *   the closed trigger's name or description, and as aria-required on the
 *   search combobox while the list is open
 * @position Colocated accessibility test for MultiSelector with hasSearch
 */

import {describe, it, expect} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {MultiSelector} from './MultiSelector';
import {FormLayout} from '../FormLayout/FormLayout';

const OPTIONS = ['Design', 'Code', 'Writing'];

function trigger(): HTMLElement {
  return screen.getByRole('button', {name: /Skills/});
}

/** The text of every element an aria-describedby or aria-labelledby names. */
function referencedText(element: HTMLElement, attribute: string): string {
  return (element.getAttribute(attribute) ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map(id => document.getElementById(id)?.textContent ?? '')
    .join(' ');
}

describe('MultiSelector with hasSearch: the required state', () => {
  it('puts no aria-required on the role-less trigger button', () => {
    render(
      <MultiSelector
        label="Skills"
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
        hasSearch
        isRequired
      />,
    );
    const button = trigger();
    expect(button).not.toHaveAttribute('role');
    expect(button).not.toHaveAttribute('aria-required');
  });

  it('announces required on the closed trigger', () => {
    render(
      <MultiSelector
        label="Skills"
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
        hasSearch
        isRequired
      />,
    );
    // The Field label's visible marker is part of the trigger's name.
    expect(
      screen.getByRole('button', {name: /Skills.*Required/}),
    ).toBeInTheDocument();
  });

  it('announces required on the closed trigger when the form hides the marker', () => {
    render(
      <FormLayout defaultOptionality="required">
        <MultiSelector
          label="Skills"
          options={OPTIONS}
          value={[]}
          onChange={() => {}}
          hasSearch
        />
      </FormLayout>,
    );
    const button = trigger();
    expect(button).not.toHaveAttribute('aria-required');
    const announced = `${referencedText(button, 'aria-labelledby')} ${referencedText(button, 'aria-describedby')}`;
    expect(announced).toMatch(/Required/);
  });

  it('puts aria-required on the search combobox while the list is open', () => {
    render(
      <MultiSelector
        label="Skills"
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
        hasSearch
        isRequired
      />,
    );
    fireEvent.click(trigger());
    const search = screen
      .getAllByRole('combobox', {hidden: true})
      .find(element => element.tagName === 'INPUT');
    expect(search).toHaveAttribute('aria-required', 'true');
  });

  it('keeps aria-required on the trigger without search, which is a combobox', () => {
    render(
      <MultiSelector
        label="Skills"
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
        isRequired
      />,
    );
    expect(screen.getByRole('combobox', {name: /Skills/})).toHaveAttribute(
      'aria-required',
      'true',
    );
  });
});
