// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FormLayout.test.tsx
 * @input Uses vitest, @testing-library/react, FormLayout component
 * @output Unit tests for FormLayout component behavior
 * @position Testing; validates FormLayout.tsx implementation
 *
 * SYNC: When FormLayout.tsx changes, update tests to match new behavior
 */

import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {use} from 'react';
import {FormLayout} from './FormLayout';
import {FormLayoutContext} from './FormLayoutContext';
import type {FormLayoutDirection} from './FormLayoutContext';
import {Field} from '../Field';
import {TextInput} from '../TextInput';
import {CheckboxInput} from '../CheckboxInput';

// Helper component to read context
function DirectionReader() {
  const {direction} = use(FormLayoutContext);
  return <span data-testid="direction">{direction}</span>;
}

// Helper component to read the defaultOptionality context value
function OptionalityReader() {
  const {defaultOptionality} = use(FormLayoutContext);
  return <span data-testid="optionality">{defaultOptionality ?? 'unset'}</span>;
}

describe('FormLayout', () => {
  // ─── Basic rendering ────────────────────────────────────────────────────

  it('renders children', () => {
    render(
      <FormLayout>
        <input data-testid="child" />
      </FormLayout>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('renders a div element', () => {
    render(<FormLayout data-testid="layout">content</FormLayout>);
    const el = screen.getByTestId('layout');
    expect(el.tagName).toBe('DIV');
  });

  it('forwards ref', () => {
    const ref = {current: null as HTMLDivElement | null};
    render(<FormLayout ref={ref}>content</FormLayout>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('passes data-testid', () => {
    render(<FormLayout data-testid="my-form">content</FormLayout>);
    expect(screen.getByTestId('my-form')).toBeInTheDocument();
  });

  it('passes through HTML attributes', () => {
    render(
      <FormLayout data-testid="layout" id="form-1" role="group">
        content
      </FormLayout>,
    );
    const el = screen.getByTestId('layout');
    expect(el).toHaveAttribute('id', 'form-1');
    expect(el).toHaveAttribute('role', 'group');
  });

  it('keeps component-owned direction metadata over a colliding pass-through', () => {
    render(
      <FormLayout
        direction="horizontal"
        data-direction="vertical"
        data-testid="layout">
        content
      </FormLayout>,
    );
    expect(screen.getByTestId('layout')).toHaveAttribute(
      'data-direction',
      'horizontal',
    );
  });

  // ─── Direction modes ────────────────────────────────────────────────────

  it('defaults to vertical direction', () => {
    render(
      <FormLayout data-testid="layout">
        <DirectionReader />
      </FormLayout>,
    );
    expect(screen.getByTestId('direction')).toHaveTextContent('vertical');
  });

  it('supports horizontal direction', () => {
    render(
      <FormLayout direction="horizontal" data-testid="layout">
        <DirectionReader />
      </FormLayout>,
    );
    expect(screen.getByTestId('direction')).toHaveTextContent('horizontal');
  });

  it('supports horizontal-labels direction', () => {
    render(
      <FormLayout direction="horizontal-labels" data-testid="layout">
        <DirectionReader />
      </FormLayout>,
    );
    expect(screen.getByTestId('direction')).toHaveTextContent(
      'horizontal-labels',
    );
  });

  // ─── Context propagation ────────────────────────────────────────────────

  it('provides direction context to children', () => {
    const directions: FormLayoutDirection[] = [
      'vertical',
      'horizontal',
      'horizontal-labels',
    ];

    for (const dir of directions) {
      const {unmount} = render(
        <FormLayout direction={dir}>
          <DirectionReader />
        </FormLayout>,
      );
      expect(screen.getByTestId('direction')).toHaveTextContent(dir);
      unmount();
    }
  });

  it('provides default context when no direction is specified', () => {
    render(
      <FormLayout>
        <DirectionReader />
      </FormLayout>,
    );
    expect(screen.getByTestId('direction')).toHaveTextContent('vertical');
  });

  // ─── Nesting ────────────────────────────────────────────────────────────

  it('supports nesting — inner layout overrides context', () => {
    render(
      <FormLayout direction="vertical" data-testid="outer">
        <FormLayout direction="horizontal" data-testid="inner">
          <DirectionReader />
        </FormLayout>
      </FormLayout>,
    );
    // Inner context should be 'horizontal', not 'vertical'
    expect(screen.getByTestId('direction')).toHaveTextContent('horizontal');
  });

  it('renders nested layouts with different elements', () => {
    render(
      <FormLayout data-testid="outer">
        <input data-testid="outer-child" />
        <FormLayout direction="horizontal" data-testid="inner">
          <input data-testid="inner-child-1" />
          <input data-testid="inner-child-2" />
        </FormLayout>
      </FormLayout>,
    );
    expect(screen.getByTestId('outer')).toBeInTheDocument();
    expect(screen.getByTestId('inner')).toBeInTheDocument();
    expect(screen.getByTestId('outer-child')).toBeInTheDocument();
    expect(screen.getByTestId('inner-child-1')).toBeInTheDocument();
    expect(screen.getByTestId('inner-child-2')).toBeInTheDocument();
  });

  // ─── defaultOptionality context propagation ─────────────────────────────

  it('leaves defaultOptionality unset by default', () => {
    render(
      <FormLayout>
        <OptionalityReader />
      </FormLayout>,
    );
    expect(screen.getByTestId('optionality')).toHaveTextContent('unset');
  });

  it('provides defaultOptionality="optional" to children', () => {
    render(
      <FormLayout defaultOptionality="optional">
        <OptionalityReader />
      </FormLayout>,
    );
    expect(screen.getByTestId('optionality')).toHaveTextContent('optional');
  });

  it('provides defaultOptionality="required" to children', () => {
    render(
      <FormLayout defaultOptionality="required">
        <OptionalityReader />
      </FormLayout>,
    );
    expect(screen.getByTestId('optionality')).toHaveTextContent('required');
  });

  it('an inner layout shadows the outer defaultOptionality', () => {
    render(
      <FormLayout defaultOptionality="optional">
        <FormLayout defaultOptionality="required">
          <OptionalityReader />
        </FormLayout>
      </FormLayout>,
    );
    expect(screen.getByTestId('optionality')).toHaveTextContent('required');
  });

  // ─── defaultOptionality indicator behavior (through Field) ───────────────
  //
  // The rule: only the *exception* is marked. A field that restates the form
  // default shows nothing; a deviation shows its indicator.

  it('optional default: only isRequired fields show an indicator', () => {
    render(
      <FormLayout defaultOptionality="optional">
        <Field label="Bio" inputID="bio">
          <input id="bio" />
        </Field>
        <Field label="Nickname" inputID="nick" isOptional>
          <input id="nick" />
        </Field>
        <Field label="Email" inputID="email" isRequired>
          <input id="email" />
        </Field>
      </FormLayout>,
    );
    // Plain + isOptional match the default → nothing shown.
    expect(screen.queryByText(/Optional/)).not.toBeInTheDocument();
    // isRequired deviates → the required indicator shows.
    expect(screen.getByText(/Required/)).toBeInTheDocument();
  });

  it('required default: only isOptional fields show an indicator', () => {
    render(
      <FormLayout defaultOptionality="required">
        <Field label="Name" inputID="name">
          <input id="name" />
        </Field>
        <Field label="Email" inputID="email" isRequired>
          <input id="email" />
        </Field>
        <Field label="Nickname" inputID="nick" isOptional>
          <input id="nick" />
        </Field>
      </FormLayout>,
    );
    // Plain + isRequired match the default → nothing shown.
    expect(screen.queryByText(/Required/)).not.toBeInTheDocument();
    // isOptional deviates → the optional indicator shows.
    expect(screen.getByText(/Optional/)).toBeInTheDocument();
  });

  it('unset default preserves per-field indicators (backwards compatible)', () => {
    render(
      <FormLayout>
        <Field label="Email" inputID="email" isRequired>
          <input id="email" />
        </Field>
        <Field label="Nickname" inputID="nick" isOptional>
          <input id="nick" />
        </Field>
      </FormLayout>,
    );
    expect(screen.getByText(/Required/)).toBeInTheDocument();
    expect(screen.getByText(/Optional/)).toBeInTheDocument();
  });

  // ─── defaultOptionality aria-required resolution ─────────────────────────
  //
  // The indicator is suppressed for the unmarked majority, so the matching
  // `aria-required` must still be exposed — otherwise a sighted user reads a
  // field as required (form default, no indicator) while a screen reader hears
  // "not required". Native `required` stays bound to the explicit prop so a
  // layout default never switches on browser validation.

  it('required default: an unmarked input still exposes aria-required', () => {
    render(
      <FormLayout defaultOptionality="required">
        <TextInput label="Name" value="" onChange={() => {}} />
      </FormLayout>,
    );
    expect(screen.getByLabelText('Name')).toHaveAttribute(
      'aria-required',
      'true',
    );
  });

  it('required default: an isOptional input is not aria-required', () => {
    render(
      <FormLayout defaultOptionality="required">
        <TextInput label="Nickname" value="" onChange={() => {}} isOptional />
      </FormLayout>,
    );
    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-required');
  });

  it('optional default: an unmarked input is not aria-required', () => {
    render(
      <FormLayout defaultOptionality="optional">
        <TextInput label="Bio" value="" onChange={() => {}} />
      </FormLayout>,
    );
    expect(screen.getByLabelText('Bio')).not.toHaveAttribute('aria-required');
  });

  it('no layout: an unmarked input is not aria-required (backwards compatible)', () => {
    render(<TextInput label="Solo" value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Solo')).not.toHaveAttribute('aria-required');
  });

  it('required default resolves aria-required without native required', () => {
    render(
      <FormLayout defaultOptionality="required">
        <CheckboxInput label="Terms" value={false} onChange={() => {}} />
      </FormLayout>,
    );
    const checkbox = screen.getByRole('checkbox', {name: 'Terms'});
    // Announced as required (form default)…
    expect(checkbox).toHaveAttribute('aria-required', 'true');
    // …but the native `required` attribute is not switched on by the layout.
    expect(checkbox).not.toHaveAttribute('required');
  });

  it('explicit isRequired still drives native required under a layout', () => {
    render(
      <FormLayout defaultOptionality="required">
        <CheckboxInput
          label="Consent"
          value={false}
          onChange={() => {}}
          isRequired
        />
      </FormLayout>,
    );
    const checkbox = screen.getByRole('checkbox', {name: 'Consent'});
    expect(checkbox).toHaveAttribute('aria-required', 'true');
    expect(checkbox).toHaveAttribute('required');
  });

  // ─── Snapshot tests ─────────────────────────────────────────────────────

  it('matches snapshot for vertical direction', () => {
    const {container} = render(
      <FormLayout data-testid="layout">
        <input placeholder="Name" />
        <input placeholder="Email" />
      </FormLayout>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for horizontal direction', () => {
    const {container} = render(
      <FormLayout direction="horizontal" data-testid="layout">
        <input placeholder="First" />
        <input placeholder="Last" />
      </FormLayout>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for horizontal-labels direction', () => {
    const {container} = render(
      <FormLayout direction="horizontal-labels" data-testid="layout">
        <label>Name</label>
        <input placeholder="Name" />
      </FormLayout>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  // ─── Horizontal-labels with real Field children ─────────────────────────

  it('horizontal-labels renders Field children with display:contents', () => {
    render(
      <FormLayout direction="horizontal-labels" data-testid="layout">
        <Field label="Name" inputID="name">
          <input id="name" data-testid="name-input" />
        </Field>
        <Field label="Email" inputID="email">
          <input id="email" data-testid="email-input" />
        </Field>
      </FormLayout>,
    );

    const layout = screen.getByTestId('layout');

    // Labels should be accessible
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();

    // The label and input wrapper should be direct grid-participating children
    // (via display:contents on the Field wrapper)
    const nameLabel = screen.getByText('Name');
    const emailLabel = screen.getByText('Email');
    expect(nameLabel.tagName).toBe('LABEL');
    expect(emailLabel.tagName).toBe('LABEL');

    // Both fields should be inside the layout
    expect(layout.contains(nameLabel)).toBe(true);
    expect(layout.contains(screen.getByTestId('name-input'))).toBe(true);
    expect(layout.contains(emailLabel)).toBe(true);
    expect(layout.contains(screen.getByTestId('email-input'))).toBe(true);
  });

  it('horizontal-labels with Field: label and input wrapper are siblings under display:contents', () => {
    render(
      <FormLayout direction="horizontal-labels" data-testid="layout">
        <Field label="Username" inputID="username" data-testid="username-field">
          <input id="username" data-testid="username-input" />
        </Field>
      </FormLayout>,
    );

    const field = screen.getByTestId('username-field');
    // Field should have display:contents class
    expect(field.className).toContain('horizontalLabels');

    // Field's direct children should be: label alignment div + input wrapper div
    const fieldChildren = Array.from(field.children);
    expect(fieldChildren.length).toBe(2);
    // First child is the label alignment wrapper containing the <label>
    expect(fieldChildren[0].tagName).toBe('DIV');
    expect(fieldChildren[0].querySelector('label')).not.toBeNull();
    // Second child is the input wrapper div
    expect(fieldChildren[1].tagName).toBe('DIV');
    // The input should be inside the wrapper div (column 2)
    expect(
      fieldChildren[1].contains(screen.getByTestId('username-input')),
    ).toBe(true);
  });
});
