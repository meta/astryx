// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {hasStrongRightToLeft} from '../i18n/firstStrongDirection';
import {cutTextDirection} from './cutTextDirection';

const ASSIGNED = /\p{Assigned}/u;
const LETTER = /\p{Letter}/u;

function assignedCharacters(): string[] {
  const characters: string[] = [];
  for (let codePoint = 0; codePoint < 0x30000; codePoint++) {
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
      continue;
    }
    const character = String.fromCodePoint(codePoint);
    if (ASSIGNED.test(character)) {
      characters.push(character);
    }
  }
  return characters;
}

describe('cutTextDirection range test', () => {
  const characters = assignedCharacters();

  it('gives every letter the direction the full classifier gives it', () => {
    const differences = characters.filter(
      character =>
        LETTER.test(character) &&
        cutTextDirection(character).dir !==
          (hasStrongRightToLeft(character) ? 'rtl' : 'ltr'),
    );
    expect(differences).toEqual([]);
  });

  it('counts only Arabic signs and marks that the classifier does not as right-to-left', () => {
    const extra = characters
      .filter(
        character =>
          !LETTER.test(character) &&
          cutTextDirection(`a${character}`).dir !== cutTextDirection('a').dir &&
          !hasStrongRightToLeft(character),
      )
      .map(character => character.codePointAt(0)!.toString(16));
    // Arabic number signs, the Arabic comma, the ornate parentheses and the
    // Arabic vowel marks. Each one stands beside an Arabic letter in a label.
    expect(extra).toEqual([
      '605',
      '60c',
      '64b',
      '64c',
      '64d',
      '64e',
      '64f',
      '650',
      '651',
      '652',
      '653',
      '654',
      '655',
      '670',
      '6dd',
      '8e2',
      'fd3e',
      'fd3f',
    ]);
  });
});
