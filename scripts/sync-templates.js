#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.


/**
 * @file sync-templates.js
 *
 * Reads packages/cli/assets/templates/{name}/template.doc.mjs and generates:
 * 1. A template registry (apps/sandbox/src/generated/templateRegistry.ts)
 * 2. Thin route wrappers under (fullscreen)/templates/{slug}/page.tsx
 *
 * Run: node scripts/sync-templates.js
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  replaceDemoContent,
} = require('../packages/cli/foundation/discovery/template-adapter.mjs');

const COPYRIGHT = '// Copyright (c) Meta Platforms, Inc. and affiliates.\n\n';
const ROOT = path.resolve(__dirname, '..');
const TEMPLATES_DIR = path.join(ROOT, 'packages', 'cli', 'assets', 'templates');
const PAGES_DIR = path.join(TEMPLATES_DIR, 'pages');
const BLOCKS_DIR = path.join(TEMPLATES_DIR, 'blocks');
const SANDBOX_DIR = path.join(ROOT, 'apps', 'sandbox');
const GENERATED_DIR = path.join(SANDBOX_DIR, 'src', 'generated');
const ROUTES_DIR = path.join(
  SANDBOX_DIR, 'src', 'app', '(fullscreen)', 'templates'
);
// Template images are committed under the docsite's public dir. The sandbox
// previews the same templates, so mirror them into the sandbox public dir at
// generate time (gitignored — not committed) so /template-assets/* resolves
// in the sandbox preview too.
const TEMPLATE_ASSETS_SRC = path.join(
  ROOT, 'apps', 'docsite', 'public', 'template-assets'
);
const TEMPLATE_ASSETS_DEST = path.join(SANDBOX_DIR, 'public', 'template-assets');
// Blocks now share the templates route directory


async function discoverPages() {
  if (!fs.existsSync(PAGES_DIR)) return [];

  const dirs = fs.readdirSync(PAGES_DIR, {withFileTypes: true})
    .filter(e => e.isDirectory());

  const templates = [];

  for (const dir of dirs) {
    const docPath = path.join(PAGES_DIR, dir.name, 'template.doc.mjs');
    const pagePath = path.join(PAGES_DIR, dir.name, 'page.tsx');

    if (!fs.existsSync(docPath)) continue;

    if (!fs.existsSync(pagePath)) {
      console.warn(`  skip ${dir.name}/ (has doc but missing page.tsx)`);
      continue;
    }

    const docModule = await import(`file://${docPath}`);
    const doc = docModule.doc;

    templates.push({
      type: 'page',
      dirName: dir.name,
      name: doc.name,
      description: doc.description,
      isReady: doc.isReady ?? false,
      sourceDir: path.join(PAGES_DIR, dir.name),
      sourceFile: 'page.tsx',
    });
  }

  return templates.sort((a, b) => a.name.localeCompare(b.name));
}

function findDocFilesRecursive(dir, pattern) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findDocFilesRecursive(full, pattern));
    } else if (pattern.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

async function discoverBlocks() {
  const docFiles = findDocFilesRecursive(BLOCKS_DIR, /\.doc\.mjs$/);
  const blocks = [];

  for (const docPath of docFiles) {
    const basename = path.basename(docPath, '.doc.mjs');
    const tsxPath = path.join(path.dirname(docPath), basename + '.tsx');
    if (!fs.existsSync(tsxPath)) {
      console.warn(`  skip ${basename} (has doc but missing .tsx)`);
      continue;
    }

    const docModule = await import(`file://${docPath}`);
    const doc = docModule.doc;

    const componentFolder = path.basename(path.dirname(docPath));
    blocks.push({
      type: 'block',
      dirName: basename,
      name: doc.name || basename,
      description: doc.description || '',
      isReady: doc.isReady ?? false,
      component: componentFolder,
      aspectRatio: doc.aspectRatio ?? 4 / 3,
      scale: doc.scale ?? 1,
      isShowcase: doc.isShowcase ?? false,
      sourceDir: path.dirname(tsxPath),
      sourceFile: basename + '.tsx',
      relPath: path.relative(BLOCKS_DIR, path.dirname(tsxPath)),
    });
  }

  return blocks.sort((a, b) => a.name.localeCompare(b.name));
}

async function discoverTemplates() {
  const [pages, blocks] = await Promise.all([
    discoverPages(),
    discoverBlocks(),
  ]);
  return {pages, blocks, all: [...pages, ...blocks]};
}

function generateRegistry(items, exportName, interfaceName, extraFields = []) {
  const entries = items.map(t => {
    const extras = extraFields
      .map(f => `    ${f}: ${JSON.stringify(t[f])},`)
      .join('\n');
    return `  {
    name: ${JSON.stringify(t.name)},
    slug: ${JSON.stringify(t.dirName)},
    description: ${JSON.stringify(t.description)},
    isReady: ${JSON.stringify(t.isReady)},
    href: '/templates/${t.dirName}/',
${extras}
  }`;
  });

  const typeMap = {string: 'string', number: 'number', boolean: 'boolean'};
  const extraInterface = extraFields
    .map(f => {
      const sample = items.find(i => i[f] != null);
      const tsType = sample ? (typeMap[typeof sample[f]] ?? 'string') : 'string';
      return `  ${f}: ${tsType};`;
    })
    .join('\n');

  return `${COPYRIGHT}/**
 * AUTO-GENERATED by scripts/sync-templates.js — do not edit.
 */

