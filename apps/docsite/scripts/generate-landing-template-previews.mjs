// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Renders the decorative landing previews to static markup at build time.
 * @input The tile rows, the page templates, the neutral theme, the themes
 *   card's Butter store (ThemesStorePreview), the CLI's experimental page
 *   renderer, the image and icon rewrites of the template previews, and the
 *   experimental DOCSITE_ICON_SET setting.
 * @output src/generated/landingPreviews.ts: each preview's rendered markup,
 *   with no script. The markup uses the site's own StyleX classes.
 * @position Part of `pnpm generate`, before the docsite build and dev server.
 *   FrozenPreview puts the markup into the page; CSS scales it and the page's
 *   color mode reaches it through CSS variables.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {render} from '@astryxdesign/cli/api/experimental';
import {
  ICON_SET_SETTING,
  previewIconSetList,
  rewriteTemplatePreview,
} from './template-icon-loader.mjs';
import {optimizeTemplateImages} from './template-image-loader.mjs';
import {finishSnapshotHtml} from './lib/preview-snapshot-html.mjs';

const docsiteDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const rowsFile = path.join(
  docsiteDir,
  'src/app/(site)/_landing/landingTemplateRows.json',
);
const outFile = path.join(docsiteDir, 'src/generated/landingPreviews.ts');
const themesStoreModule = path.join(
  docsiteDir,
  'src/app/(site)/_landing/ThemesStorePreview',
);
// The renderer inlines an image that the page's project serves. This folder
// is a project of its own with no `public` folder, so the previews keep the
// image URLs that the staged copies name.
const workDir = path.join(docsiteDir, '.landing-template-previews');
const templatesDir = path.resolve(
  docsiteDir,
  '../../packages/cli/assets/templates/pages',
);

// A tile shows its page at less than half size, so this width is enough on a
// high-density screen. It must be a width the image optimizer allows.
export const PREVIEW_IMAGE_WIDTH = 640;

const SOURCE_BLOCK =
  /<script type="application\/x-astryx-source">[\s\S]*?<\/script>/u;

/**
 * The page that the renderer renders for a tile: the template inside the
 * neutral theme and the preview-viewport wrapper, as the live template
 * previews show it.
 * @param {string} templatePage the template's page module, relative to the wrapper
 * @returns {string}
 */
export function previewPageSource(templatePage) {
  return `import '@astryxdesign/theme-neutral/theme.css';
import {Theme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral/built';
import Page from ${JSON.stringify(templatePage)};

export default function Preview() {
  return (
    <Theme theme={neutralTheme} mode="system">
      <div className="preview-viewport">
        <Page />
      </div>
    </Theme>
  );
}
`;
}

/**
 * The page that the renderer renders for the themes card: the Butter store
 * inside the Butter theme.
 * @param {string} storeModule the ThemesStorePreview module, relative to the wrapper
 * @returns {string}
 */
export function themesStorePageSource(storeModule) {
  return `import {Theme} from '@astryxdesign/core/theme';
import {butterTheme} from '@astryxdesign/theme-butter/built';
import ThemesStorePreview from ${JSON.stringify(storeModule)};

export default function Preview() {
  return (
    <Theme theme={butterTheme} mode="system">
      <ThemesStorePreview />
    </Theme>
  );
}
`;
}

/**
 * The markup of a rendered page that the landing page shows: the body,
 * without the embedded source that only `render --reverse` reads. The site's
 * own stylesheet styles it, so the page's styles are not kept. Its images
 * load at low priority.
 * @param {string} html
 * @returns {string}
 */
export function previewMarkup(html) {
  const body = /<body[^>]*>([\s\S]*)<\/body>/u.exec(html)?.[1] ?? '';
  return finishSnapshotHtml(body.replace(SOURCE_BLOCK, '').trim());
}

