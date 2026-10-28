// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PowerSearch.test.tsx
 * @input Uses vitest, @testing-library/react, PowerSearch
 * @output Integration tests for PowerSearch component
 * @position Testing; validates PowerSearch.tsx
 *
 * SYNC: When PowerSearch.tsx changes, update tests to match
 */

import {StrictMode, useState} from 'react';
import {describe, it, expect, vi, beforeAll, afterAll, afterEach} from 'vitest';
import {
  render,
  screen,
  act,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {PowerSearch} from './PowerSearch';
import {__resetLiveRegionsForTest} from '../hooks/useAnnounce';
import type {PowerSearchConfig, PowerSearchFilter} from './types';
import {TestIcon} from '../__tests__/TestIcon';

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLElement.prototype as any).matches = function (
    selector: string,
  ): boolean {
    if (selector === ':popover-open') {
      return popoverOpenState.get(this) ?? false;
    }
    return originalMatches.call(this, selector);
  };
});

afterAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLElement.prototype as any).matches = originalMatches;
});

// Reset the singleton live regions between tests so result-count
// announcements from one test don't leak into the next.
afterEach(() => {
  __resetLiveRegionsForTest();
});

// =============================================================================
// Fixtures
// =============================================================================

const config: PowerSearchConfig = {
  name: 'TestSearch',
  fields: [
    {
      key: 'title',
      label: 'Title',
      defaultOperator: 'contains',
      operators: [
        {key: 'contains', label: 'contains', value: {type: 'string'}},
      ],
    },
    {
      key: 'status',
      label: 'Status',
      defaultOperator: 'is',
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

function PowerSearchWrapper(props: {config: PowerSearchConfig}) {
  const [filters, setFilters] = useState<PowerSearchFilter[]>([]);
  return (
    <PowerSearch
      config={props.config}
      filters={filters}
      onChange={newFilters => {
        setFilters([...newFilters]);
      }}
    />
  );
}

// =============================================================================
// Tests
// =============================================================================

describe('PowerSearch', () => {
  it('forwards ref to the root element', () => {
    let root: HTMLDivElement | null = null;
    render(
      <PowerSearch
        ref={el => {
          root = el;
        }}
        config={config}
        filters={[]}
        onChange={() => {}}
      />,
    );
    expect(root).toBeInstanceOf(HTMLDivElement);
    expect(root).toHaveClass('astryx-power-search');
  });

  it('exposes typeahead focus through handleRef', () => {
    let handle: {focusTypeahead: () => void; blurTypeahead: () => void} | null =
      null;
    render(
      <PowerSearch
        handleRef={h => {
          handle = h;
        }}
        config={config}
        filters={[]}
        onChange={() => {}}
      />,
    );

    act(() => {
      handle?.focusTypeahead();
    });

    expect(screen.getByRole('combobox')).toHaveFocus();
  });

  it('clears all added filters when the clear button is clicked', async () => {
    const user = userEvent.setup();
    render(<PowerSearchWrapper config={config} />);
    const input = screen.getByRole('combobox', {name: 'Search'});
    await user.type(input, 'status open');
    await user.click(
      await screen.findByRole('option', {name: 'Status is Open', hidden: true}),
    );
    await user.type(input, 'title login');
    await user.click(
      await screen.findByRole('option', {
        name: 'Title contains "login"',
        hidden: true,
      }),
    );

    await user.type(input, 'status closed');
    await user.click(
      await screen.findByRole('option', {
        name: 'Status is Closed',
        hidden: true,
      }),
    );

    expect(screen.getAllByRole('button', {name: /^Remove /})).toHaveLength(3);

    await user.click(screen.getByRole('button', {name: 'Clear all'}));

    expect(screen.queryAllByRole('button', {name: /^Remove /})).toHaveLength(0);
    expect(
      screen.queryByRole('button', {name: 'Clear all'}),
    ).not.toBeInTheDocument();
  });

  it('clicking the remove button on a filter removes only that filter', async () => {
    const user = userEvent.setup();
    render(<PowerSearchWrapper config={config} />);
    const input = screen.getByRole('combobox', {name: 'Search'});
    await user.type(input, 'status open');
    await user.click(
      await screen.findByRole('option', {name: 'Status is Open', hidden: true}),
    );
    await user.type(input, 'title login');
    await user.click(
      await screen.findByRole('option', {
        name: 'Title contains "login"',
        hidden: true,
      }),
    );

    expect(screen.getAllByRole('button', {name: /^Remove /})).toHaveLength(2);

    await user.click(
      screen.getAllByRole('button', {name: 'Remove Status: is'})[0],
    );

    expect(screen.getAllByRole('button', {name: /^Remove /})).toHaveLength(1);
    expect(screen.getByText('login')).toBeInTheDocument();
  });

  it('Backspace on an empty input removes only the last filter', async () => {
    const user = userEvent.setup();
    render(<PowerSearchWrapper config={config} />);
    const input = screen.getByRole('combobox', {name: 'Search'});
    await user.type(input, 'status open');
    await user.click(
      await screen.findByRole('option', {name: 'Status is Open', hidden: true}),
    );
    await user.type(input, 'title login');
    await user.click(
      await screen.findByRole('option', {
        name: 'Title contains "login"',
        hidden: true,
      }),
    );

    expect(screen.getAllByRole('button', {name: /^Remove /})).toHaveLength(2);

    await user.click(input);
    await user.keyboard('{Backspace}');

    expect(screen.getAllByRole('button', {name: /^Remove /})).toHaveLength(1);
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  describe('token value truncation (#4759)', () => {
    it('truncates token values by characters, not code units', () => {
      const truncConfig: PowerSearchConfig = {
        name: 'trunc',
        fields: [
          {
            key: 'status',
            label: 'Status',
            operators: [{key: 'is', label: 'is', value: {type: 'string'}}],
          },
        ],
      };
      // 14 emoji = 28 code units but 14 user-perceived characters.
      // adjustedMaxLength = max(15 - 'Status'.length - 'is'.length, 10) = 10,
      // so the value truncates only past 13 characters, cutting at 10.
      render(
        <PowerSearch
          config={truncConfig}
          filters={[
            {
              field: 'status',
              operator: 'is',
              value: {type: 'string', value: '\u{1F600}'.repeat(14)},
            },
          ]}
          onChange={() => {}}
          maxTokenLength={15}
        />,
      );
      expect(
        screen.getByText('\u{1F600}'.repeat(10) + '...'),
      ).toBeInTheDocument();
    });
  });

  describe('startIcon', () => {
    it('does not render a start icon when omitted', () => {
      render(<PowerSearch config={config} filters={[]} onChange={() => {}} />);
      expect(document.querySelector('svg')).not.toBeInTheDocument();
    });

    it('forwards startIcon to the internal Tokenizer', () => {
      render(
        <PowerSearch
          config={config}
          filters={[]}
          onChange={() => {}}
          startIcon={<TestIcon data-testid="start-icon" />}
        />,
      );
      expect(screen.getByTestId('start-icon')).toBeInTheDocument();
    });
  });

  describe('paste behavior', () => {
    it('pasting a field name shows matching field suggestions', async () => {
      const user = userEvent.setup();
      render(<PowerSearchWrapper config={config} />);

      const input = screen.getByRole('combobox');
      await user.click(input);
      await user.paste('Tit');
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      expect(screen.getByText('Title')).toBeInTheDocument();
    });

    it('pasting produces same results as typing', async () => {
      const user = userEvent.setup();
      const {unmount} = render(<PowerSearchWrapper config={config} />);

      // Paste "Stat"
      const input1 = screen.getByRole('combobox');
      await user.click(input1);
      await user.paste('Stat');
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      const pasteResults = screen
        .getAllByRole('option', {hidden: true})
        .map(el => el.textContent);

      unmount();

      // Type "Stat"
      render(<PowerSearchWrapper config={config} />);
      const input2 = screen.getByRole('combobox');
      await user.click(input2);
      await user.type(input2, 'Stat');
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });

      const typeResults = screen
        .getAllByRole('option', {hidden: true})
        .map(el => el.textContent);

      expect(pasteResults).toEqual(typeResults);
    });
  });

  describe('disabledMessage', () => {
    const h = {hidden: true} as const;
    const isOpen = (el: Element) => el.matches(':popover-open');

    function renderSearch(props?: {onChange?: () => void}) {
      return render(
        <PowerSearch
          config={config}
          filters={[]}
          onChange={props?.onChange ?? (() => {})}
          isDisabled
          disabledMessage="You need edit access to search"
        />,
      );
    }

    it('shows the reason tooltip on hover when disabled with a reason', async () => {
      renderSearch();
      const tooltip = screen.getByRole('tooltip', h);
      expect(tooltip).toHaveTextContent('You need edit access to search');
      const wrapper = screen.getByRole('group');
      fireEvent.mouseEnter(wrapper);
      await waitFor(() => expect(isOpen(tooltip)).toBe(true));
      fireEvent.mouseLeave(wrapper);
      await waitFor(() => expect(isOpen(tooltip)).toBe(false));
    });

    it('shows the reason tooltip on keyboard focus', async () => {
      const user = userEvent.setup();
      renderSearch();
      const tooltip = screen.getByRole('tooltip', h);
      await user.tab();
      expect(screen.getByRole('combobox')).toHaveFocus();
      await waitFor(() => expect(isOpen(tooltip)).toBe(true));
    });

    it('does not render a tooltip when not disabled', () => {
      render(
        <PowerSearch
          config={config}
          filters={[]}
          onChange={() => {}}
          disabledMessage="You need edit access to search"
        />,
      );
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    });

    it('does not render a tooltip when disabled without a reason', () => {
      render(
        <PowerSearch
          config={config}
          filters={[]}
          onChange={() => {}}
          isDisabled
        />,
      );
      expect(screen.queryByRole('tooltip', h)).not.toBeInTheDocument();
    });

    it('keeps the input focusable via aria-disabled when a reason is provided', () => {
      renderSearch();
      const input = screen.getByRole('combobox');
      expect(input).not.toBeDisabled();
      expect(input).toHaveAttribute('aria-disabled', 'true');
    });

    it('links the reason tooltip via aria-describedby', () => {
      renderSearch();
      const input = screen.getByRole('combobox');
      const tooltip = screen.getByRole('tooltip', h);
      expect(input.getAttribute('aria-describedby')).toContain(tooltip.id);
    });

    it('blocks input while focusable-disabled', async () => {
      const user = userEvent.setup();
      renderSearch();
      const input = screen.getByRole('combobox');
      input.focus();
      await user.keyboard('open');
      expect((input as HTMLInputElement).value).toBe('');
    });

    it('keeps the input natively disabled when disabled without a reason', () => {
      render(
        <PowerSearch
          config={config}
          filters={[]}
          onChange={() => {}}
          isDisabled
        />,
      );
      expect(screen.getByRole('combobox')).toBeDisabled();
    });
  });

  describe('result count announcements', () => {
    const politeRegion = () =>
      document.querySelector('[data-astryx-live-region="polite"]');

    it('announces the result count to a polite live region when it changes', async () => {
      const {rerender} = render(
        <PowerSearch
          config={config}
          filters={[]}
          onChange={() => {}}
          resultCount={0}
        />,
      );
      rerender(
        <PowerSearch
          config={config}
          filters={[]}
          onChange={() => {}}
          resultCount={5}
        />,
      );
      await waitFor(() => {
        expect(politeRegion()).toHaveTextContent('5 results');
      });
    });

    it('does not announce the result count present on mount under StrictMode, only a later change', async () => {
      // StrictMode replays the mount effects: a mounted-flag guard is reset by
      // the replay and speaks the initial count unprompted; comparing against
      // the last announced text does not.
      const {rerender} = render(
        <StrictMode>
          <PowerSearch
            config={config}
            filters={[]}
            onChange={() => {}}
            resultCount={12}
          />
        </StrictMode>,
      );
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(politeRegion()?.textContent ?? '').toBe('');
      rerender(
        <StrictMode>
          <PowerSearch
            config={config}
            filters={[]}
            onChange={() => {}}
            resultCount={1}
          />
        </StrictMode>,
      );
      await waitFor(() => {
        expect(politeRegion()).toHaveTextContent('1 result');
      });
    });

    it('announces "1 result" (singular) for a single match', async () => {
      const {rerender} = render(
        <PowerSearch
          config={config}
          filters={[]}
          onChange={() => {}}
          resultCount={0}
        />,
      );
      rerender(
        <PowerSearch
          config={config}
          filters={[]}
          onChange={() => {}}
          resultCount={1}
        />,
      );
      await waitFor(() => {
        expect(politeRegion()).toHaveTextContent('1 result');
      });
      expect(politeRegion()?.textContent).not.toMatch(/results/);
    });

    it('announces a string result count verbatim', async () => {
      const {rerender} = render(
        <PowerSearch
          config={config}
          filters={[]}
          onChange={() => {}}
          resultCount="0 items"
        />,
      );
      rerender(
        <PowerSearch
          config={config}
          filters={[]}
          onChange={() => {}}
          resultCount="Showing 1.2k matches"
        />,
      );
      await waitFor(() => {
        expect(politeRegion()).toHaveTextContent('Showing 1.2k matches');
      });
    });

    it('does not announce the result count present on initial mount', async () => {
      render(
        <PowerSearch
          config={config}
          filters={[]}
          onChange={() => {}}
          resultCount={42}
        />,
      );
      // Flush effects and any pending live-region rAF writes.
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });
      expect(politeRegion()?.textContent ?? '').not.toContain('42');
    });

    it('leaves Typeahead dropdown announcements intact and stays silent when no resultCount is set', async () => {
      const user = userEvent.setup();
      render(<PowerSearchWrapper config={config} />);
      const input = screen.getByRole('combobox');
      await user.click(input);
      await user.type(input, 'Status');
      // BaseTypeahead announces the dropdown suggestion count; PowerSearch adds
      // no result-count announcement because resultCount is unset.
      await waitFor(() => {
        expect(politeRegion()?.textContent).toMatch(/\d+ results?/);
      });
    });
  });
});

describe('filter token focus', () => {
  it('opens the editor with the mouse without opening search suggestions', async () => {
    const user = userEvent.setup();
    render(
      <PowerSearch
        config={config}
        filters={[
          {
            field: 'status',
            operator: 'is',
            value: {type: 'enum', value: 'open'},
          },
        ]}
        onChange={() => {}}
      />,
    );
    const input = screen.getByRole('combobox', {name: 'Search'});

    await user.pointer({
      target: screen.getByText('Status: is'),
      keys: '[MouseLeft>]',
    });
    expect(input).not.toHaveFocus();
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('button', {name: 'Apply', hidden: true}),
    ).toBeNull();

    await user.pointer({keys: '[/MouseLeft]'});
    expect(
      await screen.findByRole('button', {name: 'Apply', hidden: true}),
    ).toBeInTheDocument();
  });

  it('preserves search entry and token editing with the keyboard', async () => {
    const user = userEvent.setup();
    render(
      <PowerSearch
        config={config}
        filters={[
          {
            field: 'status',
            operator: 'is',
            value: {type: 'enum', value: 'open'},
          },
        ]}
        onChange={() => {}}
      />,
    );
    await user.tab();
    expect(screen.getByRole('combobox', {name: 'Search'})).toHaveFocus();

    await user.tab({shift: true}); // Remove button
    await user.tab({shift: true}); // Token label
    expect(screen.getByRole('button', {name: 'Status: is'})).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(
      await screen.findByRole('button', {name: 'Apply', hidden: true}),
    ).toBeInTheDocument();
  });
});