export interface ${interfaceName} {
  name: string;
  slug: string;
  description: string;
  isReady: boolean;
  href: string;
${extraInterface}
}

export const ${exportName}: ${interfaceName}[] = [
${entries.join(',\n')}
];
`;
}

function generateSourceRegistry(items) {
  const entries = items.map(t => {
    const sourcePath = path.join(t.sourceDir, t.sourceFile);
    // The code view hands out source, not a copy: demo content becomes the
    // placeholder a copy writes, and fixture media stays. The preview route
    // renders the original file.
    const {source} = replaceDemoContent(fs.readFileSync(sourcePath, 'utf-8'));
    return `  ${JSON.stringify('/templates/' + t.dirName + '/')}: ${JSON.stringify(source)}`;
  });

  return `${COPYRIGHT}/**
 * AUTO-GENERATED by scripts/sync-templates.js — do not edit.
 * Maps template/block hrefs to their displayed source code.
 */

export const sourceRegistry: Record<string, string> = {
${entries.join(',\n')}
};
`;
}

function generatePageRouteWrapper(template) {
  const depth = '../../../../../../../packages/cli/assets/templates/pages';
  return `${COPYRIGHT}/**
 * AUTO-GENERATED by scripts/sync-templates.js — do not edit.
 * Template: ${template.name}
 */
export {default} from '${depth}/${template.dirName}/page';
`;
}

function generateBlockRouteWrapper(block) {
  const componentRel = path.relative(
    path.join(ROUTES_DIR, block.dirName),
    path.join(block.sourceDir, path.basename(block.sourceFile, '.tsx')),
  );
  const docBasename = path.basename(block.sourceFile, '.tsx') + '.doc.mjs';
  const docRel = path.relative(
    path.join(ROUTES_DIR, block.dirName),
    path.join(block.sourceDir, docBasename),
  );
  const contextRel = path.relative(
    path.join(ROUTES_DIR, block.dirName),
    path.join(SANDBOX_DIR, 'src', 'app', '(fullscreen)', 'BlockDocContext'),
  );

  if (block.isShowcase) {
    return `${COPYRIGHT}'use client';
/**
 * AUTO-GENERATED by scripts/sync-templates.js — do not edit.
 * Block: ${block.name} (showcase)
 */
import Component from '${componentRel}';
import {ShowcasePreview} from '${contextRel}';

export default function Page() {
  return (
    <ShowcasePreview>
      <Component />
    </ShowcasePreview>
  );
}
`;
  }

  return `${COPYRIGHT}'use client';
/**
 * AUTO-GENERATED by scripts/sync-templates.js — do not edit.
 * Block: ${block.name}
 */
