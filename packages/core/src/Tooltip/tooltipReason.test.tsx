// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tooltipReason.test.tsx
 * @input Uses vitest, @testing-library/react, useTooltipInternal, Button,
 *   IconButton, Link, Avatar, Tooltip, TextInput and ComplexSelector
 * @output Tests that a disabled reason is the only tooltip its control shows:
 *   while a reason tooltip covers a control, the control's own label tooltip
 *   neither shows nor adds to its accessible description, and it returns
 *   when the reason turns off
 * @position Testing; validates useTooltip's `isReason` option and the
 *   tooltip-reason mark
 */

import {afterAll, afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {act, fireEvent, render, screen} from '@testing-library/react';
import type {ReactNode} from 'react';
import {useTooltip, useTooltipInternal} from './useTooltip';
import {Tooltip} from './Tooltip';
import {Button} from '../Button/Button';
import {IconButton} from '../IconButton/IconButton';
import {Link} from '../Link/Link';
import {Avatar} from '../Avatar/Avatar';
import {Icon} from '../Icon/Icon';
import {TextInput} from '../TextInput/TextInput';
import {ComplexSelector} from '../ComplexSelector/ComplexSelector';

const originalMatches = HTMLElement.prototype.matches;
const openPopovers = new WeakSet<HTMLElement>();

beforeAll(() => {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    openPopovers.add(this);
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    openPopovers.delete(this);
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLElement.prototype as any).matches = function (selector: string) {
    if (selector === ':popover-open') {
      return openPopovers.has(this);
    }
    if (selector === ':focus-visible') {
      return this.ownerDocument.activeElement === this;
    }
    return originalMatches.call(this, selector);
  };
});

afterAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLElement.prototype as any).matches = originalMatches;
});

afterEach(() => {
  vi.useRealTimers();
});

const REASON = 'You need the Editor role';

/** A container that shows a disabled reason over its children, as a field does. */
function ReasonContainer({
  isOn,
  children,
}: {
  isOn: boolean;
  children: ReactNode;
}) {
  const reason = useTooltipInternal({
    isReason: true,
    isEnabled: isOn,
    focusTrigger: 'always',
  });
  return (
    <div ref={reason.ref}>
      {children}
      {reason.renderTooltip(REASON)}
    </div>
  );
}

/** The open tooltip layers' text. */
function shownTooltips(): string[] {
  return screen
    .queryAllByRole('tooltip', {hidden: true})
    .filter(layer => openPopovers.has(layer))
    .map(layer => layer.textContent ?? '');
}

/** A pointer entering `element` enters each of its ancestors, as in a browser. */
async function hoverAndWait(element: HTMLElement) {
  const entered: HTMLElement[] = [];
  for (
    let node: HTMLElement | null = element;
    node != null && node !== document.body;
    node = node.parentElement
  ) {
    entered.unshift(node);
  }
  for (const node of entered) {
    fireEvent.pointerEnter(node, {pointerType: 'mouse'});
    fireEvent.mouseEnter(node);
  }
  await act(async () => {
    vi.advanceTimersByTime(1000);
  });
}

async function leaveAndWait(element: HTMLElement) {
  for (
    let node: HTMLElement | null = element;
    node != null && node !== document.body;
    node = node.parentElement
  ) {
    fireEvent.pointerLeave(node, {pointerType: 'mouse'});
    fireEvent.mouseLeave(node);
  }
  await act(async () => {
    vi.advanceTimersByTime(1000);
  });
}

const cases: [string, (label: string) => ReactNode, () => HTMLElement][] = [
  [
    'Button',
    label => <Button label="Save" tooltip={label} />,
    () => screen.getByRole('button', {name: 'Save'}),
  ],
  [
    'IconButton',
    label => (
      <IconButton
        label="Settings"
        icon={<Icon icon="menu" />}
        tooltip={label}
      />
    ),
    () => screen.getByRole('button', {name: 'Settings'}),
  ],
  [
    'Link',
    label => (
      <Link href="/docs" tooltip={label}>
        Docs
      </Link>
    ),
    () => screen.getByRole('link', {name: 'Docs'}),
  ],
  [
    'Avatar',
    label => <Avatar name="Ada Lovelace" tooltip={label} />,
    () => screen.getByRole('img', {name: 'Ada Lovelace'}),
  ],
  [
    'a Tooltip-wrapped control',
    label => (
      <Tooltip content={label}>
        <button type="button">Archive</button>
      </Tooltip>
    ),
    () => screen.getByRole('button', {name: 'Archive'}),
  ],
];

