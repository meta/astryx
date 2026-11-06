// Copyright (c) Meta Platforms, Inc. and affiliates.

import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
} from 'vitest';
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, {useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {layerViewportInset} from '../Layer/layerViewportInset.stylex';
import {PowerSearch} from './PowerSearch';
import {PowerSearchEditPopover} from './PowerSearchEditPopover';
import {useInternalConfig} from './useInternalConfig';
import type {PowerSearchConfig, PowerSearchFilter} from './types';

// =============================================================================
// Test infrastructure
// =============================================================================

const originalMatches = HTMLElement.prototype.matches;
const popoverOpenState = new WeakMap<HTMLElement, boolean>();

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let rafCallbacks: FrameRequestCallback[] = [];
let rafId = 0;

beforeAll(() => {
  globalThis.ResizeObserver = MockResizeObserver;
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    popoverOpenState.set(this, true);
    const event = new Event('toggle');
    Object.defineProperty(event, 'newState', {value: 'open'});
    this.dispatchEvent(event);
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    popoverOpenState.set(this, false);
    const event = new Event('toggle');
    Object.defineProperty(event, 'newState', {value: 'closed'});
    this.dispatchEvent(event);
  });
  HTMLElement.prototype.matches = function (
    this: HTMLElement,
    selector: string,
  ) {
    if (selector === ':popover-open') {
      return popoverOpenState.get(this) ?? false;
    }
    return originalMatches.call(this, selector);
  } as typeof HTMLElement.prototype.matches;
});

beforeEach(() => {
  rafCallbacks = [];
  rafId = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafCallbacks.push(cb);
    return ++rafId;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  HTMLElement.prototype.matches = originalMatches;
});

function flushRAF() {
  const cbs = rafCallbacks.splice(0);
  cbs.forEach(cb => cb(performance.now()));
}

const testConfig: PowerSearchConfig = {
  name: 'test',
  fields: [
    {
      key: 'status',
      label: 'Status',
      operators: [{key: 'is', label: 'is', value: {type: 'string'}}],
    },
    {
      key: 'priority',
      label: 'Priority',
      operators: [{key: 'equals', label: 'equals', value: {type: 'string'}}],
    },
  ],
};

function getEditPopoverText(container: HTMLElement): string {
  // The edit popover is the one containing the Cancel/Apply buttons
  const buttons = container.querySelectorAll('button');
  for (const btn of buttons) {
    if (btn.textContent === 'Cancel') {
      const popover = btn.closest('[popover]');
      return popover?.textContent ?? '';
    }
  }
  return '';
}

// =============================================================================
// Tests
// =============================================================================

