// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The Sandbox code view and its Copy source action hand out source, not
 * a copy: each demo-content element becomes the placeholder a copy writes, and
 * fixture media stays.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import {DEMO_CONTENT_MODULE} from '../packages/cli/foundation/discovery/template-adapter.mjs';

const {generateSourceRegistry} = createRequire(import.meta.url)(
  './sync-templates.js',
);

describe('sync-templates source registry', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-source-'));
  });
  afterEach(() => fs.rmSync(dir, {recursive: true, force: true}));

  it('replaces each demo-content element and keeps fixture media', () => {
    fs.writeFileSync(
      path.join(dir, 'CardDemo.tsx'),
      "import {Card} from '@astryxdesign/core/Card';\n" +
        `import {PlayingCardContents} from '${DEMO_CONTENT_MODULE}';\n` +
        'export default function CardDemo() {\n' +
        '  return (\n' +
        '    <Card padding={4}>\n' +
        '      <PlayingCardContents rank="Q" suit="hearts" />\n' +
        '      <img src="/template-assets/hero.jpg" alt="" />\n' +
        '    </Card>\n' +
        '  );\n' +
        '}\n',
    );

    const registry = generateSourceRegistry([
      {dirName: 'CardDemo', sourceDir: dir, sourceFile: 'CardDemo.tsx'},
    ]);
    const source = JSON.parse(
      registry.match(/"\/templates\/CardDemo\/": (".*")/)[1],
    );

    expect(source).not.toContain(DEMO_CONTENT_MODULE);
    expect(source).not.toContain('PlayingCardContents');
    expect(source).toContain(
      '<Card padding={4}>\n      <Text>Card content</Text>',
    );
    expect(source).toContain('/template-assets/hero.jpg');
  });
});
