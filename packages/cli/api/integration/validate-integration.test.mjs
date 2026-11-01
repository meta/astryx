// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Hermetic tests for the validate-integration API.
 *
 * Each test stands up a temp integration package and exercises the public
 * validate API directly. Temp dirs live UNDER the repo root (process.cwd())
 * so node_modules-style paths are within Vite's allowed fs roots; we never
 * load configs from /tmp.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  validateIntegration,
  validateLocalIntegration,
  validateInstalledIntegration,
  summarizeIssues,
} from './validate-integration.mjs';
import {
  integrationComponentConflicts,
  integrationDocConflicts,
  integrationTemplateConflicts,
} from './authoring-checks.mjs';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-validate-it-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/**
 * Create an integration package directory with a package.json + manifest.
 * @param {string} dir
 * @param {{name?: string, version?: string, manifest: string, manifestExt?: string}} opts
 */
function writePackage(
  dir,
  {name = '@acme/widgets', version = '1.0.0', manifest, manifestExt = 'mjs'},
) {
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({name, version}),
  );
  fs.writeFileSync(
    path.join(dir, `astryx.integration.${manifestExt}`),
    manifest,
  );
}

/** Find issues by code. */
function byCode(issues, code) {
  return issues.filter(i => i.code === code);
}

describe('validate-integration API', () => {
  it('reports no errors for a valid integration with a codemod', async () => {
    const pkgDir = path.join(tmpDir, 'pkg');
    writePackage(pkgDir, {
      manifest: `export default { codemods: './codemods' };\n`,
    });
    const cmDir = path.join(pkgDir, 'codemods', '0.2.0');
    fs.mkdirSync(cmDir, {recursive: true});
    fs.writeFileSync(
      path.join(cmDir, 'drop-foo.mjs'),
      `export default { type: 'code', title: 'Drop foo', transform: (file) => file.source };\n`,
    );

    const result = await validateLocalIntegration(pkgDir);
    expect(result.found).toBe(true);
    expect(result.name).toBe('@acme/widgets');
    expect(result.version).toBe('1.0.0');
    const {errors} = summarizeIssues(result.issues);
    expect(errors).toBe(0);
  });

  it('warns, with a fix and the file, on docs no reader can serve', async () => {
    const pkgDir = path.join(tmpDir, 'pkg');
    writePackage(pkgDir, {
      manifest: `export default { docs: './docs' };\n`,
    });
    fs.mkdirSync(path.join(pkgDir, 'docs'), {recursive: true});
    fs.writeFileSync(
      path.join(pkgDir, 'docs', 'ghost.doc.zh.mjs'),
      "export default {title: 'ghost'};\n",
    );

    const result = await validateLocalIntegration(pkgDir);

    expect(byCode(result.issues, 'orphan_doc_overlay')).toEqual([
      expect.objectContaining({
        severity: 'warning',
        file: 'docs/ghost.doc.zh.mjs',
        fix: expect.stringContaining('Delete docs/ghost.doc.zh.mjs'),
      }),
    ]);
  });

  it('reports an unknown manifest key as a warning, and still loads the rest', async () => {
    // The manifest used to be parsed with a strict schema, so a single unknown
    // key failed the parse — and an integration whose manifest fails to parse
    // contributes NOTHING, taking its components, templates and codemods down
    // with it on every consumer resolving an older CLI (#5119). A key this CLI
    // does not know is almost always a key from a newer one.
    const pkgDir = path.join(tmpDir, 'pkg');
    writePackage(pkgDir, {
      manifest: `export default { components: './c', bogus: true };\n`,
    });
    const result = await validateLocalIntegration(pkgDir);
    expect(byCode(result.issues, 'invalid_manifest')).toHaveLength(0);

    const unknown = byCode(result.issues, 'unknown_manifest_key');
    expect(unknown).toHaveLength(1);
    expect(unknown[0].severity).toBe('warning');
    expect(unknown[0].message).toContain('"bogus"');
    // The declared root is still seen — it is missing on disk, which is the
    // proof the rest of the manifest was read rather than discarded.
    expect(byCode(result.issues, 'missing_root')).toHaveLength(1);
  });

  it('still flags a known manifest key of the wrong type as invalid_manifest', async () => {
    const pkgDir = path.join(tmpDir, 'pkg');
    writePackage(pkgDir, {
      manifest: `export default { components: 42 };\n`,
    });
    const result = await validateLocalIntegration(pkgDir);
    const manifestIssues = byCode(result.issues, 'invalid_manifest');
    expect(manifestIssues).toHaveLength(1);
    expect(manifestIssues[0].severity).toBe('error');
  });

  it('flags a declared-but-missing root as missing_root error', async () => {
    const pkgDir = path.join(tmpDir, 'pkg');
    writePackage(pkgDir, {
      manifest: `export default { templates: './nope' };\n`,
    });
    const result = await validateLocalIntegration(pkgDir);
    const rootIssues = byCode(result.issues, 'missing_root');
    expect(rootIssues).toHaveLength(1);
    expect(rootIssues[0].severity).toBe('error');
    expect(summarizeIssues(result.issues).errors).toBeGreaterThan(0);
  });

  it('flags multiple manifests as multiple_manifests error', async () => {
    const pkgDir = path.join(tmpDir, 'pkg');
    writePackage(pkgDir, {manifest: `export default {};\n`});
    fs.writeFileSync(
      path.join(pkgDir, 'astryx.integration.js'),
      'export default {};\n',
    );
    const result = await validateLocalIntegration(pkgDir);
    expect(byCode(result.issues, 'multiple_manifests')).toHaveLength(1);
  });

  it('returns found:false (guidance) when no manifest is present', async () => {
    const pkgDir = path.join(tmpDir, 'pkg');
    fs.mkdirSync(pkgDir, {recursive: true});
    fs.writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({name: 'plain'}),
    );
    const result = await validateLocalIntegration(pkgDir);
    expect(result.found).toBe(false);
    expect(result.issues).toEqual([]);
  });

  it('reports invalid agentDocs without invalidating other manifest fields', async () => {
    const pkgDir = path.join(tmpDir, 'pkg');
    writePackage(pkgDir, {
      manifest: `export default {
        components: './components',
        agentDocs: {append: [' invalid']},
      };\n`,
    });
    const componentsDir = path.join(pkgDir, 'components');
    fs.mkdirSync(componentsDir);
    fs.writeFileSync(
      path.join(componentsDir, 'Widget.doc.mjs'),
      `export default {name: 'Widget', props: []};\n`,
    );
    fs.writeFileSync(
      path.join(componentsDir, 'Widget.tsx'),
      `export function Widget() { return null; }\n`,
    );

    const result = await validateLocalIntegration(pkgDir);

    expect(byCode(result.issues, 'invalid_manifest')).toHaveLength(0);
    expect(byCode(result.issues, 'invalid_component')).toHaveLength(0);
    const agentDocsIssues = byCode(result.issues, 'invalid_agent_docs');
    expect(agentDocsIssues).toHaveLength(1);
    expect(agentDocsIssues[0].severity).toBe('error');
  });

  it('reports nothing for a docsiteUrl', async () => {
    const pkgDir = path.join(tmpDir, 'pkg');
    writePackage(pkgDir, {
      manifest: `export default {docsiteUrl: 'https://widgets.example.com'};\n`,
    });

    const result = await validateLocalIntegration(pkgDir);

    expect(result.issues).toEqual([]);
  });

  it('flags a broken codemod as invalid_codemod error', async () => {
    const pkgDir = path.join(tmpDir, 'pkg');
    writePackage(pkgDir, {
      manifest: `export default { codemods: './codemods' };\n`,
    });
    const cmDir = path.join(pkgDir, 'codemods', '0.2.0');
    fs.mkdirSync(cmDir, {recursive: true});
    // Missing default export → discovery throws → invalid_codemod.
    fs.writeFileSync(
      path.join(cmDir, 'broken.mjs'),
      `export const nope = 1;\n`,
    );

    const result = await validateLocalIntegration(pkgDir);
    expect(byCode(result.issues, 'invalid_codemod')).toHaveLength(1);
  });

  it('names a broken codemod of an installed package by its path inside the package', async () => {
    const consumer = path.join(tmpDir, 'consumer');
    fs.mkdirSync(consumer, {recursive: true});
    fs.writeFileSync(
      path.join(consumer, 'package.json'),
      JSON.stringify({name: 'consumer'}),
    );
    const pkgDir = path.join(consumer, 'node_modules', '@acme', 'kit');
    writePackage(pkgDir, {
      name: '@acme/kit',
      manifest: `export default { codemods: './codemods' };\n`,
    });
    fs.mkdirSync(path.join(pkgDir, 'codemods', '1.1.0'), {recursive: true});
    fs.writeFileSync(
      path.join(pkgDir, 'codemods', '1.1.0', 'no-default.mjs'),
      'export const nope = 1;\n',
    );
    fs.writeFileSync(
      path.join(pkgDir, 'codemods', 'stray.mjs'),
      `export default {type: 'code', title: 'Stray', transform: file => file.source};\n`,
    );

    const result = await validateInstalledIntegration('@acme/kit', consumer);

    const [broken] = byCode(result.issues, 'invalid_codemod');
    expect(broken.message).toContain('(codemods/1.1.0/no-default.mjs)');
    const [stray] = byCode(result.issues, 'codemod_outside_version');
    expect(stray.message).toContain('"codemods/stray.mjs"');
    for (const issue of result.issues) {
      expect(issue.message).not.toContain(tmpDir);
    }
  });

  it('flags a broken template as invalid_template error', async () => {
    const pkgDir = path.join(tmpDir, 'pkg');
    writePackage(pkgDir, {
      manifest: `export default { templates: './templates' };\n`,
    });
    const tplDir = path.join(pkgDir, 'templates');
    fs.mkdirSync(tplDir, {recursive: true});
    // Doc with no same-stem source file.
    fs.writeFileSync(
      path.join(tplDir, 'dash.doc.mjs'),
      `export default { type: 'page', name: 'Dash' };\n`,
    );

    const result = await validateLocalIntegration(pkgDir);
    expect(byCode(result.issues, 'invalid_template')).toHaveLength(1);
  });

  it('reports no errors for a valid source-theme descriptor', async () => {
    const pkgDir = path.join(tmpDir, 'pkg');
    writePackage(pkgDir, {
      manifest: `export default { themes: './themes' };
`,
    });
    const themeDir = path.join(pkgDir, 'themes', 'ocean');
    fs.mkdirSync(themeDir, {recursive: true});
    fs.writeFileSync(
      path.join(themeDir, 'oceanTheme.doc.mjs'),
      `/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */
export default {type: 'theme', name: 'ocean', displayName: 'Ocean', description: 'Blue and calm.', maintained: true};
`,
    );
    fs.writeFileSync(
      path.join(themeDir, 'oceanTheme.ts'),
      `export const oceanTheme = {};
`,
    );

    const result = await validateLocalIntegration(pkgDir);
    expect(byCode(result.issues, 'invalid_theme')).toHaveLength(0);
    expect(summarizeIssues(result.issues).errors).toBe(0);
  });

  it('flags an obsolete source-theme catalog as invalid_theme', async () => {
    const pkgDir = path.join(tmpDir, 'pkg');
    writePackage(pkgDir, {
      manifest: `export default { themes: './themes' };
`,
    });
    fs.mkdirSync(path.join(pkgDir, 'themes'), {recursive: true});
    fs.writeFileSync(
      path.join(pkgDir, 'themes', 'manifest.json'),
      '{"version":1}',
    );

    const result = await validateLocalIntegration(pkgDir);
    expect(byCode(result.issues, 'invalid_theme')).toHaveLength(1);
  });

  it('warns when a component source has no same-stem metadata', async () => {
    const pkgDir = path.join(tmpDir, 'pkg');
    writePackage(pkgDir, {
      manifest: `export default { components: './components' };\n`,
    });
    fs.mkdirSync(path.join(pkgDir, 'components'));
    fs.writeFileSync(
      path.join(pkgDir, 'components', 'InvisibleWidget.tsx'),
      'export function InvisibleWidget() { return null; }\n',
    );

    const result = await validateLocalIntegration(pkgDir);

    expect(byCode(result.issues, 'source_without_component_doc')).toEqual([
      expect.objectContaining({
        severity: 'warning',
        message: expect.stringContaining('InvisibleWidget.doc.mjs'),
      }),
    ]);
    expect(
      byCode(result.issues, 'source_without_component_doc')[0].message,
    ).toContain(
      "Fix: add InvisibleWidget.doc.mjs beside it with type: 'component'",
    );
  });

  it('warns when a template source has no same-stem metadata, skipping test files', async () => {
    const pkgDir = path.join(tmpDir, 'pkg');
    writePackage(pkgDir, {
      manifest: `export default { templates: './templates' };\n`,
    });
    fs.mkdirSync(path.join(pkgDir, 'templates'));
    fs.writeFileSync(
      path.join(pkgDir, 'templates', 'stray.tsx'),
      'export default function Stray() { return null; }\n',
    );
    fs.writeFileSync(
      path.join(pkgDir, 'templates', 'stray.test.tsx'),
      "import {it} from 'vitest';\nit('renders', () => {});\n",
    );

    const result = await validateLocalIntegration(pkgDir);

    const warnings = byCode(result.issues, 'source_without_template_doc');
    expect(warnings).toEqual([
      expect.objectContaining({
        severity: 'warning',
        message: expect.stringContaining('"stray.tsx"'),
      }),
    ]);
    expect(warnings[0].message).not.toContain('stray.test.tsx');
    expect(warnings[0].message).toContain(
      "Fix: add stray.doc.mjs beside it with type: 'page' or 'block'",
    );
  });

  it('reports codemods outside semver folders and invalid folder names', async () => {
    const pkgDir = path.join(tmpDir, 'pkg');
    writePackage(pkgDir, {
      manifest: `export default { codemods: './codemods' };\n`,
    });
    fs.mkdirSync(path.join(pkgDir, 'codemods', 'v1'), {recursive: true});
    fs.writeFileSync(
      path.join(pkgDir, 'codemods', 'forgotten.mjs'),
      `export default {type: 'code', title: 'Forgotten', transform: file => file.source};\n`,
    );

    const result = await validateLocalIntegration(pkgDir);

    const [stray] = byCode(result.issues, 'codemod_outside_version');
    expect(stray.message).toContain('"codemods/forgotten.mjs"');
    expect(stray.message).toContain('codemods/1.2.0/forgotten.mjs');
    expect(stray.message).not.toContain(tmpDir);
    const [folder] = byCode(result.issues, 'invalid_codemod_version');
    expect(folder.message).toContain('Fix: rename it');
  });

  it('warns about valid contribution metadata outside every declared root', async () => {
    const pkgDir = path.join(tmpDir, 'pkg');
    writePackage(pkgDir, {manifest: 'export default {};\n'});
    fs.mkdirSync(path.join(pkgDir, 'src'));
    fs.writeFileSync(
      path.join(pkgDir, 'src', 'orphan.doc.mjs'),
      `export default ${JSON.stringify({
        type: 'generic',
        name: 'orphan',
        title: 'Orphan',
        description: 'Outside every root.',
        sections: [
          {title: 'Overview', content: [{type: 'prose', text: 'Orphan.'}]},
        ],
      })};\n`,
    );
    fs.writeFileSync(
      path.join(pkgDir, 'src', 'not-a-doc.doc.mjs'),
      'export default {nope: true};\n',
    );
    fs.mkdirSync(path.join(pkgDir, 'dist'));
    fs.writeFileSync(
      path.join(pkgDir, 'dist', 'built.doc.mjs'),
      `export default ${JSON.stringify({
        type: 'generic',
        name: 'built',
        title: 'Built',
        description: 'Generated output.',
        sections: [
          {title: 'Overview', content: [{type: 'prose', text: 'Built.'}]},
        ],
      })};\n`,
    );

    const result = await validateLocalIntegration(pkgDir);

    const unreachable = byCode(result.issues, 'unreachable_contribution');
    expect(unreachable).toHaveLength(1);
    expect(unreachable[0].message).toContain('src/orphan.doc.mjs');
    // No docs root is declared, but src/ also holds a .doc.mjs that is not a
    // topic, which a docs root at src/ would read too; so the fix moves it.
    expect(unreachable[0].message).toContain(
      "Fix: move it into docs/ and set `docs: './docs'` in astryx.integration.mjs.",
    );
  });

  it('names the root that reads misplaced metadata when one is declared', async () => {
    const pkgDir = path.join(tmpDir, 'pkg');
    writePackage(pkgDir, {
      manifest: `export default { templates: './templates' };\n`,
    });
    fs.mkdirSync(path.join(pkgDir, 'templates'));
    fs.mkdirSync(path.join(pkgDir, 'src', 'blocks'), {recursive: true});
    fs.writeFileSync(
      path.join(pkgDir, 'src', 'blocks', 'Carousel.doc.mjs'),
      `export default {type: 'block', name: 'Carousel', displayName: 'Carousel', aspectRatio: 1};\n`,
    );

    const result = await validateLocalIntegration(pkgDir);

    const [issue] = byCode(result.issues, 'unreachable_contribution');
    expect(issue.message).toContain(
      "Fix: move it under templates/ (the templates root), or set `templates: './src/blocks'` in astryx.integration.mjs.",
    );
  });

  it('never executes unreachable metadata while diagnosing it', async () => {
    const pkgDir = path.join(tmpDir, 'pkg');
    const marker = path.join(tmpDir, 'executed');
    writePackage(pkgDir, {manifest: 'export default {};\n'});
    fs.mkdirSync(path.join(pkgDir, 'src'));
    fs.writeFileSync(
      path.join(pkgDir, 'src', 'danger.doc.mjs'),
      `import fs from 'node:fs';\nfs.writeFileSync(${JSON.stringify(marker)}, 'ran');\nexport default {type: 'generic', name: 'danger', title: 'Danger', description: 'Static only.', sections: []};\n`,
    );

    const result = await validateLocalIntegration(pkgDir);

    expect(byCode(result.issues, 'unreachable_contribution')).toHaveLength(1);
    expect(fs.existsSync(marker)).toBe(false);
  });

  it('reports malformed local package.json instead of losing package identity', async () => {
    const pkgDir = path.join(tmpDir, 'pkg');
    writePackage(pkgDir, {manifest: 'export default {};\n'});
    fs.writeFileSync(path.join(pkgDir, 'package.json'), '{bad-json');

    const result = await validateLocalIntegration(pkgDir);

    expect(byCode(result.issues, 'invalid_package_json')).toHaveLength(1);
  });

  it('validates an installed package resolved from node_modules', async () => {
    const consumer = path.join(tmpDir, 'consumer');
    fs.mkdirSync(consumer, {recursive: true});
    fs.writeFileSync(
      path.join(consumer, 'package.json'),
      JSON.stringify({name: 'consumer'}),
    );
    const pkgDir = path.join(consumer, 'node_modules', '@acme', 'widgets');
    writePackage(pkgDir, {
      name: '@acme/widgets',
      version: '2.0.0',
      manifest: `export default { templates: './gone' };\n`,
    });

    const result = await validateInstalledIntegration(
      '@acme/widgets',
      consumer,
    );
    expect(result.found).toBe(true);
    expect(result.name).toBe('@acme/widgets');
    expect(result.version).toBe('2.0.0');
    expect(byCode(result.issues, 'missing_root')).toHaveLength(1);
  });

  it('flags a non-installed package as package_not_found error', async () => {
    const consumer = path.join(tmpDir, 'consumer');
    fs.mkdirSync(consumer, {recursive: true});
    fs.writeFileSync(
      path.join(consumer, 'package.json'),
      JSON.stringify({name: 'consumer'}),
    );
    const result = await validateInstalledIntegration('@acme/nope', consumer);
    expect(byCode(result.issues, 'package_not_found')).toHaveLength(1);
  });

  it('reports malformed installed package.json distinctly from not found', async () => {
    const consumer = path.join(tmpDir, 'consumer');
    const pkgDir = path.join(consumer, 'node_modules', '@acme', 'widgets');
    writePackage(pkgDir, {
      name: '@acme/widgets',
      manifest: 'export default {};\n',
    });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), '{bad-json');

    const result = await validateInstalledIntegration(
      '@acme/widgets',
      consumer,
    );

    expect(byCode(result.issues, 'invalid_package_json')).toHaveLength(1);
    expect(byCode(result.issues, 'package_not_found')).toHaveLength(0);
  });

  it('reports no errors for a valid component (doc + same-stem source)', async () => {
    const pkgDir = path.join(tmpDir, 'pkg');
    writePackage(pkgDir, {
      manifest: `export default { components: './components' };\n`,
    });
    const cDir = path.join(pkgDir, 'components');
    fs.mkdirSync(cDir, {recursive: true});
    fs.writeFileSync(
      path.join(cDir, 'Widget.doc.mjs'),
      `export default { type: 'component', name: 'Widget', props: [] };\n`,
    );
    fs.writeFileSync(
      path.join(cDir, 'Widget.tsx'),
      `export function Widget() { return null; }\n`,
    );

    const result = await validateLocalIntegration(pkgDir);
    expect(byCode(result.issues, 'invalid_component')).toHaveLength(0);
    expect(summarizeIssues(result.issues).errors).toBe(0);
  });

  it('flags a component doc missing its same-stem source as invalid_component', async () => {
    const pkgDir = path.join(tmpDir, 'pkg');
    writePackage(pkgDir, {
      manifest: `export default { components: './components' };\n`,
    });
    const cDir = path.join(pkgDir, 'components');
    fs.mkdirSync(cDir, {recursive: true});
    // Doc with no sibling Widget.tsx.
    fs.writeFileSync(
      path.join(cDir, 'Widget.doc.mjs'),
      `export default { type: 'component', name: 'Widget', props: [] };\n`,
    );

    const result = await validateLocalIntegration(pkgDir);
    expect(byCode(result.issues, 'invalid_component')).toHaveLength(1);
  });

  it('degrades a path-unsafe package spec (..) into a diagnostic instead of crashing', async () => {
    const consumer = path.join(tmpDir, 'consumer');
    fs.mkdirSync(consumer, {recursive: true});
    fs.writeFileSync(
      path.join(consumer, 'package.json'),
      JSON.stringify({name: 'consumer'}),
    );
    // resolvePackageDir throws on a spec with `..`; it must be caught and
    // surfaced as an issue, not escape as a raw stack / generic ERR_UNKNOWN.
    const result = await validateInstalledIntegration('../evil', consumer);
    expect(result.found).toBe(true);
    expect(byCode(result.issues, 'invalid_package_spec')).toHaveLength(1);
    expect(summarizeIssues(result.issues).errors).toBeGreaterThan(0);
  });

  it('degrades an absolute package spec into a diagnostic', async () => {
    const consumer = path.join(tmpDir, 'consumer');
    fs.mkdirSync(consumer, {recursive: true});
    fs.writeFileSync(
      path.join(consumer, 'package.json'),
      JSON.stringify({name: 'consumer'}),
    );
    const result = await validateInstalledIntegration('/etc/passwd', consumer);
    expect(byCode(result.issues, 'invalid_package_spec')).toHaveLength(1);
  });
});

