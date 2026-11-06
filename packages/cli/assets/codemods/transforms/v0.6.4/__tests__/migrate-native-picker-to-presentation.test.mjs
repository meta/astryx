// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import transform from '../migrate-native-picker-to-presentation.mjs';

async function applyTransform(source) {
  const jscodeshift = (await import('jscodeshift')).default;
  const j = jscodeshift.withParser('tsx');
  const api = {jscodeshift: j, stats: () => {}, report: () => {}};
  return transform({source, path: 'test.tsx'}, api) ?? source;
}

describe('migrate-native-picker-to-presentation', () => {
  it('maps DateInput and DateTimeInput values (FR3)', async () => {
    const output =
      await applyTransform(`import {DateInput, DateTimeInput} from '@astryxdesign/core';
const a = <DateInput label="d" nativePicker="touch" />;
const b = <DateInput label="d" nativePicker="always" />;
const c = <DateTimeInput label="dt" nativePicker="never" />;`);

    expect(output).toContain("presentation='adaptive-native'");
    expect(output).toContain("presentation='native'");
    expect(output).toContain("presentation='adaptive-bottom-sheet'");
    expect(output).not.toContain('nativePicker');
  });

  it('maps TimeInput never to text-input (FR3)', async () => {
    const output =
      await applyTransform(`import {TimeInput} from '@astryxdesign/core';
const a = <TimeInput label="t" nativePicker="never" />;
const b = <TimeInput label="t" nativePicker={'touch'} />;`);

    expect(output).toContain("presentation='text-input'");
    expect(output).toContain("presentation={'adaptive-native'}");
  });

  it('drops nativePicker when presentation is already set (FR4)', async () => {
    const output =
      await applyTransform(`import {DateInput} from '@astryxdesign/core';
const a = <DateInput label="d" presentation="popover" nativePicker="always" />;`);

    expect(output).toContain('presentation="popover"');
    expect(output).not.toContain('nativePicker');
  });

  it('leaves dynamic values and unrelated components unchanged', async () => {
    const source = `import {DateInput, Selector} from '@astryxdesign/core';
const a = <DateInput label="d" nativePicker={mode} />;
const b = <Selector nativePicker="never" />;`;
    expect(await applyTransform(source)).toBe(source);
  });

  it('leaves a mixed static/dynamic conditional byte-identical when a sibling migrates', async () => {
    const output =
      await applyTransform(`import {TimeInput} from '@astryxdesign/core';
const a = <TimeInput label="t" nativePicker="touch" />;
const b = <TimeInput label="t" nativePicker={flag ? 'always' : mode} />;`);

    expect(output).toContain("presentation='adaptive-native'");
    expect(output).toContain("nativePicker={flag ? 'always' : mode}");
    expect(output).not.toContain("'native'");
  });
});
