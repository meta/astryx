// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  findLocalIntegrationManifest,
  findLocalIntegrationManifestOrNull,
  IntegrationRootConflictError,
  patchIntegrationRoot,
} from './manifest-writer.mjs';

let tmpDir;

function manifest(source = 'export default {};\n', ext = 'mjs') {
  fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"fixture"}\n');
  const file = path.join(tmpDir, `astryx.integration.${ext}`);
  fs.writeFileSync(file, source);
  return file;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-manifest-writer-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('patchIntegrationRoot', () => {
  it('creates a minimal manifest when requested', async () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"fixture"}\n');
    await expect(
      patchIntegrationRoot(tmpDir, 'themes', './themes', {
        createIfMissing: true,
      }),
    ).resolves.toEqual({path: './themes', created: true});
    expect(
      fs.readFileSync(path.join(tmpDir, 'astryx.integration.mjs'), 'utf-8'),
    ).toContain("themes: './themes'");
  });

  it('plans manifest creation without writing it', async () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"fixture"}\n');
    await expect(
      patchIntegrationRoot(tmpDir, 'themes', './themes', {
        createIfMissing: true,
        dryRun: true,
      }),
    ).resolves.toEqual({path: './themes', created: true});
    expect(findLocalIntegrationManifestOrNull(tmpDir)).toBeNull();
  });

  it('adds a root to a direct default export and preserves other fields', async () => {
    const file = manifest(
      `// Keep this note.\nexport default {components: './components'};\n`,
    );
    const result = await patchIntegrationRoot(tmpDir, 'themes', './themes');
    const source = fs.readFileSync(file, 'utf-8');

    expect(result).toEqual({path: './themes', created: true});
    expect(source).toContain('// Keep this note.');
    expect(source).toContain("components: './components'");
    expect(source).toContain("themes: './themes'");
  });

  it('handles a typed satisfies expression', async () => {
    const file = manifest(
      `import type {AstryxIntegration} from '@astryxdesign/cli/authoring';\nexport default {} satisfies AstryxIntegration;\n`,
      'ts',
    );
    await patchIntegrationRoot(tmpDir, 'themes', './themes');
    expect(fs.readFileSync(file, 'utf-8')).toContain("themes: './themes'");
  });

  it('is an idempotent no-op when the root already matches', async () => {
    const file = manifest(`export default {themes: './themes'};\n`);
    const before = fs.readFileSync(file, 'utf-8');
    await expect(
      patchIntegrationRoot(tmpDir, 'themes', './themes'),
    ).resolves.toEqual({path: './themes', created: false});
    expect(fs.readFileSync(file, 'utf-8')).toBe(before);
  });

  it('returns a typed refusal instead of replacing an author-owned root', async () => {
    manifest(`export default {themes: './src/themes'};\n`);
    await expect(
      patchIntegrationRoot(tmpDir, 'themes', './themes'),
    ).rejects.toBeInstanceOf(IntegrationRootConflictError);
  });

  it('runs read-back for an already-correct root', async () => {
    manifest(`export default {themes: './themes'};\n`);
    let verified = 0;
    await expect(
      patchIntegrationRoot(tmpDir, 'themes', './themes', {
        verify: () => {
          verified += 1;
        },
      }),
    ).resolves.toEqual({path: './themes', created: false});
    expect(verified).toBe(1);
  });

  it('restores the manifest when post-write verification fails', async () => {
    const file = manifest(`export default {components: './components'};\n`);
    const before = fs.readFileSync(file, 'utf-8');
    await expect(
      patchIntegrationRoot(tmpDir, 'themes', './themes', {
        verify: () => {
          throw new Error('not visible');
        },
      }),
    ).rejects.toThrow(/Post-write verification failed: not visible/u);
    expect(fs.readFileSync(file, 'utf-8')).toBe(before);
  });

  it('does not clobber a concurrent manifest edit during rollback', async () => {
    const file = manifest(`export default {components: './components'};\n`);
    const concurrent = `export default {components: './components', docs: './docs'};\n`;
    await expect(
      patchIntegrationRoot(tmpDir, 'themes', './themes', {
        verify: () => {
          fs.writeFileSync(file, concurrent);
          throw new Error('not visible');
        },
      }),
    ).rejects.toThrow(/File changed while writing/u);
    expect(fs.readFileSync(file, 'utf-8')).toBe(concurrent);
  });

  it('removes a newly created manifest when verification fails', async () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"fixture"}\n');
    await expect(
      patchIntegrationRoot(tmpDir, 'themes', './themes', {
        createIfMissing: true,
        verify: () => {
          throw new Error('not visible');
        },
      }),
    ).rejects.toThrow(/Post-write verification failed: not visible/u);
    expect(findLocalIntegrationManifestOrNull(tmpDir)).toBeNull();
  });

  it('preserves a concurrent edit to a newly created manifest on rollback', async () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"fixture"}\n');
    const file = path.join(tmpDir, 'astryx.integration.mjs');
    const concurrent = `export default {docs: './docs'};\n`;
    await expect(
      patchIntegrationRoot(tmpDir, 'themes', './themes', {
        createIfMissing: true,
        verify: () => {
          fs.writeFileSync(file, concurrent);
          throw new Error('not visible');
        },
      }),
    ).rejects.toThrow(/File changed before rollback/u);
    expect(fs.readFileSync(file, 'utf-8')).toBe(concurrent);
  });

  it('dry-runs the same patch without changing bytes', async () => {
    const file = manifest();
    const before = fs.readFileSync(file, 'utf-8');
    await expect(
      patchIntegrationRoot(tmpDir, 'themes', './themes', {dryRun: true}),
    ).resolves.toEqual({path: './themes', created: true});
    expect(fs.readFileSync(file, 'utf-8')).toBe(before);
  });

  it('refuses a root key that is not a JavaScript identifier', async () => {
    manifest();
    await expect(
      patchIntegrationRoot(tmpDir, 'not-a-key', './root'),
    ).rejects.toThrow(/Invalid integration root key/);
  });

  it('refuses a root that escapes the package', async () => {
    manifest();
    await expect(
      patchIntegrationRoot(tmpDir, 'themes', '../themes'),
    ).rejects.toThrow(/outside the project root/u);
  });

  it('preserves a manifest symlink and updates its in-package target', async () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"fixture"}\n');
    fs.mkdirSync(path.join(tmpDir, 'config'));
    const target = path.join(tmpDir, 'config', 'integration.mjs');
    const manifestFile = path.join(tmpDir, 'astryx.integration.mjs');
    fs.writeFileSync(target, 'export default {};\n');
    fs.symlinkSync(target, manifestFile);

    await patchIntegrationRoot(tmpDir, 'themes', './themes');

    expect(fs.lstatSync(manifestFile).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(target, 'utf-8')).toContain("themes: './themes'");
  });

  it('refuses a manifest symlink whose target escapes the package', async () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"fixture"}\n');
    const outside = fs.mkdtempSync(
      path.join(process.cwd(), '.astryx-manifest-outside-'),
    );
    try {
      const target = path.join(outside, 'integration.mjs');
      fs.writeFileSync(target, 'export default {};\n');
      fs.symlinkSync(target, path.join(tmpDir, 'astryx.integration.mjs'));

      await expect(
        patchIntegrationRoot(tmpDir, 'themes', './themes'),
      ).rejects.toThrow(/outside the project root|symlink/u);
      expect(fs.readFileSync(target, 'utf-8')).toBe('export default {};\n');
    } finally {
      fs.rmSync(outside, {recursive: true, force: true});
    }
  });

  it('finds zero or exactly one conventional manifest', () => {
    expect(findLocalIntegrationManifestOrNull(tmpDir)).toBeNull();
    const file = manifest();
    expect(findLocalIntegrationManifest(tmpDir)).toBe(file);
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.integration.js'),
      'export default {};\n',
    );
    expect(() => findLocalIntegrationManifest(tmpDir)).toThrow(
      /Multiple integration manifests/u,
    );
  });
});