describe('integration diagnostics are read-only', () => {
  /** Every directory and file under `dir`, with file bytes. */
  function snapshot(dir) {
    /** @type {Record<string, string>} */
    const entries = {};
    /** @param {string} current */
    const walk = current => {
      for (const entry of fs.readdirSync(current, {withFileTypes: true})) {
        const full = path.join(current, entry.name);
        const key = path.relative(dir, full);
        if (entry.isDirectory()) {
          entries[`${key}/`] = '';
          walk(full);
        } else {
          entries[key] = fs.readFileSync(full, 'base64');
        }
      }
    };
    walk(dir);
    return entries;
  }

  /** A package with valid, broken, conflicting, and unreachable contributions. */
  function writeDiagnosedPackage(dir) {
    writePackage(dir, {
      manifest:
        "export default {\n  components: './components',\n  templates: './templates',\n  docs: './docs',\n  codemods: './gone',\n  themes: './themes',\n};\n",
    });
    const write = (relative, contents) => {
      fs.mkdirSync(path.dirname(path.join(dir, relative)), {recursive: true});
      fs.writeFileSync(path.join(dir, relative), contents);
    };
    write(
      'components/Card.doc.mjs',
      "export default {type: 'component', name: 'Card', props: []};\n",
    );
    write('components/Card.tsx', 'export function Card() { return null; }\n');
    write(
      'components/Orphan.doc.mjs',
      "export default {type: 'component', name: 'Orphan', props: []};\n",
    );
    write(
      'templates/dash.doc.mjs',
      "export default {type: 'page', name: 'Dash'};\n",
    );
    write(
      'docs/theme.doc.mjs',
      "export default {type: 'generic', name: 'theme', title: 'Theme', description: 'x', sections: [{title: 'A', content: [{type: 'prose', text: 'x'}]}]};\n",
    );
    write('themes/manifest.json', '{"version": 1, "themes": [{"slug": 7}]}\n');
    write(
      'stray/Stray.doc.mjs',
      "export default {type: 'component', name: 'Stray', props: []};\n",
    );
  }

  it('leaves local and installed packages byte-for-byte unchanged', async () => {
    const pkgDir = path.join(tmpDir, 'pkg');
    writeDiagnosedPackage(pkgDir);
    const consumer = path.join(tmpDir, 'consumer');
    fs.mkdirSync(consumer, {recursive: true});
    fs.writeFileSync(
      path.join(consumer, 'package.json'),
      JSON.stringify({name: 'consumer'}),
    );
    writeDiagnosedPackage(
      path.join(consumer, 'node_modules', '@acme', 'widgets'),
    );
    const before = {pkg: snapshot(pkgDir), consumer: snapshot(consumer)};

    const local = await validateIntegration(undefined, {cwd: pkgDir});
    const installed = await validateIntegration('@acme/widgets', {
      cwd: consumer,
    });
    for (const [pkg, cwd] of [
      [undefined, pkgDir],
      ['@acme/widgets', consumer],
    ]) {
      await integrationTemplateConflicts(pkg, {cwd});
      await integrationComponentConflicts(pkg, {cwd});
      await integrationDocConflicts(pkg, {cwd});
    }

    expect(summarizeIssues(local.data.issues).errors).toBeGreaterThan(0);
    expect(byCode(local.data.issues, 'unreachable_contribution')).toHaveLength(
      1,
    );
    expect(summarizeIssues(installed.data.issues).errors).toBeGreaterThan(0);
    expect({pkg: snapshot(pkgDir), consumer: snapshot(consumer)}).toEqual(
      before,
    );
  });
});

