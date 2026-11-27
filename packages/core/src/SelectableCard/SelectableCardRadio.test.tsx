// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SelectableCardRadio.test.tsx
 * @input Uses SelectableCard, its internal group context, and Testing Library
 * @output Tests for a SelectableCard that a `value` makes a group member
 * @position A member takes its selection, input, name and disabled default
 *   from the group (the internal SelectableCardGroupContext). In a
 *   single-choice group it is a native radio that selects and never
 *   deselects itself.
 */

import {useMemo, useState, type ReactNode} from 'react';
import {describe, it, expect, vi} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {
  SelectableCard,
  type SelectableCardMemberProps,
  type SelectableCardProps,
} from './SelectableCard';
import {
  SelectableCardGroupContext,
  type SelectableCardGroupMembership,
} from './selectableCardGroupContext';
import {Dialog} from '../Dialog/Dialog';

/** A group the way a single-choice SelectableCardGroup provides it. */
function RadioGroup({
  value,
  onChange,
  isDisabled = false,
  children,
}: {
  value: string | null;
  onChange: (value: string) => void;
  isDisabled?: boolean;
  children: ReactNode;
}) {
  const membership = useMemo<SelectableCardGroupMembership>(
    () => ({
      inputType: 'radio',
      inputName: 'plan-radios',
      submitName: 'plan',
      isDisabled,
      isSelected: v => v === value,
      onMemberChange: (v, isSelected) => {
        if (isSelected) {
          onChange(v);
        }
      },
    }),
    [isDisabled, onChange, value],
  );
  return (
    <div role="radiogroup" aria-label="Plan">
      <SelectableCardGroupContext value={membership}>
        {children}
      </SelectableCardGroupContext>
    </div>
  );
}

/** A group the way a multiple-choice SelectableCardGroup provides it. */
function CheckboxGroup({
  value,
  onChange,
  isDisabled = false,
  children,
}: {
  value: ReadonlyArray<string>;
  onChange: (value: string[]) => void;
  isDisabled?: boolean;
  children: ReactNode;
}) {
  const membership = useMemo<SelectableCardGroupMembership>(
    () => ({
      inputType: 'checkbox',
      inputName: 'addons',
      submitName: 'addons',
      isDisabled,
      isSelected: v => value.includes(v),
      onMemberChange: (v, isSelected) =>
        onChange(
          isSelected
            ? [...value.filter(x => x !== v), v]
            : value.filter(x => x !== v),
        ),
    }),
    [isDisabled, onChange, value],
  );
  return (
    <SelectableCardGroupContext value={membership}>
      {children}
    </SelectableCardGroupContext>
  );
}

function Plans({onChange}: {onChange?: (value: string) => void}) {
  const [value, setValue] = useState('basic');
  return (
    <RadioGroup
      value={value}
      onChange={v => {
        setValue(v);
        onChange?.(v);
      }}>
      {['basic', 'pro', 'team'].map(plan => (
        <SelectableCard key={plan} value={plan} label={plan}>
          {plan}
        </SelectableCard>
      ))}
    </RadioGroup>
  );
}

