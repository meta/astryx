// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file Tokenizer.composites.test.tsx
 * @input Uses vitest, Testing Library, PowerSearch, PowerSearchValueEditor,
 *   and Table's filtering plugin under a compact coarse-pointer `matchMedia`
 * @output Proves Core's composites that render Tokenizer as an inline field
 *   pin its `popover` presentation, so the `adaptive` default does not turn
 *   them into a sheet trigger on a phone: PowerSearch's field and its list
 *   value editors, and Table's list filter. PowerSearch's own sheet still asks
 *   the list editors for Tokenizer's sheet.
 * @position Core tests; validates the `presentation` call sites in
 *   PowerSearch.tsx, PowerSearchValueEditor.tsx, and useTableFiltering.tsx
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {useState} from 'react';
import {render, screen} from '@testing-library/react';
import {PowerSearch} from '../PowerSearch/PowerSearch';
import {PowerSearchValueEditor} from '../PowerSearch/PowerSearchValueEditor';
import type {InternalConfig} from '../PowerSearch/useInternalConfig';
import type {PowerSearchConfig} from '../PowerSearch/types';
import {Table} from '../Table/Table';
import {useTableFiltering} from '../Table/plugins/filtering/useTableFiltering';
import type {TableFilterState} from '../Table/plugins/filtering/useTableFiltering';
import type {TableColumn} from '../Table/types';

const config: PowerSearchConfig = {
  name: 'issues',
  fields: [
    {
      key: 'tags',
      label: 'Tags',
      defaultOperator: 'include',
      operators: [
        {key: 'include', label: 'include', value: {type: 'string_list'}},
      ],
    },
  ],
};

const stubConfig = {
  fields: [],
  fieldsByKey: new Map(),
} as unknown as InternalConfig;

// The Tokenizer's sheet trigger is a button that opens a dialog; none of
// these fields renders another one at rest.
const sheetTriggers = () =>
  document.querySelectorAll('button[aria-haspopup="dialog"]');

beforeEach(() => {
  // A phone: every compact coarse-pointer query matches.
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('Tokenizer in Core composites on a compact coarse-pointer screen', () => {
  it("keeps PowerSearch's popover field an inline combobox", () => {
    render(
      <PowerSearch
        config={config}
        filters={[]}
        onChange={() => {}}
        presentation="popover"
      />,
    );
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(sheetTriggers()).toHaveLength(0);
  });

  it.each([
    ['string_list', {type: 'string_list'}],
    [
      'entity_list',
      {
        type: 'entity_list',
        searchSource: {search: () => [], bootstrap: () => []},
      },
    ],
    ['enum_list', {type: 'enum_list', values: [{value: 'a', label: 'A'}]}],
  ] as const)(
    'keeps the %s value editor of the popover an inline combobox',
    (_name, operatorValue) => {
      render(
        <PowerSearchValueEditor
          operatorValue={operatorValue as never}
          filterValue={undefined}
          onChange={() => {}}
          config={stubConfig}
        />,
      );
      expect(screen.getByRole('combobox')).toBeInTheDocument();
      expect(sheetTriggers()).toHaveLength(0);
    },
  );

  it("still opens Tokenizer's sheet from PowerSearch's sheet value step", () => {
    render(
      <PowerSearchValueEditor
        operatorValue={{type: 'string_list'}}
        filterValue={undefined}
        onChange={() => {}}
        config={stubConfig}
        presentation="bottom-sheet"
        fieldLabel="Tags"
      />,
    );
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(sheetTriggers()).toHaveLength(1);
  });

  it("keeps Table's list filter an inline combobox", () => {
    interface Row extends Record<string, unknown> {
      id: string;
      tags: string;
    }
    const columns: TableColumn<Row>[] = [
      {key: 'tags', header: 'Tags', filter: 'tags'},
    ];
    function FilterTable() {
      const [filters, setFilters] = useState<TableFilterState>({});
      const filterPlugin = useTableFiltering<Row>({
        filters,
        onFilterChange: (key, value) =>
          setFilters(prev => ({...prev, [key]: value ?? undefined})),
        variant: 'inline',
        searchConfig: config,
      });
      return (
        <Table
          data={[{id: '1', tags: 'bug'}]}
          columns={columns}
          idKey="id"
          plugins={{filter: filterPlugin}}
        />
      );
    }
    render(<FilterTable />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(sheetTriggers()).toHaveLength(0);
  });
});
