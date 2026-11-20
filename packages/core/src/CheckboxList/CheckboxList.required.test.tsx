// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CheckboxList.required.test.tsx
 * @input vitest (jsdom), React Testing Library, CheckboxList, FormLayout
 * @output Checks an `isRequired` CheckboxList: the label marker follows the
 *   input fields' rules; while no box is checked the first enabled box carries
 *   native `required`, so the form does not submit; once a box is checked, no
 *   box is required and the form submits
 * @position Testing; validates the CheckboxList record's isRequired rule
 */

import {useState, type ReactElement} from 'react';
import {describe, expect, it, vi} from 'vitest';
import {act, fireEvent, render, screen, within} from '@testing-library/react';
import {CheckboxList} from './CheckboxList';
import {CheckboxListItem} from './CheckboxListItem';
import {FormLayout} from '../FormLayout/FormLayout';

const NONE: string[] = [];

function RequiredForm({
  onSubmit,
  initial = NONE,
  disabledValue,
  isGroupDisabled = false,
}: {
  onSubmit: () => void;
  initial?: string[];
  disabledValue?: string;
  isGroupDisabled?: boolean;
}): ReactElement {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <form
      aria-label="Signup"
      onSubmit={event => {
        event.preventDefault();
        onSubmit();
      }}>
      <CheckboxList
        label="Topics"
        isRequired
        isDisabled={isGroupDisabled}
        value={value}
        onChange={setValue}>
        <CheckboxListItem
          label="Design"
          value="design"
          isDisabled={disabledValue === 'design'}
        />
        <CheckboxListItem label="Engineering" value="eng" />
        <CheckboxListItem label="Research" value="research" />
      </CheckboxList>
      <button type="submit">Submit</button>
    </form>
  );
}

const box = (name: string) => screen.getByRole('checkbox', {name});
const form = () => screen.getByRole<HTMLFormElement>('form', {name: 'Signup'});

describe('CheckboxList isRequired', () => {
  it('shows the required marker after the group label', () => {
    render(
      <CheckboxList label="Topics" isRequired value={[]} onChange={() => {}}>
        <CheckboxListItem label="Design" value="design" />
      </CheckboxList>,
    );
    expect(
      within(screen.getByText('Topics')).getByText('Required'),
    ).toBeInTheDocument();
  });

  it('shows no marker where the form already makes fields required, as for every field', () => {
    render(
      <FormLayout defaultOptionality="required">
        <CheckboxList label="Topics" isRequired value={[]} onChange={() => {}}>
          <CheckboxListItem label="Design" value="design" />
        </CheckboxList>
      </FormLayout>,
    );
    expect(screen.queryByText('Required')).not.toBeInTheDocument();
    expect(box('Design')).toBeRequired();
  });

  it('with no box checked, requires the first box only and blocks submit', () => {
    const onSubmit = vi.fn();
    render(<RequiredForm onSubmit={onSubmit} />);
    expect(box('Design')).toBeRequired();
    expect(box('Engineering')).not.toBeRequired();
    expect(box('Research')).not.toBeRequired();
    expect(form().checkValidity()).toBe(false);
    form().requestSubmit();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('with one box checked, requires no box and submits', () => {
    const onSubmit = vi.fn();
    render(<RequiredForm onSubmit={onSubmit} />);
    fireEvent.click(box('Research'));
    for (const name of ['Design', 'Engineering', 'Research']) {
      expect(box(name)).not.toBeRequired();
    }
    form().requestSubmit();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('requires the first box again when the last checked box is unchecked', () => {
    render(<RequiredForm onSubmit={() => {}} initial={['eng']} />);
    expect(box('Design')).not.toBeRequired();
    fireEvent.click(box('Engineering'));
    expect(box('Design')).toBeRequired();
  });

  it('skips a disabled box: the first enabled box is required', () => {
    render(<RequiredForm onSubmit={() => {}} disabledValue="design" />);
    expect(box('Design')).not.toBeRequired();
    expect(box('Engineering')).toBeRequired();
  });

  it('requires no box in a disabled group, which the user cannot fill', () => {
    const onSubmit = vi.fn();
    render(<RequiredForm onSubmit={onSubmit} isGroupDisabled />);
    for (const name of ['Design', 'Engineering', 'Research']) {
      expect(box(name)).not.toBeRequired();
    }
    form().requestSubmit();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('works for standalone items that own their checked state', () => {
    function Standalone() {
      const [a, setA] = useState(false);
      const [b, setB] = useState(false);
      return (
        <CheckboxList label="Consent" isRequired>
          <CheckboxListItem label="Terms" isChecked={a} onCheck={setA} />
          <CheckboxListItem label="Privacy" isChecked={b} onCheck={setB} />
        </CheckboxList>
      );
    }
    render(<Standalone />);
    expect(box('Terms')).toBeRequired();
    fireEvent.click(box('Privacy'));
    expect(box('Terms')).not.toBeRequired();
    expect(box('Privacy')).not.toBeRequired();
  });

  it('requires no box once isRequired is removed', () => {
    const {rerender} = render(
      <CheckboxList label="Topics" isRequired value={[]} onChange={() => {}}>
        <CheckboxListItem label="Design" value="design" />
      </CheckboxList>,
    );
    expect(box('Design')).toBeRequired();
    rerender(
      <CheckboxList label="Topics" value={[]} onChange={() => {}}>
        <CheckboxListItem label="Design" value="design" />
      </CheckboxList>,
    );
    expect(box('Design')).not.toBeRequired();
  });

  it('moves required to the new first box after a keyed reorder', async () => {
    const items = [
      {label: 'Design', value: 'design'},
      {label: 'Engineering', value: 'eng'},
    ];
    const list = (order: typeof items) => (
      <CheckboxList label="Topics" isRequired value={[]} onChange={() => {}}>
        {order.map(item => (
          <CheckboxListItem
            key={item.value}
            label={item.label}
            value={item.value}
          />
        ))}
      </CheckboxList>
    );
    const {rerender} = render(list(items));
    expect(box('Design')).toBeRequired();
    rerender(list([...items].reverse()));
    await act(async () => {});
    expect(box('Engineering')).toBeRequired();
    expect(box('Design')).not.toBeRequired();
  });

  it('skips a read-only group: no box is required', () => {
    render(
      <CheckboxList
        label="Topics"
        isRequired
        isReadOnly
        value={[]}
        onChange={() => {}}>
        <CheckboxListItem label="Design" value="design" />
      </CheckboxList>,
    );
    expect(box('Design')).not.toBeRequired();
  });

  it('moves required to the new first box when the first item is removed', () => {
    const {rerender} = render(
      <CheckboxList label="Topics" isRequired value={[]} onChange={() => {}}>
        <CheckboxListItem label="Design" value="design" />
        <CheckboxListItem label="Engineering" value="eng" />
      </CheckboxList>,
    );
    rerender(
      <CheckboxList label="Topics" isRequired value={[]} onChange={() => {}}>
        <CheckboxListItem label="Engineering" value="eng" />
      </CheckboxList>,
    );
    expect(box('Engineering')).toBeRequired();
  });
});
