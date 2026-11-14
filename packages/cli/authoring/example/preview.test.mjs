// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  isNodeEnvRead,
  isProcessEnv,
  isServerOnlyImport,
  previewableExample,
} from './preview.mjs';

/** @type {import('./type.ts').ExampleScope} */
const scope = {
  packageName: '@acme/widgets',
  packageNames: [
    {name: 'AcmeCard', import: '@acme/widgets/Card'},
    {name: 'useAcmeTheme', import: '@acme/widgets'},
    {name: 'Button', import: '@acme/widgets/Button'},
  ],
  coreNames: [
    {name: 'Button', import: '@astryxdesign/core'},
    {name: 'Text', import: '@astryxdesign/core'},
    {name: 'useOverlay', import: '@astryxdesign/core'},
  ],
  reactNames: ['useState', 'useEffect', 'Fragment'],
  dependencies: ['zod', 'buffer'],
  isServerOnly: specifier => specifier === '@acme/widgets/server',
};

/**
 * @param {string} code
 * @param {unknown} [kind]
 */
const read = (code, kind) => previewableExample({code, kind}, scope);

/** @param {string} code */
const problemsOf = code => {
  const result = read(code);
  return result.previewable || result.setup ? [] : result.problems;
};

/** @param {string} code */
const moduleOf = code => {
  const result = read(code);
  if (!result.previewable) {
    throw new Error(`not previewable: ${JSON.stringify(result)}`);
  }
  return result.module;
};

