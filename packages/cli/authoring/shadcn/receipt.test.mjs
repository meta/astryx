// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  shadcnJavaScriptTarget,
  transformShadcnJavaScriptSource,
} from './source-variants.mjs';
import {
  createRegistryReceipt,
  parseRegistryReceipt,
  registryContentHash,
  registryReceiptTarget,
  serializeRegistryReceipt,
} from './receipt.mjs';

function receipt() {
  const target = 'components/astryx/examples/ButtonExample.tsx';
  const receiptTarget = registryReceiptTarget(target, 'example-button-basic');
  return createRegistryReceipt({
    item: {
      name: 'example-button-basic',
      path: 'examples/button/basic',
      aliases: ['examples/button/old-basic'],
      kind: 'example',
    },
    sourceVersion: '0.6.0',
    receiptTarget,
    demoMediaReplaced: 0,
    demoContentReplaced: 0,
    files: [
      {
        id: 'primary',
        target,
        registryPath: 'registry/example-button-basic/ButtonExample.tsx',
        content: 'export default function Example(): null { return null; }\n',
        variants: [
          {
            format: 'javascript',
            target: shadcnJavaScriptTarget(target),
            content: transformShadcnJavaScriptSource(
              'export default function Example(): null { return null; }\n',
            ),
          },
        ],
      },
    ],
  });
}

describe('ShadCN registry receipts', () => {
  it('places a unique receipt beside the copied source', () => {
    expect(
      registryReceiptTarget(
        'components/astryx/examples/ButtonExample.tsx',
        'example-button-basic',
      ),
    ).toBe('components/astryx/examples/.astryx/example-button-basic.json');
  });

  it('records the installed base bytes and a relative target', () => {
    const value = receipt();
    expect(value.schemaVersion).toBe(3);
    expect(value.files[0]).toMatchObject({
      id: 'primary',
      target: '../ButtonExample.tsx',
      registryTarget: 'components/astryx/examples/ButtonExample.tsx',
      registryPath: 'registry/example-button-basic/ButtonExample.tsx',
      sha256: registryContentHash(value.files[0].content),
      variants: [
        expect.objectContaining({
          format: 'javascript',
          target: '../ButtonExample.jsx',
          registryTarget: 'components/astryx/examples/ButtonExample.jsx',
        }),
      ],
    });
    expect(value.files[0].variants[0].sha256).toBe(
      registryContentHash(value.files[0].variants[0].content),
    );
    expect(
      parseRegistryReceipt(JSON.parse(serializeRegistryReceipt(value))),
    ).toEqual(value);
  });

  it('permits a canonical JavaScript base without a duplicate variant', () => {
    const target = 'components/astryx/examples/CompiledExample.jsx';
    const value = createRegistryReceipt({
      item: {
        name: 'example-compiled',
        path: 'examples/compiled',
        aliases: [],
        kind: 'example',
      },
      sourceVersion: '0.6.0',
      receiptTarget: registryReceiptTarget(target, 'example-compiled'),
      demoMediaReplaced: 0,
      demoContentReplaced: 0,
      files: [
        {
          id: 'primary',
          target,
          registryPath: 'registry/example-compiled/CompiledExample.jsx',
          content:
            'export default function CompiledExample() { return null; }\n',
          variants: [],
        },
      ],
    });

    expect(parseRegistryReceipt(value).files[0].variants).toEqual([]);
  });

  it('continues to parse version 1 receipts without variants', () => {
    const {
      demoMediaReplaced: _media,
      demoContentReplaced: _content,
      ...value
    } = receipt();
    const {variants: _variants, ...legacyFile} = value.files[0];
    expect(
      parseRegistryReceipt({
        ...value,
        schemaVersion: 1,
        files: [legacyFile],
      }),
    ).toMatchObject({schemaVersion: 1, files: [{id: 'primary'}]});
  });

  it('continues to parse version 2 receipts without replacement counts', () => {
    const {
      demoMediaReplaced: _media,
      demoContentReplaced: _content,
      ...value
    } = receipt();
    expect(
      parseRegistryReceipt({...value, schemaVersion: 2}),
    ).toMatchObject({schemaVersion: 2, files: [{id: 'primary'}]});
  });

  it('requires a version 3 receipt to count what the copy replaced', () => {
    const value = receipt();
    expect(value).toMatchObject({demoMediaReplaced: 0, demoContentReplaced: 0});
    const {demoContentReplaced: _content, ...missing} = value;
    expect(() => parseRegistryReceipt(missing)).toThrow();
    expect(() =>
      parseRegistryReceipt({...value, demoMediaReplaced: -1}),
    ).toThrow();
  });

  it('rejects duplicate file identities', () => {
    const value = receipt();
    expect(() =>
      parseRegistryReceipt({
        ...value,
        files: [value.files[0], {...value.files[0]}],
      }),
    ).toThrow(/must be unique/);
  });

  it('rejects duplicate or escaping install variants', () => {
    const value = receipt();
    const variant = value.files[0].variants[0];
    expect(() =>
      parseRegistryReceipt({
        ...value,
        files: [
          {
            ...value.files[0],
            variants: [variant, {...variant}],
          },
        ],
      }),
    ).toThrow(/variant formats must be unique/);
    expect(() =>
      parseRegistryReceipt({
        ...value,
        files: [
          {
            ...value.files[0],
            variants: [{...variant, target: '../../outside.jsx'}],
          },
        ],
      }),
    ).toThrow(/adjacent source file/);
  });

  it('rejects traversal and corrupt hashes', () => {
    const value = receipt();
    expect(() =>
      parseRegistryReceipt({
        ...value,
        files: [{...value.files[0], target: '../../outside.tsx'}],
      }),
    ).toThrow(/adjacent source file/);
    for (const target of ['../.', '../..']) {
      expect(() =>
        parseRegistryReceipt({
          ...value,
          files: [{...value.files[0], target}],
        }),
      ).toThrow(/adjacent source file/);
    }
    expect(() =>
      parseRegistryReceipt({
        ...value,
        source: {...value.source, version: '0.6.0\n<<<<<<< injected'},
      }),
    ).toThrow(/semantic version/);
    expect(() =>
      parseRegistryReceipt({
        ...value,
        files: [{...value.files[0], sha256: 'not-a-hash'}],
      }),
    ).toThrow();
  });
});
