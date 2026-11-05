// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import jscodeshift from 'jscodeshift';
import transform from '../migrate-field-input-styling.mjs';

const j = jscodeshift.withParser('tsx');
const api = {jscodeshift: j, stats: () => {}, report: () => {}};

/** @param {string} source */
function apply(source) {
  return transform({source, path: 'test.tsx'}, api) ?? source;
}

describe('migrate-field-input-styling', () => {
  it('moves control-box members to control*', () => {
    const input = `import {TextInput, Selector, DateInput} from '@astryxdesign/core';
const a = <TextInput label="Name" xstyle={styles.input} className="name" style={{width: 200}} />;
const b = <Selector label="Fruit" options={options} xstyle={styles.selector} />;
const c = <DateInput label="Due" className="due" />;`;
    const output = apply(input);
    expect(output).toContain(
      '<TextInput label="Name" controlXstyle={styles.input} controlClassName="name" controlStyle={{width: 200}} />',
    );
    expect(output).toContain('controlXstyle={styles.selector}');
    expect(output).toContain(
      '<DateInput label="Due" controlClassName="due" />',
    );
  });

  it('moves Field-root members to container*', () => {
    const input = `import {Typeahead} from '@astryxdesign/core/Typeahead';
import {RadioList, Slider} from '@astryxdesign/core';
const a = <Typeahead label="Fruit" xstyle={styles.wide} />;
const b = <RadioList label="Plan" style={{marginTop: 8}}>{items}</RadioList>;
const c = <Slider label="Volume" className="volume" value={1} />;`;
    const output = apply(input);
    expect(output).toContain('containerXstyle={styles.wide}');
    expect(output).toContain('containerStyle={{marginTop: 8}}');
    expect(output).toContain('containerClassName="volume"');
  });

  it('moves a Typeahead inside InputGroup to control*, where its root styling painted the surface', () => {
    const input = `import {InputGroup, Typeahead} from '@astryxdesign/core';
const a = (
  <InputGroup label="Produce">
    <Typeahead label="Fruit" className="grouped" />
  </InputGroup>
);
const b = <Typeahead label="Fruit" className="standalone" />;`;
    const output = apply(input);
    expect(output).toContain('controlClassName="grouped"');
    expect(output).toContain('containerClassName="standalone"');
  });

  it('follows aliased and namespace imports', () => {
    const input = `import {TextArea as Notes} from '@astryxdesign/core';
import * as Astryx from '@astryxdesign/core';
const a = <Notes label="Notes" className="notes" />;
const b = <Astryx.Tokenizer label="Tags" xstyle={styles.tags} />;`;
    const output = apply(input);
    expect(output).toContain(
      '<Notes label="Notes" controlClassName="notes" />',
    );
    expect(output).toContain(
      '<Astryx.Tokenizer label="Tags" containerXstyle={styles.tags} />',
    );
  });

  it('leaves unrelated components, other packages, nested JSX, and spreads alone', () => {
    const input = `import {TextInput} from 'some-other-library';
import {Button, NumberInput} from '@astryxdesign/core';
const a = <TextInput className="kept" />;
const b = <Button xstyle={styles.button} />;
const c = <NumberInput label="Qty" {...rest} startIcon={<Icon className="icon" />} />;`;
    expect(apply(input)).toBe(input);
  });

  it('leaves tags whose name is shadowed by a local binding', () => {
    const input = `import {TextInput} from '@astryxdesign/core';
import * as Astryx from '@astryxdesign/core';
function Row({TextInput}) {
  return <TextInput className="kept" />;
}
function Other(Astryx) {
  return <Astryx.Typeahead className="kept" />;
}`;
    expect(apply(input)).toBe(input);
  });

  it('marks a conflict with a TODO instead of dropping a value', () => {
    const input = `import {TextInput} from '@astryxdesign/core';
const a = <TextInput label="Name" className="old" controlClassName="new" />;`;
    const output = apply(input);
    expect(output).toContain('controlClassName="new"');
    expect(output).toContain('className="old"');
    expect(output).toContain('TODO(astryx upgrade)');
  });

  it('is idempotent', () => {
    const input = `import {TextInput, CheckboxList} from '@astryxdesign/core';
const a = <TextInput label="Name" className="old" controlClassName="new" />;
const b = <TextInput label="Email" xstyle={styles.email} />;
const c = <CheckboxList label="Prefs" style={{margin: 4}}>{items}</CheckboxList>;`;
    const once = apply(input);
    expect(apply(once)).toBe(once);
  });
});
