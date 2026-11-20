// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * @file Behavior test for the settings templates' side nav.
 * @input The shipped settings and settings-sidebar page templates, rendered in
 *   jsdom at desktop width.
 * @output Guards the current nav row: it carries aria-current="page", and an
 *   item that only shows the demo toast never takes it, before or after it is
 *   chosen.
 * @position CLI template regression coverage; runs in the node test project,
 *   under jsdom for this file.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import SettingsTemplate from '../../assets/templates/pages/settings/page';
import SettingsSidebarTemplate from '../../assets/templates/pages/settings-sidebar/page';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;

async function renderPage(Page: () => React.ReactNode): Promise<void> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<Page />);
  });
}

/** The text of every element marked as the current page. */
function current(): string[] {
  return Array.from(
    document.querySelectorAll('[aria-current="page"]'),
    marked => marked.textContent?.trim() ?? '',
  );
}

async function choose(label: string): Promise<void> {
  const button = Array.from(document.querySelectorAll('button')).find(
    candidate => candidate.textContent?.trim() === label,
  );
  if (button == null) {
    throw new Error(`no "${label}" nav button rendered`);
  }
  await act(async () => {
    button.click();
  });
}

beforeAll(() => {
  // No LayerProvider here, so the toast hook warns once and uses its fallback.
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  // Desktop width: the side nav renders, not the phone layout.
  window.matchMedia = ((query: string) => ({
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

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  document.body.replaceChildren();
});

describe('settings template nav', () => {
  it('marks Profile, the page shown, as the current page', async () => {
    await renderPage(SettingsTemplate);
    expect(current()).toEqual(['Profile']);
  });

  it('keeps Profile current when a toast-only item is chosen', async () => {
    await renderPage(SettingsTemplate);
    for (const item of ['Account', 'Members', 'Billing', 'Invoices', 'API']) {
      await choose(item);
      expect(current()).toEqual(['Profile']);
    }
  });
});

describe('settings-sidebar template nav', () => {
  it('marks the section shown as the current page', async () => {
    await renderPage(SettingsSidebarTemplate);
    expect(current()).toEqual(['Personal information']);
    await choose('Privacy');
    expect(current()).toEqual(['Privacy']);
  });

  it('never marks a toast-only item as the current page', async () => {
    await renderPage(SettingsSidebarTemplate);
    for (const item of [
      'Notifications',
      'Taxes',
      'Payments',
      'Travel for work',
    ]) {
      await choose(item);
      expect(current()).toEqual(['Personal information']);
    }
  });
});
