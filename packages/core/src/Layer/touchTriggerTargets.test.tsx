// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touchTriggerTargets.test.tsx
 * @input Uses every Core component that shows a disabled reason in a tooltip
 *   (Button, IconButton and ToggleButton through `tooltip`; the form
 *   controls through `disabledMessage`), DropdownMenuItem, ClickableCard and
 *   Tooltip, under a finger's tap in jsdom
 * @output Proof that under touchTrigger="auto" a tap on a disabled control
 *   opens its disabled-reason tooltip and nothing activates, also inside a
 *   clickable row or card, while a tap on an enabled control is left to the
 *   trigger as before
 * @position Unit tests beside useTouchTrigger; the rule's own rows are in
 *   useTouchTrigger.test.ts
 */

import type {MouseEvent, ReactElement} from 'react';
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, screen, fireEvent, waitFor} from '@testing-library/react';
import {Button} from '../Button/Button';
import {IconButton} from '../IconButton/IconButton';
import {ToggleButton} from '../ToggleButton/ToggleButton';
import {CheckboxInput} from '../CheckboxInput/CheckboxInput';
import {CheckboxList} from '../CheckboxList/CheckboxList';
import {CheckboxListItem} from '../CheckboxList/CheckboxListItem';
import {DateInput} from '../DateInput/DateInput';
import {DateRangeInput} from '../DateRangeInput/DateRangeInput';
import {DateTimeInput} from '../DateTimeInput/DateTimeInput';
import {FileInput} from '../FileInput/FileInput';
import {MultiSelector} from '../MultiSelector/MultiSelector';
import {NumberInput} from '../NumberInput/NumberInput';
import {PowerSearch} from '../PowerSearch/PowerSearch';
import type {PowerSearchConfig} from '../PowerSearch/types';
import {RadioList} from '../RadioList/RadioList';
import {RadioListItem} from '../RadioList/RadioListItem';
import {SegmentedControl} from '../SegmentedControl/SegmentedControl';
import {SegmentedControlItem} from '../SegmentedControl/SegmentedControlItem';
import {Selector} from '../Selector/Selector';
import {Slider} from '../Slider/Slider';
import {Switch} from '../Switch/Switch';
import {TextArea} from '../TextArea/TextArea';
import {TextInput} from '../TextInput/TextInput';
import {TimeInput} from '../TimeInput/TimeInput';
import {Tokenizer} from '../Tokenizer/Tokenizer';
import {Typeahead} from '../Typeahead/Typeahead';
import type {SearchSource, SearchableItem} from '../Typeahead/types';
import {DropdownMenuItem} from '../DropdownMenu/DropdownMenuItem';
import {ClickableCard} from '../ClickableCard/ClickableCard';
import {Overlay} from '../Overlay/Overlay';
import {HoverCard} from '../HoverCard/HoverCard';
import {Tooltip} from '../Tooltip/Tooltip';
import {__resetInteractionModalityForTest} from '../utils/interactionModality';

const originalShowPopover = HTMLElement.prototype.showPopover;
const originalHidePopover = HTMLElement.prototype.hidePopover;
const originalMatches = HTMLElement.prototype.matches;

beforeEach(() => {
  __resetInteractionModalityForTest();
  // jsdom has no Popover API: keep the open state where the test reads it.
  HTMLElement.prototype.showPopover = function (this: HTMLElement) {
    this.setAttribute('popover-open', '');
  };
  HTMLElement.prototype.hidePopover = function (this: HTMLElement) {
    this.removeAttribute('popover-open');
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLElement.prototype as any).matches = function (
    this: HTMLElement,
    selector: string,
  ): boolean {
    return selector === ':popover-open'
      ? this.hasAttribute('popover-open')
      : originalMatches.call(this, selector);
  };
});

afterEach(() => {
  HTMLElement.prototype.showPopover = originalShowPopover;
  HTMLElement.prototype.hidePopover = originalHidePopover;
  HTMLElement.prototype.matches = originalMatches;
});

/** A finger's tap on `element`, in the order a browser dispatches it. */
function tap(element: HTMLElement) {
  fireEvent.pointerEnter(element, {pointerType: 'touch'});
  fireEvent.pointerDown(element, {pointerType: 'touch'});
  fireEvent.pointerUp(element, {pointerType: 'touch'});
  fireEvent.mouseEnter(element);
  fireEvent.click(element);
}

