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
import {memo, type ReactNode} from 'react';
import {useTooltip, useTooltipInternal} from './useTooltip';
import {Tooltip} from './Tooltip';
import {Button} from '../Button/Button';
import {IconButton} from '../IconButton/IconButton';
import {Link} from '../Link/Link';
import {Avatar} from '../Avatar/Avatar';
import {Icon} from '../Icon/Icon';
import {TextInput} from '../TextInput/TextInput';
import {ComplexSelector} from '../ComplexSelector/ComplexSelector';
import {Switch} from '../Switch/Switch';

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

/** A label tooltip its caller holds open with `isOpen`. */
function ControlledLabel({label, onHide}: {label: string; onHide: () => void}) {
  const tooltip = useTooltip({isOpen: true, onHide});
  return (
    <button type="button" ref={tooltip.ref}>
      Status
      {tooltip.renderTooltip(label)}
    </button>
  );
}

/** A child that never re-renders on its parent's render. */
const MemoButton = memo(function MemoButton({label}: {label: string}) {
  return <Button label="Save" tooltip={label} />;
});

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
    const onHide = vi.fn();
    const {rerender} = render(
      <ReasonContainer isOn>
        <ControlledLabel label={LABEL} onHide={onHide} />
      </ReasonContainer>,
    );
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(shownTooltips()).not.toContain(LABEL);
    expect(
      screen.getByRole('button', {name: 'Status'}),
    ).not.toHaveAccessibleDescription(expect.stringContaining(LABEL));
    expect(onHide).not.toHaveBeenCalled();

    rerender(
      <ReasonContainer isOn={false}>
        <ControlledLabel label={LABEL} onHide={onHide} />
      </ReasonContainer>,
    );
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(shownTooltips()).toContain(LABEL);
  });

  it('closes an open label tooltip when a reason turns on, and restores it when the reason turns off', async () => {
    vi.useFakeTimers();
    const LABEL = 'The label tooltip';
    const {rerender} = render(
      <ReasonContainer isOn={false}>
        <Button label="Save" tooltip={LABEL} />
      </ReasonContainer>,
    );
    await act(async () => {});
    const button = screen.getByRole('button', {name: 'Save'});
    fireEvent.pointerEnter(button, {pointerType: 'mouse'});
    fireEvent.mouseEnter(button);
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(shownTooltips()).toContain(LABEL);

    rerender(
      <ReasonContainer isOn>
        <Button label="Save" tooltip={LABEL} />
      </ReasonContainer>,
    );
    await act(async () => {});
    expect(shownTooltips()).not.toContain(LABEL);
    expect(button).not.toHaveAccessibleDescription(
      expect.stringContaining(LABEL),
    );

    rerender(
      <ReasonContainer isOn={false}>
        <Button label="Save" tooltip={LABEL} />
      </ReasonContainer>,
    );
    await act(async () => {});
    expect(button).toHaveAccessibleDescription(expect.stringContaining(LABEL));
  });

  it("drops a memoized child's label description when a reason turns on later, without re-rendering the child", async () => {
    const LABEL = 'The label tooltip';
    const child = <MemoButton label={LABEL} />;
    const {rerender} = render(
      <ReasonContainer isOn={false}>{child}</ReasonContainer>,
    );
    await act(async () => {});
    const button = screen.getByRole('button', {name: 'Save'});
    expect(button).toHaveAccessibleDescription(expect.stringContaining(LABEL));
    rerender(<ReasonContainer isOn>{child}</ReasonContainer>);
    await act(async () => {});
    expect(button).not.toHaveAccessibleDescription(
      expect.stringContaining(LABEL),
    );
  });

  it("keeps a field's own status message under its disabled reason", async () => {
    render(
      <TextInput
        label="Name"
        value="ada"
        onChange={() => {}}
        isDisabled
        disabledMessage={REASON}
        status={{type: 'error', message: 'Name is taken'}}
        statusVariant="tooltip"
      />,
    );
    await act(async () => {});
    expect(
      screen.getByRole('textbox', {name: 'Name'}),
    ).toHaveAccessibleDescription(expect.stringContaining('Name is taken'));
  });

  it("shows a Switch's help InfoTip on a press, under the Switch's disabled reason", async () => {
    vi.useFakeTimers();
    const HELP = 'Sends a daily summary';
    const {container} = render(
      <Switch
        label="Digest"
        value={false}
        onChange={() => {}}
        isDisabled
        disabledMessage={REASON}
        labelTooltip={HELP}
      />,
    );
    await act(async () => {});
    const help = container.querySelector<HTMLElement>('button[aria-expanded]');
    expect(help).not.toBeNull();
    fireEvent.click(help as HTMLElement);
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(help).toHaveAttribute('aria-expanded', 'true');
    expect(shownTooltips()).toContain(HELP);
  });

  it('a Tooltip around a region that holds a field disabled with a reason still opens on another control', async () => {
    vi.useFakeTimers();
    const LABEL = 'Region help';
    render(
      <Tooltip content={LABEL}>
        <div>
          <TextInput
            label="Name"
            value=""
            onChange={() => {}}
            isDisabled
            disabledMessage={REASON}
          />
          <button type="button">Other</button>
        </div>
      </Tooltip>,
    );
    await act(async () => {});
    await hoverAndWait(screen.getByRole('button', {name: 'Other'}));
    expect(shownTooltips()).toContain(LABEL);
  });
});
