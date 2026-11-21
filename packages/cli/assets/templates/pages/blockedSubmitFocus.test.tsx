// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * @file blockedSubmitFocus.test.tsx
 * @input The contact-form, form-two-column and form-wizard-dialog page
 *   templates, rendered empty in jsdom
 * @output A blocked Submit (or Continue) moves focus to the first invalid
 *   field, as the form-wizard-vertical and checkout-wizard templates do, so
 *   the field's error is read as its description
 * @position CLI page-template regression coverage; runs in the node project
 *   under jsdom
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeAll, describe, expect, it} from 'vitest';
import ContactForm from './contact-form/page';
import FormTwoColumn from './form-two-column/page';
import FormWizardDialog from './form-wizard-dialog/page';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

function renderPage(Page: () => React.ReactNode): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<Page />);
  });
}

/** The button whose text is `name`. */
function button(name: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(
    candidate => candidate.textContent?.trim() === name,
  );
  if (found == null) {
    throw new Error(`no "${name}" button rendered`);
  }
  return found;
}

/** The input or text area labelled `name`. */
function field(name: string): HTMLElement {
  const label = [...container.querySelectorAll('label')].find(candidate =>
    candidate.textContent?.trim().startsWith(name),
  );
  const target =
    label?.htmlFor != null ? document.getElementById(label.htmlFor) : null;
  if (target == null) {
    throw new Error(`no field labelled "${name}"`);
  }
  return target;
}

function press(target: HTMLButtonElement): void {
  act(() => {
    target.focus();
    target.click();
  });
}

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe('a blocked submit focuses the first invalid field', () => {
  it('contact-form: Submit with every field empty focuses Full Name', () => {
    renderPage(ContactForm);
    press(button('Submit'));
    expect(document.activeElement).toBe(field('Full Name'));
  });

  it('form-two-column: the submit with every field empty focuses Full name', () => {
    renderPage(FormTwoColumn);
    press(button("Let's connect"));
    expect(document.activeElement).toBe(field('Full name'));
  });

  it('form-wizard-dialog: Continue on the empty first step focuses Report name', () => {
    renderPage(FormWizardDialog);
    press(button('Continue'));
    expect(document.activeElement).toBe(field('Report name'));
  });
});
