// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';

import {linkableStrings, pointersIn} from './stray-pointers.mjs';

describe('pointersIn', () => {
  it('finds a code span that is exactly the command opening one doc', () => {
    expect(
      pointersIn(
        'Read `astryx docs theme`, then `astryx docs layout-spacing`.',
      ),
    ).toEqual(['theme', 'layout-spacing']);
  });

  it('leaves a walkthrough alone: more words, a flag, or a route', () => {
    expect(
      pointersIn(
        'Run `astryx docs theme overview`, `astryx docs --json`, `astryx docs authoring/quick-start`, or `astryx docs`.',
      ),
    ).toEqual([]);
  });

  it('finds the {@command docs <name>} token too, with or without ticks', () => {
    expect(
      pointersIn('Read {@command docs theme}, then `{@command docs layout}`.'),
    ).toEqual(['theme', 'layout']);
  });

  it('leaves the bare name and a runner-written command alone', () => {
    expect(
      pointersIn('See astryx docs theme, or `pnpm astryx docs theme`.'),
    ).toEqual([]);
  });
});

describe('linkableStrings', () => {
  it("reads a topic's description and summary, then prose, headings, list items and table cells, not code", () => {
    const strings = linkableStrings({
      name: 'acme',
      description: 'Read `astryx docs theme`.',
      summary: 'In short.',
      sections: [
        {
          title: 'Use it',
          content: [
            {type: 'prose', text: 'prose'},
            {type: 'heading', level: 3, text: 'heading'},
            {type: 'list', style: 'unordered', items: ['item']},
            {type: 'table', headers: ['head'], rows: [['cell']]},
            {type: 'code', lang: 'bash', code: 'astryx docs theme'},
          ],
        },
      ],
    });
    expect(strings).toEqual([
      {text: 'Read `astryx docs theme`.', section: null, field: 'description'},
      {text: 'In short.', section: null, field: 'summary'},
      {text: 'prose', section: 'Use it', field: null},
      {text: 'heading', section: 'Use it', field: null},
      {text: 'item', section: 'Use it', field: null},
      {text: 'head', section: 'Use it', field: null},
      {text: 'cell', section: 'Use it', field: null},
    ]);
  });

  it("reads a component doc's text fields, not its names, types, defaults, or code", () => {
    const strings = linkableStrings({
      type: 'component',
      name: 'AcmeButton',
      displayName: 'Acme Button',
      usage: {
        description: 'usage',
        bestPractices: [{guidance: true, description: 'practice'}],
      },
      props: [
        {name: 'tone', type: 'string', default: "'a'", description: 'prop'},
      ],
      examples: [{label: 'example', code: 'astryx docs theme'}],
    });
    expect(strings).toEqual([
      {text: 'usage', section: null, field: 'usage.description'},
      {
        text: 'practice',
        section: null,
        field: 'usage.bestPractices[0].description',
      },
      {text: 'prop', section: null, field: 'props[0].description'},
      {text: 'example', section: null, field: 'examples[0].label'},
    ]);
  });
});
