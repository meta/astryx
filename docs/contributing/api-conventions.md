# API conventions for contributors

Use this guide to shape a public component API before review. This page is a
practical projection. It does not create policy. If it conflicts with a current
owner record, follow the owner record and fix this guide.

This repository guide is the maintained contributor reference. The public wiki
may provide an overview and rationale, but it should link here instead of keeping
a second copy of these conventions.

## Start with the owner

Use only records whose front matter says `authority: current`. Read the narrowest
owner first when one is linked or easy to find. Human contributors do not need to
understand or edit the spec system to contribute; reviewers and maintainers route
new decisions and record final rulings.

1. The component's `<Name>.spec.md`, when one exists beside its code in
   [`packages/core/src/`](../../packages/core/src/), owns component behavior.
2. A current contract under [`docs/families/`](../families/) owns behavior shared
   by sibling components.
3. Current architecture and accepted system decisions own cross-component rules.
   Start with the [public component API architecture](../architecture/public-component-api.md),
   the [knowledge contract](../architecture/knowledge-contracts.md), and
   [AST-002: public API admission and operation shape](../specs/AST-002/spec.md).

The `owners` field names who can settle a missing decision. Component source and
its public `index.ts` own the shipped API. The component's `.doc.mjs` owns exact
consumer syntax and reference material. The component spec owns local semantic
API meaning and guarantees, including public hooks or utilities it explicitly
co-owns.

