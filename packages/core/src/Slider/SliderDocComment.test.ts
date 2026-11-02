// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SliderDocComment.test.ts
 * @input Slider.tsx's source, parsed with the TypeScript compiler
 * @output Checks that Slider's doc comment attaches to `export function
 *   Slider`, with its summary and its example
 * @position Test for Slider's public documentation: the comment above the
 *   component is its emitted declaration's description and the Storybook
 *   docs page's introduction, so a helper declared between the two takes it
 */

import {readFileSync} from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {describe, expect, it} from 'vitest';

describe('Slider’s doc comment', () => {
  it('attaches to the exported component, with its summary and example', () => {
    const file = path.resolve(__dirname, 'Slider.tsx');
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const slider = source.statements.find(
      (statement): statement is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(statement) &&
        statement.name?.text === 'Slider',
    );
    expect(slider).toBeDefined();
    if (slider == null) {
      return;
    }
    // The comment that documents a declaration is the last JSDoc block
    // directly above it.
    const doc = ts.getJSDocCommentsAndTags(slider).filter(ts.isJSDoc).at(-1);
    expect(ts.getTextOfJSDocComment(doc?.comment)).toMatch(
      /^A slider component for selecting numeric values or ranges\./,
    );
    expect(doc?.tags?.some(tag => tag.tagName.text === 'example')).toBe(true);
  });
});
