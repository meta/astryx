// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx component <Name> --showcase` hands out showcase source: each
 * demo-content element becomes the placeholder a copy writes, and fixture
 * media stays, because the output is not written into a project.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {DEMO_CONTENT_MODULE} from '../../../../foundation/discovery/template-adapter.mjs';

const findShowcase = vi.hoisted(() => vi.fn());
vi.mock('../../../template/template.mjs', async importOriginal => ({
  ...(await importOriginal()),
  findShowcase,
}));

const {componentDetailShowcase} = await import('./showcase.mjs');

describe('component.detail.showcase', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'showcase-demo-'));
  });
  afterEach(() => {
    fs.rmSync(dir, {recursive: true, force: true});
    findShowcase.mockReset();
  });

  it('replaces each demo-content element and keeps fixture media', async () => {
    const filePath = path.join(dir, 'CardShowcase.tsx');
    fs.writeFileSync(
      filePath,
      "import {Card} from '@astryxdesign/core/Card';\n" +
        `import {PlayingCardContents} from '${DEMO_CONTENT_MODULE}';\n` +
        'export default function CardShowcase() {\n' +
        '  return (\n' +
        '    <Card padding={4}>\n' +
        '      <PlayingCardContents rank="Q" suit="hearts" />\n' +
        '      <img src="/template-assets/hero.jpg" alt="" />\n' +
        '    </Card>\n' +
        '  );\n' +
        '}\n',
    );
    findShowcase.mockResolvedValue({filePath, aspectRatio: 1});

    const result = await componentDetailShowcase('Card', {
      cwd: dir,
      name: 'Card',
      ownerPackage: '@astryxdesign/core',
    });

    expect(result.data.source).not.toContain(DEMO_CONTENT_MODULE);
    expect(result.data.source).not.toContain('PlayingCardContents');
    expect(result.data.source).toContain(
      '<Card padding={4}>\n      <Text>Card content</Text>',
    );
    expect(result.data.source).toContain('/template-assets/hero.jpg');
  });
});