describe('validated separates "checked and clean" from "never checked"', () => {
  // `doctor integration validate --json` from a directory with no manifest
  // returned {name: null, version: null, issues: []} and exit 0 — the same
  // envelope a healthy, fully validated integration produces. Wire that into
  // CI from the wrong directory and it is green forever.
  it('is false for every check when no manifest is found', async () => {
    const dir = path.join(tmpDir, 'plain');
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({name: 'plain-app', version: '1.0.0'}),
    );

    const validate = await validateIntegration(undefined, {cwd: dir});
    expect(validate.data.validated).toBe(false);
    expect(validate.data.issues).toEqual([]);

    const templates = await integrationTemplateConflicts(undefined, {cwd: dir});
    const components = await integrationComponentConflicts(undefined, {
      cwd: dir,
    });
    const docs = await integrationDocConflicts(undefined, {cwd: dir});
    expect(templates.data.validated).toBe(false);
    expect(components.data.validated).toBe(false);
    expect(docs.data.validated).toBe(false);
  });

  it('is true for a real integration, whose empty issue list then means healthy', async () => {
    const dir = path.join(tmpDir, 'integration');
    writePackage(dir, {manifest: 'export default {};\n'});

    const validate = await validateIntegration(undefined, {cwd: dir});
    expect(validate.data.validated).toBe(true);
    expect(validate.data.name).toBe('@acme/widgets');

    const templates = await integrationTemplateConflicts(undefined, {cwd: dir});
    const components = await integrationComponentConflicts(undefined, {
      cwd: dir,
    });
    const docs = await integrationDocConflicts(undefined, {cwd: dir});
    expect(templates.data.validated).toBe(true);
    expect(components.data.validated).toBe(true);
    expect(docs.data.validated).toBe(true);
  });

  it('is true for an installed package that could not be found — that is a real finding', async () => {
    const consumer = path.join(tmpDir, 'consumer');
    fs.mkdirSync(consumer, {recursive: true});
    fs.writeFileSync(
      path.join(consumer, 'package.json'),
      JSON.stringify({name: 'consumer', version: '1.0.0'}),
    );

    const res = await validateIntegration('@acme/nope', {cwd: consumer});
    expect(res.data.validated).toBe(true);
    expect(summarizeIssues(res.data.issues).errors).toBeGreaterThan(0);
  });
});

