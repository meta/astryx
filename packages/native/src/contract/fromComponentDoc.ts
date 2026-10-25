// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file contract/fromComponentDoc.ts
 * @input A component's documentation (.doc.mjs) plus the native additions for it
 * @output A component contract: the portable core, native platform props, and the
 *   web-only props with reasons
 * @position Turns core documentation into the contract the generators consume.
 *   Reads documentation as data at build time; never imports core at run time
 *   (AST-082 FR16)
 */

import {parseDocType} from './parseDocType.js';
import {coreNameProblem} from './rules.js';
import type {
  BaseTarget,
  ComponentContract,
  PropMap,
  PropSpec,
  PropType,
  WebOnlyProp,
} from './types.js';
import type {NativePlatform} from '../platforms.js';

interface DocProp {
  readonly name: string;
  readonly type?: unknown;
  readonly required?: boolean;
  readonly description?: unknown;
}

/**
 * The subset of a ComponentDoc this reader needs. A file that documents
 * several components, such as Stack with HStack and VStack, lists them in
 * `components`.
 */
export interface ComponentDocLike {
  readonly name: string;
  readonly props?: ReadonlyArray<DocProp>;
  readonly components?: ReadonlyArray<{
    readonly name: string;
    readonly props?: ReadonlyArray<DocProp>;
  }>;
}

/**
 * Typed slots (AST-082 FR4) for documented free-form content. `text` is a
 * string in the core contract, as a badge's label or a heading's words;
 * `content` is child Astryx components, as a stack's or a card's children;
 * `icon` is a shared icon name (FR17), as an icon's glyph.
 */
export type SlotKind = 'text' | 'content' | 'icon';

/** What the native package adds to one core component. */
export interface NativeAdditions {
  readonly name: string;
  readonly baseTarget: BaseTarget;
  /**
   * Where core documents the component when it is not `<Name>/<Name>.doc.mjs`:
   * `file` relative to core's `src` without `.doc.mjs`, and `component` when
   * the file documents several components.
   */
  readonly doc?: {readonly file: string; readonly component?: string};
  /** Documented free-form content props, given a typed slot in the core. */
  readonly slots?: Readonly<Record<string, SlotKind>>;
  /**
   * Callbacks whose only documented argument is a DOM event but which name a
   * moment every platform has, such as a button's press. Their core form
   * takes no arguments.
   */
  readonly callbacks?: readonly string[];
  /**
   * Core props whose name a platform toolkit also uses, with the same meaning
   * (AST-082 FR8 forbids only a different meaning), and why: a button's
   * `onClick` is a press in Compose too.
   */
  readonly sameMeaning?: Readonly<Record<string, string>>;
  /**
   * Portable definitions for named types the documentation references. Fields
   * the web type has that are not portable are left out on purpose.
   */
  readonly types?: Readonly<Record<string, PropMap>>;
  /** Documented types renamed to a native definition, e.g. `SelectorOption[]`. */
  readonly typeNames?: Readonly<Record<string, string>>;
  readonly platforms?: Readonly<Partial<Record<NativePlatform, PropMap>>>;
  /**
   * Props whose web type is wider than a portable kind, with the closed set of
   * values every platform supports, each mapped to the one web value it means
   * (AST-082 FR4), such as Button `width`: `content` is the web's `'auto'`
   * and `fill` its `'100%'`. The first value is the default. The prop's other
   * web values stay in the web contract.
   */
  readonly projections?: Readonly<
    Record<string, Readonly<Record<string, string>>>
  >;
  /**
   * Portable-typed props that still belong to the web contract, with the
   * reason, such as a web presentation heuristic a native platform replaces.
   */
  readonly webOnly?: Readonly<Record<string, string>>;
}

/** The documented props of the component the additions name. */
function documentedProps(
  doc: ComponentDocLike,
  additions: NativeAdditions,
): ReadonlyArray<DocProp> {
  const wanted = additions.doc?.component;
  if (wanted == null) {
    return doc.props ?? [];
  }
  const entry = doc.components?.find(component => component.name === wanted);
  if (!entry) {
    throw new Error(
      `${additions.name}: core documentation "${doc.name}" does not document "${wanted}"`,
    );
  }
  return entry.props ?? [];
}

const SLOT_TYPES: Readonly<Record<SlotKind, PropType>> = {
  text: {kind: 'string'},
  content: {kind: 'content'},
  icon: {kind: 'icon'},
};