describe('PowerSearch statusVariant forwarding', () => {
  it('defaults to attached (status renders with data-variant="attached")', () => {
    const {container} = render(
      <PowerSearch
        config={config}
        filters={[]}
        onChange={() => {}}
        status={{type: 'error', message: 'Required'}}
      />,
    );
    expect(container.querySelector('.astryx-field-status')).toHaveAttribute(
      'data-variant',
      'attached',
    );
  });

  it('forwards statusVariant="detached" to the underlying Field status', () => {
    const {container} = render(
      <PowerSearch
        config={config}
        filters={[]}
        onChange={() => {}}
        status={{type: 'error', message: 'Required'}}
        statusVariant="detached"
      />,
    );
    expect(container.querySelector('.astryx-field-status')).toHaveAttribute(
      'data-variant',
      'detached',
    );
  });
});

describe('maxOperatorMenuItems', () => {
  it('caps entity suggestions after selecting a field', async () => {
    const people = Array.from({length: 6}, (_, index) => ({
      id: `person-${index}`,
      label: `Person ${index}`,
    }));
    const config: PowerSearchConfig = {
      name: 'PeopleSearch',
      fields: [
        {
          key: 'person',
          label: 'Person',
          defaultOperator: 'is_any_of',
          operators: [
            {
              key: 'is_any_of',
              label: 'is any of',
              value: {
                type: 'entity_list',
                searchSource: {
                  search: query =>
                    people.filter(person => person.label.includes(query)),
                  bootstrap: () => people,
                },
              },
            },
          ],
        },
      ],
    };
    const user = userEvent.setup();
    render(
      <PowerSearch
        config={config}
        filters={[
          {
            field: 'person',
            operator: 'is_any_of',
            value: {type: 'entity_list', value: [people[0]]},
          },
        ]}
        onChange={() => {}}
        maxOperatorMenuItems={2}
      />,
    );

    await user.click(screen.getByRole('button', {name: 'Person: is any of'}));
    const inputs = screen.getAllByRole('combobox', {hidden: true});
    const valueInput = inputs[inputs.length - 1];
    await user.type(valueInput, 'Person');

    const listboxID = valueInput.getAttribute('aria-controls');
    expect(listboxID).not.toBeNull();
    const listbox = document.getElementById(listboxID!);
    expect(listbox).not.toBeNull();
    await waitFor(() => {
      expect(
        within(listbox!).getAllByRole('option', {hidden: true}),
      ).toHaveLength(2);
    });
  });
});

