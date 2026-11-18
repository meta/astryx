// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useTableColumnSettingsState example is a members Table with a
 * column visibility picker. Toggling Email hides the column, and
 * clicking Reset restores the defaults.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import UseTableColumnSettingsStateHookUsage from '../../assets/templates/blocks/components/Table/useTableColumnSettingsStateHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

function columnHeaders(): string[] {
  return Array.from(container.querySelectorAll('th')).map(
    th => th.textContent?.trim() ?? '',
  );
}

function clickButton(label: string): void {
  const button = Array.from(document.body.querySelectorAll('button')).find(
    b => b.textContent?.trim() === label,
  );
  if (button == null) {
    throw new Error(`no button with label "${label}"`);
  }
  act(() => {
    button.dispatchEvent(
      new MouseEvent('click', {bubbles: true, cancelable: true}),
    );
  });
}

function clickCheckbox(label: string): void {
  const labelElement = Array.from(document.body.querySelectorAll('label')).find(
    l => l.textContent?.trim() === label,
  );
  if (labelElement == null) {
    throw new Error(`no label with text "${label}"`);
  }
  const checkbox = labelElement.htmlFor
    ? document.getElementById(labelElement.htmlFor)
    : labelElement.querySelector('input[type="checkbox"]');
  if (checkbox == null) {
    throw new Error(`no checkbox for label "${label}"`);
  }
  act(() => {
    checkbox.dispatchEvent(
      new MouseEvent('click', {bubbles: true, cancelable: true}),
    );
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<UseTableColumnSettingsStateHookUsage />);
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe('useTableColumnSettingsState example', () => {
  it('renders all default columns', () => {
    expect(columnHeaders()).toEqual(['Name', 'Email', 'Role']);
  });

  it('toggles a column off and on using the picker', () => {
    clickButton('Columns');
    clickCheckbox('Email');
    expect(columnHeaders()).toEqual(['Name', 'Role']);

    clickCheckbox('Email');
    expect(columnHeaders()).toEqual(['Name', 'Role', 'Email']);
  });

  it('restores default columns on reset', () => {
    clickButton('Columns');
    clickCheckbox('Email');
    expect(columnHeaders()).toEqual(['Name', 'Role']);

    clickButton('Reset');
    expect(columnHeaders()).toEqual(['Name', 'Email', 'Role']);
  });
});
