// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {render, renderHook, screen, within} from '@testing-library/react';
import {Theme} from '../../../theme/Theme';
import {defineTheme} from '../../../theme/defineTheme';
import {__resetDevWarnings} from '../../../utils/devWarning';
import {Table} from '../../Table';
import type {TableColumn, TablePlugin} from '../../types';
import {useTableRowExpansion} from '../rowExpansion';
import {useTableSelection} from '../selection';
import {
  useTableRowStatus,
  type UseTableRowStatusConfig,
} from './useTableRowStatus';

interface Row extends Record<string, unknown> {
  id: string;
  name: string;
  state: 'error' | 'warning' | 'ok' | 'done';
}

type TableRowStatusResult = Exclude<
  ReturnType<UseTableRowStatusConfig<Row>['getStatus']>,
  null
>;

const data: Row[] = [
  {id: 'a', name: 'Alice', state: 'error'},
  {id: 'b', name: 'Bob', state: 'ok'},
  {id: 'c', name: 'Carol', state: 'warning'},
];

const columns: TableColumn<Row>[] = [{key: 'name', header: 'Name'}];

function getStatus(item: Row): TableRowStatusResult | null {
  if (item.state === 'error') {
    return {status: 'error', label: 'Error'};
  }
  if (item.state === 'warning') {
    return {status: 'warning', label: 'Warning'};
  }
  return null;
}

function Harness({
  rows = data,
  statusFn = getStatus,
}: {
  rows?: Row[];
  statusFn?: (item: Row) => TableRowStatusResult | null;
}) {
  const rowStatus = useTableRowStatus<Row>({getStatus: statusFn});
  return (
    <Table data={rows} columns={columns} idKey="id" plugins={{rowStatus}} />
  );
}