describe('field menu sizing', () => {
  const FIELD_COUNT = 25;
  const manyFields: PowerSearchConfig = {
    name: 'ManyFields',
    fields: Array.from({length: FIELD_COUNT}, (_, i) => ({
      key: `field_${i}`,
      label: `Zebra ${String(i).padStart(2, '0')}`,
      defaultOperator: 'is',
      operators: [{key: 'is', label: 'is', value: {type: 'string'} as const}],
    })),
  };

  async function openMenu(
    props?: {maxSearchResults?: number; menuWidth?: number},
    config: PowerSearchConfig = manyFields,
  ) {
    const user = userEvent.setup();
    render(
      <PowerSearch
        config={config}
        filters={[]}
        onChange={() => {}}
        {...props}
      />,
    );
    await user.click(screen.getByRole('combobox'));
    await waitFor(() => {
      expect(screen.getByRole('listbox', {hidden: true})).toBeInTheDocument();
    });
    return user;
  }

  const optionCount = () =>
    screen.getAllByRole('option', {hidden: true}).length;

  it('shows every field in a normal field list while browsing', async () => {
    await openMenu();
    expect(optionCount()).toBe(FIELD_COUNT);
  });

  it('caps an extreme field list at the 1,000-row browsing ceiling', async () => {
    const extremeConfig: PowerSearchConfig = {
      name: 'ExtremeFields',
      fields: Array.from({length: 1001}, (_, i) => ({
        key: `extreme_${i}`,
        label: `Extreme ${i}`,
        defaultOperator: 'is',
        operators: [{key: 'is', label: 'is', value: {type: 'string'} as const}],
      })),
    };

    await openMenu(undefined, extremeConfig);
    expect(optionCount()).toBe(1000);
  });

  it('caps ranked results while typing', async () => {
    const user = await openMenu();
    // "zebra" matches every field label.
    await user.type(screen.getByRole('combobox'), 'zebra');
    await waitFor(() => {
      expect(optionCount()).toBe(10);
    });
  });

  it('caps ranked results at maxSearchResults while typing', async () => {
    const user = await openMenu({maxSearchResults: 3});
    await user.type(screen.getByRole('combobox'), 'zebra');
    await waitFor(() => {
      expect(optionCount()).toBe(3);
    });
  });

  it('does not apply maxSearchResults while browsing', async () => {
    await openMenu({maxSearchResults: 3});
    expect(optionCount()).toBe(FIELD_COUNT);
  });

  it('applies menuWidth to the main field menu', async () => {
    await openMenu({menuWidth: 480});
    const listbox = screen.getByRole('listbox', {hidden: true});
    const popover = listbox.closest('[popover]');
    expect(popover).not.toBeNull();
    // Clamped to the layer runtime's viewport cap, never to the room beside
    // the field (spec:AST-059 FR2, FR7).
    expect(
      (popover as HTMLElement).style.getPropertyValue('--x-width'),
    ).toMatch(/^min\(480px, calc\(100vw - /);
  });
});

describe('field menu grouping', () => {
  const groupedConfig: PowerSearchConfig = {
    name: 'GroupedSearch',
    fields: [
      field('team_a', 'Field Team A', 'Team'),
      field('plain_a', 'Field Plain A'),
      field('time_a', 'Field Time A', 'Time'),
      field('team_b', 'Field Team B', 'Team'),
      field('plain_b', 'Field Plain B'),
      field('time_b', 'Field Time B', 'Time'),
    ],
  };

  function field(key: string, label: string, group?: string) {
    return {
      key,
      label,
      group,
      operators: [{key: 'is', label: 'is', value: {type: 'string'} as const}],
    };
  }

  async function openMenu() {
    const user = userEvent.setup();
    render(
      <PowerSearch config={groupedConfig} filters={[]} onChange={() => {}} />,
    );
    await user.click(screen.getByRole('combobox'));
    await waitFor(() => {
      expect(screen.getByRole('listbox', {hidden: true})).toBeInTheDocument();
    });
    return user;
  }

  it('renders ungrouped fields first and named sections after them', async () => {
    await openMenu();
    const listbox = screen.getByRole('listbox', {hidden: true});
    expect(
      within(listbox)
        .getAllByRole('option', {hidden: true})
        .map(option => option.textContent),
    ).toEqual([
      'Field Plain A',
      'Field Plain B',
      'Field Team A',
      'Field Team B',
      'Field Time A',
      'Field Time B',
    ]);
    expect(
      within(listbox)
        .getAllByRole('group', {hidden: true})
        .map(group => group.getAttribute('aria-label')),
    ).toEqual(['Team', 'Time']);
  });

  it('keeps keyboard navigation flat across section boundaries', async () => {
    const user = await openMenu();
    const input = screen.getByRole('combobox');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    const activeId = input.getAttribute('aria-activedescendant');
    expect(activeId).not.toBeNull();
    expect(document.getElementById(activeId!)?.textContent).toBe(
      'Field Team A',
    );
  });

  it('keeps ranked results flat while typing', async () => {
    const user = await openMenu();
    await user.type(screen.getByRole('combobox'), 'field');
    await waitFor(() => {
      expect(
        within(screen.getByRole('listbox', {hidden: true})).queryAllByRole(
          'group',
          {hidden: true},
        ),
      ).toHaveLength(0);
    });
  });
});

describe('field menu highlight under a resting pointer', () => {
  it('keeps the first field highlighted when the menu opens under the pointer', async () => {
    const user = userEvent.setup();
    render(<PowerSearchWrapper config={config} />);
    const input = screen.getByRole('combobox', {name: 'Search'});

    // Open the field menu from the keyboard; the option that lands under a
    // resting pointer receives mouseenter but no mousemove.
    await user.tab();
    const status = await screen.findByRole('option', {
      name: 'Status',
      hidden: true,
    });
    const title = screen.getByRole('option', {name: 'Title', hidden: true});
    expect(input.getAttribute('aria-activedescendant')).toBe(title.id);

    fireEvent.mouseEnter(status);
    expect(input.getAttribute('aria-activedescendant')).toBe(title.id);

    // Enter acts on the highlighted first field, not the one under the
    // pointer.
    await user.keyboard('{Enter}');
    expect(
      await screen.findByRole('button', {name: 'Apply', hidden: true}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', {name: 'Field', hidden: true}),
    ).toHaveTextContent('Title');
  });

  it('moves the highlight when the pointer moves over a field', async () => {
    const user = userEvent.setup();
    render(<PowerSearchWrapper config={config} />);
    const input = screen.getByRole('combobox', {name: 'Search'});

    await user.tab();
    const status = await screen.findByRole('option', {
      name: 'Status',
      hidden: true,
    });
    fireEvent.mouseMove(status);
    expect(input.getAttribute('aria-activedescendant')).toBe(status.id);
  });
});

describe('field menu after the search source changes', () => {
  it('opens the new field menu on the first click after a config change', async () => {
    const user = userEvent.setup();
    // A caller that loads field options asynchronously hands PowerSearch a
    // new config, which builds a new search source.
    const loadedConfig: PowerSearchConfig = {
      ...config,
      fields: [
        ...config.fields,
        {
          key: 'owner',
          label: 'Owner',
          defaultOperator: 'is',
          operators: [{key: 'is', label: 'is', value: {type: 'string'}}],
        },
      ],
    };
    const renderSearch = (searchConfig: PowerSearchConfig) => (
      <>
        <PowerSearch config={searchConfig} filters={[]} onChange={() => {}} />
        <button type="button">Sort</button>
      </>
    );
    const {rerender} = render(renderSearch(config));
    const input = screen.getByRole('combobox');

    await user.click(input);
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'true');
    });
    await user.click(screen.getByRole('button', {name: 'Sort'}));
    expect(input).toHaveAttribute('aria-expanded', 'false');

    rerender(renderSearch(loadedConfig));
    await user.click(input);

    await waitFor(() => {
      expect(input).toHaveAttribute('aria-expanded', 'true');
      expect(
        screen.getByRole('option', {name: /Owner/, hidden: true}),
      ).toBeInTheDocument();
    });
  });
});