describe('unreadable folders are reported, never fatal', () => {
  // Root reads every folder, so permission cases cannot be staged as root.
  const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  /** @type {string[]} */
  const locked = [];
  afterEach(() => {
    while (locked.length) fs.chmodSync(locked.pop(), 0o755);
  });
  /** @param {string} dir */
  const lock = dir => {
    fs.chmodSync(dir, 0o000);
    locked.push(dir);
  };

  it.skipIf(asRoot)(
    'names a folder it cannot read and checks the rest of the package',
    async () => {
      const pkgDir = path.join(tmpDir, 'pkg');
      writePackage(pkgDir, {
        manifest: "export default { components: './components' };\n",
      });
      fs.mkdirSync(path.join(pkgDir, 'components'));
      fs.mkdirSync(path.join(pkgDir, 'cache'));
      lock(path.join(pkgDir, 'cache'));
      const result = await validateLocalIntegration(pkgDir);
      expect(byCode(result.issues, 'unreadable_folder')).toEqual([
        expect.objectContaining({
          severity: 'warning',
          message: expect.stringContaining('Could not read "cache/" (EACCES)'),
        }),
      ]);
      expect(summarizeIssues(result.issues).errors).toBe(0);
    },
  );

  it.skipIf(asRoot)(
    'reports a declared root it cannot read as unreadable_root',
    async () => {
      const pkgDir = path.join(tmpDir, 'pkg');
      writePackage(pkgDir, {
        manifest:
          "export default { codemods: './codemods', themes: './themes' };\n",
      });
      fs.mkdirSync(path.join(pkgDir, 'codemods'));
      fs.mkdirSync(path.join(pkgDir, 'themes'));
      lock(path.join(pkgDir, 'codemods'));
      lock(path.join(pkgDir, 'themes'));
      const result = await validateLocalIntegration(pkgDir);
      expect(
        byCode(result.issues, 'unreadable_root').map(issue => issue.message),
      ).toEqual([
        expect.stringMatching(
          /^Declared codemods root cannot be read \(EACCES\)/,
        ),
        expect.stringMatching(
          /^Declared themes root cannot be read \(EACCES\)/,
        ),
      ]);
    },
  );

  it('reports a declared root that is a file as invalid_root', async () => {
    const pkgDir = path.join(tmpDir, 'pkg');
    writePackage(pkgDir, {
      manifest: "export default { codemods: './codemods.mjs' };\n",
    });
    fs.writeFileSync(path.join(pkgDir, 'codemods.mjs'), 'export default {};\n');
    const result = await validateLocalIntegration(pkgDir);
    expect(byCode(result.issues, 'invalid_root')).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('is a file, not a folder'),
      }),
    ]);
  });
});
