// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file Table canonical identity and opt-in admission.
 * @input Complete logical data, idKey and declared plugin capabilities.
 * @output Type-preserving row identities and order-independent admission.
 * @position Private parent protocol; never a plugin-specific extractor.
 */
import type {TablePlugin, TableRowContext} from './types';

export interface RowIdentity {
  key: string | number | undefined;
  reactKey: string | number;
  identityStatus: TableRowContext['identityStatus'];
}

export function resolveTableIdentity<T extends Record<string, unknown>>(
  data: ReadonlyArray<T>,
  idKey: (keyof T & string) | ((item: T) => string | number) | undefined,
  usesCanonicalIdentity: boolean,
): RowIdentity[] {
  const counts = new Map<string | number, number>();
  const rows = data.map((item, index): RowIdentity => {
    if (!usesCanonicalIdentity) {
      const key =
        idKey == null
          ? index
          : typeof idKey === 'function'
            ? idKey(item)
            : String(item[idKey]);
      return {key, reactKey: key, identityStatus: 'valid'};
    }
    if (idKey == null) {
      return {
        key: undefined,
        reactKey: `invalid:${index}`,
        identityStatus: 'missing',
      };
    }
    let raw: unknown;
    try {
      raw = typeof idKey === 'function' ? idKey(item) : item[idKey];
    } catch {
      return {
        key: undefined,
        reactKey: `invalid:${index}`,
        identityStatus: 'invalid',
      };
    }
    if (
      typeof raw !== 'string' &&
      (typeof raw !== 'number' || !Number.isFinite(raw))
    ) {
      return {
        key: undefined,
        reactKey: `invalid:${index}`,
        identityStatus: 'invalid',
      };
    }
    const key = typeof idKey === 'function' ? raw : String(raw);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return {
      key,
      reactKey: `${typeof key === 'number' ? 'n' : 's'}:${key}`,
      identityStatus: 'valid',
    };
  });
  if (!usesCanonicalIdentity) {
    return rows;
  }
  return rows.map((row, index) =>
    row.key != null && (counts.get(row.key) ?? 0) > 1
      ? {...row, identityStatus: 'duplicate', reactKey: `duplicate:${index}`}
      : row,
  );
}

export function resolveTableAdmission<T extends Record<string, unknown>>(
  plugins: ReadonlyArray<TablePlugin<T>>,
) {
  const modifier = plugins.find(
    plugin =>
      plugin.rowModel !== 'flat' &&
      (plugin.rowModel != null ||
        plugin.transformBodyRow != null ||
        plugin.transformBodyCell != null),
  );
  const rowModel = modifier?.rowModel ?? (modifier ? 'custom' : 'flat');
  const owners = plugins.filter(plugin => plugin.wholeRowOwner != null);
  const wantsActivation = owners.some(
    plugin => plugin.wholeRowOwner === 'activation',
  );
  return {
    rowModel,
    canActivate: rowModel === 'flat' && wantsActivation && owners.length === 1,
    canLoad: rowModel === 'flat',
    usesCanonicalIdentity: wantsActivation,
    hasOwnerConflict: wantsActivation && owners.length !== 1,
  };
}
