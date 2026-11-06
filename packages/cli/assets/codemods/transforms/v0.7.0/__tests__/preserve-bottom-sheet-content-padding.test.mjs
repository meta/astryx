// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import transform from '../preserve-bottom-sheet-content-padding.mjs';

async function applyTransform(source) {
  const jscodeshift = (await import('jscodeshift')).default;
  const j = jscodeshift.withParser('tsx');
  const api = {jscodeshift: j, stats: () => {}, report: () => {}};
  return transform({source, path: 'test.tsx'}, api) ?? source;
}

describe('preserve-bottom-sheet-content-padding', () => {
  it('adds padding={0} to a sheet with self-padded content', async () => {
    const output =
      await applyTransform(`import {BottomSheet, VStack} from '@astryxdesign/core';
const a = (
  <BottomSheet isOpen={isOpen} onOpenChange={setIsOpen} label="Filters">
    <VStack gap={4} padding={4}>x</VStack>
  </BottomSheet>
);`);

    expect(output).toContain(
      '<BottomSheet isOpen={isOpen} onOpenChange={setIsOpen} label="Filters" padding={0}>',
    );
  });

  it('leaves a sheet whose only child is a core Section unchanged', async () => {
    const source = `import {BottomSheet, Section, VStack} from '@astryxdesign/core';
const a = (
  <BottomSheet isOpen onOpenChange={() => {}} label="Filters">
    {/* filters */}
    <Section padding={4}>
      <VStack gap={4}>x</VStack>
    </Section>
  </BottomSheet>
);`;
    expect(await applyTransform(source)).toBe(source);
  });

  it('leaves a sheet whose only child is a core Layout unchanged', async () => {
    const source = `import {BottomSheet, Layout, LayoutContent} from '@astryxdesign/core';
const a = (
  <BottomSheet isOpen onOpenChange={() => {}} label="Message">
    <Layout content={<LayoutContent>x</LayoutContent>} />
  </BottomSheet>
);`;
    expect(await applyTransform(source)).toBe(source);
  });

  it('flags every nested Layout with a TODO, with or without its own padding', async () => {
    const output =
      await applyTransform(`import {BottomSheet, Layout, VStack} from '@astryxdesign/core';
function A() {
  return (
    <BottomSheet sheetId="a" label="A">
      <VStack>
        <Layout content={x} />
      </VStack>
    </BottomSheet>
  );
}
function B() {
  return (
    <BottomSheet sheetId="b" label="B">
      <VStack>
        <Layout padding={4} content={x} />
      </VStack>
    </BottomSheet>
  );
}`);

    expect(output).toContain('<BottomSheet sheetId="a" label="A" padding={0}>');
    expect(output).toContain('<BottomSheet sheetId="b" label="B" padding={0}>');
    expect(output.match(/TODO\(astryx upgrade\)/g)).toHaveLength(2);
    expect(output.indexOf('TODO(astryx upgrade)')).toBeLessThan(
      output.indexOf('sheetId="a"'),
    );
    expect(output.indexOf('TODO(astryx upgrade)')).toBeGreaterThan(
      output.indexOf('function A'),
    );
    expect(output.lastIndexOf('TODO(astryx upgrade)')).toBeGreaterThan(
      output.indexOf('function B'),
    );
  });

  it('does not flag a Layout from another package or a shadowed Layout binding', async () => {
    const output =
      await applyTransform(`import {BottomSheet} from '@astryxdesign/core';
import {Layout} from './my-layout';
export function A() {
  return <BottomSheet isOpen><Layout content={<p>b</p>} /></BottomSheet>;
}
`);
    expect(output).toContain('padding={0}');
    expect(output).not.toContain('TODO');
  });

  it('leaves a BottomSheet that a parameter or local binding shadows alone', async () => {
    const source = `import {BottomSheet} from '@astryxdesign/core';
export function Host({BottomSheet: Sheet}) {
  return <Sheet isOpen><p>own inset</p></Sheet>;
}
export function Local() {
  const BottomSheet = (props) => <div {...props} />;
  return <BottomSheet isOpen><p>own inset</p></BottomSheet>;
}
`;
    expect(await applyTransform(source)).toBe(source);
  });

  it('is idempotent: a second run changes nothing', async () => {
    const once =
      await applyTransform(`import {BottomSheet, Layout, VStack} from '@astryxdesign/core';
export function A() {
  return <BottomSheet isOpen><VStack><p>a</p></VStack></BottomSheet>;
}
export function B() {
  return <BottomSheet isOpen><VStack><Layout content={<p>b</p>} /></VStack></BottomSheet>;
}
`);
    expect(await applyTransform(once)).toBe(once);
  });

  it('pads a sheet when the Section has a sibling or is not from core', async () => {
    const output =
      await applyTransform(`import {BottomSheet} from '@astryxdesign/core';
import {Section} from './local';
import {Section as CoreSection} from '@astryxdesign/core';
const a = <BottomSheet sheetId="a" label="A"><Section>x</Section></BottomSheet>;
const b = (
  <BottomSheet sheetId="b" label="B">
    <CoreSection>x</CoreSection>
    <p>after</p>
  </BottomSheet>
);`);

    expect(output).toContain('<BottomSheet sheetId="a" label="A" padding={0}>');
    expect(output).toContain('<BottomSheet sheetId="b" label="B" padding={0}>');
  });

  it('leaves a sheet that already sets padding unchanged', async () => {
    const source = `import {BottomSheet} from '@astryxdesign/core';
const a = <BottomSheet sheetId="a" label="A" padding={2}>x</BottomSheet>;
const b = <BottomSheet sheetId="b" label="B" padding={value}>x</BottomSheet>;`;
    expect(await applyTransform(source)).toBe(source);
  });

  it('follows aliases, subpath default imports, and namespace imports', async () => {
    const output =
      await applyTransform(`import {BottomSheet as Sheet} from '@astryxdesign/core';
import Panel from '@astryxdesign/core/BottomSheet';
import * as Core from '@astryxdesign/core';
const a = <Sheet sheetId="a" label="A">x</Sheet>;
const b = <Panel sheetId="b" label="B">x</Panel>;
const c = <Core.BottomSheet sheetId="c" label="C">x</Core.BottomSheet>;`);

    expect(output).toContain('<Sheet sheetId="a" label="A" padding={0}>');
    expect(output).toContain('<Panel sheetId="b" label="B" padding={0}>');
    expect(output).toContain(
      '<Core.BottomSheet sheetId="c" label="C" padding={0}>',
    );
  });

  it('puts padding={0} before a spread so a spread padding still wins', async () => {
    const output =
      await applyTransform(`import {BottomSheet} from '@astryxdesign/core';
const a = <BottomSheet label="A" {...args} />;`);

    expect(output).toContain('<BottomSheet label="A" padding={0} {...args} />');
  });

  it('ignores BottomSheet from other packages', async () => {
    const source = `import {BottomSheet} from './prototype';
const a = <BottomSheet title="A">x</BottomSheet>;`;
    expect(await applyTransform(source)).toBe(source);
  });
});