describe('previewableExample', () => {
  it('leaves a setup example as code only, whatever its code', () => {
    expect(read('return <AcmeCard', 'setup')).toEqual({
      previewable: false,
      setup: true,
    });
  });

  it('turns code that ends with JSX into a component that returns it', () => {
    const module = moduleOf(
      [
        "import {z} from 'zod';",
        '',
        'const [open, setOpen] = useState(false);',
        '',
        '<AcmeCard open={open} onOpenChange={setOpen} />',
      ].join('\n'),
    );
    expect(module).toBe(
      [
        "import {AcmeCard} from '@acme/widgets/Card';",
        "import {useState} from 'react';",
        "import {z} from 'zod';",
        '',
        'export default function Example() {',
        'const [open, setOpen] = useState(false);',
        'return (',
        '<AcmeCard open={open} onOpenChange={setOpen} />',
        ');',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('wraps sibling elements at the end in one fragment', () => {
    const module = moduleOf(
      [
        '<Text>One</Text>',
        '<AcmeCard>',
        '  <Text>Two</Text>',
        '</AcmeCard>',
      ].join('\n'),
    );
    expect(module).toContain(
      'return (\n<>\n<Text>One</Text>\n<AcmeCard>\n  <Text>Two</Text>\n</AcmeCard>\n</>\n);',
    );
  });

  it('accepts a semicolon after the JSX it ends with', () => {
    expect(read('<AcmeCard />;').previewable).toBe(true);
    expect(read('<Text>A</Text>\n<Text>B</Text>;').previewable).toBe(true);
  });

  it('keeps a module that default-exports what it renders', () => {
    const code = [
      "'use client';",
      'export default function Demo() {',
      '  return <AcmeCard />;',
      '}',
    ].join('\n');
    expect(moduleOf(code)).toBe(
      `import {AcmeCard} from '@acme/widgets/Card';\n${code}`,
    );
  });

  it('renders the last component a module declares', () => {
    const module = moduleOf(
      [
        'function Row() { return <Text>Row</Text>; }',
        'export const CardDemo = () => <AcmeCard><Row /></AcmeCard>;',
        'const LIMIT = 3;',
      ].join('\n'),
    );
    expect(module.endsWith('\n\nexport default CardDemo;\n')).toBe(true);
  });

  it('reports a top-level return with its line and the fix', () => {
    const [problem] = problemsOf("const href = '/a';\nreturn <AcmeCard />;");
    expect(problem.code).toBe('example_does_not_compile');
    expect(problem.line).toBe(2);
    expect(problem.message).toBe(
      "does not compile: 'return' outside of function (line 2)",
    );
    expect(problem.fix).toContain('instead of a `return`');
  });

  it('reports code that stops partway', () => {
    const [problem] = problemsOf('const options = {\n  label: "a",\n');
    expect(problem.code).toBe('example_does_not_compile');
    expect(problem.message).toBe(
      'does not compile: the code stops before its last statement ends (line 3)',
    );
    expect(problem.fix).toContain('Show the whole statement');
  });

  it('reports code that renders nothing', () => {
    const problems = problemsOf(
      "const options = {label: 'a'};\n// <AcmeCard options={options} />",
    );
    expect(problems.map(problem => problem.code)).toEqual([
      'example_renders_nothing',
    ]);
  });

  it('names each undefined name once, in order of use', () => {
    const [problem] = problemsOf(
      [
        '<AcmeCard',
        '  title={viewer.name}',
        '  onSave={() => saveDraft(viewer)}',
        '  footer={<Footer />}',
        '/>',
      ].join('\n'),
    );
    expect(problem.code).toBe('example_undefined_name');
    expect(problem.names).toEqual(['viewer', 'saveDraft', 'Footer']);
    expect(problem.message).toBe(
      'uses `viewer`, `saveDraft`, `Footer` but never defines or imports them, so a live preview throws a ReferenceError when that code runs',
    );
  });

  it('ignores types, typeof, intrinsic tags, globals and its own bindings', () => {
    const code = [
      "import type {Row} from 'other-package';",
      'interface Props { row: Row }',
      'function Demo({row}: Props) {',
      '  const [items, setItems] = useState<Row[]>([]);',
      '  useEffect(() => { window.setTimeout(() => setItems([]), 10); console.log(typeof missing); }, []);',
      '  return <div><Text>{row.id}</Text><AcmeCard count={items.length} /></div>;',
      '}',
    ].join('\n');
    expect(read(code).previewable).toBe(true);
  });

  it("imports a scope name from the package before Core, and Core's before a browser global", () => {
    const module = moduleOf(
      '<>\n<Button label="Save" />\n<Text>Hi</Text>\n</>',
    );
    expect(module).toContain("import {Button} from '@acme/widgets/Button';");
    expect(module).toContain("import {Text} from '@astryxdesign/core';");
  });

  it('binds React as the namespace', () => {
    expect(
      moduleOf('const [a] = React.useState(1);\n<Text>{a}</Text>'),
    ).toContain("import * as React from 'react';");
  });

  it('reports server-only imports, an own server module and process.env', () => {
    const problems = problemsOf(
      [
        "import {headers} from 'next/headers';",
        "import fs from 'fs';",
        "import {Buffer} from 'buffer';",
        "import {loadTheme} from '@acme/widgets/server';",
        'const key = process.env.API_KEY;',
        "const dev = process.env.NODE_ENV !== 'production';",
        '<AcmeCard />',
      ].join('\n'),
    );
    expect(
      problems.map(problem => [problem.code, problem.specifier ?? null]),
    ).toEqual([
      ['example_server_only', 'next/headers'],
      ['example_server_only', 'fs'],
      ['example_server_only', '@acme/widgets/server'],
      ['example_server_only', null],
    ]);
  });

  it('reports an async server component the example renders, by scope or by import', () => {
    const serverScope = {...scope, serverComponents: ['AcmeCard']};
    /** @param {string} code */
    const problems = code => {
      const result = previewableExample({code}, serverScope);
      return result.previewable || result.setup ? [] : result.problems;
    };
    const [byScope] = problems('<AcmeCard />');
    expect(byScope.code).toBe('example_server_only');
    expect(byScope.names).toEqual(['AcmeCard']);
    expect(byScope.message).toBe(
      'renders `AcmeCard`, an async component that only a server can render, so a live preview in a browser cannot show it',
    );
    expect(
      problems(
        "import {AcmeCard as Card} from '@acme/widgets/Card';\n<Card />",
      ).map(problem => problem.code),
    ).toEqual(['example_server_only']);
    expect(problems('<Text>No server component here</Text>')).toEqual([]);
  });

  it('reports a relative import and an undeclared package, never a type-only import', () => {
    const problems = problemsOf(
      [
        "import './globals.css';",
        "import {chart} from 'chart-kit';",
        "import type {Options} from 'chart-kit/types';",
        "import {useState as useLocal} from 'react';",
        "import {Button as CoreButton} from '@astryxdesign/core/Button';",
        '<CoreButton label={chart} />',
      ].join('\n'),
    );
    expect(problems.map(problem => [problem.code, problem.specifier])).toEqual([
      ['example_import_unresolvable', './globals.css'],
      ['example_import_unresolvable', 'chart-kit'],
    ]);
    expect(problems[1].message).toContain(
      "@acme/widgets does not declare 'chart-kit'",
    );
  });
});

describe('the server-only rule', () => {
  it('counts an uninstalled Node built-in, never one the package installs', () => {
    expect(isServerOnlyImport('server-only', [])).toBe(true);
    expect(isServerOnlyImport('node:path', [])).toBe(true);
    expect(isServerOnlyImport('events', [])).toBe(true);
    expect(isServerOnlyImport('events', ['events'])).toBe(false);
    expect(isServerOnlyImport('next/link', [])).toBe(false);
  });

  it('tells process.env from process.env.NODE_ENV', () => {
    const env = {
      type: 'MemberExpression',
      object: {type: 'Identifier', name: 'process'},
      property: {type: 'Identifier', name: 'env'},
      computed: false,
    };
    const nodeEnv = {
      type: 'MemberExpression',
      object: env,
      property: {type: 'Identifier', name: 'NODE_ENV'},
      computed: false,
    };
    expect(isProcessEnv(env)).toBe(true);
    expect(isNodeEnvRead(nodeEnv)).toBe(true);
    expect(isNodeEnvRead({...nodeEnv, computed: true})).toBe(false);
  });
});
