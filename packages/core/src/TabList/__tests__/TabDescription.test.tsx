// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TabDescription.test.tsx
 * @input Uses vitest, @testing-library/react, Tab, TabList, Tooltip and Icon
 * @output Tests for Tab's documented description pattern: a Tooltip anchored on
 *   the Tab through its forwarded ref, with only decorative end content
 * @position Guards the pattern in Tab.doc.mjs and the TabList story
 */

import {useRef} from 'react';
import {describe, it, expect} from 'vitest';
import {act, fireEvent, render, screen} from '@testing-library/react';
import {TabList} from '../TabList';
import {Tab} from '../Tab';
import {Tooltip} from '../../Tooltip/Tooltip';
import {Icon} from '../../Icon/Icon';

function DescribedTab({
  value,
  label,
  description,
}: {
  value: string;
  label: string;
  description: string;
}) {
  const tabRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Tab
        ref={tabRef}
        value={value}
        label={label}
        endContent={<Icon icon="info" size="sm" />}
      />
      <Tooltip content={description} anchorRef={tabRef} />
    </>
  );
}

function renderTabs() {
  return render(
    <TabList
      value="general"
      onChange={() => {}}
      role="tablist"
      aria-label="Settings">
      <DescribedTab
        value="general"
        label="General"
        description="What this tab controls."
      />
      <Tab value="advanced" label="Advanced" />
    </TabList>,
  );
}

const FOCUSABLE =
  'button, a[href], input, select, textarea, [tabindex], [contenteditable="true"]';

describe('Tab description pattern', () => {
  it('describes the tab itself through aria-describedby', async () => {
    renderTabs();
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
    renderTabs();
    const tab = screen.getByRole('tab', {name: 'General'});
    expect(tab.querySelectorAll(FOCUSABLE)).toHaveLength(0);
    // The glyph is decorative, so the tab's name stays its label.
    expect(tab.querySelector('svg')?.closest('[aria-hidden="true"]')).not.toBe(
      null,
    );
  });
});
