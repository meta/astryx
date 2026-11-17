// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/components/describe-the-component/check-the-props`:
 * compare each component doc's props table with the component's TypeScript
 * props, read each finding, and fix the doc or the code.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'check-the-props',
  placement: {
    parent: 'namespace:describe-the-component',
    slot: 'guides',
    order: 50,
  },
  title: 'Check the props table',
  category: 'guide',
  keywords: [
    'props table',
    'documented props',
    'prop drift',
    'props not compared',
  ],
  description:
    "Compare each props table with the component's TypeScript props, then fix the doc or the code.",
  sections: [
    {
      id: 'run-the-props-check',
      title: 'Run the props check',
      content: [
        {
          type: 'prose',
          text: "`doctor integration components` compares every props table in your component docs, hidden docs and every family entry included, with the props the component's TypeScript declares. Run it in your package after you change a component or its doc.",
        },
        {
          type: 'code',
          lang: 'bash',
          code: '{@command doctor integration components}',
        },
        {
          type: 'code',
          lang: 'text',
          code: `severity:  [warn]
component: AcmeCarousel
prop:      loop
kind:      not_in_code
message:   "loop" is documented, but AcmeCarousel's props have no "loop".
doc:       components/AcmeCarousel.doc.mjs
source:    components/AcmeCarousel.tsx
docType:   boolean

1 prop(s) differ between the docs and the code in 1 of 1 component(s) compared (TypeScript 6.0.3). These are warnings: update the doc, or the code if the doc is right.`,
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            "A doc's own `props` describe the export its `name` names. In a family doc, each entry describes its own export. A hook entry documents parameters and returns, so it is not compared.",
            "It reads props with the `typescript` your package installs, and reads your package's `tsconfig.json` the way `tsc -p` does. It finds TypeScript the way the docs check does, TypeScript 7 included ({@link generic:check-your-docs}). Without a usable one it prints `[skip] Props not compared` and the reason.",
            'Findings are warnings and leave the exit code at 0. Read them before you publish. With `--json`, they are in `data.propDrift.findings`.',
          ],
        },
      ],
    },
    {
      id: 'fix-each-finding',
      title: 'Fix each finding',
      content: [
        {
          type: 'prose',
          text: "Each finding's `kind` says what differs. Fix the doc, or the code if the doc is right.",
        },
        {
          type: 'table',
          headers: ['Kind', 'Means', 'Fix'],
          rows: [
            [
              '`not_in_code`',
              "The doc lists a prop the component's props do not have",
              'Remove it from the doc, or add it to the code. A name an index signature takes, such as `data-*`, counts as present',
            ],
            [
              '`not_in_doc`',
              "Your package declares a prop the doc does not list, or builds one with a mapped type, such as `Partial<Record<'sm' | 'md', string>>`",
              'Document it. Props from React, the DOM, or another package are never asked for, and neither are props whose keys another package defines (`keyof CSSProperties`, behind an alias or not), `className`, `style`, `xstyle`, `data-testid`, `ref`, `key`, or a prop whose JSDoc has `@internal`. A deprecated prop is still a prop: document it until you remove it. A prop a mapped type builds from keys the check cannot trace (a template literal, say) is listed under `[info] Props not checked for a doc entry` instead',
            ],
            [
              '`required_mismatch`',
              '`required` disagrees with the code',
              'Set `required: true` exactly when every caller must pass the prop. One your `defaultProps` fills counts as optional, as it is to JSX callers, and so does one only some members of a union require, since a caller can leave it out: say in its description which variants need it. An entry that names several props (`value / onChange`) makes the same claim about each: give them separate entries when they differ',
            ],
            [
              '`type_mismatch`',
              "The documented `type` differs from the code's, where both read exactly",
              'Copy the type from the source, or fix the code. The next section says which types are judged',
            ],
            [
              '`default_mismatch`',
              "The documented `default` differs from the literal default the component writes in its props destructuring, such as `size = 'md'`",
              'Copy the default from the source, quoted as code: `default: "\'md\'"`. Quotes and spacing are ignored, and a default that is not a literal on either side (a constant, a call, prose) is not compared',
            ],
          ],
        },
      ],
    },
    {
      id: 'write-types-the-check-can-judge',
      title: 'Write types the check can judge',
      content: [
        {
          type: 'prose',
          text: 'For a prop your package declares, the check also compares the documented `type`, but only where both sides read exactly. It never guesses, so a type it cannot judge is listed, not reported. It needs TypeScript 4.8 or later: with an older one it prints `[skip] Prop types not judged` and judges none.',
        },
        {
          type: 'code',
          lang: 'text',
          code: `severity:  [warn]
component: AcmeCarousel
prop:      interval
kind:      type_mismatch
message:   "interval" is documented as string, but the code declares number.
doc:       components/AcmeCarousel.doc.mjs
source:    components/AcmeCarousel.tsx
docType:   string
codeType:  number`,
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            "Write the type as the source writes it, such as `ReactNode[]` or `(index: number) => void`. Parameter names, member order, quotes and whitespace may differ. Text that writes `readonly` must match exactly, parameter names included; only whitespace may differ. `React.X` names React's own `X` where the prop is declared, so it matches a bare `X` only where that name is React's: `React.KeyboardEvent` is not the DOM's `KeyboardEvent`.",
            "Name a type as the file that declares the prop names it, so an import renamed there (`Item as BaseItem`) is written as that file writes it. A field (`cfg.level`) takes its prop's file, even when the field's own type is declared in another file.",
            'A type written another way is judged only when both sides are built from exact parts: primitives such as `string` and `number`, string, number and boolean literals, string enum members, arrays and unions of these, and type names that stand for them. Union members may come in any order, and a member another covers adds nothing, as TypeScript passes it there: `undefined` beside `void`, or `string[]` beside `(string | number)[]`.',
            'A mutable array type matches a readonly one, because callers can pass it. A readonly one documented for a mutable array is a mismatch.',
            "When a prop's variants give a field different types, as `{value: string} | {value: number}` does, document every variant's type (`string | number`). The types of only some variants are listed: the prop's variants give this field different types. With more than six variant types, any other type is listed too.",
            "To name an alias and show its values, write `AcmeSize = 'sm' | 'md'` or `AcmeSize ('sm' | 'md')`. Both parts must match.",
            "An optional prop's `undefined` is set aside on both sides. With `exactOptionalPropertyTypes`, the doc shows `undefined` exactly when the code declares it.",
            'Anything else, such as an object, a tuple, a generic with arguments, `keyof`, an intersection, or a mapped or conditional type written another way, is not compared.',
          ],
        },
        {
          type: 'prose',
          text: "The check prints how many documented types it judged, then lists the rest by reason: not a form the check judges exactly, a field the prop's variants give different types, a standard prop, or a prop declared outside the package. With `--json`, they are in `data.propDrift.typesNotCompared`.",
        },
        {
          type: 'code',
          lang: 'text',
          code: '[info] Documented prop types judged: 2; not compared: 0. A type is judged when the doc writes it the same as the source (exactly, if it contains `readonly`), or when both are primitives, literals, arrays and unions of those, or names for them.',
        },
      ],
    },
    {
      id: 'when-a-component-is-not-compared',
      title: 'When a component is not compared',
      content: [
        {
          type: 'prose',
          text: "When the check cannot read a component's props exactly, it lists the component under `[info] Props not compared`, with the reason, instead of reporting findings that might be wrong.",
        },
        {
          type: 'code',
          lang: 'text',
          code: `[info] Props not compared for 1 documented component(s):

component: AcmeCarousel
doc:       components/AcmeCarousel.doc.mjs
reason:    AcmeCarousel depends on \`@acme/motion\` (imported in AcmeCarousel.tsx), which the compiler could not resolve, usually a dependency that is not installed. Install the package's dependencies and run this check again`,
        },
        {
          type: 'table',
          headers: ['Reason', 'Fix'],
          rows: [
            [
              'It depends on a package or file the compiler could not resolve',
              "Install the package's dependencies, then run the check again",
            ],
            [
              "It depends on a type the compiler can't work out",
              'Make the types compile with `{@pm exec tsc --noEmit}`, then run the check again',
            ],
            [
              "The package's TypeScript config has an error",
              'Fix `tsconfig.json` until `{@pm exec tsc -p .}` reads it',
            ],
            ['Its props are typed `any`', 'Give the component a props type'],
            [
              'Some prop names come from a type parameter',
              'Nothing to fix: a component that renders an element the caller picks takes props known only where it is used',
            ],
            [
              "The file has no export named by the doc's `name`",
              'Change `name` or the export so they agree',
            ],
          ],
        },
      ],
    },
  ],
};
