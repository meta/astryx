// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TypeRefText.tsx
 * @input A documented type string plus the entry's extracted type declarations
 * @output Type text whose resolved type names are inline definition triggers
 * @position Shared by the component props table and the hook signature tables.
 */

'use client';

import * as stylex from '@stylexjs/stylex';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/Layout';
import {Card} from '@astryxdesign/core/Card';
import {Popover} from '@astryxdesign/core/Popover';
import {splitTypeRefSegments} from './parsePropType';
import type {TypeDefinition} from '../../generated/componentRegistry';
import {CodeExampleBlock} from '../CodeExampleBlock';
import {proseLinkStyles} from '../proseLink';

const styles = stylex.create({
  // Strips the native button chrome from type-name definition triggers; the
  // link treatment itself comes from proseLink.ts, shared with the rest of
  // the docs prose. A button rather than an anchor so the trigger stays
  // keyboard-focusable without pretending to navigate.
  typeRefTrigger: {
    backgroundColor: 'transparent',
    borderStyle: 'none',
    padding: 0,
    // A button's UA text-align is `center`, which centres a wrapped type name
    // in the fixed-width Type column of the hook tables.
    textAlign: 'start',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    lineHeight: 'inherit',
    cursor: 'pointer',
  },
});

/**
 * Inline definition trigger for a type name: the name itself renders as a
 * link-styled button that opens the extracted declaration so readers can
 * inspect the shape without leaving the table (#2682). The popover mirrors
 * the Popover + Card + CodeExampleBlock pattern used by PackageActions.
 */
function TypeDefinitionTrigger({def}: {def: TypeDefinition}) {
  return (
    <Popover
      width="min(480px, calc(100vw - 32px))"
      label={`${def.name} type definition`}
      content={
        <VStack gap={1}>
          <Text type="supporting" color="secondary">
            {def.sourcePath}
          </Text>
          <Card padding={0}>
            <CodeExampleBlock
              code={def.definition}
              language="typescript"
              size="sm"
              hasCopyButton
              maxHeight={320}
              width="100%"
            />
          </Card>
        </VStack>
      }>
      <button
        type="button"
        {...stylex.props(
          styles.typeRefTrigger,
          proseLinkStyles.underline,
          proseLinkStyles.color,
          proseLinkStyles.focusRing,
        )}>
        {def.name}
      </button>
    </Popover>
  );
}

/**
 * Resolve the type names a documented row references against the declarations
 * attached to its registry entry. Unresolvable names are dropped, so an empty
 * result means the row has no shape to surface and the caller should render
 * its own plain type text.
 */
export function resolveTypeRefs(
  typeRefs: string[] | undefined,
  typeDefs: TypeDefinition[],
): TypeDefinition[] {
  return (typeRefs ?? [])
    .map(name => typeDefs.find(def => def.name === name))
    .filter(def => def != null);
}

/**
 * A type string with each resolved name rendered as a
 * {@link TypeDefinitionTrigger}; surrounding type syntax (generics
 * punctuation, unions) stays plain text.
 */
export function TypeRefText({
  type,
  defs,
}: {
  type: string;
  defs: TypeDefinition[];
}) {
  const segments = splitTypeRefSegments(
    type,
    defs.map(def => def.name),
  );
  return (
    <>
      {segments.map((segment, i) => {
        const def = segment.isRef
          ? defs.find(d => d.name === segment.text)
          : undefined;
        return def ? (
          <TypeDefinitionTrigger key={i} def={def} />
        ) : (
          <span key={i}>{segment.text}</span>
        );
      })}
    </>
  );
}