/** The tooltip holding `text`. */
function layerOf(text: string): HTMLElement | null {
  return (
    screen
      .queryByText(text, {exact: false})
      ?.closest<HTMLElement>('[popover]') ?? null
  );
}

/** Whether the tooltip holding `text` is open. */
function isOpen(text: string): boolean {
  return layerOf(text)?.hasAttribute('popover-open') === true;
}

/**
 * The control a disabled reason describes: the element whose
 * `aria-describedby` names the reason's tooltip, which is what a finger taps.
 */
function controlDescribedBy(reason: string): HTMLElement {
  const layer = layerOf(reason);
  const id = layer?.id;
  if (id == null || id === '') {
    throw new Error(`no tooltip with an id holds "${reason}"`);
  }
  const control = Array.from(
    document.querySelectorAll<HTMLElement>('[aria-describedby]'),
  ).find(element =>
    (element.getAttribute('aria-describedby') ?? '').split(/\s+/).includes(id),
  );
  if (control == null) {
    throw new Error(`nothing is described by the tooltip holding "${reason}"`);
  }
  return control;
}

const fruits: SearchableItem[] = [
  {id: '1', label: 'Apple'},
  {id: '2', label: 'Banana'},
];
const fruitSource: SearchSource = {
  search: (query: string) =>
    fruits.filter(f => f.label.toLowerCase().includes(query.toLowerCase())),
  bootstrap: () => fruits,
};
const searchConfig: PowerSearchConfig = {
  name: 'Issues',
  fields: [
    {
      key: 'title',
      label: 'Title',
      defaultOperator: 'contains',
      operators: [
        {key: 'contains', label: 'contains', value: {type: 'string'}},
      ],
    },
  ],
};

type DisabledReasonCase = {
  name: string;
  reason: string;
  /** Renders the component disabled with `reason`; `act` is its action. */
  renderDisabled: (reason: string, act: () => void) => ReactElement;
};

