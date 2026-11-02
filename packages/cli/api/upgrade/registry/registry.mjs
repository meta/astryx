// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Safe reconciliation for source copied from the Astryx ShadCN registry.
 * @input Adjacent install receipts, current project files, and current registry JSON.
 * @output Dry-run/apply summaries, clean merges, and separate conflict artifacts.
 * @position ShadCN composition lane inside the `upgrade` API.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {randomUUID} from 'node:crypto';
import {mergeDiff3} from 'node-diff3';
import {
  createShadcnPrecompiledDeclaration,
  shadcnJavaScriptTarget,
  shadcnPrecompiledDeclarationTarget,
  shadcnJavaScriptSourcesEquivalent,
  transformShadcnJavaScriptSource,
} from '../../../authoring/shadcn/source-variants.mjs';
import {
  PUBLIC_SHADCN_REGISTRY_ORIGIN,
  parseRegistryReceipt,
  parseRegistryUpgradeItem,
  registryContentHash,
  registryReceiptTarget,
  serializeRegistryReceipt,
} from '../../../authoring/shadcn/receipt.mjs';
import {
  assertWithin,
  PathSafetyError,
} from '../../../foundation/fs/path-safety.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';
import {AstryxError} from '../../error.mjs';
import {logger} from '../../logger.mjs';
import {detectInstalledTargetVersion} from '../_adapter.mjs';

const SKIP_DIRS = new Set([
  '.cache',
  '.git',
  '.next',
  '.pnpm',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
]);
const MAX_ITEM_BYTES = 16 * 1024 * 1024;
const FETCH_CONCURRENCY = 8;

/** @param {string} filePath @param {string} root */
function relativePath(filePath, root) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

/** @param {string} root */
export function discoverRegistryReceipts(root) {
  /** @type {string[]} */
  const receipts = [];
  if (!fs.existsSync(root)) return receipts;

  /** @param {string} dir */
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (!entry.isDirectory()) continue;
      if (entry.name === '.astryx') {
        for (const receipt of fs.readdirSync(fullPath, {withFileTypes: true})) {
          if (receipt.isFile() && receipt.name.endsWith('.json')) {
            receipts.push(path.join(fullPath, receipt.name));
          }
        }
        continue;
      }
      walk(fullPath);
    }
  }

  walk(root);
  return receipts.sort();
}

/** @param {string} filePath @param {string} content */
function atomicWrite(filePath, content) {
  const temporary = `${filePath}.astryx-tmp-${randomUUID()}`;
  const existing = fs.existsSync(filePath) ? fs.lstatSync(filePath) : null;
  const mode = existing && !existing.isSymbolicLink() ? existing.mode : null;
  try {
    fs.writeFileSync(temporary, content, 'utf8');
    if (mode != null) fs.chmodSync(temporary, mode);
    fs.renameSync(temporary, filePath);
  } finally {
    fs.rmSync(temporary, {force: true});
  }
}

/** @param {string} source */
function lines(source) {
  return source.split('\n');
}

/** @param {string} source */
function normalizeLineEndings(source) {
  return source.replace(/\r\n/g, '\n');
}

/** @param {string} source */
function preferredLineEnding(source) {
  return source.includes('\r\n') ? '\r\n' : '\n';
}

/** @param {string} source @param {string} lineEnding */
function applyLineEnding(source, lineEnding) {
  const normalized = normalizeLineEndings(source);
  return lineEnding === '\n'
    ? normalized
    : normalized.replace(/\n/g, lineEnding);
}

/**
 * @template T, U
 * @param {T[]} values
 * @param {number} limit
 * @param {(value: T, index: number) => Promise<U>} mapper
 * @returns {Promise<U[]>}
 */
async function mapWithConcurrency(values, limit, mapper) {
  /** @type {U[]} */
  const results = new Array(values.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(
    Array.from({length: Math.min(limit, values.length)}, () => worker()),
  );
  return results;
}

/** @param {Response} response @param {string} url */
async function readRegistryItemBody(response, url) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ITEM_BYTES) {
    throw new Error(`Registry item ${url} exceeds ${MAX_ITEM_BYTES} bytes`);
  }
  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_ITEM_BYTES) {
      throw new Error(`Registry item ${url} exceeds ${MAX_ITEM_BYTES} bytes`);
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_ITEM_BYTES) {
      await reader.cancel();
      throw new Error(`Registry item ${url} exceeds ${MAX_ITEM_BYTES} bytes`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total).toString('utf8');
}