describe('patchIntegrationRoot with a nested key beside a spread', () => {
  it('refuses to add the object a spread may set, and leaves the manifest as it was', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'shared.mjs'),
      "export default {experimental: {other: './other'}};\n",
    );
    const before =
      "import shared from './shared.mjs';\n\nexport default {\n  ...shared,\n  docs: './docs',\n};\n";
    const file = manifest(before);
    await expect(
      patchIntegrationRoot(tmpDir, 'experimental.iconSets', './icon-sets'),
    ).rejects.toThrow(
      /spreads another object \(`\.\.\.`\) where "experimental" would go.*Set "experimental\.iconSets: '\.\/icon-sets'" in it yourself/u,
    );
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
  });

  it('adds the key inside an existing literal object, keeping its other keys', async () => {
    const file = manifest(
      "export default {\n  experimental: {\n    other: './other',\n  },\n};\n",
    );
    await patchIntegrationRoot(tmpDir, 'experimental.iconSets', './icon-sets');
    const text = fs.readFileSync(file, 'utf8');
    expect(text).toContain("other: './other'");
    expect(text).toContain("iconSets: './icon-sets'");
    expect(text.match(/experimental:/gu)).toHaveLength(1);
  });

  it('a top-level key beside a spread is still added: the loaded manifest shows whether the spread sets it', async () => {
    const file = manifest(
      "const shared = {docs: './docs'};\n\nexport default {\n  ...shared,\n};\n",
    );
    await patchIntegrationRoot(tmpDir, 'themes', './themes');
    expect(fs.readFileSync(file, 'utf8')).toContain("themes: './themes'");
    // The spread already sets `docs`: the same value is a no-op, another a
    // conflict, so the spread's value is never shadowed.
    await expect(
      patchIntegrationRoot(tmpDir, 'docs', './elsewhere'),
    ).rejects.toBeInstanceOf(IntegrationRootConflictError);
  });
});
