// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The props a module gives Core components: named, renamed, subpath
 * and namespace imports of Core count; other components, the props every
 * component takes, styling props, names with a hyphen and spread
 * props do not.
 */

import {describe, expect, it} from 'vitest';
import {scanCoreProps} from './core-props.mjs';

/**
 * The uses in a module, as `Component.prop@line:column`.
 * @param {string} source
 */
function uses(source) {
  return scanCoreProps(source)?.map(use => `${use.component}.${use.prop}@${use.line}:${use.column}`) ?? null;
}

describe('scanCoreProps', () => {
  it('reads each prop a Core component is given, by the name Core exports it by', () => {
    const source = [
      "import {TabList as Tabs, Badge} from '@astryxdesign/core';",
      "import {Tab} from '@astryxdesign/core/TabList';",
      "import * as Core from '@astryxdesign/core';",
      'export default function Page() {',
      '  return <><Tabs selectedID="a" /><Tab value="a" /><Badge color="red" /><Core.Text tone="muted" /></>;',
      '}',
      '',
    ].join('\n');
    expect(uses(source)).toEqual(['TabList.selectedID@5:18', 'Tab.value@5:40', 'Badge.color@5:59', 'Text.tone@5:84']);
  });

  it('leaves out other components, and the props that name no prop of the component', () => {
    const source = [
      "import {Button} from '@astryxdesign/core';",
      "import type {ButtonProps} from '@astryxdesign/core';",
      "import {Panel} from './Panel';",
      "import Link from 'next/link';",
      'export function Page(props: ButtonProps) {',
      '  return <Panel tone="x"><Link href="/" tone="x" /><Button key="k" ref={null} className="c" style={{}} xstyle={null} data-id="1" aria-label="Go" hx-get="/save" {...props} label="Go">x</Button></Panel>;',
      '}',
      '',
    ].join('\n');
    expect(uses(source)).toEqual(['Button.label@6:172']);
  });

  it('reads no component a type-only import names', () => {
    expect(uses("import type {Button} from '@astryxdesign/core';\nexport const x = <Button labelText=\"Go\" />;\n")).toEqual([]);
    expect(uses("import {type Button} from '@astryxdesign/core';\nexport const x = <Button labelText=\"Go\" />;\n")).toEqual([]);
  });

  it('a module that does not parse gives null', () => {
    expect(scanCoreProps('export default function (')).toBeNull();
  });
});
