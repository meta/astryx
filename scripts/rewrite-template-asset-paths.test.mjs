// Copyright (c) Meta Platforms, Inc. and affiliates.

import {transformSync} from '@babel/core';
import {describe, expect, it} from 'vitest';

import rewriteTemplateAssetPaths from '../apps/sandbox/scripts/rewrite-template-asset-paths.cjs';

function transform(source, basePath = '/astryx/sandbox/template-assets') {
  return transformSync(source, {
    configFile: false,
    plugins: [[rewriteTemplateAssetPaths, {basePath}]],
  }).code;
}

describe('rewriteTemplateAssetPaths', () => {
  it('points template media at the configured shared path', () => {
    const output = transform(`
      const image = '/template-assets/image.png';
      const untouched = '/images/image.png';
    `);

    expect(output).toContain('/astryx/sandbox/template-assets/image.png');
    expect(output).toContain('/images/image.png');
  });

  it('leaves embedded source examples portable', () => {
    const output = transform(
      `const source = "const image = '/template-assets/image.png';";`,
    );

    expect(output).toContain('/template-assets/image.png');
    expect(output).not.toContain('/astryx/sandbox/template-assets/image.png');
  });

  it('is a no-op without a configured path', () => {
    expect(
      transform(`const image = '/template-assets/image.png';`, ''),
    ).toContain('/template-assets/image.png');
  });
});
