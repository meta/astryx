// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TabDescription.test.tsx
 * @input Uses vitest, @testing-library/react, Tab, TabList, Tooltip and Icon
 * @output Tests for Tab's documented description pattern: a Tooltip anchored on
 *   the Tab through its forwarded ref, rendered outside the strip, with only
 *   non-interactive end content
 * @position Guards the pattern in Tab.doc.mjs and the TabList story
 */

import {useRef, useState} from 'react';
import {afterEach, beforeEach, describe, it, expect, vi} from 'vitest';
import {act, fireEvent, render, screen} from '@testing-library/react';
import {TabList} from '../TabList';
import {Tab} from '../Tab';
import {Tooltip} from '../../Tooltip/Tooltip';
import {Icon} from '../../Icon/Icon';

function SettingsTabs() {
  const [value, setValue] = useState('general');
  const generalRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <TabList
        value={value}
        onChange={setValue}
        role="tablist"
        aria-label="Settings">
        <Tab
          ref={generalRef}
          value="general"
          label="General"
          panelId="panel-general"
          endContent={<Icon icon="info" size="sm" />}
        />
        <Tab value="advanced" label="Advanced" panelId="panel-advanced" />
      </TabList>
      <Tooltip content="What this tab controls." anchorRef={generalRef} />
      <div id="panel-general" role="tabpanel" hidden={value !== 'general'}>
        General settings
      </div>
      <div id="panel-advanced" role="tabpanel" hidden={value !== 'advanced'}>
        Advanced settings
      </div>
    </>
  );
}

const FOCUSABLE =
  'button, a[href], input, select, textarea, [tabindex], [contenteditable="true"]';

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
});

describe('Tab description pattern', () => {
  it('describes the tab itself through aria-describedby', async () => {
    render(<SettingsTabs />);
    const tab = screen.getByRole('tab', {name: 'General'});
    const ids = (tab.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter(Boolean);
    expect(ids.length).toBeGreaterThan(0);

    act(() => {
      fireEvent.focus(tab);
      fireEvent.pointerEnter(tab, {pointerType: 'mouse'});
      fireEvent.mouseEnter(tab);
    });
    const described = await screen.findByText('What this tab controls.');
    expect(ids.some(id => described.closest(`[id="${id}"]`) != null)).toBe(
      true,
    );
  });

  it('keeps the tab one control: its end content holds nothing focusable', () => {
    render(<SettingsTabs />);
    const tab = screen.getByRole('tab', {name: 'General'});
    expect(tab.querySelectorAll(FOCUSABLE)).toHaveLength(0);
    // The glyph is decorative, so the tab's name stays its label.
    expect(tab.querySelector('svg')?.closest('[aria-hidden="true"]')).not.toBe(
      null,
    );
  });

  it('leaves the strip holding only tabs, with no development warning', () => {
    render(<SettingsTabs />);
    const strip = screen.getByRole('tablist', {name: 'Settings'});
    expect(strip.querySelector('[role="tooltip"], template')).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});
