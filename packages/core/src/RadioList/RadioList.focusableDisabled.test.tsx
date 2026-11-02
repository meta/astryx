// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RadioList.focusableDisabled.test.tsx
 * @input Uses RadioList, RadioListItem, Testing Library
 * @output Tests that disabled radios stay focusable (spec:AST-085 FR1–FR4)
 *   and that arrow keys skip individually disabled options (RadioList FR4)
 * @position Colocated behavior test for RadioList and RadioListItem
 */

import {describe, it, expect, vi} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {renderToString} from 'react-dom/server';
import {RadioList} from './RadioList';
import {RadioListItem} from './RadioListItem';

const radio = (name: string) =>
  screen.getByRole<HTMLInputElement>('radio', {name, hidden: true});

describe('RadioList: disabled radios stay focusable (spec:AST-085)', () => {
  it('renders an individually disabled option with aria-disabled and no native disabled', () => {
    render(
      <RadioList label="Delivery" value="standard" onChange={() => {}}>
        <RadioListItem label="Standard" value="standard" />
        <RadioListItem label="Express" value="express" isDisabled />
      </RadioList>,
    );
    expect(radio('Express')).not.toHaveAttribute('disabled');
    expect(radio('Express')).toHaveAttribute('aria-disabled', 'true');
    expect(radio('Standard')).not.toHaveAttribute('aria-disabled');
  });

  it('renders every radio of a group disabled without a reason with aria-disabled and no native disabled', () => {
    render(
      <RadioList
        label="Delivery"
        value="standard"
        onChange={() => {}}
        isDisabled>
        <RadioListItem label="Standard" value="standard" />
        <RadioListItem label="Express" value="express" />
      </RadioList>,
    );
    for (const name of ['Standard', 'Express']) {
      expect(radio(name)).not.toHaveAttribute('disabled');
      expect(radio(name)).toHaveAttribute('aria-disabled', 'true');
    }
  });

  it('neither selects nor runs a caller onClick when a disabled option is clicked', () => {
    const onChange = vi.fn();
    const onClick = vi.fn();
    render(
      <RadioList label="Delivery" value="standard" onChange={onChange}>
        <RadioListItem label="Standard" value="standard" />
        <RadioListItem
          label="Express"
          value="express"
          isDisabled
          onClick={onClick}
        />
      </RadioList>,
    );
    fireEvent.click(radio('Express'));
    expect(onChange).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
    expect(radio('Standard')).toBeChecked();
  });

  it('keeps focus on a radio when its group becomes disabled', () => {
    const {rerender} = render(
      <RadioList label="Delivery" value="standard" onChange={() => {}}>
        <RadioListItem label="Standard" value="standard" />
      </RadioList>,
    );
    radio('Standard').focus();
    rerender(
      <RadioList
        label="Delivery"
        value="standard"
        onChange={() => {}}
        isDisabled>
        <RadioListItem label="Standard" value="standard" />
      </RadioList>,
    );
    expect(radio('Standard')).toHaveFocus();
    expect(radio('Standard')).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('RadioList: arrow keys skip individually disabled options', () => {
  function renderDelivery(
    onChange: (value: string) => void,
    props: {value?: string; dir?: 'rtl'} = {},
  ) {
    return render(
      <RadioList
        label="Delivery"
        value={props.value ?? 'standard'}
        onChange={onChange}
        controlStyle={props.dir === 'rtl' ? {direction: 'rtl'} : undefined}>
        <RadioListItem label="Standard" value="standard" />
        <RadioListItem label="Express" value="express" isDisabled />
        <RadioListItem label="Pickup" value="pickup" />
      </RadioList>,
    );
  }

  it('moves past a disabled option to the next enabled one and selects it', () => {
    const onChange = vi.fn();
    renderDelivery(onChange);
    radio('Standard').focus();
    const handled = !fireEvent.keyDown(radio('Standard'), {key: 'ArrowDown'});
    expect(handled).toBe(true);
    expect(radio('Pickup')).toHaveFocus();
    expect(onChange).toHaveBeenCalledWith('pickup');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('moves past a disabled option backward, with ArrowUp', () => {
    const onChange = vi.fn();
    renderDelivery(onChange, {value: 'pickup'});
    radio('Pickup').focus();
    fireEvent.keyDown(radio('Pickup'), {key: 'ArrowUp'});
    expect(radio('Standard')).toHaveFocus();
    expect(onChange).toHaveBeenCalledWith('standard');
  });

  it('follows the inline direction: in RTL, ArrowLeft moves forward', () => {
    const onChange = vi.fn();
    renderDelivery(onChange, {dir: 'rtl'});
    radio('Standard').focus();
    fireEvent.keyDown(radio('Standard'), {key: 'ArrowLeft'});
    expect(radio('Pickup')).toHaveFocus();
    expect(onChange).toHaveBeenCalledWith('pickup');
  });

  it('moves every arrow key itself once an option is disabled, so each engine mirrors the same way', () => {
    // WebKit does not mirror horizontal arrows in a right-to-left radio group;
    // with a disabled option RadioList owns every arrow move, so ArrowRight
    // moves backward in RTL even where the move lands on an enabled option.
    const onChange = vi.fn();
    renderDelivery(onChange, {dir: 'rtl'});
    radio('Standard').focus();
    // Backward from the first option wraps to Pickup, which is enabled.
    const handled = !fireEvent.keyDown(radio('Standard'), {key: 'ArrowRight'});
    expect(handled).toBe(true);
    expect(radio('Pickup')).toHaveFocus();
    expect(onChange).toHaveBeenCalledWith('pickup');
  });

  it('leaves arrow keys to the browser in a group with no disabled option', () => {
    const onChange = vi.fn();
    render(
      <RadioList label="Delivery" value="standard" onChange={onChange}>
        <RadioListItem label="Standard" value="standard" />
        <RadioListItem label="Pickup" value="pickup" />
      </RadioList>,
    );
    radio('Standard').focus();
    const handled = !fireEvent.keyDown(radio('Standard'), {key: 'ArrowDown'});
    expect(handled).toBe(false);
  });

  it('keeps focus where it is when every other option is disabled', () => {
    const onChange = vi.fn();
    render(
      <RadioList
        label="Delivery"
        value="standard"
        onChange={onChange}
        isDisabled>
        <RadioListItem label="Standard" value="standard" />
        <RadioListItem label="Express" value="express" />
      </RadioList>,
    );
    radio('Standard').focus();
    const handled = !fireEvent.keyDown(radio('Standard'), {key: 'ArrowDown'});
    expect(handled).toBe(true);
    expect(radio('Standard')).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores arrow keys held with a modifier', () => {
    const onChange = vi.fn();
    renderDelivery(onChange);
    radio('Standard').focus();
    const handled = !fireEvent.keyDown(radio('Standard'), {
      key: 'ArrowDown',
      ctrlKey: true,
    });
    expect(handled).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('runs a caller onKeyDown as well', () => {
    const onKeyDown = vi.fn();
    render(
      <RadioList
        label="Delivery"
        value="standard"
        onChange={() => {}}
        onKeyDown={onKeyDown}>
        <RadioListItem label="Standard" value="standard" />
        <RadioListItem label="Express" value="express" isDisabled />
      </RadioList>,
    );
    fireEvent.keyDown(radio('Standard'), {key: 'ArrowDown'});
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });
});

describe('RadioList: entry Tab stop with disabled options', () => {
  function renderEmpty() {
    return render(
      <>
        <button type="button">before</button>
        <RadioList label="Delivery" value="" onChange={() => {}}>
          <RadioListItem label="Standard" value="standard" isDisabled />
          <RadioListItem label="Express" value="express" />
          <RadioListItem label="Pickup" value="pickup" />
          <RadioListItem label="Locker" value="locker" isDisabled />
        </RadioList>
        <button type="button">after</button>
      </>,
    );
  }

  it('lands forward entry on the first enabled option, past a disabled first one', () => {
    renderEmpty();
    screen.getByText('before').focus();
    radio('Standard').focus();
    expect(radio('Express')).toHaveFocus();
  });

  it('lands backward entry on the last enabled option, past a disabled last one', () => {
    renderEmpty();
    screen.getByText('after').focus();
    radio('Locker').focus();
    expect(radio('Pickup')).toHaveFocus();
  });

  it('treats a value that matches no option as no selection', () => {
    render(
      <>
        <button type="button">before</button>
        <RadioList label="Delivery" value="missing" onChange={() => {}}>
          <RadioListItem label="Standard" value="standard" isDisabled />
          <RadioListItem label="Express" value="express" />
          <RadioListItem label="Pickup" value="pickup" />
        </RadioList>
      </>,
    );
    screen.getByText('before').focus();
    radio('Standard').focus();
    expect(radio('Express')).toHaveFocus();
  });

  it('enters a wholly disabled group on its first radio', () => {
    render(
      <>
        <button type="button">before</button>
        <RadioList label="Delivery" value="" onChange={() => {}} isDisabled>
          <RadioListItem label="Standard" value="standard" />
          <RadioListItem label="Express" value="express" />
          <RadioListItem label="Pickup" value="pickup" />
        </RadioList>
      </>,
    );
    screen.getByText('before').focus();
    radio('Express').focus();
    expect(radio('Standard')).toHaveFocus();
  });
});

describe('RadioList: disabled values are not submitted (spec:AST-085 FR3)', () => {
  function formOf(container: HTMLElement) {
    return container.querySelector('form')!;
  }

  it('submits nothing from a group disabled without a reason', () => {
    const {container} = render(
      <form>
        <RadioList
          label="Delivery"
          htmlName="delivery"
          value="standard"
          onChange={() => {}}
          isDisabled>
          <RadioListItem label="Standard" value="standard" />
        </RadioList>
      </form>,
    );
    expect([...new FormData(formOf(container)).keys()]).toEqual([]);
  });

  it('keeps an unselected disabled option in the same form group as the others', () => {
    const {container} = render(
      <form>
        <RadioList
          label="Delivery"
          htmlName="delivery"
          value="standard"
          onChange={() => {}}>
          <RadioListItem label="Standard" value="standard" />
          <RadioListItem label="Express" value="express" isDisabled />
        </RadioList>
      </form>,
    );
    const form = formOf(container);
    expect(radio('Standard').form).toBe(form);
    expect(radio('Express').form).toBe(form);
    expect(new FormData(form).get('delivery')).toBe('standard');
  });

  it('does not block a required submit when every option is disabled and none is selected', () => {
    const {container} = render(
      <form>
        <RadioList
          label="Delivery"
          htmlName="delivery"
          value=""
          onChange={() => {}}
          isRequired>
          <RadioListItem label="Standard" value="standard" isDisabled />
          <RadioListItem label="Express" value="express" isDisabled />
        </RadioList>
      </form>,
    );
    expect(formOf(container).checkValidity()).toBe(true);
  });

  it('still requires a choice while any option is enabled', () => {
    const {container} = render(
      <form>
        <RadioList
          label="Delivery"
          htmlName="delivery"
          value=""
          onChange={() => {}}
          isRequired>
          <RadioListItem label="Standard" value="standard" isDisabled />
          <RadioListItem label="Express" value="express" />
        </RadioList>
      </form>,
    );
    expect(formOf(container).checkValidity()).toBe(false);
  });

  it('keeps two disabled groups that share an htmlName in different forms apart', () => {
    render(
      <>
        <form aria-label="First">
          <RadioList
            label="First delivery"
            htmlName="delivery"
            value="standard"
            onChange={() => {}}
            isDisabled>
            <RadioListItem label="First standard" value="standard" />
            <RadioListItem label="First express" value="express" />
          </RadioList>
        </form>
        <form aria-label="Second">
          <RadioList
            label="Second delivery"
            htmlName="delivery"
            value="express"
            onChange={() => {}}
            isDisabled>
            <RadioListItem label="Second standard" value="standard" />
            <RadioListItem label="Second express" value="express" />
          </RadioList>
        </form>
      </>,
    );
    expect(radio('First standard')).toBeChecked();
    expect(radio('Second express')).toBeChecked();
    expect(radio('First standard').name).not.toBe(radio('Second express').name);
  });

  it('detaches the whole group, from the server-rendered markup on, when its checked option is disabled', () => {
    // Server markup, before any hydration: the group decides this while
    // rendering, so no script has to run (spec:AST-085 FR3).
    const container = document.createElement('div');
    container.innerHTML = renderToString(
      <form>
        <input name="order" defaultValue="1001" />
        <RadioList
          label="Delivery"
          htmlName="delivery"
          value="express"
          onChange={() => {}}>
          <RadioListItem label="Standard" value="standard" />
          <>
            <RadioListItem label="Express" value="express" isDisabled />
          </>
        </RadioList>
      </form>,
    );
    const form = formOf(container);
    const radios = [
      ...container.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
    ];
    expect(radios).toHaveLength(2);
    // Every radio leaves the form together, under one name of its own, so the
    // radios stay one native group with one Tab stop...
    for (const radio of radios) {
      expect(radio.getAttribute('form')).toBe('');
      expect(radio.name).toBe(radios[0].name);
    }
    expect(radios[0].name).not.toBe('delivery');
    expect(radios.find(radio => radio.checked)?.value).toBe('express');
    // ...and the group submits nothing.
    expect([...new FormData(form).entries()]).toEqual([['order', '1001']]);
  });

  it('keeps the group in the form when its checked option is enabled', () => {
    const {container} = render(
      <form>
        <RadioList
          label="Delivery"
          htmlName="delivery"
          value="standard"
          onChange={() => {}}>
          <RadioListItem label="Standard" value="standard" />
          <RadioListItem label="Express" value="express" isDisabled />
        </RadioList>
      </form>,
    );
    expect(radio('Express')).not.toHaveAttribute('form');
    expect(new FormData(formOf(container)).get('delivery')).toBe('standard');
  });

  it('leaves an option another component renders to its own submission filter', () => {
    // RadioList cannot see this option among its children, so the group stays
    // in the form; the item excludes its value from the form owner's
    // `formdata` event once hydrated (proved in a real browser: jsdom fires no
    // `formdata` event).
    function ExpressOption() {
      return <RadioListItem label="Express" value="express" isDisabled />;
    }
    const {container} = render(
      <form>
        <RadioList
          label="Delivery"
          htmlName="delivery"
          value="express"
          onChange={() => {}}>
          <RadioListItem label="Standard" value="standard" />
          <ExpressOption />
        </RadioList>
      </form>,
    );
    const form = formOf(container);
    expect(radio('Express').form).toBe(form);
    expect(radio('Standard').form).toBe(form);
  });

  it('does not block a required submit, and keeps one group, when the selected option is disabled', () => {
    const {container} = render(
      <form>
        <RadioList
          label="Delivery"
          htmlName="delivery"
          value="express"
          onChange={() => {}}
          isRequired>
          <RadioListItem label="Standard" value="standard" />
          <RadioListItem label="Express" value="express" isDisabled />
        </RadioList>
      </form>,
    );
    const form = formOf(container);
    expect(form.checkValidity()).toBe(true);
    // The radios stay one group: they leave the form together, under one
    // name, so the selected radio remains the group's only Tab stop.
    expect(radio('Standard').form).toBe(radio('Express').form);
    expect(radio('Standard').name).toBe(radio('Express').name);
    expect(radio('Express')).toBeChecked();
  });
});
