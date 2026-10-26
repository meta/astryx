// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file InputGroup.test.tsx
 * @input Uses vitest, @testing-library/react, InputGroup, TextInput, NumberInput, DateInput components
 * @output Unit tests for InputGroup
 * @position Testing; validates InputGroup component implementation
 *
 * SYNC: When InputGroup component changes, update tests to match new behavior
 */

import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {InputGroup} from './InputGroup';
import {InputGroupText} from './InputGroupText';
import {TextInput} from '../TextInput';
import {NumberInput} from '../NumberInput';
import {DateInput} from '../DateInput';
import {Typeahead} from '../Typeahead';
import type {SearchableItem, SearchSource} from '../Typeahead';
import {Selector} from '../Selector';
import {MultiSelector} from '../MultiSelector';
import {TimeInput} from '../TimeInput';
import {Button} from '../Button';

const fruits: SearchableItem[] = [
  {id: '1', label: 'Apple'},
  {id: '2', label: 'Banana'},
];

const fruitSource: SearchSource = {
  search: (query: string) =>
    fruits.filter(f => f.label.toLowerCase().includes(query.toLowerCase())),
  bootstrap: () => fruits,
};

describe('InputGroup', () => {
  it('names the group via the label element (forms-14)', () => {
    render(
      <InputGroup label="Price">
        <InputGroupText>$</InputGroupText>
        <TextInput label="Amount" isLabelHidden value="" onChange={() => {}} />
      </InputGroup>,
    );

    // The group is named by the field label via aria-labelledby (not a
    // duplicated aria-label). The label is rendered as a <span> (not a literal
    // <label>, which can't name a group) and carries no orphaned htmlFor.
    const group = screen.getByRole('group', {name: 'Price'});
    expect(group).toBeInTheDocument();
    expect(group).not.toHaveAttribute('aria-label');
    const label = screen.getByText('Price');
    expect(label.tagName).toBe('SPAN');
    expect(label.closest('label')).toBeNull();
    expect(label).not.toHaveAttribute('for');
    expect(group.getAttribute('aria-labelledby')).toBe(label.id);
  });

  it('associates group description and status through aria-describedby', () => {
    render(
      <InputGroup
        label="Price"
        description="Enter the amount in USD"
        status={{type: 'error', message: 'Price is required'}}>
        <InputGroupText>$</InputGroupText>
        <TextInput label="Amount" isLabelHidden value="" onChange={() => {}} />
      </InputGroup>,
    );

    const group = screen.getByRole('group', {name: 'Price'});
    const describedBy = group.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(describedBy!.split(' ')).toHaveLength(2);
    expect(describedBy).toContain(
      screen.getByText('Enter the amount in USD').id,
    );
    expect(describedBy).toContain(screen.getByText('Price is required').id);
  });

  it('labels grouped TextInput from the group and inner input labels', () => {
    render(
      <InputGroup
        label="Price"
        description="Enter the amount in USD"
        status={{type: 'error', message: 'Price is required'}}>
        <InputGroupText>$</InputGroupText>
        <TextInput label="Amount" isLabelHidden value="" onChange={() => {}} />
      </InputGroup>,
    );

    const group = screen.getByRole('group', {name: 'Price'});
    const groupLabelID = group.getAttribute('aria-labelledby');
    const describedBy = group.getAttribute('aria-describedby');
    const input = screen.getByRole('textbox', {name: 'Price Amount'});
    const labelledByIDs =
      input.getAttribute('aria-labelledby')?.split(' ') ?? [];

    expect(labelledByIDs).toHaveLength(2);
    expect(labelledByIDs[0]).toBe(groupLabelID);
    expect(document.getElementById(labelledByIDs[1])).toHaveTextContent(
      'Amount',
    );
    expect(input).not.toHaveAttribute('aria-label');
    expect(input).toHaveAttribute('aria-describedby', describedBy);
  });

  it('labels grouped Typeahead from the group and inner input labels', () => {
    const {container} = render(
      <InputGroup label="Favorite fruit" description="Pick one fruit">
        <InputGroupText>Fruit</InputGroupText>
        <Typeahead
          label="Selection"
          isLabelHidden
          searchSource={fruitSource}
          value={null}
          onChange={() => {}}
        />
      </InputGroup>,
    );

    const group = screen.getByRole('group', {name: 'Favorite fruit'});
    const groupLabelID = group.getAttribute('aria-labelledby');
    const input = screen.getByRole('combobox', {
      name: 'Favorite fruit Selection',
    });
    const labelledByIDs =
      input.getAttribute('aria-labelledby')?.split(' ') ?? [];

    expect(labelledByIDs).toHaveLength(2);
    expect(labelledByIDs[0]).toBe(groupLabelID);
    expect(document.getElementById(labelledByIDs[1])).toHaveTextContent(
      'Selection',
    );
    expect(input).not.toHaveAttribute('aria-label');
    expect(input).toHaveAttribute(
      'aria-describedby',
      group.getAttribute('aria-describedby'),
    );
    expect(container.querySelectorAll('.astryx-field')).toHaveLength(1);
  });

  it('labels grouped NumberInput from the group and inner input labels', () => {
    render(
      <InputGroup label="Budget" description="Whole dollars only">
        <InputGroupText>$</InputGroupText>
        <NumberInput
          label="Amount"
          isLabelHidden
          value={null}
          onChange={() => {}}
        />
      </InputGroup>,
    );

    const group = screen.getByRole('group', {name: 'Budget'});
    const groupLabelID = group.getAttribute('aria-labelledby');
    const input = screen.getByRole('spinbutton', {name: 'Budget Amount'});
    const labelledByIDs =
      input.getAttribute('aria-labelledby')?.split(' ') ?? [];

    expect(labelledByIDs).toHaveLength(2);
    expect(labelledByIDs[0]).toBe(groupLabelID);
    expect(document.getElementById(labelledByIDs[1])).toHaveTextContent(
      'Amount',
    );
    expect(input).not.toHaveAttribute('aria-label');
    expect(input).toHaveAttribute(
      'aria-describedby',
      group.getAttribute('aria-describedby'),
    );
  });

  it('labels grouped DateInput from the group and inner input labels', () => {
    render(
      <InputGroup label="Deadline" description="Use business days">
        <InputGroupText>Due</InputGroupText>
        <DateInput label="Date" isLabelHidden onChange={() => {}} />
      </InputGroup>,
    );

    const group = screen.getByRole('group', {name: 'Deadline'});
    const groupLabelID = group.getAttribute('aria-labelledby');
    const input = screen.getByRole('combobox', {name: 'Deadline Date'});
    const labelledByIDs =
      input.getAttribute('aria-labelledby')?.split(' ') ?? [];

    expect(labelledByIDs).toHaveLength(2);
    expect(labelledByIDs[0]).toBe(groupLabelID);
    expect(document.getElementById(labelledByIDs[1])).toHaveTextContent('Date');
    expect(input).toHaveAttribute('aria-haspopup', 'dialog');
    expect(input).toHaveAttribute(
      'aria-describedby',
      group.getAttribute('aria-describedby'),
    );
  });

  it('labels grouped Selector from the group and selector labels', () => {
    render(
      <InputGroup label="Destination" description="Where alerts are sent">
        <InputGroupText>#</InputGroupText>
        <Selector
          label="Channel"
          isLabelHidden
          options={['General', 'Support']}
          placeholder="Choose channel"
        />
      </InputGroup>,
    );

    const group = screen.getByRole('group', {name: 'Destination'});
    const groupLabelID = group.getAttribute('aria-labelledby');
    const trigger = screen.getByRole('combobox', {
      name: 'Destination Channel',
    });
    const labelledByIDs =
      trigger.getAttribute('aria-labelledby')?.split(' ') ?? [];

    expect(labelledByIDs).toHaveLength(2);
    expect(labelledByIDs[0]).toBe(groupLabelID);
    expect(document.getElementById(labelledByIDs[1])).toHaveTextContent(
      'Channel',
    );
    expect(trigger).not.toHaveAttribute('aria-label');
    expect(trigger).toHaveAttribute(
      'aria-describedby',
      group.getAttribute('aria-describedby'),
    );
  });

  it('labels grouped MultiSelector from the group and selector labels', () => {
    render(
      <InputGroup label="Destinations" description="Where alerts are sent">
        <InputGroupText>#</InputGroupText>
        <MultiSelector
          label="Channels"
          isLabelHidden
          options={['General', 'Support']}
          value={[]}
          onChange={() => {}}
          placeholder="Choose channels"
        />
      </InputGroup>,
    );

    const group = screen.getByRole('group', {name: 'Destinations'});
    const groupLabelID = group.getAttribute('aria-labelledby');
    const trigger = screen.getByRole('combobox', {
      name: 'Destinations Channels',
    });
    const labelledByIDs =
      trigger.getAttribute('aria-labelledby')?.split(' ') ?? [];

    expect(labelledByIDs).toHaveLength(2);
    expect(labelledByIDs[0]).toBe(groupLabelID);
    expect(document.getElementById(labelledByIDs[1])).toHaveTextContent(
      'Channels',
    );
    expect(trigger).not.toHaveAttribute('aria-label');
    expect(trigger).toHaveAttribute(
      'aria-describedby',
      group.getAttribute('aria-describedby'),
    );
  });

  it('keeps grouped DateInput calendar button and popover semantics', () => {
    render(
      <InputGroup label="Deadline">
        <InputGroupText>Due</InputGroupText>
        <DateInput label="Date" isLabelHidden onChange={() => {}} />
      </InputGroup>,
    );

    expect(
      screen.getByRole('button', {name: 'Open calendar'}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', {name: 'Deadline Date'}),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('propagates disabled state to all compatible inputs and Button addons', () => {
    const onChange = () => {};
    render(
      <>
        <InputGroup label="Group" isDisabled>
          <TextInput label="Text" value="" onChange={onChange} />
          <Button label="Save" tooltip="Save" />
        </InputGroup>
        <InputGroup label="Group" isDisabled>
          <NumberInput label="Amount" value={2} onChange={onChange} />
        </InputGroup>
        <InputGroup label="Group" isDisabled>
          <Selector label="Single fruit" options={['Apple', 'Banana']} />
        </InputGroup>
        <InputGroup label="Group" isDisabled>
          <MultiSelector
            label="Multiple fruits"
            options={['Apple', 'Banana']}
            value={[]}
            onChange={onChange}
          />
        </InputGroup>
        <InputGroup label="Group" isDisabled>
          <DateInput label="Date" presentation="popover" onChange={onChange} />
        </InputGroup>
        <InputGroup label="Group" isDisabled>
          <TimeInput
            label="Time"
            presentation="text-input"
            onChange={onChange}
          />
        </InputGroup>
        <InputGroup label="Group" isDisabled>
          <Typeahead
            label="Fruit"
            value={null}
            searchSource={fruitSource}
            onChange={onChange}
            disabledMessage="Unavailable"
          />
        </InputGroup>
      </>,
    );

    for (const group of screen.getAllByRole('group', {name: 'Group'})) {
      expect(group).toHaveAttribute('aria-disabled', 'true');
    }
    for (const name of [
      'Group Text',
      'Group Amount',
      'Group Single fruit',
      'Group Multiple fruits',
      'Group Date',
      'Group Time',
      'Group Fruit',
    ]) {
      expect(screen.getByLabelText(name)).toHaveAttribute(
        'aria-disabled',
        'true',
      );
    }
    expect(screen.getByRole('button', {name: 'Save'})).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('does not let nested groups or children opt out of ancestor disablement', () => {
    render(
      <InputGroup label="Outer" isDisabled>
        <InputGroup label="Inner" isDisabled={false}>
          <TextInput
            label="Text"
            value=""
            isDisabled={false}
            onChange={() => {}}
          />
        </InputGroup>
      </InputGroup>,
    );

    expect(screen.getByRole('group', {name: 'Inner'})).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('textbox', {name: 'Inner Text'})).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('re-enables inherited children without re-enabling explicitly disabled children', () => {
    function Example({disabled}: {disabled: boolean}) {
      return (
        <InputGroup label="Group" isDisabled={disabled}>
          <TextInput label="Text" value="" onChange={() => {}} />
          <TextInput label="Explicit" value="" isDisabled />
        </InputGroup>
      );
    }
    const {rerender} = render(<Example disabled />);
    expect(screen.getByRole('textbox', {name: 'Group Text'})).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    rerender(<Example disabled={false} />);
    expect(screen.getByRole('group', {name: 'Group'})).not.toHaveAttribute(
      'aria-disabled',
    );
    expect(
      screen.getByRole('textbox', {name: 'Group Text'}),
    ).not.toHaveAttribute('aria-disabled');
    expect(
      screen.getByRole('textbox', {name: 'Group Explicit'}),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('renders the visible label', () => {
    render(
      <InputGroup label="Price">
        <TextInput label="Amount" isLabelHidden value="" onChange={() => {}} />
      </InputGroup>,
    );

    expect(screen.getByText('Price')).toBeInTheDocument();
  });

  it('renders addon text', () => {
    render(
      <InputGroup label="Price">
        <InputGroupText>$</InputGroupText>
        <TextInput label="Amount" isLabelHidden value="" onChange={() => {}} />
      </InputGroup>,
    );

    expect(screen.getByText('$')).toBeInTheDocument();
  });

  it('renders the input', () => {
    render(
      <InputGroup label="Price">
        <TextInput label="Amount" isLabelHidden value="" onChange={() => {}} />
      </InputGroup>,
    );

    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('renders prefix and suffix addons', () => {
    render(
      <InputGroup label="Website">
        <InputGroupText>https://</InputGroupText>
        <TextInput label="URL" isLabelHidden value="" onChange={() => {}} />
        <InputGroupText>.com</InputGroupText>
      </InputGroup>,
    );

    expect(screen.getByText('https://')).toBeInTheDocument();
    expect(screen.getByText('.com')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('applies data-testid', () => {
    render(
      <InputGroup label="Price" data-testid="price-group">
        <TextInput label="Amount" isLabelHidden value="" onChange={() => {}} />
      </InputGroup>,
    );

    expect(screen.getByTestId('price-group')).toBeInTheDocument();
  });

  it('renders description text', () => {
    render(
      <InputGroup label="Price" description="Enter the price in USD">
        <TextInput label="Amount" isLabelHidden value="" onChange={() => {}} />
      </InputGroup>,
    );

    expect(screen.getByText('Enter the price in USD')).toBeInTheDocument();
  });

  it('renders status message', () => {
    render(
      <InputGroup
        label="Price"
        status={{type: 'error', message: 'Price is required'}}>
        <TextInput label="Amount" isLabelHidden value="" onChange={() => {}} />
      </InputGroup>,
    );

    expect(screen.getByText('Price is required')).toBeInTheDocument();
  });

  it('renders with hidden label', () => {
    render(
      <InputGroup label="Price" isLabelHidden>
        <TextInput label="Amount" isLabelHidden value="" onChange={() => {}} />
      </InputGroup>,
    );

    expect(screen.getByText('Price')).toBeInTheDocument();
    expect(screen.getByRole('group')).toBeInTheDocument();
  });

  it('renders with different sizes', () => {
    const {rerender} = render(
      <InputGroup label="Price" size="sm">
        <TextInput label="Amount" isLabelHidden value="" onChange={() => {}} />
      </InputGroup>,
    );
    expect(screen.getByRole('textbox')).toBeInTheDocument();

    rerender(
      <InputGroup label="Price" size="lg">
        <TextInput label="Amount" isLabelHidden value="" onChange={() => {}} />
      </InputGroup>,
    );
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });
});