The wiki gives broader background: [API Conventions](https://github.com/facebook/astryx/wiki/API-Conventions)
and [API Arbitration](https://github.com/facebook/astryx/wiki/API-Arbitration).
Do not copy detailed decisions from those pages into a proposal. Link the current
owner instead.

## Separate semantic contract from syntax reference

Every public-facing API addition or semantic change updates its canonical owning
component, family, architecture, or system record. Update the component spec only
when it owns the changed component-local semantics or explicitly co-owns the
public hook or utility. The owning record describes what callers mean, observe,
and may rely on; `.doc.mjs` remains the authority for signatures, prop/reference
tables, and consumer usage. Do not turn the semantic contract into a second
syntax catalog.

A component spec inherits every applicable rule from its current family
contracts. Record only component-local concepts, additions, and explicit
exceptions. Link an exception to its approving decision instead of copying or
rewriting the family rule.

A component spec may co-own a colocated public hook or utility when that ownership
is explicit. Its local semantic contract covers:

- inputs and options, including meaning, defaults, invalid values, and unsupported
  combinations;
- outputs and operations, including observable results and guarantees; and
- side effects, identity, lifetime, resource ownership, and cleanup where relevant.

Link a different canonical owner for any public surface the component spec does
not own.

## Name one concept at a time

| Surface                      | Convention                              | Example                       |
| ---------------------------- | --------------------------------------- | ----------------------------- |
| Component                    | Unprefixed PascalCase                   | `Button`, `TextInput`         |
| Props type                   | `<Component>Props`                      | `ButtonProps`                 |
| Public hook                  | `use<Name>`                             | `usePopover`                  |
| Boolean state                | `is<Name>`                              | `isDisabled`                  |
| Boolean capability           | `has<Name>`                             | `hasClear`                    |
| Uncontrolled boolean default | `defaultIs<Name>` or `defaultHas<Name>` | `defaultIsOpen`               |
| Synchronous callback         | `on<Verb>`                              | `onChange`                    |
| Disambiguated callback       | `on<Verb><Scope>`                       | `onSidebarCollapsedChange`    |
| Transition Action            | `<verb>Action`                          | `changeAction`, `clickAction` |
| Logical direction            | `start` or `end`                        | `startIcon`, `paddingEnd`     |

Use callback scope only when the verb could refer to more than one part. Use an
`html` prefix only for a native attribute that passes through unchanged, such as
`htmlName`. Keep the clearer semantic name when the component owns the concept.

String values use `camelCase`. A public input has one stable semantic
responsibility across its full value domain and every accepted input shape. Its
name and type disclose the caller-owned meaning.

One semantic input may derive several visual details when they form one cohesive,
named outcome. For example, a semantic `status` or `variant` may own both tone and
a signifier. This is not an overloaded input.

Reject a property when its value or input shape changes which axis it controls, or
when consumers need implementation knowledge to predict which axes it controls.
If two axes are independently caller-owned, represent them with separate inputs
and prevent conflicting combinations. If the system owns their coordination,
expose the semantic concept and derive the details instead of naming the input
after one mechanism such as `color`.

Parallel inputs must not create hidden conditional precedence. An override is
valid only when its name, type, and behavior across every combination form an
explicit coherent contract, with invalid or conflicting states prevented under
[FR15](../specs/AST-002/spec.md#requirements).

## Name public module and utility functions by their result

Choose a function's verb from its primary caller-observable result and side
effects. Distinguish construction, inspection, lookup, conversion, registration,
and guaranteed state. Do not name the public function after one internal step.
Keep one callable role per public capability.

This section covers exported standalone functions that form module or utility
APIs. It does not reinterpret component names, callback `on<Verb>` names, or
transition Action names. CLI command verbs and their programmatic command twins
have separate ownership in the
[CLI surface architecture](../architecture/cli-surface.md) and CLI conventions.

The repository-wide export audit supports these roles:

| Verb                  | Public module or utility role                                                                      | Boundary                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `define*`             | Construct or normalize and return a durable typed value used by a supported consumer.              | Validation may be a precondition; inspection or unchanged identity alone is not definition.       |
| `validate*`, `check*` | Inspect input and return structured results.                                                       | State which failures are returned and which conditions throw.                                     |
| `create*`             | Construct or initialize a caller-used runtime value, state object, source, configuration, or view. | The result may be normalized; inspection alone is not creation.                                   |
| `build*`              | Assemble a composite configuration or artifact from parts.                                         | This row covers module utilities, not CLI command naming.                                         |
| `generate*`           | Derive a new aggregate or serialized output from supplied input.                                   | Name the generated result; do not hide unrelated mutation.                                        |
| `resolve*`            | Choose and return a concrete value from inputs, options, context, or a registry.                   | Document fallback and missing-value behavior.                                                     |
| `parse*`              | Convert an external or string representation into a typed or structured representation.            | The public contract states whether invalid input returns `null`, returns a result, or throws.     |
| `format*`             | Serialize a value or produce display text without changing the source value.                       | Include locale, mode, or fallback behavior when it affects output.                                |
| `get*`                | Read or project a requested value without mutating its source.                                     | Current APIs include both registry lookup and deterministic projection; do not imply persistence. |
| `is*`, `has*`         | Return a boolean predicate or type guard.                                                          | Use a structured check when callers need reasons, warnings, or multiple findings.                 |
| `register*`           | Add or replace shared registry state.                                                              | Registration is an explicit side effect.                                                          |
| `ensure*`             | Idempotently establish required state when it is absent.                                           | The name must disclose the state or resource the function may create or mutate.                   |
| `use*`                | Expose a React hook that may read context/state and own React lifecycle or effects.                | Follow the Rules of Hooks; a non-hook utility must not use `use*`.                                |
| `reset*`              | Clear or restore shared state to its documented baseline.                                          | The affected state and intended consumer scope must be explicit.                                  |
| `expand*`             | Convert a compact configuration or representation into its fuller derived form.                    | Expansion does not imply persistence.                                                             |
| `merge*`              | Combine compatible inputs into one returned value or composed behavior.                            | State precedence and conflict behavior.                                                           |

If construction, validation, registration, or another capability is public,
expose each capability through its own callable function. A constructor may reuse
the same internal validation primitive, but it still returns the constructed
value and does not absorb a separately public role.

These are roles supported by current repository evidence, not permission to pick
a familiar verb first and make the implementation fit later. Check the exported
signature, implementation, tests, consumer docs, supported callsites, and release
history. Scope a documented exception to the owning module instead of weakening a
verb across the repository.

Do not silently rename a released mismatch. Preserve compatibility through an
explicit deprecation and migration, then remove or change the old contract only at
the approved compatibility boundary.

## Callbacks and Actions

A callback reports an event synchronously. An Action starts transition-aware
work. The Action name never starts with `on`.

`changeAction` does not replace `onChange`. A component may support either or
both. When both are present, run the callback first. Run the Action afterward
unless the component's public event contract lets the consumer cancel it.

```tsx
interface SearchInputProps {
  value: string;
  onChange?: (
    value: string,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => void;
  changeAction?: (
    value: string,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => void | Promise<void>;
}

const [, startTransition] = React.useTransition();

function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
  const nextValue = event.currentTarget.value;
  onChange?.(nextValue, event);

  if (changeAction && !event.defaultPrevented) {
    startTransition(() => changeAction(nextValue, event));
  }
}
```

Do not name the Action `onChangeAction`. Do not require every input callback by
category. Requiredness follows the component's usable-state, control, and
accessibility contract.

When a component and a consumer both handle the same React event, compose the
handlers deliberately. Put the consumer first only when the public contract
promises that `preventDefault()` cancels built-in behavior.

```tsx
const handleClick = composeEventHandlers(onClickProp, selectItem);
```

If cancellation is not promised, preserve the component's required behavior and
state that order in its contract and tests.

## DOM props, styling, and refs

Extend [`BaseProps`](../../packages/core/src/BaseProps.ts) only when the component
owns a stable DOM element. A component that only coordinates children or returns
multiple unrelated roots should expose the smaller contract it actually owns.

For a DOM-owning component:

- type `BaseProps` with the contract element and accept `ref` as a React 19 prop;
- remove native names that collide with component concepts by using `Omit`;
- forward neutral `data-*`, ARIA, DOM, and event props to the contract element;
- keep component-owned role, accessibility, and behavior props from being
  overwritten; and
- merge `xstyle`, `className`, and `style` instead of choosing one.

```tsx
export interface PanelProps extends BaseProps<HTMLDivElement> {
  ref?: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
}

export function Panel({
  children,
  ref,
  xstyle,
  className,
  style,
  ...rest
}: PanelProps) {
  return (
    <div
      ref={ref}
      {...mergeProps(
        themeProps('panel'),
        stylex.props(styles.root, xstyle),
        className,
        style,
      )}
      {...rest}>
      {children}
    </div>
  );
}
```

Destructure styling and owned handlers before spreading `rest`. Use
`composeEventHandlers` when both sides need the same event. Set component-owned
contract props after `rest` so spread order cannot change semantics.

## Open visual vocabularies and closed axes

The [component theming surface](../architecture/component-theming-surface.md#boundaries-and-invariants)
admits a theme-extensible prop axis only when it is visual and an unavailable
custom value has one safe, deterministic baseline independent of the active
theme. `Heading.type` qualifies because required `Heading.level` supplies that
baseline. `Icon.size` does not: choosing a fallback size would silently change
geometry, alignment, or composition.

Behavioral, structural, placement, directional, and state-machine axes stay
closed. A theme may redefine an existing value on a closed axis, but it may not
add one.

An admitted theme-extensible vocabulary uses a public `*Map` interface in the
component subpath barrel. Derive the prop type from its keys.

```ts
// packages/core/src/Button/index.ts
export interface ButtonVariantMap {
  primary: true;
  secondary: true;
  ghost: true;
  destructive: true;
}

// packages/core/src/Button/Button.tsx
export type ButtonVariant = keyof ButtonVariantMap;
```

A theme can add an admitted visual value through module augmentation of
`@astryxdesign/core/Button`. The component contract or governing system spec and
focused test must show the fallback when no matching theme rule is active; the
shared structural guard checks only the public map, `themeProps()` reflection,
and theming metadata.

Do not assume a nested `theme.components.button.variants` shape. Follow the current
[theme authoring contract](../architecture/theme-authoring-contract.md) for
component target and style-key overrides.

## Slots and composition

Prefer composition when content or child behavior has its own contract. A named
slot accepts the complete child and renders it directly.

```tsx
<AppShell
  topNav={<TopNav items={items} />}
  sideNav={<SideNav sections={sections} />}
/>
```

Do not hoist `SideNav` state or callbacks onto `AppShell`. Keep them on the child
that owns them. Use a render function only when the parent must provide item data
or context. Use a prop for a finite independent axis, not for a one-off product
recipe.

High-level compositions have a higher bar for new props than utility components.
Before adding a prop, check whether a child, slot, theme target, styling escape
hatch, parent layout, or existing context already owns the distinction.

## API proposal gate

Classify the change after identifying current authority. The
[knowledge contract](../architecture/knowledge-contracts.md#change-coupling) owns
the five results and their disposition: `preserves`, `settled`, `violates`,
`novel-human`, and `out-of-scope`. This guide applies those results; it does not
redefine them.

A defect fix is `preserves` only when it restores a current contract or standard
without adding public API or public behavior beyond that authority. Supply focused
regression evidence for the broken state and representative unchanged states. Any
additional public delta is classified independently through the knowledge
contract: existing current authority may settle it, and only absent authority uses
the unsettled owner path. The bug-fix label never bypasses API design.

For a claimed API addition or semantic behavior change, review has four stages:

1. **Inventory the public delta.** State the exact semantic before → after,
   identify the canonical owner by scope, and include supporting declarations,
   types, context fields, hook returns, defaults, and observable behavior reachable
   from supported package paths.
2. **Apply API admission.** Reject a public choice the component can derive, a
   public input whose controlled axis changes by value or input shape, hidden
   conditional precedence between parallel inputs, or a parallel public/package-
   internal operation for the same semantic action. A cohesive semantic status or
   variant may derive several visual details when its public meaning stays stable
   and disclosed. Within one module, keep one canonical operation name; another
   requires genuinely distinct caller-owned intent and contract.
3. **Apply current authority.** Follow the result and disposition owned by the
   knowledge contract. A draft is useful review context but is not policy and
   cannot clear the gate. Exact-head owner discussion or approval is decision
   evidence; an accepted decision must be committed in the canonical record as
   `current` before implementation acceptance.
4. **Review implementation correctness.** Once current authority settles the
   public contract, verify the exact implementation head, regression evidence,
   compatibility, migration, docs, and representative unchanged states.

Mechanical manifests and receipts may inventory the delta and prove which
current record was read. They are evidence only; they do not choose semantics or
assign pull-request disposition.

## API proposal checklist

Every public-facing API pull request has this minimum readable summary:

- **Owner:** link the canonical owning record and state its authority. Use the
  component spec only for component-local semantics; use the family, architecture,
  or system record when it owns the changed semantics. If the owner is draft or
  missing before this pull request, name the intended owner.
- **Semantic before → after:** state the caller-visible meaning and guarantee in
  one sentence.
- **Classification:** name `preserves`, `settled`, `violates`, `novel-human`, or
  `out-of-scope` as defined by the knowledge contract.
- **Representative syntax:** include it only when public syntax changes; the
  component `.doc.mjs` remains the complete syntax/reference authority.

Before requesting review:

- **Prove caller ownership.** Show two otherwise identical cases that need
  different outcomes, why the caller knows the difference, and why the component
  cannot derive it. This is the admission rule in
  [AST-002](../specs/AST-002/spec.md#dec-1--public-props-require-a-non-derivable-caller-distinction).
- **Keep each input's responsibility stable.** Walk the full value domain, every
  accepted input shape, and every combination with parallel inputs. The name and
  type must disclose one caller-owned meaning. A semantic status or variant may
  derive a cohesive set of visual details; reject values or shapes that switch
  the controlled axis, and reject hidden conditional precedence. Represent
  independently caller-owned axes separately and prevent invalid or conflicting
  combinations under FR15.
- **Update the semantic owner.** Update or add the canonical owning record.
  Component-local concepts belong in the component spec; shared family,
  architecture, or system concepts belong in that owner. Record inputs, options,
  defaults, invalid values and unsupported combinations, outputs, operations,
  guarantees, and relevant lifetime or resource obligations without copying
  inherited rules.
- **Prevent broken states.** Make statically knowable invalid combinations
  unrepresentable when practical. Otherwise document validation or warnings, or
  a safe fallback; do not silently render a broken state or block legitimate
  composition.
- **Check operation uniqueness.** Within one module, use the same canonical name
  for public and package-internal forms of one semantic action. The internal form
  may accept wider options; another operation requires distinct caller-owned
  intent.
- **Check the shared grammar.** Cover names, optionality, callback/Action order,
  cancellation, ref target, DOM pass-through, and whether each string axis is
  open or closed. An open axis must name and test its safe theme-independent
  fallback when no matching theme rule is active.
- **Protect compatibility.** State defaults and observable behavior. Include a
  migration for a released breaking change.
- **Ship API evidence together.** When consumer usage or a documented promise
  changes, update consumer docs, public exports, focused runtime and type tests,
  and representative integration coverage in the same pull request.

If two or three viable shapes remain after applying current conventions, use the
[API Arbitration](https://github.com/facebook/astryx/wiki/API-Arbitration)
process. Compare realistic consumer code across the relevant cases and put the
evidence in the pull request. Ask the owner to decide. A maintainer or review
agent records the final ruling in the owning spec. Keep the research procedure
out of architecture records.

## Common review smells

- A public API change has no semantic delta in its canonical owning record, so
  reviewers must infer meaning from implementation or syntax.
- One module gives the same semantic action separate public and package-internal
  operation names because an internal caller needs wider options.
- A public input controls one axis for some values or shapes and additional axes
  for others, so consumers must know implementation branches to predict output.
- Parallel inputs create a conditional override without an explicit contract for
  every combination or prevention of conflicting states.
- A prop exposes a value the component can derive from state, content, layout,
  context, or the platform.
- A high-level component accumulates tuning props or duplicates a child's state.
- Equivalent concepts use different names, such as `onChangeAction` instead of
  `changeAction`.
- An Action suppresses its callback, or handler order accidentally removes a
  promised consumer cancellation path.
- A callback is required only because all inputs were assumed to require it.
- An eligible theme-extensible visual value is a closed union, an axis opens
  without a safe theme-independent fallback, or a behavioral, structural,
  placement, directional, or state-machine axis is opened to augmentation.
- `BaseProps` is applied to a component without one stable contract element, or
  accepted DOM props never reach that element.
- `xstyle`, `className`, `style`, a ref, or an event handler is dropped or
  clobbered by spread order.
- A parent wraps slot content or mirrors props that belong to the slotted child.
- A prop reaches into a subcomponent's anatomy, a composition renders a slot
  the anatomy does not describe, or a rendered content slot is not a part named in the anatomy
  ([INV18](../architecture/public-component-api.md#boundaries-and-invariants)).
- A feature with a large resource cost loads for every caller, with no plug-in
  path or named feature prop (INV19).
- A boolean prop only swaps visuals where a variant fits (INV20).
- A new API shares a job with an existing one that is not being deprecated in
  its favor (INV21).
- A proposal invents a nested `theme.components.button.variants` layer instead of
  using the current component target and style-key contract.
- A green docs parser is treated as full API proof. Parsing and selected drift
  checks do not prove export reachability, runtime behavior, ref targets,
  pass-through, handler composition, compatibility, or complete doc coverage.

When a current record conflicts with another current record, stop. Do not choose
by recency or specificity. Route the conflict to the canonical owner described in
the [knowledge contract](../architecture/knowledge-contracts.md#when-current-records-disagree).
