// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Shared provenance receipt contract for ShadCN-copied Astryx source.
 * @input A stable registry identity and exact canonical and format-specific install bytes.
 * @output Validated, deterministic receipts used by registry generation and upgrade.
 * @position Protocol boundary between the public ShadCN registry and `astryx upgrade`.
 */

import {createHash} from 'node:crypto';
import * as path from 'node:path';
import {z} from 'zod';

export const REGISTRY_RECEIPT_SCHEMA_VERSION = 2;
export const PUBLIC_SHADCN_REGISTRY_ORIGIN = 'https://astryx.atmeta.com/shadcn';

const receiptTargetSchema = z
  .string()
  .regex(/^\.\.\/[^/\\]+$/, 'must point to one adjacent source file')
  .refine(
    value => value !== '../.' && value !== '../..',
    'must point to one adjacent source file',
  );

const registryFilePathSchema = z
  .string()
  .min(1)
  .refine(value => !path.posix.isAbsolute(value), 'must be relative')
  .refine(value => !value.includes('\\'), 'must use forward slashes')
  .refine(
    value =>
      value
        .split('/')
        .every(
          segment => segment !== '' && segment !== '.' && segment !== '..',
        ),
    'must be a normalized registry path',
  );

const registryPathSchema = z
  .string()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/,
    'must be a lowercase registry path',
  );

const sourceVersionSchema = z
  .string()
  .regex(
    /^(?:canary|\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/,
    'must be canary or an exact semantic version',
  );

const receiptItemSchema = z
  .object({
    name: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    path: registryPathSchema,
    aliases: z.array(registryPathSchema),
    kind: z.enum(['showcase', 'example', 'block', 'page']),
  })
  .strict();

const receiptSourceSchema = z
  .object({
    package: z.literal('@astryxdesign/cli'),
    version: sourceVersionSchema,
  })
  .strict();

const receiptFileBaseShape = {
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  target: receiptTargetSchema,
  registryTarget: registryFilePathSchema,
  registryPath: registryFilePathSchema,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  content: z.string(),
};

const receiptVariantSchema = z
  .object({
    format: z.literal('javascript'),
    target: receiptTargetSchema,
    registryTarget: registryFilePathSchema,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    content: z.string(),
  })
  .strict();

const receiptFileV1Schema = z.object(receiptFileBaseShape).strict();
const receiptFileV2Schema = z
  .object({
    ...receiptFileBaseShape,
    variants: z.array(receiptVariantSchema),
  })
  .strict();

const receiptV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    item: receiptItemSchema,
    source: receiptSourceSchema,
    files: z.array(receiptFileV1Schema).min(1),
  })
  .strict();

const receiptV2Schema = z
  .object({
    schemaVersion: z.literal(REGISTRY_RECEIPT_SCHEMA_VERSION),
    item: receiptItemSchema,
    source: receiptSourceSchema,
    files: z.array(receiptFileV2Schema).min(1),
  })
  .strict();

export const registryReceiptSchema = z
  .discriminatedUnion('schemaVersion', [receiptV1Schema, receiptV2Schema])
  .superRefine((receipt, context) => {
    const identities = [
      {label: 'id', values: receipt.files.map(file => file.id)},
      {
        label: 'registryPath',
        values: receipt.files.map(file => file.registryPath),
      },
    ];
    const installTargets = [];
    const registryTargets = [];
    for (const file of receipt.files) {
      installTargets.push(file.target);
      registryTargets.push(file.registryTarget);
      if ('variants' in file) {
        const formats = file.variants.map(variant => variant.format);
        if (new Set(formats).size !== formats.length) {
          context.addIssue({
            code: 'custom',
            path: ['files'],
            message: 'receipt file variant formats must be unique',
          });
        }
        installTargets.push(...file.variants.map(variant => variant.target));
        registryTargets.push(
          ...file.variants.map(variant => variant.registryTarget),
        );
      }
    }
    identities.push(
      {label: 'target', values: installTargets},
      {label: 'registryTarget', values: registryTargets},
    );
    for (const {label, values} of identities) {
      if (new Set(values).size !== values.length) {
        context.addIssue({
          code: 'custom',
          path: ['files'],
          message: `receipt file ${label} values must be unique`,
        });
      }
    }
  });

const registryUpgradeFileSchema = z
  .object({
    path: registryFilePathSchema,
    type: z.string().min(1),
    target: registryFilePathSchema.optional(),
    content: z.string(),
  })
  .passthrough();

const registryUpgradeItemSchema = z
  .object({
    name: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    type: z.enum(['registry:block', 'registry:page']),
    files: z.array(registryUpgradeFileSchema).min(1),
  })
  .passthrough();

/** @param {unknown} input */
export function parseRegistryUpgradeItem(input) {
  return registryUpgradeItemSchema.parse(input);
}

/** @param {string} content */
export function registryContentHash(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Place a receipt beside its copied source so custom ShadCN aliases resolve
 * both files through the same root.
 * @param {string} sourceTarget
 * @param {string} itemName
 */
export function registryReceiptTarget(sourceTarget, itemName) {
  const sourceDir = path.posix.dirname(sourceTarget);
  return path.posix.join(sourceDir, '.astryx', `${itemName}.json`);
}

/**
 * @param {{
 *   item: {name: string, path: string, aliases: string[], kind: 'showcase'|'example'|'block'|'page'},
 *   sourceVersion: string,
 *   receiptTarget: string,
 *   files: Array<{
 *     id: string,
 *     target: string,
 *     registryPath: string,
 *     content: string,
 *     variants?: Array<{format: 'javascript', target: string, content: string}>,
 *   }>,
 * }} input
 */
export function createRegistryReceipt(input) {
  const receiptDir = path.posix.dirname(input.receiptTarget);
  const receipt = {
    schemaVersion: REGISTRY_RECEIPT_SCHEMA_VERSION,
    item: input.item,
    source: {
      package: '@astryxdesign/cli',
      version: input.sourceVersion,
    },
    files: input.files.map(file => ({
      id: file.id,
      target: path.posix.relative(receiptDir, file.target),
      registryTarget: file.target,
      registryPath: file.registryPath,
      sha256: registryContentHash(file.content),
      content: file.content,
      variants: (file.variants ?? []).map(variant => ({
        format: variant.format,
        target: path.posix.relative(receiptDir, variant.target),
        registryTarget: variant.target,
        sha256: registryContentHash(variant.content),
        content: variant.content,
      })),
    })),
  };
  return registryReceiptSchema.parse(receipt);
}

/** @param {unknown} input */
export function parseRegistryReceipt(input) {
  return registryReceiptSchema.parse(input);
}

/** @param {ReturnType<typeof createRegistryReceipt>} receipt */
export function serializeRegistryReceipt(receipt) {
  return `${JSON.stringify(receipt, null, 2)}\n`;
}
