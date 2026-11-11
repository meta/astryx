// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file The template-meaning counts and the receipt line (AST-084 FR13). */

import {describe, expect, it} from 'vitest';
import {
  countTemplateMeanings,
  unmappedTemplateMeanings,
} from './template-icon-meanings.mjs';
import {templateMeaningsLine} from '../text/template-meanings-line.mjs';

const known = new Set(['document', 'share', 'scissors', 'close']);

describe('countTemplateMeanings', () => {
  it('counts a definition once per template, most used first, then by name', () => {
    const meanings = countTemplateMeanings(
      [
        {icons: {FileIcon: 'document', PageIcon: 'document', XIcon: 'close'}},
        {icons: {FileIcon: 'document', ShareIcon: 'share'}},
        {icons: {CutIcon: 'scissors', ShareIcon: 'share'}},
        {icons: {UnknownIcon: 'notADefinition'}},
        {},
      ],
      known,
    );
    expect(meanings).toEqual([
      {definition: 'document', templates: 2},
      {definition: 'share', templates: 2},
      {definition: 'close', templates: 1},
      {definition: 'scissors', templates: 1},
    ]);
  });
});

describe('unmappedTemplateMeanings and templateMeaningsLine', () => {
  const meanings = [
    {definition: 'document', templates: 4},
    {definition: 'share', templates: 2},
    {definition: 'scissors', templates: 1},
  ];

  it('keeps the ranked meanings the map leaves out, and names them in one line', () => {
    const unmapped = unmappedTemplateMeanings(meanings, {scissors: 'cut'});
    expect(unmapped).toEqual(meanings.slice(0, 2));
    expect(templateMeaningsLine(unmapped, 'outline')).toBe(
      'Templates use 2 meanings this set does not map: document (4 templates), share (2). Map one: `astryx experimental icon map <definition> <icon id> --set outline`.',
    );
  });

  it('says one meaning and one template in the singular', () => {
    expect(templateMeaningsLine([meanings[2]], 'outline')).toBe(
      'Templates use 1 meaning this set does not map: scissors (1 template). Map one: `astryx experimental icon map <definition> <icon id> --set outline`.',
    );
  });

  it('names at most eight, then how many more', () => {
    const many = Array.from({length: 10}, (_, index) => ({
      definition: `d${index}`,
      templates: 10 - index,
    }));
    expect(templateMeaningsLine(many, 'outline')).toContain(
      'd7 (3), and 2 more. Map one:',
    );
  });

  it('gives no line when the set maps every meaning', () => {
    expect(
      templateMeaningsLine(
        unmappedTemplateMeanings(meanings, {
          document: 'a',
          share: 'b',
          scissors: 'c',
        }),
        'outline',
      ),
    ).toBeNull();
  });
});