describe('SelectableCard as a group radio', () => {
  it('renders a native radio in the named group', () => {
    render(<Plans />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    for (const radio of radios) {
      expect(radio).toHaveAttribute('type', 'radio');
      expect(radio).toHaveAttribute('name', 'plan-radios');
    }
    expect(screen.getByRole('radio', {name: 'pro'})).toHaveAttribute(
      'value',
      'pro',
    );
    expect(screen.getByRole('radio', {name: 'basic'})).toBeChecked();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('selects the clicked card and unchecks the others', () => {
    const onChange = vi.fn();
    render(<Plans onChange={onChange} />);
    fireEvent.click(screen.getByText('pro'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('pro');
    expect(screen.getByRole('radio', {name: 'pro'})).toBeChecked();
    expect(screen.getByRole('radio', {name: 'basic'})).not.toBeChecked();
  });

  it('never deselects itself: a click or Enter on the selected card does nothing', () => {
    const onChange = vi.fn();
    render(
      <RadioGroup value="basic" onChange={onChange}>
        <SelectableCard value="basic" label="Basic">
          Basic
        </SelectableCard>
      </RadioGroup>,
    );
    fireEvent.click(screen.getByText('Basic'));
    fireEvent.keyDown(screen.getByRole('radio'), {key: 'Enter'});
    expect(onChange).not.toHaveBeenCalled();
  });

  it('selects on Enter when unselected', () => {
    const onChange = vi.fn();
    render(
      <RadioGroup value={null} onChange={onChange}>
        <SelectableCard value="pro" label="Pro">
          Pro
        </SelectableCard>
      </RadioGroup>,
    );
    fireEvent.keyDown(screen.getByRole('radio'), {key: 'Enter'});
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('pro');
  });

  it('a disabled radio card stays focusable and does not select', () => {
    const onChange = vi.fn();
    render(
      <RadioGroup value={null} onChange={onChange}>
        <SelectableCard value="team" label="Team" isDisabled>
          Team
        </SelectableCard>
      </RadioGroup>,
    );
    const radio = screen.getByRole('radio');
    expect(radio).toHaveAttribute('aria-disabled', 'true');
    expect(radio).not.toBeDisabled();
    // Every radio card leaves the form, so the group stays one tab stop.
    expect(radio).toHaveAttribute('form', '');
    fireEvent.click(screen.getByText('Team'));
    fireEvent.keyDown(radio, {key: 'Enter'});
    expect(onChange).not.toHaveBeenCalled();
  });

  it("a disabled group disables every member, and an enabled group keeps a member's own isDisabled", () => {
    const onChange = vi.fn();
    const {rerender} = render(
      <RadioGroup value={null} onChange={onChange} isDisabled>
        <SelectableCard value="basic" label="Basic">
          Basic
        </SelectableCard>
      </RadioGroup>,
    );
    expect(screen.getByRole('radio')).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByText('Basic'));
    expect(onChange).not.toHaveBeenCalled();
    rerender(
      <RadioGroup value={null} onChange={onChange}>
        <SelectableCard value="basic" label="Basic" isDisabled>
          Basic
        </SelectableCard>
      </RadioGroup>,
    );
    expect(screen.getByRole('radio')).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByText('Basic'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("the chosen, enabled radio card submits its value under the group's name", () => {
    const {container, rerender} = render(
      <form>
        <RadioGroup value="pro" onChange={() => {}}>
          <SelectableCard value="basic" label="Basic">
            Basic
          </SelectableCard>
          <SelectableCard value="pro" label="Pro">
            Pro
          </SelectableCard>
        </RadioGroup>
      </form>,
    );
    const form = container.querySelector('form');
    if (form == null) {
      throw new Error('no form');
    }
    expect([...new FormData(form).entries()]).toEqual([['plan', 'pro']]);
    rerender(
      <form>
        <RadioGroup value="pro" onChange={() => {}}>
          <SelectableCard value="basic" label="Basic">
            Basic
          </SelectableCard>
          <SelectableCard value="pro" label="Pro" isDisabled>
            Pro
          </SelectableCard>
        </RadioGroup>
      </form>,
    );
    expect([...new FormData(form).entries()]).toEqual([]);
  });

  it('keeps the checkbox without a group', () => {
    render(
      <SelectableCard label="A" isSelected={false} onChange={() => {}}>
        A
      </SelectableCard>,
    );
    expect(screen.getByRole('checkbox')).toHaveAttribute('type', 'checkbox');
  });
});

describe('SelectableCard as a group checkbox', () => {
  it('toggles its value in the group and submits it while checked', () => {
    const onChange = vi.fn();
    const {container} = render(
      <form>
        <CheckboxGroup value={['backup']} onChange={onChange}>
          <SelectableCard value="backup" label="Backup">
            Backup
          </SelectableCard>
          <SelectableCard value="support" label="Support">
            Support
          </SelectableCard>
        </CheckboxGroup>
      </form>,
    );
    const backup = screen.getByRole('checkbox', {name: 'Backup'});
    expect(backup).toBeChecked();
    expect(backup).toHaveAttribute('name', 'addons');
    const form = container.querySelector('form');
    if (form == null) {
      throw new Error('no form');
    }
    expect([...new FormData(form).entries()]).toEqual([['addons', 'backup']]);
    fireEvent.click(screen.getByText('Support'));
    expect(onChange).toHaveBeenLastCalledWith(['backup', 'support']);
    fireEvent.click(screen.getByText('Backup'));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('a disabled checkbox member submits nothing, whichever side disables it', () => {
    const {container, rerender} = render(
      <form>
        <CheckboxGroup value={['backup']} onChange={() => {}}>
          <SelectableCard value="backup" label="Backup" isDisabled>
            Backup
          </SelectableCard>
        </CheckboxGroup>
      </form>,
    );
    const form = container.querySelector('form');
    if (form == null) {
      throw new Error('no form');
    }
    expect(screen.getByRole('checkbox', {name: 'Backup'})).toBeChecked();
    expect([...new FormData(form).entries()]).toEqual([]);
    rerender(
      <form>
        <CheckboxGroup value={['backup']} onChange={() => {}} isDisabled>
          <SelectableCard value="backup" label="Backup">
            Backup
          </SelectableCard>
        </CheckboxGroup>
      </form>,
    );
    expect([...new FormData(form).entries()]).toEqual([]);
  });
});

describe('SelectableCard membership', () => {
  it('a card without a value stays standalone inside a group', () => {
    const onChange = vi.fn();
    const onCardChange = vi.fn();
    render(
      <RadioGroup value={null} onChange={onChange}>
        <SelectableCard
          label="Alone"
          isSelected={false}
          onChange={onCardChange}>
          Alone
        </SelectableCard>
      </RadioGroup>,
    );
    expect(screen.getByRole('checkbox', {name: 'Alone'})).not.toHaveAttribute(
      'name',
    );
    fireEvent.click(screen.getByText('Alone'));
    expect(onCardChange).toHaveBeenCalledWith(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a card with a value outside a group warns in development and stays unselected and inert', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <SelectableCard value="pro" label="Pro">
        Pro
      </SelectableCard>,
    );
    const input = screen.getByRole('checkbox', {name: 'Pro'});
    expect(input).not.toBeChecked();
    expect(input).not.toHaveAttribute('name');
    fireEvent.click(screen.getByText('Pro'));
    fireEvent.keyDown(input, {key: 'Enter'});
    expect(input).not.toBeChecked();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('SelectableCardGroup'),
    );
    warn.mockRestore();
  });

  it('membership stops at a layer: a card with a value in a layer inside a group is not a member', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onChange = vi.fn();
    render(
      <RadioGroup value="inner" onChange={onChange}>
        <Dialog isOpen isInline onOpenChange={() => {}}>
          <SelectableCard value="inner" label="Inner">
            Inner
          </SelectableCard>
        </Dialog>
      </RadioGroup>,
    );
    const input = screen.getByRole('checkbox', {name: 'Inner'});
    expect(input).not.toBeChecked();
    fireEvent.click(screen.getByText('Inner'));
    expect(onChange).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('keeps SelectableCardProps an interface that callers extend and pass back', () => {
    interface TrackedCardProps extends SelectableCardProps {
      trackingID: string;
    }
    const tracked: TrackedCardProps = {
      label: 'A',
      isSelected: false,
      onChange: () => {},
      trackingID: 'a',
    };
    const {trackingID, ...card} = tracked;
    const withoutVariant: Omit<SelectableCardProps, 'variant'> = card;
    const member: SelectableCardMemberProps = {label: 'B', value: 'b'};
    render(
      <>
        <SelectableCard {...withoutVariant}>{trackingID}</SelectableCard>
        <CheckboxGroup value={[]} onChange={() => {}}>
          <SelectableCard {...member}>B</SelectableCard>
        </CheckboxGroup>
      </>,
    );
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  it('types a card as standalone or as a member, never both', () => {
    const standalone = (
      <SelectableCard label="A" isSelected onChange={() => {}} />
    );
    const member = <SelectableCard label="B" value="b" />;
    // @ts-expect-error a member takes its selection from the group
    const both = <SelectableCard label="C" value="c" isSelected />;
    // @ts-expect-error a standalone card needs isSelected and onChange
    const neither = <SelectableCard label="D" />;
    expect([standalone, member, both, neither]).toHaveLength(4);
  });
});
