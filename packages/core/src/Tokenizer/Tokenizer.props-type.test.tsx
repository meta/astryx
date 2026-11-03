// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file Tokenizer.props-type.test.tsx
 * @input Uses vitest, TokenizerProps and Tokenizer
 * @output Type-level proof that the exported `TokenizerProps` stays an
 *   interface callers can extend and `Omit` (its `ref` typed for the combobox
 *   input as released), and that only the experimental opt-in admits a `ref`
 *   that also accepts the sheet presentation's trigger button
 * @position Core type tests; checked by `tsc`, with `@ts-expect-error`
 *   marking the shapes that must keep failing
 */
import {createRef, type ComponentProps} from 'react';
import {describe, it, expect} from 'vitest';
import type {SearchableItem} from '../Typeahead/types';
import {Tokenizer, type TokenizerProps} from './Tokenizer';

type Item = SearchableItem;
const source = {search: () => [], bootstrap: () => []};

// A consumer's props interface extends the exported one, as before.
interface TagsFieldProps extends TokenizerProps<Item> {
  helpUrl?: string;
}

// A wrapper narrows the exported props with Omit and spreads the rest.
function TagsField({helpUrl, ...rest}: Omit<TagsFieldProps, 'label'>) {
  void helpUrl;
  return <Tokenizer label="Tags" {...rest} />;
}

// The component's declared props resolve to the stable interface, so the
// same two consumer shapes work through ComponentProps.
type FromComponent = ComponentProps<typeof Tokenizer>;
interface FromComponentProps extends FromComponent {
  helpUrl?: string;
}
function FromComponentField({
  helpUrl,
  ...rest
}: Omit<FromComponentProps, 'label'>) {
  void helpUrl;
  return <Tokenizer label="Tags" {...rest} />;
}
// And it is exactly TokenizerProps, in both directions.
const same: FromComponent extends TokenizerProps<Item>
  ? TokenizerProps<Item> extends FromComponent
    ? true
    : never
  : never = true;
void same;

const inputRef = createRef<HTMLInputElement>();
const wideRef = createRef<HTMLInputElement | HTMLButtonElement>();

export function compiles() {
  return (
    <>
      <TagsField searchSource={source} value={[]} onChange={() => {}} />
      <FromComponentField
        searchSource={source}
        value={[]}
        onChange={() => {}}
        ref={inputRef}
      />
      <TagsField
        searchSource={source}
        value={[]}
        onChange={() => {}}
        ref={inputRef}
        experimental={{presentation: 'adaptive'}}
      />
      {/* The stable shape: ref is the combobox input's. */}
      <Tokenizer
        label="Tags"
        searchSource={source}
        value={[]}
        onChange={() => {}}
        ref={inputRef}
      />
      {/* The experimental opt-in admits the wider ref. */}
      <Tokenizer
        label="Tags"
        searchSource={source}
        value={[]}
        onChange={() => {}}
        ref={wideRef}
        experimental={{presentation: 'adaptive'}}
      />
      {/* An input-typed ref is still fine with the opt-in. */}
      <Tokenizer
        label="Tags"
        searchSource={source}
        value={[]}
        onChange={() => {}}
        ref={inputRef}
        experimental={{}}
      />
      {/* @ts-expect-error -- without experimental, ref keeps the released input-only type */}
      <Tokenizer
        label="Tags"
        searchSource={source}
        value={[]}
        onChange={() => {}}
        ref={wideRef}
      />
    </>
  );
}

describe('Tokenizer props type', () => {
  it('keeps TokenizerProps an interface that extends and Omit-wraps (type-checked above)', () => {
    expect(typeof compiles).toBe('function');
  });
});
