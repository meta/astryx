// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Selector.searchRequired.test.tsx
 * @input Uses Selector, FormLayout, Testing Library
 * @output Tests where a required search Selector states its required state:
 *   never as aria-required on the role-less trigger button, always in the
 *   closed trigger's name or description, and as aria-required on the search
 *   combobox while the list is open
 * @position Colocated accessibility test for Selector with hasSearch
 */

import {describe, it, expect} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {Selector} from './Selector';
import {FormLayout} from '../FormLayout/FormLayout';

const OPTIONS = ['Easy', 'Hard', 'Expert'];

function trigger(): HTMLElement {
  return screen.getByRole('button', {name: /Level/});
}

/** The text of every element an aria-describedby or aria-labelledby names. */
function referencedText(element: HTMLElement, attribute: string): string {
  return (element.getAttribute(attribute) ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map(id => document.getElementById(id)?.textContent ?? '')
    .join(' ');
}

describe('Selector with hasSearch: the required state', () => {
  it('puts no aria-required on the role-less trigger button', () => {
    render(
      <Selector
        label="Level"
        options={OPTIONS}
        value=""
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
      <Selector
        label="Level"
        options={OPTIONS}
        value=""
        onChange={() => {}}
        hasSearch
        isRequired
      />,
    );
    const button = trigger();
    const announced = `${referencedText(button, 'aria-labelledby')} ${referencedText(button, 'aria-describedby')}`;
    expect(announced).toMatch(/Required/);
  });

  it('announces required on the closed trigger when the form hides the marker', () => {
    render(
      <FormLayout defaultOptionality="required">
        <Selector
          label="Level"
          options={OPTIONS}
          value=""
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
      <Selector
        label="Level"
        options={OPTIONS}
        value=""
        onChange={() => {}}
        hasSearch
        isRequired
      />,
    );
    fireEvent.click(trigger());
    expect(
      screen.getByRole('combobox', {name: 'Search options', hidden: true}),
    ).toHaveAttribute('aria-required', 'true');
  });

  it('keeps aria-required on the read-only trigger, which stays a combobox', () => {
    render(
      <Selector
        label="Level"
        options={OPTIONS}
        value="Easy"
        onChange={() => {}}
        hasSearch
        isRequired
        isReadOnly
      />,
    );
    expect(screen.getByRole('combobox', {name: /Level/})).toHaveAttribute(
      'aria-required',
      'true',
    );
  });
});