/**
 * @param {string} current
 * @param {string} installed
 * @param {string} latest
 * @param {{current: string, installed: string, latest: string}} labels
 */
function threeWayMerge(current, installed, latest, labels) {
  const result = mergeDiff3(lines(current), lines(installed), lines(latest), {
    excludeFalseConflicts: true,
    label: {
      a: labels.current,
      o: labels.installed,
      b: labels.latest,
    },
  });
  return {conflict: result.conflict, content: result.result.join('\n')};
}

/** @param {string} itemPath @param {string} registryOrigin */
function registryItemUrl(itemPath, registryOrigin) {
  return new URL(
    `${itemPath}.json`,
    `${registryOrigin.replace(/\/$/, '')}/`,
  ).toString();
}

/** @param {string} sourceVersion @param {string} expectedVersion */
function sourceVersionMatches(sourceVersion, expectedVersion) {
  if (sourceVersion === expectedVersion) return true;
  return (
    sourceVersion === 'canary' &&
    /(^|[.-])canary([.-]|$)/i.test(expectedVersion)
  );
}

/**
 * Flatten the canonical receipt file and each format-specific install variant.
 * Version 1 receipts did not carry variants; derive the stock-ShadCN JavaScript
 * form so early canary installs can repair themselves on their first upgrade.
 * @param {ReturnType<typeof parseRegistryReceipt>} receipt
 * @param {any} file
 */
function receiptFileCandidates(receipt, file) {
  const canonical = {...file, format: 'typescript'};
  /** @type {Array<{format: 'javascript', target: string, registryTarget: string, sha256: string, content: string}>} */
  let variants = receipt.schemaVersion === 2 ? file.variants : [];
  if (receipt.schemaVersion === 1) {
    const target = shadcnJavaScriptTarget(file.target);
    const registryTarget = shadcnJavaScriptTarget(file.registryTarget);
    if (target !== file.target || registryTarget !== file.registryTarget) {
      try {
        const content = transformShadcnJavaScriptSource(file.content);
        variants = [
          {
            format: 'javascript',
            target,
            registryTarget,
            sha256: registryContentHash(content),
            content,
          },
        ];
      } catch {
        // A version 1 receipt may describe a non-code file. Its canonical form
        // remains valid; it simply has no derivable JavaScript variant.
      }
    }
  }
  return [
    canonical,
    ...variants.map(variant => ({
      ...variant,
      id: file.id,
      registryPath: file.registryPath,
    })),
  ];
}

/** @param {ReturnType<typeof parseRegistryReceipt>} receipt @param {any} file @param {string} format */
function receiptFileForFormat(receipt, file, format) {
  return receiptFileCandidates(receipt, file).find(
    candidate => candidate.format === format,
  );
}

/**
 * @param {string} itemPath
 * @param {{fetchImpl: typeof fetch, registryOrigin: string, expectedVersion?: string}} options
 */