describe('a disabled reason is the only tooltip its control shows', () => {
  it.each(cases)(
    '%s: under a reason, its label tooltip neither shows nor describes it; both return when the reason turns off',
    async (_name, renderControl, getControl) => {
      vi.useFakeTimers();
      const LABEL = 'The label tooltip';
      const {rerender} = render(
        <ReasonContainer isOn>{renderControl(LABEL)}</ReasonContainer>,
      );
      await act(async () => {});
      const control = getControl();

      expect(control).not.toHaveAccessibleDescription(
        expect.stringContaining(LABEL),
      );
      await hoverAndWait(control);
      expect(shownTooltips()).not.toContain(LABEL);
      expect(shownTooltips()).toContain(REASON);

      await leaveAndWait(control);
      rerender(
        <ReasonContainer isOn={false}>{renderControl(LABEL)}</ReasonContainer>,
      );
      await act(async () => {});
      const after = getControl();
      await hoverAndWait(after);
      expect(shownTooltips()).toContain(LABEL);
      expect(shownTooltips()).not.toContain(REASON);
    },
  );

  it('a Tooltip around a field disabled with a reason shows only the reason, and its label again once enabled', async () => {
    vi.useFakeTimers();
    const LABEL = 'Your display name';
    const field = (isDisabled: boolean) => (
      <Tooltip content={LABEL}>
        <TextInput
          label="Name"
          value=""
          onChange={() => {}}
          isDisabled={isDisabled}
          disabledMessage={REASON}
        />
      </Tooltip>
    );
    const {rerender} = render(field(true));
    await act(async () => {});
    const input = screen.getByRole('textbox', {name: 'Name'});
    await hoverAndWait(input);
    expect(shownTooltips()).toContain(REASON);
    expect(shownTooltips()).not.toContain(LABEL);
    expect(input).not.toHaveAccessibleDescription(
      expect.stringContaining(LABEL),
    );

    await leaveAndWait(input);
    rerender(field(false));
    await act(async () => {});
    await hoverAndWait(screen.getByRole('textbox', {name: 'Name'}));
    expect(shownTooltips()).toContain(LABEL);
    expect(shownTooltips()).not.toContain(REASON);
  });

  it('a Tooltip around a ComplexSelector disabled with a reason shows only the reason', async () => {
    vi.useFakeTimers();
    const LABEL = 'Pick the columns to show';
    render(
      <Tooltip content={LABEL}>
        <ComplexSelector
          label="View options"
          value={[]}
          isDisabled
          disabledMessage={REASON}>
          {() => <button type="button">Apply</button>}
        </ComplexSelector>
      </Tooltip>,
    );
    await act(async () => {});
    const trigger = screen.getByRole('combobox', {name: 'View options'});
    await hoverAndWait(trigger);
    expect(shownTooltips()).toContain(REASON);
    expect(shownTooltips()).not.toContain(LABEL);
    expect(trigger).not.toHaveAccessibleDescription(
      expect.stringContaining(LABEL),
    );
  });

  it("keeps a controlled label tooltip's isOpen under a reason, and shows it once the reason ends", async () => {
    vi.useFakeTimers();
    const LABEL = 'Saved a minute ago';
    const onOpenChange = vi.fn();
    function ControlledLabel() {
      const label = useTooltip({isOpen: true, onOpenChange});
      return (
        <button type="button" ref={label.ref}>
          Status
          {label.renderTooltip(LABEL)}
        </button>
      );
    }
    const {rerender} = render(
      <ReasonContainer isOn>
        <ControlledLabel />
      </ReasonContainer>,
    );
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(shownTooltips()).not.toContain(LABEL);
    expect(
      screen.getByRole('button', {name: 'Status'}),
    ).not.toHaveAccessibleDescription(expect.stringContaining(LABEL));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    rerender(
      <ReasonContainer isOn={false}>
        <ControlledLabel />
      </ReasonContainer>,
    );
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(shownTooltips()).toContain(LABEL);
  });

  // Known limit (Tooltip FR14): coverage is read when a tooltip renders or
  // would show. A child that never re-renders when a reason turns on later
  // keeps its label in the description until it renders again.
  it.todo(
    "drops a memoized child's label description when a reason turns on later without re-rendering the child",
  );
});