export function fromComponentDoc(
  doc: ComponentDocLike,
  additions: NativeAdditions,
): ComponentContract {
  const core: Record<string, PropSpec> = {};
  const webOnly: WebOnlyProp[] = [];
  const projections: Record<string, Readonly<Record<string, string>>> = {};
  const types = additions.types ?? {};
  const describe = (prop: DocProp) =>
    typeof prop.description === 'string' ? {doc: prop.description} : {};

  for (const prop of documentedProps(doc, additions)) {
    // `id` and `isHidden` are shared base props on every platform (FR7), so a
    // documented prop of either name is the base prop, not a core prop.
    if (prop.name === 'id' || prop.name === 'isHidden') {
      continue;
    }
    const declaredWebOnly = additions.webOnly?.[prop.name];
    if (declaredWebOnly) {
      webOnly.push({name: prop.name, reason: declaredWebOnly});
      continue;
    }
    if (
      /(?:Xstyle|XStyle|ClassName|Style)$/.test(prop.name) ||
      prop.name === 'xstyle'
    ) {
      webOnly.push({name: prop.name, reason: 'web styling input'});
      continue;
    }
    if (prop.name.startsWith('html') || prop.name.startsWith('aria-')) {
      webOnly.push({name: prop.name, reason: 'HTML attribute'});
      continue;
    }
    const projection = additions.projections?.[prop.name];
    if (projection) {
      const mapping = Object.entries(projection)
        .map(
          ([value, web]) =>
            `\`${value}\` is the web's \`${JSON.stringify(web)}\``,
        )
        .join(', ');
      core[prop.name] = {
        type: {kind: 'enum', values: Object.keys(projection)},
        optional: prop.required !== true,
        doc: `${typeof prop.description === 'string' ? `${prop.description} ` : ''}Native values: ${mapping}.`,
      };
      projections[prop.name] = projection;
      continue;
    }
    const slot = additions.slots?.[prop.name];
    const slotNameProblem =
      slot &&
      coreNameProblem(prop.name, prop.name in (additions.sameMeaning ?? {}));
    if (slotNameProblem) {
      webOnly.push({name: prop.name, reason: slotNameProblem});
      continue;
    }
    if (slot) {
      core[prop.name] = {
        type: SLOT_TYPES[slot],
        optional: prop.required !== true,
        ...describe(prop),
      };
      continue;
    }
    let parsed = parseDocType(String(prop.type ?? ''));
    if (
      !parsed.ok &&
      parsed.eventOnly === true &&
      additions.callbacks?.includes(prop.name)
    ) {
      parsed = {ok: true, type: {kind: 'fn', args: []}};
    }
    if (!parsed.ok) {
      webOnly.push({name: prop.name, reason: parsed.reason});
      continue;
    }
    // A portable type can still carry a name another platform owns.
    const nameProblem = coreNameProblem(
      prop.name,
      prop.name in (additions.sameMeaning ?? {}),
    );
    if (nameProblem) {
      webOnly.push({name: prop.name, reason: nameProblem});
      continue;
    }
    let type = parsed.type;
    const renamed = (name: string) => additions.typeNames?.[name] ?? name;
    if (type.kind === 'named') {
      type = {kind: 'named', name: renamed(type.name)};
    }
    if (type.kind === 'array' && type.of.kind === 'named') {
      type = {kind: 'array', of: {kind: 'named', name: renamed(type.of.name)}};
    }
    if (type.kind === 'named' && !(type.name in types)) {
      webOnly.push({
        name: prop.name,
        reason: `type "${type.name}" has no portable definition yet`,
      });
      continue;
    }
    if (
      type.kind === 'array' &&
      type.of.kind === 'named' &&
      !(type.of.name in types)
    ) {
      webOnly.push({
        name: prop.name,
        reason: `type "${type.of.name}" has no portable definition yet`,
      });
      continue;
    }
    core[prop.name] = {
      type,
      optional: prop.required !== true,
      ...describe(prop),
    };
  }

  return {
    name: additions.name,
    baseTarget: additions.baseTarget,
    types,
    core,
    platforms: additions.platforms ?? {},
    webOnly,
    projections,
    sameMeaning: Object.keys(additions.sameMeaning ?? {}).filter(
      name => name in core,
    ),
  };
}