async function fetchLatestReceipt(
  itemPath,
  {fetchImpl, registryOrigin, expectedVersion},
) {
  const url = registryItemUrl(itemPath, registryOrigin);
  let response;
  try {
    response = await fetchImpl(url, {
      headers: {accept: 'application/json'},
      redirect: 'error',
      signal: globalThis.AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new Error(
      `Could not fetch ${url}: ${error instanceof Error ? error.message : String(error)}`,
      {cause: error},
    );
  }
  if (!response.ok) {
    throw new Error(`Could not fetch ${url}: HTTP ${response.status}`);
  }
  const text = await readRegistryItemBody(response, url);

  let parsed;
  try {
    parsed = parseRegistryUpgradeItem(JSON.parse(text));
  } catch (error) {
    throw new Error(
      `Registry item ${url} is invalid: ${error instanceof Error ? error.message : String(error)}`,
      {cause: error},
    );
  }

  const receiptCandidates = [];
  for (const file of parsed.files) {
    if (file.type !== 'registry:file' || !file.path.endsWith('.json')) continue;
    try {
      receiptCandidates.push({
        receipt: parseRegistryReceipt(JSON.parse(file.content)),
        carrier: file,
      });
    } catch {
      // Other JSON files are allowed; only a valid Astryx receipt counts.
    }
  }
  if (receiptCandidates.length !== 1) {
    throw new Error(
      `Registry item ${url} must contain exactly one Astryx receipt; found ${receiptCandidates.length}`,
    );
  }
  const {receipt, carrier} = receiptCandidates[0];
  if (
    expectedVersion &&
    !sourceVersionMatches(receipt.source.version, expectedVersion)
  ) {
    throw new Error(
      `Registry item ${url} targets Astryx ${receipt.source.version}, but the project has ${expectedVersion}. Update Astryx packages first or retry after the registry catches up.`,
    );
  }
  const expectedItemType =
    receipt.item.kind === 'page' ? 'registry:page' : 'registry:block';
  if (parsed.name !== receipt.item.name || parsed.type !== expectedItemType) {
    throw new Error(`Registry item ${url} identity does not match its receipt`);
  }
  const expectedReceiptTarget = registryReceiptTarget(
    receipt.files[0].registryTarget,
    receipt.item.name,
  );
  if (
    carrier.path !== `registry/${receipt.item.name}/astryx-receipt.json` ||
    carrier.target !== expectedReceiptTarget
  ) {
    throw new Error(`Registry item ${url} has a misplaced Astryx receipt`);
  }
  if (
    receipt.item.path !== itemPath &&
    !receipt.item.aliases.includes(itemPath)
  ) {
    throw new Error(
      `Registry item ${url} no longer recognizes installed path ${itemPath}`,
    );
  }

  const primaryFile = receipt.files.find(file => file.id === 'primary');
  const typesFile = receipt.files.find(file => file.id === 'types');
  const typesVariants =
    receipt.schemaVersion === 2
      ? receipt.files.find(file => file.id === 'types')?.variants
      : undefined;
  if (typesFile) {
    let expectedTypesTarget;
    let expectedTypesContent;
    try {
      expectedTypesTarget = shadcnPrecompiledDeclarationTarget(
        primaryFile?.registryTarget ?? '',
      );
      expectedTypesContent = createShadcnPrecompiledDeclaration(
        primaryFile?.registryTarget ?? '',
      );
    } catch {
      expectedTypesTarget = null;
      expectedTypesContent = null;
    }
    if (
      primaryFile == null ||
      typesFile.registryTarget !== expectedTypesTarget ||
      typesFile.content !== expectedTypesContent ||
      typesVariants?.length !== 0
    ) {
      throw new Error(
        `Registry item ${url} has an invalid TypeScript declaration`,
      );
    }
  }

  for (const file of receipt.files) {
    const source = parsed.files.find(
      candidate => candidate.path === file.registryPath,
    );
    if (
      !source ||
      source.target !== file.registryTarget ||
      source.content !== file.content
    ) {
      throw new Error(
        `Registry item ${url} receipt does not match ${file.registryPath}`,
      );
    }
    if (registryContentHash(file.content) !== file.sha256) {
      throw new Error(
        `Registry item ${url} receipt has a corrupt hash for ${file.registryPath}`,
      );
    }
    for (const variant of receiptFileCandidates(receipt, file).slice(1)) {
      if (
        variant.target !== shadcnJavaScriptTarget(file.target) ||
        variant.registryTarget !==
          shadcnJavaScriptTarget(file.registryTarget) ||
        variant.content !== transformShadcnJavaScriptSource(file.content) ||
        registryContentHash(variant.content) !== variant.sha256
      ) {
        throw new Error(
          `Registry item ${url} has an invalid ${variant.format} variant for ${file.registryPath}`,
        );
      }
    }
  }
  return receipt;
}

/**
 * @param {string} receiptPath
 * @param {string} root
 * @param {string} [display] the folder reported paths are relative to
 */
function loadInstalledReceipt(receiptPath, root, display = root) {
  let receipt;
  let receiptText;
  try {
    const receiptStat = fs.lstatSync(receiptPath);
    if (receiptStat.isSymbolicLink()) {
      throw new Error('receipt is a symbolic link');
    }
    if (receiptStat.size > MAX_ITEM_BYTES) {
      throw new Error(`receipt exceeds ${MAX_ITEM_BYTES} bytes`);
    }
    receiptText = fs.readFileSync(receiptPath, 'utf8');
    receipt = parseRegistryReceipt(JSON.parse(receiptText));
    if (
      path.basename(path.dirname(receiptPath)) !== '.astryx' ||
      path.basename(receiptPath) !== `${receipt.item.name}.json`
    ) {
      throw new Error('receipt filename does not match its item identity');
    }
  } catch (error) {
    throw new Error(
      `Invalid receipt ${relativePath(receiptPath, display)}: ${error instanceof Error ? error.message : String(error)}`,
      {cause: error},
    );
  }

  const files = receipt.files.map(file => {
    const candidates = receiptFileCandidates(receipt, file).map(candidate => {
      if (registryContentHash(candidate.content) !== candidate.sha256) {
        throw new Error(
          `Invalid receipt ${relativePath(receiptPath, display)}: stored hash does not match ${file.registryPath} (${candidate.format})`,
        );
      }
      let sourcePath;
      try {
        sourcePath = assertWithin(
          path.resolve(path.dirname(receiptPath), candidate.target),
          root,
          {allowAbsolute: true, label: 'registry composition source'},
        );
      } catch (error) {
        if (error instanceof PathSafetyError) {
          throw new Error(
            `Invalid receipt ${relativePath(receiptPath, display)}: ${error.message}`,
            {cause: error},
          );
        }
        throw error;
      }
      return {...candidate, sourcePath};
    });
    const existing = candidates.filter(candidate =>
      fs.existsSync(candidate.sourcePath),
    );
    if (existing.length > 1) {
      throw new Error(
        `Invalid receipt ${relativePath(receiptPath, display)}: multiple install variants exist for ${file.registryPath}`,
      );
    }
    return existing[0] ?? candidates[0];
  });

  return {receipt, files, receiptText};
}

/**
 * @param {string} receiptPath
 * @param {string} root
 * @param {{fetchImpl: typeof fetch, registryOrigin: string, expectedVersion?: string, display?: string}} options
 *   `display` is the folder reported paths are relative to, `root` by default
 */
async function planReceipt(receiptPath, root, options) {
  const display = options.display ?? root;
  let installed;
  try {
    installed = loadInstalledReceipt(receiptPath, root, display);
  } catch (error) {
    return {
      receiptPath,
      item: path.basename(receiptPath, '.json'),
      action: 'invalid',
      message: error instanceof Error ? error.message : String(error),
      files: [],
    };
  }

  const {
    receipt: oldReceipt,
    files: oldFiles,
    receiptText: oldReceiptText,
  } = installed;
  let newReceipt;
  try {
    newReceipt = await fetchLatestReceipt(oldReceipt.item.path, options);
  } catch (error) {
    return {
      receiptPath,
      item: oldReceipt.item.name,
      itemPath: oldReceipt.item.path,
      action: 'fetch-error',
      message: error instanceof Error ? error.message : String(error),
      files: [],
    };
  }

  if (
    newReceipt.item.name !== oldReceipt.item.name ||
    newReceipt.item.kind !== oldReceipt.item.kind
  ) {
    return {
      receiptPath,
      item: oldReceipt.item.name,
      itemPath: oldReceipt.item.path,
      action: 'conflict',
      message: 'Latest item changed its stable name or kind',
      files: [],
      oldReceiptText,
    };
  }
  const oldIds = oldReceipt.files.map(file => file.id).sort();
  const newIds = newReceipt.files.map(file => file.id).sort();
  const removedIds = oldIds.filter(id => !newIds.includes(id));
  const addedIds = newIds.filter(id => !oldIds.includes(id));
  const addsOnlyGeneratedTypes =
    removedIds.length === 0 &&
    addedIds.length === 1 &&
    addedIds[0] === 'types' &&
    oldReceipt.files.some(
      file => file.id === 'primary' && /\.jsx?$/.test(file.registryTarget),
    );
  if (
    JSON.stringify(oldIds) !== JSON.stringify(newIds) &&
    !addsOnlyGeneratedTypes
  ) {
    return {
      receiptPath,
      item: oldReceipt.item.name,
      itemPath: oldReceipt.item.path,
      action: 'conflict',
      message:
        'Latest item changed its copied source set; no files were written',
      files: [],
      oldReceiptText,
    };
  }

  const plannedFiles = [];
  if (addsOnlyGeneratedTypes) {
    const newReceiptFile = newReceipt.files.find(file => file.id === 'types');
    const newFile = newReceiptFile
      ? receiptFileCandidates(newReceipt, newReceiptFile)[0]
      : null;
    if (newFile) {
      let sourcePath;
      try {
        sourcePath = assertWithin(
          path.resolve(path.dirname(receiptPath), newFile.target),
          root,
          {allowAbsolute: true, label: 'registry composition declaration'},
        );
      } catch (error) {
        return {
          receiptPath,
          item: oldReceipt.item.name,
          itemPath: oldReceipt.item.path,
          action: 'invalid',
          message: error instanceof Error ? error.message : String(error),
          files: [],
          oldReceiptText,
        };
      }
      const displayPath = relativePath(sourcePath, display);
      try {
        if (!fs.existsSync(sourcePath)) {
          plannedFiles.push({
            id: newFile.id,
            path: displayPath,
            sourcePath,
            action: 'create',
            content: newFile.content,
          });
        } else if (fs.lstatSync(sourcePath).isSymbolicLink()) {
          plannedFiles.push({
            id: newFile.id,
            path: displayPath,
            sourcePath,
            action: 'invalid',
            message:
              'Generated declaration is a symbolic link; it will not be replaced',
          });
        } else {
          const current = fs.readFileSync(sourcePath, 'utf8');
          const currentHash = registryContentHash(current);
          plannedFiles.push({
            id: newFile.id,
            path: displayPath,
            sourcePath,
            currentContent: current,
            action: currentHash === newFile.sha256 ? 'current' : 'conflict',
            message:
              currentHash === newFile.sha256
                ? undefined
                : 'Generated declaration already exists with different content',
          });
        }
      } catch (error) {
        plannedFiles.push({
          id: newFile.id,
          path: displayPath,
          sourcePath,
          action: 'invalid',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  for (const oldFile of oldFiles) {
    const newReceiptFile = newReceipt.files.find(
      file => file.id === oldFile.id,
    );
    const newFile = newReceiptFile
      ? receiptFileForFormat(newReceipt, newReceiptFile, oldFile.format)
      : null;
    const displayPath = relativePath(oldFile.sourcePath, display);
    if (!newReceiptFile) {
      plannedFiles.push({
        id: oldFile.id,
        path: displayPath,
        action: 'target-changed',
        message: `Latest item removed source id ${oldFile.id}`,
      });
      continue;
    }
    if (!newFile) {
      plannedFiles.push({
        id: oldFile.id,
        path: displayPath,
        action: 'target-changed',
        message: `Latest item removed the ${oldFile.format} install variant`,
      });
      continue;
    }
    if (
      newFile.target !== oldFile.target ||
      newFile.registryTarget !== oldFile.registryTarget ||
      newFile.registryPath !== oldFile.registryPath
    ) {
      plannedFiles.push({
        id: oldFile.id,
        path: displayPath,
        action: 'target-changed',
        message: 'Latest item changed the copied source target',
      });
      continue;
    }
    if (!fs.existsSync(oldFile.sourcePath)) {
      plannedFiles.push({
        id: oldFile.id,
        path: displayPath,
        action: 'missing',
        message: 'Copied source was deleted or moved; it will not be recreated',
      });
      continue;
    }

    let current;
    try {
      if (fs.lstatSync(oldFile.sourcePath).isSymbolicLink()) {
        plannedFiles.push({
          id: oldFile.id,
          path: displayPath,
          action: 'invalid',
          message: 'Copied source is a symbolic link; it will not be replaced',
        });
        continue;
      }
      current = fs.readFileSync(oldFile.sourcePath, 'utf8');
    } catch (error) {
      plannedFiles.push({
        id: oldFile.id,
        path: displayPath,
        action: 'invalid',
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    const lineEnding = preferredLineEnding(current);
    const conflictPath = `${oldFile.sourcePath}.astryx-conflict`;
    const currentCanonical = normalizeLineEndings(current);
    const oldCanonical = normalizeLineEndings(oldFile.content);
    const newCanonical = normalizeLineEndings(newFile.content);
    const currentHash = registryContentHash(currentCanonical);
    const oldHash = registryContentHash(oldCanonical);
    const newHash = registryContentHash(newCanonical);
    const currentMatchesOld =
      currentHash === oldHash ||
      (/\.jsx?$/.test(oldFile.target) &&
        shadcnJavaScriptSourcesEquivalent(currentCanonical, oldCanonical));
    if (oldHash === newHash) {
      plannedFiles.push({
        id: oldFile.id,
        path: displayPath,
        sourcePath: oldFile.sourcePath,
        currentContent: current,
        conflictPath,
        action: currentMatchesOld ? 'current' : 'user-modified',
      });
      continue;
    }
    if (currentMatchesOld) {
      plannedFiles.push({
        id: oldFile.id,
        path: displayPath,
        sourcePath: oldFile.sourcePath,
        currentContent: current,
        conflictPath,
        action: 'update',
        content: applyLineEnding(newCanonical, lineEnding),
      });
      continue;
    }
    if (currentHash === newHash) {
      plannedFiles.push({
        id: oldFile.id,
        path: displayPath,
        sourcePath: oldFile.sourcePath,
        currentContent: current,
        conflictPath,
        action: 'receipt-only',
      });
      continue;
    }

    const merged = threeWayMerge(currentCanonical, oldCanonical, newCanonical, {
      current: 'current project',
      installed: `installed ${oldReceipt.source.version}`,
      latest: `latest ${newReceipt.source.version}`,
    });
    plannedFiles.push({
      id: oldFile.id,
      path: displayPath,
      sourcePath: oldFile.sourcePath,
      currentContent: current,
      action: merged.conflict ? 'conflict' : 'merge',
      content: applyLineEnding(merged.content, lineEnding),
      conflictPath,
    });
  }

  let action = 'current';
  if (
    plannedFiles.some(file =>
      ['conflict', 'missing', 'invalid', 'target-changed'].includes(
        file.action,
      ),
    )
  ) {
    action = 'conflict';
  } else if (plannedFiles.some(file => file.action === 'merge')) {
    action = 'merge';
  } else if (
    plannedFiles.some(file => ['update', 'create'].includes(file.action))
  ) {
    action = 'update';
  } else if (
    plannedFiles.some(file => file.action === 'receipt-only') ||
    serializeRegistryReceipt(oldReceipt) !==
      serializeRegistryReceipt(newReceipt)
  ) {
    action = 'receipt-only';
  }

  return {
    receiptPath,
    item: oldReceipt.item.name,
    itemPath: oldReceipt.item.path,
    action,
    files: plannedFiles,
    oldReceipt,
    newReceipt,
    oldReceiptText,
  };
}

/**
 * @param {ReturnType<typeof emptySummary>} summary
 * @param {any} item
 * @param {string} plannedAction
 * @param {boolean} apply
 */
function recordItem(summary, item, plannedAction, apply) {
  summary.items.push(item);
  if (['current', 'user-modified'].includes(plannedAction)) summary.current++;
  else if (plannedAction === 'update') {
    if (apply) summary.updated++;
    else summary.wouldUpdate++;
  } else if (plannedAction === 'merge') {
    if (apply) summary.merged++;
    else summary.wouldMerge++;
  } else if (plannedAction === 'receipt-only') {
    if (apply) summary.receiptsRefreshed++;
    else summary.wouldRefreshReceipt++;
  } else if (plannedAction === 'conflict') summary.conflicts++;
  else if (plannedAction === 'invalid') summary.invalid++;
  else if (plannedAction === 'fetch-error') summary.failed++;
}

/**
 * @param {boolean} apply
 * @returns {import('../upgrade.type.mjs').RegistryCompositionSummary}
 */
function emptySummary(apply) {
  return {
    applied: apply,
    ok: true,
    found: 0,
    current: 0,
    wouldUpdate: 0,
    updated: 0,
    wouldMerge: 0,
    merged: 0,
    wouldRefreshReceipt: 0,
    receiptsRefreshed: 0,
    conflicts: 0,
    missing: 0,
    invalid: 0,
    failed: 0,
    items: [],
  };
}

/** @param {string} action @param {boolean} apply */
function publicAction(action, apply) {
  if (action === 'update') return apply ? 'updated' : 'would-update';
  if (action === 'create') return apply ? 'created' : 'would-create';
  if (action === 'merge') return apply ? 'merged' : 'would-merge';
  if (action === 'receipt-only') {
    return apply ? 'receipt-refreshed' : 'would-refresh-receipt';
  }
  return action;
}

/**
 * @param {any} item
 * @param {string} display the folder reported paths are relative to
 * @param {boolean} apply
 */
function publicItem(item, display, apply) {
  return {
    item: item.item,
    path: item.itemPath,
    action: publicAction(item.action, apply),
    ...(item.message ? {message: item.message} : {}),
    files: item.files.map(
      /** @param {any} file */
      file => ({
        path: file.path,
        action: publicAction(file.action, apply),
        ...(file.message ? {message: file.message} : {}),
        ...(file.action === 'conflict' && file.conflictPath
          ? {conflictFile: relativePath(file.conflictPath, display)}
          : {}),
      }),
    ),
  };
}

/** @param {any} plan */
function applyPlan(plan) {
  if (!['conflict', 'update', 'merge', 'receipt-only'].includes(plan.action)) {
    return;
  }
  if (
    plan.oldReceiptText != null &&
    fs.readFileSync(plan.receiptPath, 'utf8') !== plan.oldReceiptText
  ) {
    throw new Error('Receipt changed while the upgrade was running');
  }
  for (const file of plan.files) {
    if (file.action === 'create' && fs.existsSync(file.sourcePath)) {
      throw new Error(`${file.path} appeared while the upgrade was running`);
    }
    if (
      file.sourcePath &&
      file.currentContent != null &&
      fs.readFileSync(file.sourcePath, 'utf8') !== file.currentContent
    ) {
      throw new Error(`${file.path} changed while the upgrade was running`);
    }
  }

  if (plan.action === 'conflict') {
    for (const file of plan.files) {
      if (
        file.action === 'conflict' &&
        file.conflictPath &&
        file.content != null
      ) {
        atomicWrite(file.conflictPath, file.content);
      }
    }
    return;
  }

  const writable = plan.files.filter(
    /** @param {any} file */
    file => ['update', 'merge', 'create'].includes(file.action),
  );
  const originals = writable
    .filter(
      /** @param {any} file */
      file => file.action !== 'create',
    )
    .map(
      /** @param {any} file */
      file => ({
        path: file.sourcePath,
        content: fs.readFileSync(file.sourcePath, 'utf8'),
      }),
    );
  /** @type {string[]} */
  const created = [];
  const oldReceiptText = fs.readFileSync(plan.receiptPath, 'utf8');
  try {
    for (const file of writable) {
      atomicWrite(file.sourcePath, file.content);
      if (file.action === 'create') created.push(file.sourcePath);
    }
    atomicWrite(plan.receiptPath, serializeRegistryReceipt(plan.newReceipt));
  } catch (error) {
    for (const createdPath of created) {
      try {
        fs.rmSync(createdPath, {force: true});
      } catch {
        // Preserve the first failure.
      }
    }
    for (const original of originals) {
      try {
        atomicWrite(original.path, original.content);
      } catch {
        // Preserve the first failure; the caller reports the item as failed.
      }
    }
    try {
      atomicWrite(plan.receiptPath, oldReceiptText);
    } catch {
      // Preserve the first failure.
    }
    throw error;
  }

  for (const file of plan.files) {
    if (file.conflictPath) fs.rmSync(file.conflictPath, {force: true});
  }
}

/**
 * Reported paths are relative to the scanned source folder, or, when `origin`
 * names the folder the command ran in below the project root `cwd`, to that
 * folder, so they resolve from where the command ran.
 * @param {{apply?: boolean, path?: string}} options
 * @param {{cwd?: string, origin?: string, fetchImpl?: typeof fetch, registryOrigin?: string, expectedVersion?: string, requireExpectedVersion?: boolean}} [ctx]
 */
export async function reconcileRegistryCompositions(
  options = {},
  {
    cwd = process.cwd(),
    origin,
    fetchImpl = globalThis.fetch,
    registryOrigin = PUBLIC_SHADCN_REGISTRY_ORIGIN,
    expectedVersion,
    requireExpectedVersion = false,
  } = {},
) {
  let root;
  try {
    root = assertWithin(options.path ?? './src', cwd, {
      allowAbsolute: true,
      label: 'source directory',
    });
  } catch (error) {
    if (error instanceof PathSafetyError) {
      throw new AstryxError(
        error.message,
        undefined,
        ERROR_CODES.ERR_PATH_TRAVERSAL,
      );
    }
    throw error;
  }

  const display = origin ?? root;
  const apply = options.apply ?? false;
  const receipts = discoverRegistryReceipts(root);
  const summary = emptySummary(apply);
  summary.found = receipts.length;
  if (receipts.length === 0) return {summary, writtenFiles: []};
  if (requireExpectedVersion && !expectedVersion) {
    throw new AstryxError(
      'Could not find installed @astryxdesign/core. Install project dependencies before upgrading copied compositions.',
      undefined,
      ERROR_CODES.ERR_VERSION_DETECT,
    );
  }

  const plans = await mapWithConcurrency(
    receipts,
    FETCH_CONCURRENCY,
    receiptPath =>
      planReceipt(receiptPath, root, {
        fetchImpl,
        registryOrigin,
        expectedVersion,
        display,
      }),
  );

  /** @type {string[]} */
  const writtenFiles = [];
  for (const plan of plans) {
    for (const file of plan.files) {
      if (file.action === 'missing') summary.missing++;
      if (file.action === 'invalid' || file.action === 'target-changed') {
        summary.invalid++;
      }
    }
    recordItem(summary, publicItem(plan, display, apply), plan.action, apply);
    if (!apply) continue;

    try {
      applyPlan(plan);
      if (['update', 'merge'].includes(plan.action)) {
        for (const file of plan.files) {
          if (
            file.sourcePath &&
            ['update', 'merge', 'create'].includes(file.action)
          ) {
            writtenFiles.push(file.sourcePath);
          }
        }
      }
    } catch (error) {
      if (plan.action === 'update') summary.updated--;
      else if (plan.action === 'merge') summary.merged--;
      else if (plan.action === 'receipt-only') summary.receiptsRefreshed--;
      summary.failed++;
      const item = summary.items.at(-1);
      if (item) {
        item.action = 'write-error';
        item.message = error instanceof Error ? error.message : String(error);
      }
    }
  }

  summary.ok =
    summary.conflicts === 0 &&
    summary.missing === 0 &&
    summary.invalid === 0 &&
    summary.failed === 0;
  return {summary, writtenFiles};
}

/** @param {import('../upgrade.type.mjs').RegistryCompositionSummary} summary */
export function logRegistryCompositionSummary(summary) {
  if (summary.found === 0) return;
  logger.log(
    `${summary.found} ShadCN composition receipt${summary.found === 1 ? '' : 's'} checked.`,
  );
  const pending =
    summary.wouldUpdate + summary.wouldMerge + summary.wouldRefreshReceipt;
  if (!summary.applied && pending > 0) {
    logger.log(
      `${pending} update${pending === 1 ? '' : 's'} available (dry run).`,
    );
  }
  const changed = summary.updated + summary.merged;
  if (changed + summary.receiptsRefreshed > 0) {
    logger.log(
      `${changed} composition${changed === 1 ? '' : 's'} updated` +
        (summary.receiptsRefreshed > 0
          ? `; ${summary.receiptsRefreshed} receipt${summary.receiptsRefreshed === 1 ? '' : 's'} refreshed.`
          : '.'),
    );
  }
  if (
    summary.conflicts + summary.missing + summary.invalid + summary.failed >
    0
  ) {
    logger.warn(
      `${summary.conflicts} conflict(s), ${summary.missing} missing file(s), ` +
        `${summary.invalid} invalid receipt(s), ${summary.failed} failed item(s).`,
    );
    for (const item of summary.items) {
      if (item.message) logger.warn(`  ${item.item}: ${item.message}`);
      for (const file of item.files) {
        if (
          !['conflict', 'missing', 'invalid', 'target-changed'].includes(
            file.action,
          )
        ) {
          continue;
        }
        const detail = file.conflictFile
          ? ` Review ${file.conflictFile}.`
          : file.message
            ? ` ${file.message}.`
            : '';
        logger.warn(`  ${file.path}: ${file.action}.${detail}`);
      }
    }
  }
}

/**
 * Standalone `astryx upgrade --registry` leaf. `ctx.origin` is the folder the
 * command ran in, when `ctx.cwd` is the project root above it.
 * @param {{apply?: boolean, path?: string}} options
 * @param {{cwd?: string, origin?: string, fetchImpl?: typeof fetch, registryOrigin?: string, expectedVersion?: string, requireExpectedVersion?: boolean}} [ctx]
 * @returns {Promise<import('../upgrade.type.mjs').UpgradeRegistryResponse>}
 */
export async function registryUpgrade(options = {}, ctx = {}) {
  const cwd = ctx.cwd ?? process.cwd();
  if (ctx.origin != null) {
    logger.log(`Project root: ${path.relative(ctx.origin, cwd) || '.'}`);
  }
  const installed = detectInstalledTargetVersion(cwd);
  const expectedVersion =
    ctx.expectedVersion ??
    (installed?.packageName === '@astryxdesign/core'
      ? installed.version
      : undefined);
  const {summary} = await reconcileRegistryCompositions(options, {
    ...ctx,
    cwd,
    expectedVersion,
    requireExpectedVersion: true,
  });
  if (summary.found === 0) {
    logger.log('No ShadCN composition receipts found.');
  } else {
    logRegistryCompositionSummary(summary);
  }
  logger.log(
    summary.ok
      ? (summary.applied
          ? 'Registry upgrade complete'
          : 'Registry dry run complete') + '\n'
      : 'Registry upgrade finished with unresolved items\n',
  );
  return {type: 'upgrade.registry', data: summary};
}