const DISABLED_REASON_CASES: DisabledReasonCase[] = [
  // A disabled Link is not listed: it takes no pointer events
  // (component:Link FR5), so a tap never reaches it.
  {
    name: 'Button',
    reason: 'You need the Editor role to publish',
    renderDisabled: (reason, act) => (
      <Button label="Publish" isDisabled tooltip={reason} onClick={act} />
    ),
  },
  {
    name: 'IconButton',
    reason: 'Only the owner can delete this file',
    renderDisabled: (reason, act) => (
      <IconButton
        label="Delete"
        icon="info"
        isDisabled
        tooltip={reason}
        onClick={act}
      />
    ),
  },
  {
    name: 'ToggleButton',
    reason: 'Formatting is off in plain-text mode',
    renderDisabled: (reason, act) => (
      <ToggleButton
        label="Bold"
        isDisabled
        tooltip={reason}
        onPressedChange={act}
      />
    ),
  },
  {
    name: 'CheckboxInput',
    reason: 'Terms are managed by your administrator',
    renderDisabled: (reason, act) => (
      <CheckboxInput
        label="Accept terms"
        value={false}
        onChange={act}
        isDisabled
        disabledMessage={reason}
      />
    ),
  },
  {
    name: 'CheckboxList',
    reason: 'Notifications are managed by your administrator',
    renderDisabled: (reason, act) => (
      <CheckboxList
        label="Notifications"
        value={['email']}
        onChange={act}
        isDisabled
        disabledMessage={reason}>
        <CheckboxListItem label="Email" value="email" />
        <CheckboxListItem label="SMS" value="sms" />
      </CheckboxList>
    ),
  },
  {
    name: 'DateInput',
    reason: 'Scheduling is locked',
    renderDisabled: (reason, act) => (
      <DateInput
        label="Date"
        onChange={act}
        isDisabled
        disabledMessage={reason}
      />
    ),
  },
  {
    name: 'DateRangeInput',
    reason: 'The reporting period is fixed',
    renderDisabled: (reason, act) => (
      <DateRangeInput
        label="Range"
        value={null}
        onChange={act}
        isDisabled
        disabledMessage={reason}
      />
    ),
  },
  {
    name: 'DateTimeInput',
    reason: 'The launch time is locked',
    renderDisabled: (reason, act) => (
      <DateTimeInput
        label="When"
        onChange={act}
        isDisabled
        disabledMessage={reason}
      />
    ),
  },
  {
    name: 'FileInput',
    reason: 'You need the Editor role to upload',
    renderDisabled: (reason, act) => (
      <FileInput
        label="Resume"
        value={null}
        onChange={act}
        isDisabled
        disabledMessage={reason}
      />
    ),
  },
  {
    name: 'MultiSelector',
    reason: 'Select a table first',
    renderDisabled: (reason, act) => (
      <MultiSelector
        label="Fruit"
        options={['Apple', 'Banana', 'Orange']}
        value={[]}
        onChange={act}
        isDisabled
        disabledMessage={reason}
      />
    ),
  },
  {
    name: 'NumberInput',
    reason: 'Quantity is fixed by the contract',
    renderDisabled: (reason, act) => (
      <NumberInput
        label="Quantity"
        value={42}
        onChange={act}
        isDisabled
        disabledMessage={reason}
      />
    ),
  },
  {
    name: 'PowerSearch',
    reason: 'You need edit access to search',
    renderDisabled: (reason, act) => (
      <PowerSearch
        config={searchConfig}
        filters={[]}
        onChange={act}
        isDisabled
        disabledMessage={reason}
      />
    ),
  },
  {
    name: 'RadioList',
    reason: 'Upgrade your account to change plans',
    renderDisabled: (reason, act) => (
      <RadioList
        label="Plan"
        value="free"
        onChange={act}
        isDisabled
        disabledMessage={reason}>
        <RadioListItem label="Free" value="free" />
        <RadioListItem label="Pro" value="pro" />
      </RadioList>
    ),
  },
  {
    name: 'SegmentedControl',
    reason: 'Choose a project to switch views',
    renderDisabled: (reason, act) => (
      <SegmentedControl
        value="grid"
        onChange={act}
        label="View mode"
        isDisabled
        disabledMessage={reason}>
        <SegmentedControlItem value="grid" label="Grid" />
        <SegmentedControlItem value="list" label="List" />
      </SegmentedControl>
    ),
  },
  {
    name: 'Selector',
    reason: 'Ask an admin to change the fruit',
    renderDisabled: (reason, act) => (
      <Selector
        label="Fruit"
        options={['Apple', 'Banana', 'Cherry']}
        onChange={act}
        isDisabled
        disabledMessage={reason}
      />
    ),
  },
  {
    name: 'Slider',
    reason: 'Volume is locked while sharing your screen',
    renderDisabled: (reason, act) => (
      <Slider
        label="Volume"
        value={50}
        onChange={act}
        valueDisplay="none"
        isDisabled
        disabledMessage={reason}
      />
    ),
  },
  {
    name: 'Switch',
    reason: 'Notifications are turned off for your organization',
    renderDisabled: (reason, act) => (
      <Switch
        label="Notifications"
        value={false}
        onChange={act}
        isDisabled
        disabledMessage={reason}
      />
    ),
  },
  {
    name: 'TextArea',
    reason: 'Notes are locked while the review is open',
    renderDisabled: (reason, act) => (
      <TextArea
        label="Notes"
        value="hello"
        onChange={act}
        isDisabled
        disabledMessage={reason}
      />
    ),
  },
  {
    name: 'TextInput',
    reason: 'You need the Editor role to change this',
    renderDisabled: (reason, act) => (
      <TextInput
        label="Owner"
        value="alice"
        onChange={act}
        isDisabled
        disabledMessage={reason}
      />
    ),
  },
  {
    name: 'TimeInput',
    reason: 'Time edits are locked',
    renderDisabled: (reason, act) => (
      <TimeInput
        label="Start time"
        onChange={act}
        isDisabled
        disabledMessage={reason}
      />
    ),
  },
  {
    name: 'Tokenizer',
    reason: 'Tags are locked while syncing',
    renderDisabled: (reason, act) => (
      <Tokenizer
        label="Tags"
        searchSource={fruitSource}
        value={[]}
        onChange={act}
        isDisabled
        disabledMessage={reason}
      />
    ),
  },
  {
    name: 'Typeahead',
    reason: 'You need the Editor role to assign',
    renderDisabled: (reason, act) => (
      <Typeahead
        label="Assignee"
        searchSource={fruitSource}
        value={null}
        onChange={act}
        isDisabled
        disabledMessage={reason}
      />
    ),
  },
];