describe('PowerSearch', () => {
  it('edit popover resets state when switching between filter tokens', () => {
    const filters: PowerSearchFilter[] = [
      {field: 'status', operator: 'is', value: {type: 'string', value: 'open'}},
      {
        field: 'priority',
        operator: 'equals',
        value: {type: 'string', value: 'high'},
      },
    ];

    function Harness() {
      const [currentFilters, setCurrentFilters] = useState(filters);
      return (
        <PowerSearch
          config={testConfig}
          filters={currentFilters}
          onChange={newFilters => setCurrentFilters([...newFilters])}
        />
      );
    }

    const {container} = render(<Harness />);

    // Both filter tokens should be rendered
    const statusToken = screen.getByText('Status: is');
    const priorityToken = screen.getByText('Priority: equals');

    // Click the status token to open its edit popover
    act(() => {
      fireEvent.click(statusToken);
      flushRAF();
    });

    // The edit popover should show "Status" as the selected field
    expect(getEditPopoverText(container)).toContain('Status');

    // Close the popover
    act(() => {
      fireEvent.click(screen.getByText('Cancel'));
      flushRAF();
    });

    // Click the priority token
    act(() => {
      fireEvent.click(priorityToken);
      flushRAF();
    });

    // The edit popover should now show "Priority", not stale "Status"
    const popoverText = getEditPopoverText(container);
    expect(popoverText).toContain('Priority');
    expect(popoverText).toContain('equals');
  });

  describe('value editor identity follows the field and operator', () => {
    // Two fields with the same value type, so an unkeyed editor would be
    // reused across the switch and keep the first field's menu contents.
    const sameTypeConfig: PowerSearchConfig = {
      name: 'test-same-type',
      fields: [
        {
          key: 'creator',
          label: 'Creator',
          operators: [
            {
              key: 'is_any_of',
              label: 'is any of',
              value: {
                type: 'enum_list',
                values: [{value: 'creator-1', label: 'Creator Person'}],
              },
            },
          ],
        },
        {
          key: 'owner',
          label: 'Owner',
          operators: [
            {
              key: 'is_any_of',
              label: 'is any of',
              value: {
                type: 'enum_list',
                values: [{value: 'owner-1', label: 'Owner Person'}],
              },
            },
          ],
        },
      ],
    };

    const creatorOption = () =>
      screen.queryByRole('option', {name: 'Creator Person', hidden: true});
    const ownerOption = () =>
      screen.queryByRole('option', {name: 'Owner Person', hidden: true});

    it('replaces an open value menu when the field changes', async () => {
      function Harness() {
        const internalConfig = useInternalConfig(sameTypeConfig);
        return (
          <PowerSearchEditPopover
            config={internalConfig}
            filter={{
              field: 'creator',
              operator: 'is_any_of',
              value: {type: 'enum_list', value: []},
            }}
            mode="edit"
            onSave={() => {}}
            onCancel={() => {}}
          />
        );
      }

      render(<Harness />);

      // Open the Creator value menu and leave it open.
      fireEvent.focus(screen.getByRole('combobox', {name: 'Values'}));
      await waitFor(() => expect(creatorOption()).toBeInTheDocument());

      // Switch the field underneath the open menu.
      fireEvent.click(screen.getByRole('combobox', {name: 'Field'}));
      fireEvent.click(
        screen.getByRole('option', {name: 'Owner', hidden: true}),
      );
      act(() => flushRAF());

      // The old field's options are gone, the new field's are shown.
      expect(creatorOption()).not.toBeInTheDocument();
      await waitFor(() => expect(ownerOption()).toBeInTheDocument());
    });

    it('replaces an open value menu on a nested sub-filter row', async () => {
      const nestedConfig: PowerSearchConfig = {
        name: 'test-nested-same-type',
        fields: [
          {
            key: 'group',
            label: 'Group',
            operators: [
              {key: 'all_of', label: 'all of', value: {type: 'nested'}},
            ],
          },
          ...sameTypeConfig.fields,
        ],
      };

      function Harness() {
        const internalConfig = useInternalConfig(nestedConfig);
        return (
          <PowerSearchEditPopover
            config={internalConfig}
            filter={{
              field: 'group',
              operator: 'all_of',
              value: {
                type: 'nested',
                value: [
                  {
                    field: 'creator',
                    operator: 'is_any_of',
                    value: {type: 'enum_list', value: []},
                  },
                ],
              },
            }}
            mode="edit"
            onSave={() => {}}
            onCancel={() => {}}
          />
        );
      }

      render(<Harness />);

      fireEvent.focus(screen.getByRole('combobox', {name: 'Values'}));
      await waitFor(() => expect(creatorOption()).toBeInTheDocument());

      // The nested row's own field selector is the one currently on
      // "Creator"; the root selector stays on "Group".
      const rowField = screen
        .getAllByRole('combobox', {name: 'Field'})
        .find(el => el.textContent === 'Creator');
      expect(rowField).toBeDefined();
      fireEvent.click(rowField!);
      const rowListbox = document.getElementById(
        rowField!.getAttribute('aria-controls')!,
      )!;
      fireEvent.click(
        within(rowListbox).getByRole('option', {name: 'Owner', hidden: true}),
      );

      expect(creatorOption()).not.toBeInTheDocument();
    });
  });

  it('edit popover shows correct filter after removing a preceding filter', () => {
    const filters: PowerSearchFilter[] = [
      {field: 'status', operator: 'is', value: {type: 'string', value: 'open'}},
      {
        field: 'priority',
        operator: 'equals',
        value: {type: 'string', value: 'high'},
      },
    ];

    function Harness() {
      const [currentFilters, setCurrentFilters] = useState(filters);
      return (
        <PowerSearch
          config={testConfig}
          filters={currentFilters}
          onChange={newFilters => setCurrentFilters([...newFilters])}
        />
      );
    }

    const {container} = render(<Harness />);

    // Click the status token (index 0) to edit it
    act(() => {
      fireEvent.click(screen.getByText('Status: is'));
      flushRAF();
    });

    // Delete the status filter via the Delete button in the popover
    act(() => {
      fireEvent.click(screen.getByText('Delete'));
      flushRAF();
    });

    // Now only the priority filter remains (shifted to index 0)
    expect(screen.queryByText('Status: is')).toBeNull();
    const priorityToken = screen.getByText('Priority: equals');

    // Click the priority token (now at index 0 — same index as the deleted filter)
    act(() => {
      fireEvent.click(priorityToken);
      flushRAF();
    });

    // The edit popover should show "Priority", not stale "Status"
    const popoverText = getEditPopoverText(container);
    expect(popoverText).toContain('Priority');
    expect(popoverText).toContain('equals');
  });

  it('does not save/close edit popover when Enter is consumed by child listbox option selection', () => {
    const multiConfig: PowerSearchConfig = {
      name: 'test-multi',
      fields: [
        {
          key: 'status',
          label: 'Status',
          operators: [
            {
              key: 'any_of',
              label: 'is any of',
              value: {
                type: 'enum_list',
                values: [
                  {value: 'open', label: 'Open'},
                  {value: 'closed', label: 'Closed'},
                ],
              },
            },
          ],
        },
      ],
    };

    const onSave = vi.fn();
    const onCancel = vi.fn();

    function MultiSelectHarness() {
      const internalConfig = useInternalConfig(multiConfig);
      return (
        <PowerSearchEditPopover
          config={internalConfig}
          filter={{
            field: 'status',
            operator: 'any_of',
            value: {type: 'enum_list', value: ['open']},
          }}
          mode="edit"
          onSave={onSave}
          onCancel={onCancel}
        />
      );
    }

    const {container} = render(<MultiSelectHarness />);

    const input = container.querySelector('input');
    expect(input).not.toBeNull();

    // Fire an Enter event that has been defaultPrevented (e.g. child typeahead option selection)
    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    enterEvent.preventDefault();

    act(() => {
      input?.dispatchEvent(enterEvent);
    });

    // onSave should NOT be called because the event was already consumed (defaultPrevented)
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves the freshly committed numeric value on Enter', () => {
    const numericConfig: PowerSearchConfig = {
      name: 'test-number',
      fields: [
        {
          key: 'level',
          label: 'Level',
          operators: [
            {key: 'equals', label: 'equals', value: {type: 'integer'}},
          ],
        },
      ],
    };
    const onSave = vi.fn();

    function NumericValueHarness() {
      const internalConfig = useInternalConfig(numericConfig);
      return (
        <PowerSearchEditPopover
          config={internalConfig}
          filter={{
            field: 'level',
            operator: 'equals',
            value: {type: 'integer', value: 5},
          }}
          mode="edit"
          onSave={onSave}
          onCancel={() => {}}
        />
      );
    }

    render(<NumericValueHarness />);
    const input = screen.getByRole('spinbutton');
    fireEvent.focus(input);
    fireEvent.input(input, {target: {value: '42'}});
    fireEvent.keyDown(input, {key: 'Enter'});

    expect(onSave).toHaveBeenCalledWith({
      field: 'level',
      operator: 'equals',
      value: {type: 'integer', value: 42},
    });
  });

  it('does not save an invalid numeric draft on Enter', () => {
    const numericConfig: PowerSearchConfig = {
      name: 'test-number',
      fields: [
        {
          key: 'level',
          label: 'Level',
          operators: [
            {key: 'equals', label: 'equals', value: {type: 'integer'}},
          ],
        },
      ],
    };
    const onSave = vi.fn();

    function NumericValueHarness() {
      const internalConfig = useInternalConfig(numericConfig);
      return (
        <PowerSearchEditPopover
          config={internalConfig}
          filter={{
            field: 'level',
            operator: 'equals',
            value: {type: 'integer', value: 5},
          }}
          mode="edit"
          onSave={onSave}
          onCancel={() => {}}
        />
      );
    }

    render(<NumericValueHarness />);
    const input = screen.getByRole('spinbutton');
    fireEvent.focus(input);
    fireEvent.input(input, {target: {value: '1·234'}});
    fireEvent.keyDown(input, {key: 'Enter'});

    expect(onSave).not.toHaveBeenCalled();
    expect(input).toHaveValue('1·234');
  });

  it('does not save/close on a composing Enter while typing a filter value (#4828)', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();

    function StringValueHarness() {
      const internalConfig = useInternalConfig(testConfig);
      return (
        <PowerSearchEditPopover
          config={internalConfig}
          filter={{
            field: 'status',
            operator: 'is',
            value: {type: 'string', value: '한국어'},
          }}
          mode="edit"
          onSave={onSave}
          onCancel={onCancel}
        />
      );
    }

    const {container} = render(<StringValueHarness />);
    const input = container.querySelector('input');
    expect(input).not.toBeNull();

    // Same composing-Enter signal as BaseTypeahead's guard: isComposing
    // (modern) or legacy keyCode 229. An IME commits its composition on
    // Enter too, so this keydown must not also close/save the popover.
    // handleKeyDown is bound on an ancestor container div, so the keydown
    // reaches it the same way it would from any real input inside — same
    // dispatch mechanism the sibling defaultPrevented test above uses.
    fireEvent.keyDown(input!, {key: 'Enter', isComposing: true});
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.keyDown(input!, {key: 'Enter', keyCode: 229});
    expect(onSave).not.toHaveBeenCalled();

    // A real, non-composing Enter still saves normally.
    fireEvent.keyDown(input!, {key: 'Enter'});
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// Narrow-width layout (#4761)
// =============================================================================

// jsdom performs no real layout (and never matches @container conditions), so
// these tests assert the declarations that produce the narrow-width behavior
// rather than measured geometry, via StyleX probe classes: one deterministic
// atomic class per property/value/condition, so an element carries a probe's
// classes exactly when it has the same declaration. The dev debug class
// (contains "__") is excluded.
const CHIP_ROW_COLLAPSE = '@container (max-width: 399px)';

const probe = stylex.create({
  responsiveLayerMinWidth: {
    minWidth: stylex.firstThatWorks(
      `min(400px, ${layerViewportInset.maxInlineSize})`,
      `min(400px, ${layerViewportInset.maxInlineSizeFallback})`,
    ),
  },
  fixedLayerMinWidth: {minWidth: 400},
  queryContainer: {containerType: 'inline-size'},
  responsiveWrap: {
    flexWrap: {default: 'nowrap', [CHIP_ROW_COLLAPSE]: 'wrap'},
  },
  cellMaxWidth: {maxWidth: '100%'},
  nestedFieldCellWidth: {width: 200},
});

function atomicClasses(style: (typeof probe)[keyof typeof probe]): string[] {
  const {className = ''} = stylex.props(style);
  const classes = className
    .split(' ')
    .filter(c => c !== '' && !c.includes('__'));
  // A probe resolving to no atomic classes would make every assertion built
  // on it vacuous, including the not-toHaveClass loops; fail loudly instead.
  expect(classes.length).toBeGreaterThan(0);
  return classes;
}

function expectProbeClasses(
  el: HTMLElement,
  style: (typeof probe)[keyof typeof probe],
) {
  for (const cls of atomicClasses(style)) {
    expect(el).toHaveClass(cls);
  }
}

describe('narrow-width layout (#4761)', () => {
  function EditHarness() {
    const internalConfig = useInternalConfig(testConfig);
    return (
      <PowerSearchEditPopover
        config={internalConfig}
        filter={{
          field: 'status',
          operator: 'is',
          value: {type: 'string', value: 'open'},
        }}
        mode="edit"
        onSave={() => {}}
        onCancel={() => {}}
      />
    );
  }

  function getChipRow(container: HTMLElement): HTMLElement {
    // Locate the chip row by its collapse declaration, then sanity-check it
    // really is the row holding the field / operator / value cells.
    const [rowCls] = atomicClasses(probe.responsiveWrap);
    const row = container.querySelector(`.${rowCls}`) as HTMLElement;
    expect(row).not.toBeNull();
    expect(row).toHaveClass('astryx-stack');
    expect(row.children).toHaveLength(3);
    return row;
  }

  it('popover root establishes the container the collapse query measures', () => {
    const {container} = render(<EditHarness />);

    // Without inline-size containment on the root, no @container condition
    // in this file can match and the chip rows would never wrap.
    const root = container.firstElementChild as HTMLElement;
    expect(root).not.toBeNull();
    expectProbeClasses(root, probe.queryContainer);
  });

  it('filter chip row wraps below the collapse width instead of overflowing', () => {
    const {container} = render(<EditHarness />);

    const row = getChipRow(container);
    expectProbeClasses(row, probe.responsiveWrap);
  });

  it('operator cell is capped at the row width', () => {
    const {container} = render(<EditHarness />);

    // Capped so a long translated operator label truncates inside the
    // Selector trigger instead of pushing the row wider than the popover.
    const operatorCell = getChipRow(container).children[1] as HTMLElement;
    expectProbeClasses(operatorCell, probe.cellMaxWidth);
  });

  it('nested sub-filter rows wrap instead of overflowing on one line', () => {
    const nestedConfig: PowerSearchConfig = {
      name: 'test-nested',
      fields: [
        {
          key: 'group',
          label: 'Group',
          operators: [
            {key: 'all_of', label: 'all of', value: {type: 'nested'}},
          ],
        },
        {
          key: 'status',
          label: 'Status',
          operators: [{key: 'is', label: 'is', value: {type: 'string'}}],
        },
      ],
    };

    function NestedHarness() {
      const internalConfig = useInternalConfig(nestedConfig);
      return (
        <PowerSearchEditPopover
          config={internalConfig}
          filter={{
            field: 'group',
            operator: 'all_of',
            value: {
              type: 'nested',
              value: [
                {
                  field: 'status',
                  operator: 'is',
                  value: {type: 'string', value: 'open'},
                },
              ],
            },
          }}
          mode="edit"
          onSave={() => {}}
          onCancel={() => {}}
        />
      );
    }

    const {container} = render(<NestedHarness />);

    // Locate the sub-filter row through its fixed-width field cell.
    const [cellCls] = atomicClasses(probe.nestedFieldCellWidth);
    const fieldCell = container.querySelector(`.${cellCls}`) as HTMLElement;
    expect(fieldCell).not.toBeNull();
    const row = fieldCell.parentElement as HTMLElement;
    expect(row).toHaveClass('astryx-stack');
    expectProbeClasses(row, probe.responsiveWrap);

    // The fixed-width cells are capped so they cannot clip in containers
    // narrower than their design width (or under deep TreeList indentation).
    expectProbeClasses(fieldCell, probe.cellMaxWidth);
    const operatorCell = row.children[1] as HTMLElement;
    expectProbeClasses(operatorCell, probe.cellMaxWidth);
  });

  it('edit popover layer yields to viewports narrower than its 400px floor', () => {
    const filters: PowerSearchFilter[] = [
      {field: 'status', operator: 'is', value: {type: 'string', value: 'open'}},
    ];

    function Harness() {
      const [currentFilters, setCurrentFilters] = useState(filters);
      return (
        <PowerSearch
          config={testConfig}
          filters={currentFilters}
          onChange={newFilters => setCurrentFilters([...newFilters])}
        />
      );
    }

    render(<Harness />);

    act(() => {
      fireEvent.click(screen.getByText('Status: is'));
      flushRAF();
    });

    const layer = screen
      .getByText('Cancel')
      .closest('[popover]') as HTMLElement;
    expect(layer).not.toBeNull();

    // The fixed 400px floor is clamped by the layer runtime's viewport cap
    // (spec:AST-059 FR7), so the popover never opens wider than the screen.
    expectProbeClasses(layer, probe.responsiveLayerMinWidth);
    for (const cls of atomicClasses(probe.fixedLayerMinWidth)) {
      expect(layer).not.toHaveClass(cls);
    }
  });
});

describe('value save', () => {
  const enumConfig: PowerSearchConfig = {
    name: 'test-enum',
    fields: [
      {
        key: 'status',
        label: 'Status',
        operators: [
          {
            key: 'is',
            label: 'is',
            value: {
              type: 'enum',
              values: [
                {value: 'open', label: 'Open'},
                {value: 'closed', label: 'Closed'},
              ],
            },
          },
        ],
      },
    ],
  };

  function Harness({
    onSave,
  }: {
    onSave: (filter: PowerSearchFilter | null) => void;
  }) {
    const config = useInternalConfig(enumConfig);
    return (
      <PowerSearchEditPopover
        config={config}
        filter={{field: 'status', operator: 'is', value: undefined}}
        mode="create"
        onSave={onSave}
        onCancel={() => {}}
      />
    );
  }

  it('saves exactly once when a value that saves on choice is picked', () => {
    const onSave = vi.fn();
    render(
      <React.StrictMode>
        <Harness onSave={onSave} />
      </React.StrictMode>,
    );
    fireEvent.click(screen.getByRole('combobox', {name: 'Value'}));
    fireEvent.click(screen.getByRole('option', {name: 'Closed', hidden: true}));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      field: 'status',
      operator: 'is',
      value: {type: 'enum', value: 'closed'},
    });
  });
});

describe('empty-operator save', () => {
  const emptyConfig: PowerSearchConfig = {
    name: 'test-empty',
    fields: [
      {
        key: 'title',
        label: 'Title',
        operators: [
          {key: 'contains', label: 'contains', value: {type: 'string'}},
          {key: 'is_empty', label: 'is empty', value: {type: 'empty'}},
        ],
      },
      {
        key: 'assignee',
        label: 'Assignee',
        defaultOperator: 'is_unset',
        operators: [
          {key: 'is_unset', label: 'is unset', value: {type: 'empty'}},
          {key: 'is', label: 'is', value: {type: 'string'}},
        ],
      },
    ],
  };

  type HarnessProps = {
    filter: React.ComponentProps<typeof PowerSearchEditPopover>['filter'];
    onSave: (filter: PowerSearchFilter | null) => void;
  };

  // A parent that keeps the editor mounted and re-renders with a fresh
  // onSave identity on every render, as an un-memoized consumer does.
  function Harness({filter, onSave}: HarnessProps) {
    const config = useInternalConfig(emptyConfig);
    const [, setTick] = useState(0);
    return (
      <>
        <button type="button" onClick={() => setTick(n => n + 1)}>
          Rerender
        </button>
        <PowerSearchEditPopover
          config={config}
          filter={filter}
          mode="edit"
          onSave={saved => onSave(saved)}
          onCancel={() => {}}
        />
      </>
    );
  }

  // The save is queued as a microtask after the choice; flush it.
  const selectOption = async (comboboxName: string, optionName: string) => {
    fireEvent.click(screen.getByRole('combobox', {name: comboboxName}));
    fireEvent.click(
      screen.getByRole('option', {name: optionName, hidden: true}),
    );
    await act(async () => {});
  };

  it('saves exactly once when an empty operator is chosen', async () => {
    const onSave = vi.fn();
    render(
      <React.StrictMode>
        <Harness
          filter={{field: 'title', operator: 'contains', value: undefined}}
          onSave={onSave}
        />
      </React.StrictMode>,
    );
    expect(onSave).not.toHaveBeenCalled();

    await selectOption('Operator', 'is empty');
    fireEvent.click(screen.getByRole('button', {name: 'Rerender'}));
    fireEvent.click(screen.getByRole('button', {name: 'Rerender'}));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      field: 'title',
      operator: 'is_empty',
      value: {type: 'empty'},
    });
  });

  it('saves exactly once when the field switches to one whose default operator is empty', async () => {
    const onSave = vi.fn();
    render(
      <React.StrictMode>
        <Harness
          filter={{field: 'title', operator: 'contains', value: undefined}}
          onSave={onSave}
        />
      </React.StrictMode>,
    );

    await selectOption('Field', 'Assignee');
    fireEvent.click(screen.getByRole('button', {name: 'Rerender'}));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      field: 'assignee',
      operator: 'is_unset',
      value: {type: 'empty'},
    });
  });

  it('does not save again when the current empty operator or field is re-chosen', async () => {
    const onSave = vi.fn();
    render(
      <React.StrictMode>
        <Harness
          filter={{field: 'title', operator: 'contains', value: undefined}}
          onSave={onSave}
        />
      </React.StrictMode>,
    );

    await selectOption('Operator', 'is empty');
    expect(onSave).toHaveBeenCalledTimes(1);
    await selectOption('Operator', 'is empty');
    expect(onSave).toHaveBeenCalledTimes(1);

    await selectOption('Field', 'Assignee');
    expect(onSave).toHaveBeenCalledTimes(2);
    await selectOption('Field', 'Assignee');
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it('does not save just because it opens on a complete empty-operator filter', async () => {
    const onSave = vi.fn();
    render(
      <React.StrictMode>
        <Harness
          filter={{field: 'title', operator: 'is_empty', value: undefined}}
          onSave={onSave}
        />
      </React.StrictMode>,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Rerender'}));
    await act(async () => {});

    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('empty-operator choices inside PowerSearch', () => {
  const emptyConfig: PowerSearchConfig = {
    name: 'test-empty-ps',
    fields: [
      {
        key: 'title',
        label: 'Title',
        operators: [
          {key: 'contains', label: 'contains', value: {type: 'string'}},
          {key: 'is_empty', label: 'is empty', value: {type: 'empty'}},
        ],
      },
    ],
  };

  function Harness({
    initial,
    onChange,
  }: {
    initial: PowerSearchFilter[];
    onChange: (
      filters: ReadonlyArray<PowerSearchFilter>,
      type: string,
      index: number,
    ) => void;
  }) {
    const [filters, setFilters] = useState(initial);
    return (
      <PowerSearch
        config={emptyConfig}
        filters={filters}
        onChange={(next, type, index) => {
          onChange(next, type, index);
          setFilters([...next]);
        }}
      />
    );
  }

  it('returns focus to the search input after an empty operator is chosen', async () => {
    const onChange = vi.fn();
    render(
      <Harness
        initial={[
          {
            field: 'title',
            operator: 'contains',
            value: {type: 'string', value: 'x'},
          },
        ]}
        onChange={onChange}
      />,
    );
    act(() => {
      fireEvent.click(screen.getByText('Title: contains'));
      flushRAF();
    });
    fireEvent.click(
      screen.getByRole('combobox', {name: 'Operator', hidden: true}),
    );
    fireEvent.click(
      screen.getByRole('option', {name: 'is empty', hidden: true}),
    );
    await act(async () => {});
    act(() => flushRAF());

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][1]).toBe('edit');
    expect(document.activeElement).not.toBe(document.body);
    expect(screen.getAllByRole('combobox')[0]).toHaveFocus();
  });

  it('commits a clicked empty-operator token once without opening the editor', () => {
    const onChange = vi.fn();
    const {container} = render(
      <Harness
        initial={[
          {field: 'title', operator: 'is_empty', value: {type: 'empty'}},
        ]}
        onChange={onChange}
      />,
    );
    act(() => {
      fireEvent.click(screen.getByText(/Title: is empty/));
      flushRAF();
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(
      [{field: 'title', operator: 'is_empty', value: {type: 'empty'}}],
      'edit',
      0,
    );
    expect(getEditPopoverText(container)).toBe('');
  });
});

describe('empty-operator token with an Editor override', () => {
  it('opens the consumer empty Editor instead of committing', () => {
    const onChange = vi.fn();
    const EmptyEditor = ({onCancel}: {onCancel: () => void}) => (
      <div data-testid="custom-empty-editor">
        <button type="button" onClick={onCancel}>
          Close custom
        </button>
      </div>
    );
    const overrideConfig: PowerSearchConfig = {
      name: 'test-empty-override',
      fields: [
        {
          key: 'title',
          label: 'Title',
          operators: [
            {key: 'contains', label: 'contains', value: {type: 'string'}},
            {key: 'is_empty', label: 'is empty', value: {type: 'empty'}},
          ],
        },
      ],
    };
    render(
      <PowerSearch
        config={overrideConfig}
        filters={[
          {field: 'title', operator: 'is_empty', value: {type: 'empty'}},
        ]}
        onChange={onChange}
        components={{empty: {Editor: EmptyEditor}}}
      />,
    );
    act(() => {
      fireEvent.click(screen.getByText(/Title: is empty/));
      flushRAF();
    });

    expect(screen.getByTestId('custom-empty-editor')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Enter on a focused footer button (#7437)', () => {
  const validFilter: PowerSearchFilter = {
    field: 'status',
    operator: 'is',
    value: {type: 'string', value: 'example'},
  };

  function Harness({
    onSave,
    onCancel,
  }: {
    onSave: (filter: PowerSearchFilter | null) => void;
    onCancel: () => void;
  }) {
    const internalConfig = useInternalConfig(testConfig);
    return (
      <PowerSearchEditPopover
        config={internalConfig}
        filter={validFilter}
        mode="edit"
        onSave={onSave}
        onCancel={onCancel}
      />
    );
  }

  it('cancels without saving when Cancel has focus', async () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSave={onSave} onCancel={onCancel} />);

    screen.getByRole('button', {name: 'Cancel'}).focus();
    await user.keyboard('{Enter}');

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('deletes the filter when Delete has focus', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSave={onSave} onCancel={() => {}} />);

    screen.getByRole('button', {name: 'Delete'}).focus();
    await user.keyboard('{Enter}');

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(null);
  });

  it('saves once when Apply has focus', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSave={onSave} onCancel={() => {}} />);

    screen.getByRole('button', {name: 'Apply'}).focus();
    await user.keyboard('{Enter}');

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(validFilter);
  });

  it('still cancels on Escape when a button has focus', async () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSave={onSave} onCancel={onCancel} />);

    screen.getByRole('button', {name: 'Delete'}).focus();
    await user.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});
