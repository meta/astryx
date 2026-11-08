// Copyright (c) Meta Platforms, Inc. and affiliates.
// PREVIEW ONLY, not for merge. Shows two candidate directions for one shared
// list-row padding: `?variant=a1` (RadioList rows take List's density
// padding) and `?variant=a2` (CheckboxList rows take RadioList's spacing).
// The variants are applied by a page-level style override, so the shipped
// components stay unchanged on this branch.

'use client';

import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {PowerSearch} from '@astryxdesign/core/PowerSearch';
import type {
  PowerSearchConfig,
  PowerSearchFilter,
} from '@astryxdesign/core/PowerSearch';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {CheckboxList, CheckboxListItem} from '@astryxdesign/core/CheckboxList';
import {Heading, Text} from '@astryxdesign/core/Text';

const statusValues = [
  {value: 'open', label: 'Open'},
  {value: 'in_progress', label: 'In Progress'},
  {value: 'review', label: 'In Review'},
  {value: 'closed', label: 'Closed'},
  {value: 'blocked', label: 'Blocked'},
];

const config: PowerSearchConfig = {
  name: 'ListPaddingPreview',
  fields: [
    {
      key: 'status',
      label: 'Status',
      defaultOperator: 'is_any_of',
      operators: [
        {key: 'is', label: 'is', value: {type: 'enum', values: statusValues}},
        {
          key: 'is_not',
          label: 'is not',
          value: {type: 'enum', values: statusValues},
        },
        {
          key: 'is_any_of',
          label: 'is any of',
          value: {type: 'enum_list', values: statusValues},
        },
        {
          key: 'is_none_of',
          label: 'is none of',
          value: {type: 'enum_list', values: statusValues},
        },
      ],
    },
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

// Balanced density: List's item padding is 8px per row and its row gap 2px;
// RadioList's rows have no padding and an 8px gap.
const VARIANT_CSS: Record<string, string> = {
  a1: `
    .astryx-radio-list-item { padding-block: 8px !important; }
    .astryx-radio-list[data-orientation="vertical"] { gap: 2px !important; }
  `,
  a2: `
    .astryx-checkbox-list .astryx-list-item { padding-block: 0 !important; }
    .astryx-checkbox-list ul { gap: 8px !important; }
  `,
};

const DESCRIPTIONS: Record<string, string> = {
  a1: 'A1: RadioList rows take List’s density padding (8px per row at balanced); CheckboxList is unchanged.',
  a2: 'A2: CheckboxList rows tighten to RadioList’s spacing (no row padding, 8px between rows); RadioList is unchanged.',
  main: 'Today: RadioList rows have no padding; CheckboxList rows have 8px each.',
};

type Measure = {
  radioRow: number;
  radioPitch: number;
  checkRow: number;
  checkPitch: number;
};

function measureLists(root: HTMLElement): Measure | null {
  const radios = [
    ...root.querySelectorAll<HTMLElement>('.astryx-radio-list-item'),
  ];
  const checks = [
    ...root.querySelectorAll<HTMLElement>(
      '.astryx-checkbox-list .astryx-list-item',
    ),
  ];
  if (radios.length < 2 || checks.length < 2) {
    return null;
  }
  const height = (el: HTMLElement) =>
    Math.round(el.getBoundingClientRect().height);
  const pitch = (a: HTMLElement, b: HTMLElement) =>
    Math.round(b.getBoundingClientRect().top - a.getBoundingClientRect().top);
  return {
    radioRow: height(radios[0]),
    radioPitch: pitch(radios[0], radios[1]),
    checkRow: height(checks[0]),
    checkPitch: pitch(checks[0], checks[1]),
  };
}

const card: React.CSSProperties = {
  background: 'rgba(127,127,127,0.10)',
  borderRadius: 12,
  padding: 12,
};

export default function ListPaddingPreviewPage() {
  // Read after hydration, so the server render and the first client render
  // agree.
  const [variant, setVariant] = useState<string>('main');
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get('variant');
    setVariant(v === 'a1' || v === 'a2' ? v : 'main');
  }, []);
  const [filters, setFilters] = useState<ReadonlyArray<PowerSearchFilter>>([]);
  const [priority, setPriority] = useState('p1');
  const [labels, setLabels] = useState<string[]>(['bug']);
  const listsRef = useRef<HTMLDivElement>(null);
  const [measure, setMeasure] = useState<Measure | null>(null);
  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => {
      if (listsRef.current != null) {
        setMeasure(measureLists(listsRef.current));
      }
    });
    return () => cancelAnimationFrame(id);
  }, [variant]);

  return (
    <main
      style={{
        maxWidth: 640,
        margin: '0 auto',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
      {VARIANT_CSS[variant] != null && <style>{VARIANT_CSS[variant]}</style>}
      <Heading level={1}>List row padding: {variant.toUpperCase()}</Heading>
      <Text type="body">{DESCRIPTIONS[variant]}</Text>
      <Text type="supporting" color="secondary">
        Variants: <a href="?variant=a1">A1</a> · <a href="?variant=a2">A2</a> ·{' '}
        <a href="?">today</a>
      </Text>

      <Heading level={2}>In PowerSearch (phone sheet)</Heading>
      <Text type="supporting" color="secondary">
        Tap the field, Add filter, then Status: the step shows the operator list
        above the multiple-choice list.
      </Text>
      <PowerSearch
        config={config}
        filters={filters}
        onChange={next => setFilters(next)}
        presentation="bottom-sheet"
      />

      <Heading level={2}>Standalone, outside PowerSearch</Heading>
      <div
        ref={listsRef}
        style={{display: 'flex', flexDirection: 'column', gap: 16}}>
        <div style={card}>
          <RadioList label="Priority" value={priority} onChange={setPriority}>
            <RadioListItem label="P0 - Critical" value="p0" />
            <RadioListItem label="P1 - High" value="p1" />
            <RadioListItem label="P2 - Medium" value="p2" />
            <RadioListItem label="P3 - Low" value="p3" />
          </RadioList>
        </div>
        <div style={card}>
          <CheckboxList label="Labels" value={labels} onChange={setLabels}>
            <CheckboxListItem label="Bug" value="bug" />
            <CheckboxListItem label="Feature" value="feature" />
            <CheckboxListItem label="Docs" value="docs" />
            <CheckboxListItem label="Design" value="design" />
          </CheckboxList>
        </div>
      </div>
      <Text type="supporting" color="secondary">
        {measure == null
          ? 'Measuring…'
          : `Measured here: radio row ${measure.radioRow}px (rows ${measure.radioPitch}px apart); checkbox row ${measure.checkRow}px (rows ${measure.checkPitch}px apart).`}
      </Text>
      {Array.from({length: 12}, (_, index) => (
        <Text key={index} type="body">
          {`Page content ${index + 1}. The page scrolls as a normal document.`}
        </Text>
      ))}
    </main>
  );
}