describe('a tap on a disabled control opens its disabled-reason tooltip, and nothing activates', () => {
  it.each(DISABLED_REASON_CASES)('$name', async ({reason, renderDisabled}) => {
    const act = vi.fn();
    render(renderDisabled(reason, act));
    const control = controlDescribedBy(reason);

    tap(control);

    await waitFor(() => {
      expect(isOpen(reason)).toBe(true);
    });
    expect(act).not.toHaveBeenCalled();
    expect(control).not.toHaveAttribute('aria-expanded', 'true');
  });

  it('a disabled menu item, through a caller tooltip (menu items have no reason prop)', async () => {
    const onClick = vi.fn();
    render(
      <ul role="menu">
        <Tooltip content="Ask an admin to delete projects">
          <DropdownMenuItem
            label="Delete project"
            isDisabled
            onClick={onClick}
          />
        </Tooltip>
      </ul>,
    );

    tap(
      screen
        .getByText('Delete project')
        .closest('[role="menuitem"]') as HTMLElement,
    );

    await waitFor(() => {
      expect(isOpen('Ask an admin to delete projects')).toBe(true);
    });
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('a disabled field inside a clickable card or row', () => {
  it("opens the field's reason on a tap, and neither the field nor the row activates", async () => {
    const onRowClick = vi.fn();
    const onChange = vi.fn();
    render(
      <ClickableCard label="Billing contact" onClick={onRowClick}>
        <TextInput
          label="Email"
          value="ada@example.com"
          onChange={onChange}
          isDisabled
          disabledMessage="Only an owner can change the billing contact"
        />
      </ClickableCard>,
    );
    const field = screen.getByRole('textbox', {name: /Email/});

    tap(field);

    await waitFor(() => {
      expect(isOpen('Only an owner can change the billing contact')).toBe(true);
    });
    expect(onRowClick).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(field).toHaveValue('ada@example.com');
  });
});

describe('a tap on an enabled control is left to the trigger, as before', () => {
  it('a tap inside a default Overlay within a link leaves the link’s tooltip shut, as before, and the link runs', async () => {
    const follow = vi.fn((event: MouseEvent) => event.preventDefault());
    render(
      <Tooltip content="Open the full report">
        <a href="/report" onClick={follow}>
          <Overlay content={<span>Caption</span>}>
            <span>Q3 report</span>
          </Overlay>
        </a>
      </Tooltip>,
    );
    tap(screen.getByText('Q3 report'));
    expect(follow).toHaveBeenCalledTimes(1);
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(isOpen('Open the full report')).toBe(false);
  });

  it('a truncated label inside a link still opens its tooltip, and the link still runs', async () => {
    const follow = vi.fn((event: MouseEvent) => event.preventDefault());
    render(
      <a href="/doc" onClick={follow}>
        <Tooltip content="A very long document title">
          <span>A very long document…</span>
        </Tooltip>
      </a>,
    );
    tap(screen.getByText('A very long document…'));
    await waitFor(() => {
      expect(isOpen('A very long document title')).toBe(true);
    });
    expect(follow).toHaveBeenCalledTimes(1);
  });
});

describe('HoverCard: a disabled control performs no action', () => {
  it('a tap on an aria-disabled trigger opens its hover card, and nothing activates', async () => {
    const onOpenChange = vi.fn();
    const publish = vi.fn();
    render(
      <HoverCard
        content={<span>Publishing needs an editor</span>}
        onOpenChange={onOpenChange}
        delay={0}>
        <button type="button" aria-disabled="true" onClick={publish}>
          Publish
        </button>
      </HoverCard>,
    );
    tap(screen.getByRole('button', {name: 'Publish'}));
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(true);
    });
  });

  it('a tap on a disabled checkbox inside an option-row trigger opens the row’s hover card', async () => {
    const onOpenChange = vi.fn();
    render(
      <HoverCard
        content={<span>Archived projects cannot be selected</span>}
        onOpenChange={onOpenChange}
        delay={0}>
        <div role="option" aria-selected={false} tabIndex={0}>
          <input type="checkbox" aria-disabled="true" aria-label="Apollo" />
          Apollo
        </div>
      </HoverCard>,
    );
    tap(screen.getByRole('checkbox', {name: 'Apollo'}));
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(true);
    });
  });
});
