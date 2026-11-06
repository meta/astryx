// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

// The module packages, built from source beside Core. Per package, it renders
// a base instance, one under the product's StyleX and one under its class
// (globals.css). Each sits in a `data-probe` wrapper.
import * as stylex from '@stylexjs/stylex';
import {Chart, bar} from '@astryxdesign/charts';
import {RichTextView} from '@astryxdesign/richtext';

const styles = stylex.create({
  richtext: {position: 'static'},
  charts: {width: 50},
});

const value = JSON.stringify({
  root: {
    type: 'root',
    version: 1,
    direction: null,
    format: '',
    indent: 0,
    children: [
      {
        type: 'paragraph',
        version: 1,
        direction: null,
        format: '',
        indent: 0,
        children: [
          {
            type: 'text',
            version: 1,
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: 'Notes',
          },
        ],
      },
    ],
  },
});

const data = [
  {month: 'Jan', revenue: 3},
  {month: 'Feb', revenue: 5},
];
const series = [bar('revenue', {label: 'Revenue'})];

function Revenue(props: {xstyle?: stylex.StyleXStyles; className?: string}) {
  return (
    <Chart
      data={data}
      xKey="month"
      series={series}
      title="Revenue"
      height={120}
      {...props}
    />
  );
}

export function Modules() {
  return (
    <>
      <div data-probe="richtext-base">
        <RichTextView value={value} />
      </div>
      <div data-probe="richtext-stylex">
        <RichTextView value={value} xstyle={styles.richtext} />
      </div>
      <div data-probe="richtext-class">
        <RichTextView value={value} className="product-richtext" />
      </div>
      <div data-probe="charts-base" style={{width: 300}}>
        <Revenue />
      </div>
      <div data-probe="charts-stylex" style={{width: 300}}>
        <Revenue xstyle={styles.charts} />
      </div>
      <div data-probe="charts-class" style={{width: 300}}>
        <Revenue className="product-charts" />
      </div>
    </>
  );
}
