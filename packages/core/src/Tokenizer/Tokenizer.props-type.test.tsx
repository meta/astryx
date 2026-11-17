// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file Tokenizer.props-type.test.tsx
 * @input Uses vitest, TokenizerProps and Tokenizer
 * @output Type-level proof that the exported `TokenizerProps` stays an
 *   interface callers can extend and `Omit`, with its released input `ref`
 *   type, that the component also accepts a ref typed for both controls it
 *   can reach (the combobox input and the sheet trigger), and that
 *   `presentation` takes exactly its three values
 * @position Core type tests; checked by `tsc`, with `@ts-expect-error`
 *   marking the shapes that must keep failing
 */
import {createRef, type ComponentProps, type Ref} from 'react';
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

// TokenizerProps keeps its released ref type, so a wrapper that forwards it
// to an input still compiles.
const refType: TokenizerProps<Item>['ref'] extends
  Ref<HTMLInputElement> | undefined
  ? true
  : never = true;
void refType;
function ForwardingField({ref}: Pick<TokenizerProps<Item>, 'ref'>) {
  return <input ref={ref} />;
}
void ForwardingField;

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
        presentation="popover"
      />
      {/* An input-typed ref still type-checks. */}
      <Tokenizer
        label="Tags"
        searchSource={source}
        value={[]}
        onChange={() => {}}
        ref={inputRef}
      />
      {/* A ref typed for both controls. */}
      <Tokenizer
        label="Tags"
        searchSource={source}
        value={[]}
        onChange={() => {}}
        ref={wideRef}
        presentation="adaptive"
      />
      <Tokenizer
        label="Tags"
        searchSource={source}
        value={[]}
        onChange={() => {}}
        presentation="bottom-sheet"
      />
      <Tokenizer
        label="Tags"
        searchSource={source}
        value={[]}
        onChange={() => {}}
        // @ts-expect-error -- presentation takes only its three values
        presentation="sheet"
      />
    </>
  );
}

describe('Tokenizer props type', () => {
  it('keeps TokenizerProps an interface that extends and Omit-wraps with its released ref, and accepts presentation and a ref for both controls (type-checked above)', () => {
    expect(typeof compiles).toBe('function');
  });
});