import Component from '${componentRel}';
import {doc} from '${docRel}';
import {BlockPreview} from '${contextRel}';

const d = doc as {aspectRatio?: number; scale?: number};

export default function Page() {
  return (
    <BlockPreview meta={{aspectRatio: d.aspectRatio ?? 4 / 3, scale: d.scale ?? 1}}>
      <Component />
    </BlockPreview>
  );
}
`;
}

// Mirror docsite template-assets into the sandbox public dir so the sandbox
// preview can serve /template-assets/* (the files are only committed under the
// docsite). Uses fs.cpSync; the destination is gitignored.
function copyTemplateAssets() {
  if (!fs.existsSync(TEMPLATE_ASSETS_SRC)) {
    return;
  }
  fs.cpSync(TEMPLATE_ASSETS_SRC, TEMPLATE_ASSETS_DEST, {recursive: true});
  const count = fs.readdirSync(TEMPLATE_ASSETS_DEST).length;
  console.log(
    `  copied ${count} template asset(s) → ${path.relative(ROOT, TEMPLATE_ASSETS_DEST)}`,
  );
}

async function main() {
  console.log('Syncing templates...');

  const {pages, blocks, all} = await discoverTemplates();
  console.log(`  found ${pages.length} page(s), ${blocks.length} block(s)`);

  fs.mkdirSync(GENERATED_DIR, {recursive: true});

  if (fs.existsSync(ROUTES_DIR)) fs.rmSync(ROUTES_DIR, {recursive: true});

  const registryPath = path.join(GENERATED_DIR, 'templateRegistry.ts');
  fs.writeFileSync(registryPath, generateRegistry(pages, 'templates', 'TemplateEntry'));
  console.log(`  wrote ${path.relative(ROOT, registryPath)}`);

  const blockRegistryPath = path.join(GENERATED_DIR, 'blockRegistry.ts');
  fs.writeFileSync(blockRegistryPath, generateRegistry(blocks, 'blocks', 'BlockEntry', ['component', 'aspectRatio', 'scale', 'isShowcase']));
  console.log(`  wrote ${path.relative(ROOT, blockRegistryPath)}`);

  const sourceRegistryPath = path.join(GENERATED_DIR, 'sourceRegistry.ts');
  fs.writeFileSync(sourceRegistryPath, generateSourceRegistry(all));
  console.log(`  wrote ${path.relative(ROOT, sourceRegistryPath)}`);

  for (const t of pages) {
    const routeDir = path.join(ROUTES_DIR, t.dirName);
    fs.mkdirSync(routeDir, {recursive: true});
    const wrapperPath = path.join(routeDir, 'page.tsx');
    fs.writeFileSync(wrapperPath, generatePageRouteWrapper(t));
    console.log(`  wrote ${path.relative(ROOT, wrapperPath)}`);
  }

  for (const b of blocks) {
    const routeDir = path.join(ROUTES_DIR, b.dirName);
    fs.mkdirSync(routeDir, {recursive: true});
    const wrapperPath = path.join(routeDir, 'page.tsx');
    fs.writeFileSync(wrapperPath, generateBlockRouteWrapper(b));
    console.log(`  wrote ${path.relative(ROOT, wrapperPath)}`);
  }

  copyTemplateAssets();

  console.log('Done.');
}

module.exports = {generateSourceRegistry};

// Importing the module for its helpers runs neither the sync nor the watch.
const isCli = require.main === module;
(isCli ? main() : Promise.resolve())
  .then(() => {
    if (isCli && process.argv.includes('--watch')) {
      const chokidar = require('chokidar');
      const watchPaths = [
        PAGES_DIR + '/**/template.doc.mjs',
        BLOCKS_DIR + '/**/*.doc.mjs',
      ];
      let debounce = null;
      const rerun = () => {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => {
          console.log('\n  .doc.mjs changed — re-syncing...');
          main().catch(console.error);
        }, 300);
      };
      chokidar.watch(watchPaths, {ignoreInitial: true}).on('all', rerun);
      console.log('  Watching .doc.mjs files for changes...');
    }
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