/**
 * Writes the page that the renderer renders for one tile into `pageDir`: a
 * copy of the template with the rewrites that the Webpack loaders give every
 * other template preview. Each photo that the docsite serves loads through
 * the image optimizer at preview size. With icon sets named, the icons come
 * from those sets.
 * @param {object} input
 * @param {string} input.slug
 * @param {string} input.pageDir an empty folder for this tile
 * @param {string} input.templatesDir the folder of the page templates
 * @param {string[]} input.iconSets the sets DOCSITE_ICON_SET names
 * @param {string} input.projectDir the docsite, where the sets are installed
 * @param {(path: string) => boolean} [input.isServed] whether the docsite's
 *   `public` folder serves a file at the path
 * @param {typeof rewriteTemplatePreview} [input.rewrite]
 */
export async function stagePreviewPage({
  slug,
  pageDir,
  templatesDir,
  iconSets,
  projectDir,
  isServed = file => fs.existsSync(path.join(projectDir, 'public', file)),
  rewrite = rewriteTemplatePreview,
}) {
  const templateDir = path.join(templatesDir, slug);
  const copyDir = path.join(pageDir, 'template');
  fs.cpSync(templateDir, copyDir, {recursive: true});
  const sources = fs
    .readdirSync(copyDir, {recursive: true, encoding: 'utf8'})
    .filter(file => file.endsWith('.tsx'));
  for (const relative of sources) {
    let source = optimizeTemplateImages(
      fs.readFileSync(path.join(copyDir, relative), 'utf8'),
      isServed,
      PREVIEW_IMAGE_WIDTH,
    );
    if (iconSets.length > 0) {
      // The rewrite finds the template's doc by the path of the original.
      source = await rewrite(source, path.join(templateDir, relative), {
        projectDir,
        list: iconSets,
      });
    }
    fs.writeFileSync(path.join(copyDir, relative), source);
  }
  fs.writeFileSync(
    path.join(pageDir, 'page.tsx'),
    previewPageSource('./template/page'),
  );
}

async function main() {
  /** @type {string[]} */
  const slugs = JSON.parse(fs.readFileSync(rowsFile, 'utf8')).flat();
  const iconSets = previewIconSetList(process.env[ICON_SET_SETTING]);
  fs.rmSync(workDir, {recursive: true, force: true});
  fs.mkdirSync(workDir, {recursive: true});
  fs.writeFileSync(
    path.join(workDir, 'package.json'),
    '{"name": "landing-template-previews", "private": true}\n',
  );
  /** @type {Record<string, string>} */
  const previews = {};
  const renderPage = async (id, pageDir) => {
    await render('page.tsx', {cwd: pageDir, out: 'page.html'});
    previews[id] = previewMarkup(
      fs.readFileSync(path.join(pageDir, 'page.html'), 'utf8'),
    );
    console.log(
      `landing preview ${id} ${(previews[id].length / 1024).toFixed(0)} KB`,
    );
  };
  try {
    for (const slug of slugs) {
      const pageDir = path.join(workDir, slug);
      fs.mkdirSync(pageDir);
      await stagePreviewPage({
        slug,
        pageDir,
        templatesDir,
        iconSets,
        projectDir: docsiteDir,
      });
      await renderPage(slug, pageDir);
    }
    const storeDir = path.join(workDir, 'themes-store');
    fs.mkdirSync(storeDir);
    fs.writeFileSync(
      path.join(storeDir, 'page.tsx'),
      themesStorePageSource(
        path.relative(storeDir, themesStoreModule).split(path.sep).join('/'),
      ),
    );
    await renderPage('themes-store', storeDir);
  } finally {
    fs.rmSync(workDir, {recursive: true, force: true});
  }
  fs.mkdirSync(path.dirname(outFile), {recursive: true});
  fs.writeFileSync(
    outFile,
    [
      '// Copyright (c) Meta Platforms, Inc. and affiliates.',
      '',
      '// @generated by scripts/generate-landing-template-previews.mjs — do not edit manually',
      '',
      `export const LANDING_PREVIEWS: Readonly<Record<string, string>> = ${JSON.stringify(previews, null, 2)};`,
      '',
    ].join('\n'),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
