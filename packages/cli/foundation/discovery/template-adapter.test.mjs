// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated tests for template-adapter's `extractComponents`.
 *
 * `extractComponents` scrapes the components a page template renders out of its
 * JSX. Three callers depend on it: `template <name>` and `template --skeleton`
 * print it as "components used", and `search`/`build` index it as keywords.
 * It had no test coverage, and the tag regex was matching TypeScript generic
 * argument lists as if they were JSX tags — so type names (`Record`,
 * `SVGProps`, `ReadonlySet`, and every local type alias) were being reported as
 * rendered components and indexed as search keywords.
 */

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  effectiveTemplateDiscovery,
  extractComponents,
  findPageDocFile,
  stripTemplateAssetRefs,
} from './template-adapter.mjs';

/** @type {string} */
let dir;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-extract-'));
});

afterAll(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

/**
 * @param {string} name
 * @param {string} src
 * @returns {string}
 */
function writePage(name, src) {
  const file = path.join(dir, `${name}.tsx`);
  fs.writeFileSync(file, src);
  return file;
}

describe('extractComponents — JSX tags', () => {
  it('extracts rendered components', () => {
    const file = writePage(
      'basic',
      `'use client';
      export default function Page() {
        return (
          <Layout content={<Dialog><TreeList /></Dialog>} />
        );
      }`,
    );
    const got = extractComponents(file);
    expect(got).toContain('Layout');
    expect(got).toContain('Dialog');
    expect(got).toContain('TreeList');
  });

  it('extracts a component opening a JSX expression, not just a statement', () => {
    const file = writePage(
      'mapped',
      `export default function Page() {
        return <List>{rows.map(r => <ListRow key={r.id} />)}</List>;
      }`,
    );
    expect(extractComponents(file)).toContain('ListRow');
  });

  it('drops ubiquitous primitives so they do not drown the signal', () => {
    const file = writePage(
      'ubiquitous',
      `export default function Page() {
        return <VStack><Text>hi</Text><Button /><Kanban /></VStack>;
      }`,
    );
    const got = extractComponents(file);
    expect(got).not.toContain('VStack');
    expect(got).not.toContain('Text');
    expect(got).not.toContain('Button');
    expect(got).toContain('Kanban');
  });
});

describe('extractComponents — TypeScript generics are not components', () => {
  it('ignores generic argument lists', () => {
    const file = writePage(
      'generics',
      `import type {ComponentType, SVGProps} from 'react';
      type Phase = 'a' | 'b';
      export default function Page() {
        const [sel, setSel] = useState<ReadonlySet<string>>(new Set());
        const rows = useMemo<Array<StockRow>>(() => [], []);
        const icon: ComponentType<SVGProps<SVGSVGElement>> = Placeholder;
        const byPhase: Record<string, Phase> = {};
        return <Dialog />;
      }`,
    );
    const got = extractComponents(file);
    for (const typeName of [
      'ReadonlySet',
      'Array',
      'StockRow',
      'SVGProps',
      'SVGSVGElement',
      'Record',
      'Phase',
    ]) {
      expect(got).not.toContain(typeName);
    }
    expect(got).toContain('Dialog');
  });

  it('still ignores a generic when the JSX it precedes is valid', () => {
    const file = writePage(
      'mixed',
      `export default function Page() {
        const m = new Map<string, Severity>();
        return <Banner />;
      }`,
    );
    const got = extractComponents(file);
    expect(got).not.toContain('Severity');
    expect(got).toEqual(['Banner']);
  });

  it('does not treat a closing tag as a component', () => {
    const file = writePage(
      'closing',
      `export default function Page() {
        return <Card>x</Card>;
      }`,
    );
    expect(extractComponents(file)).toEqual(['Card']);
  });
});

describe('stripTemplateAssetRefs', () => {
  it('uses the last extension on dotted demo asset names', () => {
    const src = 'src="/template-assets/clip.min.mp4"';
    expect(stripTemplateAssetRefs(src)).toBe('src=""');
  });

  it('strips m4v demo assets as video', () => {
    const src = 'src="/template-assets/demo.m4v"';
    expect(stripTemplateAssetRefs(src)).toBe('src=""');
  });

  it('keeps the image placeholder for known image extensions', () => {
    const src = 'src="/template-assets/hero.png"';
    const out = stripTemplateAssetRefs(src);
    expect(out).toContain('data:image/svg+xml');
    expect(out).not.toContain('/template-assets/hero.png');
  });

  it('throws for an unrecognized demo asset extension', () => {
    expect(() =>
      stripTemplateAssetRefs('src="/template-assets/clip.bin"'),
    ).toThrow(
      /Unrecognized template asset format bin for \/template-assets\/clip\.bin/,
    );
  });
});

describe('findPageDocFile', () => {
  it('keeps the released precedence when one page has two specs', () => {
    const page = fs.mkdtempSync(path.join(dir, 'page-'));
    fs.writeFileSync(path.join(page, 'template.doc.mjs'), 'export {};\n');
    fs.writeFileSync(path.join(page, 'template.doc.ts'), 'export {};\n');
    expect(findPageDocFile(page)).toBe(path.join(page, 'template.doc.ts'));

    fs.writeFileSync(path.join(page, 'template.template.mjs'), 'export {};\n');
    expect(findPageDocFile(page)).toBe(
      path.join(page, 'template.template.mjs'),
    );
  });
});

describe('effectiveTemplateDiscovery', () => {
  it('shadows only the matching template kind', () => {
    const pageReplacement = {
      type: 'page',
      dirName: 'acme-dashboard',
      name: 'Acme dashboard',
      description: '',
      filePath: '/acme-dashboard.tsx',
      docPath: '/acme-dashboard.doc.mjs',
      package: '@acme/widgets',
      replaces: 'dashboard',
    };
    const corePage = {
      type: 'page',
      dirName: 'dashboard',
      name: 'Dashboard page',
      description: '',
      filePath: '/dashboard-page.tsx',
      docPath: '/dashboard-page.doc.mjs',
    };
    const coreBlock = {
      type: 'block',
      dirName: 'dashboard',
      name: 'Dashboard block',
      description: '',
      filePath: '/dashboard-block.tsx',
      docPath: '/dashboard-block.doc.mjs',
    };

    const effective = effectiveTemplateDiscovery([
      corePage,
      coreBlock,
      pageReplacement,
    ]);

    expect(effective).toContain(pageReplacement);
    expect(effective).toContain(coreBlock);
    expect(effective).not.toContain(corePage);
  });
});
