// Copyright (c) Meta Platforms, Inc. and affiliates.

import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {
  createShadcnPrecompiledDeclaration,
  shadcnJavaScriptSourcesEquivalent,
  shadcnJavaScriptTarget,
  shadcnPrecompiledDeclarationTarget,
  transformShadcnJavaScriptSource,
} from './source-variants.mjs';

describe('ShadCN JavaScript source variants', () => {
  it('uses the target extension ShadCN writes for tsx=false', () => {
    expect(shadcnJavaScriptTarget('components/Example.tsx')).toBe(
      'components/Example.jsx',
    );
    expect(shadcnJavaScriptTarget('hooks/useExample.ts')).toBe(
      'hooks/useExample.js',
    );
    expect(shadcnJavaScriptTarget('components/Example.jsx')).toBe(
      'components/Example.jsx',
    );
  });

  it('matches the pinned ShadCN TypeScript stripping shape', () => {
    const source =
      "'use client';\n\n" +
      "import type {ReactNode} from 'react';\n" +
      'const value: ReactNode = null;\n' +
      'export default function Example() { return value; }\n';

    expect(transformShadcnJavaScriptSource(source)).toBe(
      "'use client';;\n" +
        'const value = null;\n' +
        'export default function Example() { return value; }\n',
    );
  });

  it('is idempotent for already-precompiled JSX', () => {
    const source =
      "export default function Example() { return <Component label='A long label' value='A long value' onChange={() => {}} />; }\n";
    const transformed = transformShadcnJavaScriptSource(source);
    expect(transformShadcnJavaScriptSource(transformed)).toBe(transformed);
  });

  it('recognizes printer-only JavaScript differences without hiding edits', () => {
    const compact =
      "// Keep this note\nexport default function Example(){return <Button label='Save'/>;}\n";
    const formatted =
      '// Keep this note\nexport default function Example() {\n  return <Button label="Save" />;\n}\n';
    expect(shadcnJavaScriptSourcesEquivalent(compact, formatted)).toBe(true);
    expect(
      shadcnJavaScriptSourcesEquivalent(
        compact,
        formatted.replace('Save', 'Delete'),
      ),
    ).toBe(false);
    expect(
      shadcnJavaScriptSourcesEquivalent(
        compact,
        formatted.replace('Keep this note', 'Changed note'),
      ),
    ).toBe(false);
    expect(shadcnJavaScriptSourcesEquivalent('x++;\ny;\n', 'x\n++y;\n')).toBe(
      false,
    );
    expect(
      shadcnJavaScriptSourcesEquivalent(
        'function value() { return 42; }\n',
        'function value() { return\n42; }\n',
      ),
    ).toBe(false);
    expect(shadcnJavaScriptSourcesEquivalent('not valid {', formatted)).toBe(
      false,
    );
  });

  it('pins every load-bearing transform dependency', () => {
    const manifest = JSON.parse(
      readFileSync('packages/cli/package.json', 'utf8'),
    );
    expect(manifest.dependencies).toMatchObject({
      '@babel/core': '7.29.7',
      '@babel/parser': '7.29.8',
      '@babel/plugin-transform-typescript': '7.29.7',
      '@babel/types': '7.29.8',
      'ast-types': '0.16.3',
      recast: '0.23.21',
    });
    const workspace = readFileSync('pnpm-workspace.yaml', 'utf8');
    expect(workspace).toContain("'shadcn@4.19.0>@babel/core': 7.29.7");
    expect(workspace).toContain("'shadcn@4.19.0>@babel/parser': 7.29.8");
    expect(workspace).toContain(
      "'shadcn@4.19.0>@babel/plugin-transform-typescript': 7.29.7",
    );
    expect(workspace).toContain("'shadcn@4.19.0>recast': 0.23.21");
  });

  it('emits a narrow declaration for precompiled JavaScript', () => {
    expect(
      createShadcnPrecompiledDeclaration(
        'components/astryx/examples/Example.jsx',
      ),
    ).toBe(
      "declare module '*components/astryx/examples/Example' {\n" +
        "  const Component: import('react').ComponentType;\n" +
        '  export default Component;\n' +
        '}\n',
    );
    expect(
      shadcnPrecompiledDeclarationTarget(
        'components/astryx/examples/Example.jsx',
      ),
    ).toBe('components/astryx/examples/Example.astryx.d.mts');
    expect(() =>
      createShadcnPrecompiledDeclaration('components/Example.tsx'),
    ).toThrow(/must be JavaScript/);
  });
});