beforeEach(() => {
  __resetDevWarnings();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('useTableRowStatus', () => {
  it('preserves the fixed leading status-column semantics', () => {
    render(<Harness />);
    const header = screen.getByRole('columnheader', {name: 'Row status'});

    expect(header).toHaveAttribute('data-column-key', '__rowStatus');
    expect(screen.getAllByRole('columnheader')[0]).toBe(header);
    expect(header).toHaveStyle({width: '28px'});

    const hiddenText = within(header).getByText('Row status');
    expect(hiddenText.tagName).toBe('SPAN');
    expect(hiddenText.className).not.toBe('');
  });

  it('preserves plugin identity for a stable getStatus callback', () => {
    const {result, rerender} = renderHook(() =>
      useTableRowStatus<Row>({getStatus}),
    );
    const initialPlugin = result.current;

    rerender();

    expect(result.current).toBe(initialPlugin);
  });

  it('resolves every semantic status through the active theme glyph and tone', () => {
    const theme = defineTheme({
      name: 'table-row-status-semantic-icons',
      icons: {
        success: <svg data-testid="themed-success" />,
        warning: <svg data-testid="themed-warning" />,
        error: <svg data-testid="themed-error" />,
      },
    });

    render(
      <Theme theme={theme}>
        <Harness
          statusFn={item =>
            item.id === 'a'
              ? {status: 'error', label: 'Error'}
              : item.id === 'b'
                ? {status: 'success', label: 'Success'}
                : {status: 'warning', label: 'Warning'}
          }
        />
      </Theme>,
    );

    for (const status of ['success', 'warning', 'error'] as const) {
      const glyph = screen.getByTestId(`themed-${status}`);
      expect(
        screen.getByRole('img', {
          name: status[0].toUpperCase() + status.slice(1),
        }),
      ).toContainElement(glyph);
      expect(glyph.parentElement).toHaveAttribute('data-color', status);
    }
  });

  it('keeps every semantic-looking custom color on the stable 8px dot path', () => {
    render(
      <Harness
        statusFn={item =>
          item.id === 'a'
            ? {color: 'success', label: 'Success-colored custom marker'}
            : item.id === 'b'
              ? {color: 'warning', label: 'Warning-colored custom marker'}
              : {color: 'error', label: 'Error-colored custom marker'}
        }
      />,
    );

    const expectedTokens = {
      'Success-colored custom marker': '--color-icon-green',
      'Warning-colored custom marker': '--color-icon-orange',
      'Error-colored custom marker': '--color-icon-red',
    } as const;

    for (const [label, token] of Object.entries(expectedTokens)) {
      const indicator = screen.getByRole('img', {name: label});
      const dot = indicator.firstElementChild;

      expect(indicator.querySelector('svg')).toBeNull();
      expect(dot).toBeInstanceOf(HTMLElement);
      expect(getComputedStyle(dot as HTMLElement).width).toBe('8px');
      expect(getComputedStyle(dot as HTMLElement).height).toBe('8px');
      expect(dot?.getAttribute('style')).toContain(token);
    }
  });

  it('keeps an explicit undefined status on the custom-marker path', () => {
    render(
      <Harness
        statusFn={item =>
          item.state === 'error'
            ? {status: undefined, color: 'red', label: 'Custom marker'}
            : null
        }
      />,
    );

    const indicator = screen.getByRole('img', {name: 'Custom marker'});
    expect(indicator.querySelector('svg')).toBeNull();
    expect(indicator.firstElementChild?.getAttribute('style')).toContain(
      '--color-icon-red',
    );
  });

  it('preserves the released paint for a named custom icon', () => {
    const theme = defineTheme({
      name: 'table-row-status-custom-icon',
      icons: {
        clock: <svg data-testid="caller-clock" />,
        warning: <svg data-testid="semantic-warning" />,
      },
    });

    render(
      <Theme theme={theme}>
        <Harness
          statusFn={item =>
            item.state === 'warning'
              ? {color: 'warning', icon: 'clock', label: 'Custom clock'}
              : null
          }
        />
      </Theme>,
    );

    const indicator = screen.getByRole('img', {name: 'Custom clock'});
    const glyph = screen.getByTestId('caller-clock');

    expect(indicator).toContainElement(glyph);
    expect(screen.queryByTestId('semantic-warning')).not.toBeInTheDocument();
    // A closed tooltip leaves its trigger with no inline style at all.
    expect(indicator.getAttribute('style') ?? '').not.toContain('--color-icon');
    expect(glyph.parentElement).toHaveAttribute('data-color', 'warning');
  });

  it('applies a raw CSS color to an explicit custom icon', () => {
    const theme = defineTheme({
      name: 'table-row-status-raw-custom-icon',
      icons: {check: <svg data-testid="raw-caller-check" />},
    });

    render(
      <Theme theme={theme}>
        <Harness
          statusFn={item =>
            item.state === 'error'
              ? {
                  color: 'rgb(1, 2, 3)',
                  icon: 'check',
                  label: 'Raw custom icon',
                }
              : null
          }
        />
      </Theme>,
    );

    const indicator = screen.getByRole('img', {name: 'Raw custom icon'});
    const glyph = screen.getByTestId('raw-caller-check');
    expect(indicator).toContainElement(glyph);
    expect(indicator.getAttribute('style')).toContain('rgb(1, 2, 3)');
    expect(glyph.parentElement).toHaveAttribute('data-color', 'inherit');
  });

  it('passes through a raw CSS color to a custom dot', () => {
    render(
      <Harness
        statusFn={item =>
          item.state === 'error' ? {color: 'rgb(1, 2, 3)', label: 'Raw'} : null
        }
      />,
    );

    const indicator = screen.getByRole('img', {name: 'Raw'});
    expect(indicator.firstElementChild?.getAttribute('style')).toContain(
      'rgb(1, 2, 3)',
    );
  });

  it('renders no indicator for rows returning null', () => {
    render(<Harness />);
    const rows = screen.getAllByRole('row');
    const bob = rows[2];

    expect(within(bob).getByText('Bob')).toBeInTheDocument();
    expect(within(bob).queryByRole('img')).not.toBeInTheDocument();
  });

  it('exposes the required label as one accessible image name', () => {
    render(
      <Harness
        statusFn={item =>
          item.state === 'error' ? {status: 'error', label: 'Failed'} : null
        }
      />,
    );

    const indicator = screen.getByRole('img', {name: 'Failed'});
    expect(indicator).toBeInTheDocument();
    expect(within(indicator).queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  describe.each([
    [
      'row status before expansion',
      false,
      ['__expansion', '__rowStatus', '__xds_selection', 'name'],
    ],
    [
      'expansion before row status',
      true,
      ['__rowStatus', '__expansion', '__xds_selection', 'name'],
    ],
  ] as const)(
    'with selection and expansion plugins: %s',
    (_label, expansionFirst, expectedColumnKeys) => {
      function CompositionHarness() {
        const selection = useTableSelection<Row>({
          getIsItemSelected: () => false,
          onSelectItem: () => {},
          onSelectAll: () => {},
          getIsAllSelected: () => false,
          getRowLabel: item => item.name,
        });
        const expansion = useTableRowExpansion<Row>({
          expandedKeys: new Set(),
          onToggle: () => {},
          getRowKey: item => item.id,
          renderExpanded: item => item.name,
        });
        const rowStatus = useTableRowStatus<Row>({getStatus});
        const plugins = expansionFirst
          ? {selection, expansion, rowStatus}
          : {selection, rowStatus, expansion};

        return (
          <Table data={data} columns={columns} idKey="id" plugins={plugins} />
        );
      }

      it('keeps each generated column and row control valid', () => {
        render(<CompositionHarness />);

        expect(
          screen
            .getAllByRole('columnheader')
            .map(header => header.getAttribute('data-column-key')),
        ).toEqual(expectedColumnKeys);
        expect(screen.getAllByRole('checkbox')).toHaveLength(4);
        expect(
          screen.getAllByRole('button', {name: 'Expand row'}),
        ).toHaveLength(3);
        expect(
          screen.getAllByRole('img', {name: /Error|Warning/}),
        ).toHaveLength(2);
      });
    },
  );

  describe.each([
    [
      'row status before custom plugin',
      false,
      ['__custom', '__rowStatus', 'name'],
    ],
    [
      'custom plugin before row status',
      true,
      ['__rowStatus', '__custom', 'name'],
    ],
  ] as const)(
    'with a caller-defined plugin: %s',
    (_label, customFirst, expectedColumnKeys) => {
      const customPlugin: TablePlugin<Row> = {
        transformColumns(inputColumns) {
          return [
            {
              key: '__custom',
              header: 'Custom',
              renderCell: item => item.id,
            },
            ...inputColumns,
          ];
        },
      };

      function CustomPluginHarness() {
        const rowStatus = useTableRowStatus<Row>({getStatus});
        const plugins = customFirst
          ? {customPlugin, rowStatus}
          : {rowStatus, customPlugin};
        return (
          <Table data={data} columns={columns} idKey="id" plugins={plugins} />
        );
      }

      it('follows the parent pipeline without dropping or duplicating columns', () => {
        render(<CustomPluginHarness />);

        expect(
          screen
            .getAllByRole('columnheader')
            .map(header => header.getAttribute('data-column-key')),
        ).toEqual(expectedColumnKeys);
        expect(
          screen.getAllByRole('img', {name: /Error|Warning/}),
        ).toHaveLength(2);
        expect(screen.getByText('a')).toBeInTheDocument();
        expect(screen.getByText('b')).toBeInTheDocument();
        expect(screen.getByText('c')).toBeInTheDocument();
      });
    },
  );

  it('renders the status header with empty data and no indicators', () => {
    render(<Harness rows={[]} />);
    const header = screen.getByRole('columnheader', {name: 'Row status'});

    expect(header).toHaveAttribute('data-column-key', '__rowStatus');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('lets status win every untyped custom-marker conflict and warns once in development', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const theme = defineTheme({
      name: 'table-row-status-conflict',
      icons: {
        error: <svg data-testid="conflict-semantic-error" />,
        warning: <svg data-testid="conflict-semantic-warning" />,
        success: <svg data-testid="conflict-semantic-success" />,
        check: <svg data-testid="ignored-custom-check" />,
      },
    });

    render(
      <Theme theme={theme}>
        <Harness
          statusFn={item =>
            (item.id === 'a'
              ? {
                  status: 'error',
                  color: 'blue',
                  label: 'Status plus color',
                }
              : item.id === 'b'
                ? {
                    status: 'warning',
                    icon: 'check',
                    label: 'Status plus icon',
                  }
                : {
                    status: 'success',
                    color: 'red',
                    icon: 'check',
                    label: 'Status plus color and icon',
                  }) as unknown as TableRowStatusResult
          }
        />
      </Theme>,
    );

    expect(screen.getByTestId('conflict-semantic-error')).toBeInTheDocument();
    expect(screen.getByTestId('conflict-semantic-warning')).toBeInTheDocument();
    expect(screen.getByTestId('conflict-semantic-success')).toBeInTheDocument();
    expect(
      screen.queryByTestId('ignored-custom-check'),
    ).not.toBeInTheDocument();
    const conflictWarnings = warning.mock.calls.filter(
      ([message]) =>
        message ===
        'useTableRowStatus: status cannot be combined with color or icon. The semantic status takes precedence and the custom marker fields are ignored.',
    );
    expect(conflictWarnings).toHaveLength(1);
  });

  it('uses the same status-wins fallback without warning in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const theme = defineTheme({
      name: 'table-row-status-production-conflict',
      icons: {
        warning: <svg data-testid="production-semantic-warning" />,
        check: <svg data-testid="production-ignored-check" />,
      },
    });
    const mixedStatus = {
      status: 'warning',
      color: 'red',
      icon: 'check',
      label: 'Conflict',
    } as unknown as TableRowStatusResult;

    render(
      <Theme theme={theme}>
        <Harness statusFn={() => mixedStatus} />
      </Theme>,
    );

    expect(screen.getAllByTestId('production-semantic-warning')).toHaveLength(
      3,
    );
    expect(
      screen.queryByTestId('production-ignored-check'),
    ).not.toBeInTheDocument();
    const conflictWarnings = warning.mock.calls.filter(
      ([message]) =>
        message ===
        'useTableRowStatus: status cannot be combined with color or icon. The semantic status takes precedence and the custom marker fields are ignored.',
    );
    expect(conflictWarnings).toHaveLength(0);
  });

  it('uses the custom branch when an untyped status is unsupported', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const theme = defineTheme({
      name: 'table-row-status-unsupported',
      icons: {check: <svg data-testid="unsupported-custom-check" />},
    });
    const unsupportedStatus = {
      status: 'info',
      color: 'red',
      icon: 'check',
      label: 'Unsupported semantic, valid custom marker',
    } as unknown as TableRowStatusResult;

    render(
      <Theme theme={theme}>
        <Harness statusFn={() => unsupportedStatus} />
      </Theme>,
    );

    const indicator = screen.getAllByRole('img', {
      name: 'Unsupported semantic, valid custom marker',
    })[0];
    const unsupportedGlyph = screen.getAllByTestId(
      'unsupported-custom-check',
    )[0];
    expect(indicator).toContainElement(unsupportedGlyph);
    expect(unsupportedGlyph.parentElement).toHaveAttribute('data-color', 'red');
    const conflictWarnings = warning.mock.calls.filter(
      ([message]) =>
        message ===
        'useTableRowStatus: status cannot be combined with color or icon. The semantic status takes precedence and the custom marker fields are ignored.',
    );
    expect(conflictWarnings).toHaveLength(0);
  });
});
