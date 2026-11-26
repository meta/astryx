// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PowerSearchTokenText.test.tsx
 * @input PowerSearch in its popover presentation, under a German provider
 * @output Each kind of token value reads in the provider locale: the
 *   catalog's summaries and relative dates, the locale's list format and its
 *   decimal mark
 * @position Unit test of the popover token's value text
 */

import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {InternationalizationProvider} from '../i18n/InternationalizationProvider';
import {PowerSearch} from './PowerSearch';
import type {PowerSearchConfig, PowerSearchFilter} from './types';

const config: PowerSearchConfig = {
  name: 'Issues',
  fields: [
    {
      key: 'tags',
      label: 'Tags',
      operators: [{key: 'in', label: 'in', value: {type: 'string_list'}}],
    },
    {
      key: 'window',
      label: 'Window',
      operators: [{key: 'between', label: 'in', value: {type: 'date_range'}}],
    },
    {
      key: 'group',
      label: 'Group',
      operators: [{key: 'all', label: 'all', value: {type: 'nested'}}],
    },
    {
      key: 'age',
      label: 'Age',
      operators: [
        {
          key: 'newer',
          label: 'since',
          value: {type: 'date_relative', isFutureAllowed: false},
        },
      ],
    },
    {
      key: 'cost',
      label: 'Cost',
      operators: [{key: 'gt', label: '>', value: {type: 'float'}}],
    },
  ],
};

const filters: ReadonlyArray<PowerSearchFilter> = [
  {
    field: 'tags',
    operator: 'in',
    value: {type: 'string_list', value: ['a', 'b', 'c']},
  },
  {
    field: 'tags',
    operator: 'in',
    value: {
      type: 'string_list',
      value: ['alpha-bravo', 'charlie-delta', 'echo-foxtrot'],
    },
  },
  {
    field: 'window',
    operator: 'between',
    value: {
      type: 'date_range',
      value: {
        start: {type: 'ABSOLUTE', unixSeconds: 1709251200},
        end: {type: 'ABSOLUTE', unixSeconds: 1710028800},
      },
    },
  },
  {
    field: 'group',
    operator: 'all',
    value: {
      type: 'nested',
      value: [
        {field: 'cost', operator: 'gt', value: {type: 'float', value: 1}},
      ],
    },
  },
  {
    field: 'age',
    operator: 'newer',
    value: {type: 'date_relative', value: '3d_ago'},
  },
  {field: 'cost', operator: 'gt', value: {type: 'float', value: 2.5}},
];

describe('PowerSearch popover token text', () => {
  it('reads every value in the provider locale', () => {
    render(
      <InternationalizationProvider
        locale="de"
        messages={{
          de: {
            '@astryx.powersearch.valueEditor.itemsCount': {
              defaultMessage:
                '{count, plural, one {# Eintrag} other {# Einträge}}',
            },
            '@astryx.powersearch.valueEditor.dateRange': {
              defaultMessage: 'Zeitraum',
            },
            '@astryx.powersearch.valueEditor.filtersCount': {
              defaultMessage:
                '{count, plural, one {# Filter} other {# Filter}}',
            },
            '@astryx.powersearch.sheet.relativeDaysAgo': {
              defaultMessage:
                'vor {count, plural, one {# Tag} other {# Tagen}}',
            },
          },
        }}>
        <PowerSearch
          config={config}
          filters={filters}
          onChange={() => {}}
          maxTokenLength={30}
          presentation="popover"
        />
      </InternationalizationProvider>,
    );
    expect(screen.getByText('a, b und c')).toBeInTheDocument();
    expect(screen.getByText('3 Einträge')).toBeInTheDocument();
    // The range reads its two days in the locale's own range form (FR25).
    expect(screen.getByText('1.–10. März 2024')).toBeInTheDocument();
    expect(screen.getByText('1 Filter')).toBeInTheDocument();
    expect(screen.getByText('vor 3 Tagen')).toBeInTheDocument();
    expect(screen.getByText('2,5')).toBeInTheDocument();
  });

  it('reads the same values in English without a provider', () => {
    render(
      <PowerSearch
        config={config}
        filters={filters}
        onChange={() => {}}
        maxTokenLength={30}
        presentation="popover"
      />,
    );
    expect(screen.getByText('a, b, c')).toBeInTheDocument();
    expect(screen.getByText('3 items')).toBeInTheDocument();
    expect(screen.getByText('Mar 1 – 10, 2024')).toBeInTheDocument();
    expect(screen.getByText('1 filter')).toBeInTheDocument();
    expect(screen.getByText('3 days ago')).toBeInTheDocument();
    expect(screen.getByText('2.5')).toBeInTheDocument();
  });
});
