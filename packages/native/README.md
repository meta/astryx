# @astryxdesign/native

> **Experimental. Canary only.** This package is published only under the
> `@canary` dist-tag and is never released as a stable version. Its APIs change
> without notice. Nothing here is supported for production apps.

`@astryxdesign/native` is where Astryx experiments with native platforms
(iOS, Android, macOS, Windows) under AST-082 (Native-first surfaces). The
experiment compares ways of building Astryx components on each platform and
measures them against the same scorecard, so the decision for each platform
rests on evidence.

## What is here today

| Part           | Path                              | What it does                                                                                                                                                                                                                                                                                                 |
| -------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contracts      | `src/contract/`                   | Reads a core component's documentation and splits its props into a portable **core contract** and a **web-only** part, with a reason for each web-only prop. Checks prop names against Swift and Kotlin keywords and platform toolkit names.                                                                 |
| Platform types | `@astryxdesign/native/components` | TypeScript props per platform, chosen by type-resolution condition: `ios`, `android`, `macos`, `windows`, or `shared` for the core contract only.                                                                                                                                                            |
| Swift binding  | `apple/`                          | A Swift package with two products: `AstryxNative`, props generated from the same contracts (iOS and macOS props sit behind `#if os(...)`) plus the logic host, and `Astryx`, SwiftUI views drawn with core's tokens. Clone-only page templates sit in `apple/Templates/`. See [its README](apple/README.md). |
| Native theme   | `defineNativeTheme`               | Durable theme intent (`material: 'opaque' \| 'translucent'`) plus platform entries scoped by OS version, such as Liquid Glass from iOS 26. Never sets tokens.                                                                                                                                                |
| Icons          | `NATIVE_ICON_DEFAULTS`            | Astryx's built-in icon names mapped to SF Symbols on Apple platforms and Material Symbols on Android.                                                                                                                                                                                                        |
| Wire           | `AstryxNode`, `AstryxAction`      | Each component as JSON a TypeScript core sends a native host (arm C), and the action a host sends back when a view calls a callback. Swift decodes `<Name>Node` and turns it into `<Name>Props` with `viewProps(send:)`.                                                                                     |
| Logic core     | `@astryxdesign/native/logic`      | `createLogicCore` holds a screen's state, builds its node tree, and reduces actions; `connectBridge` carries it to a native host as JSON. ECMAScript built-ins only, so it runs in Hermes. Shaped after EJ Campbell's astryx-swift spike.                                                                    |
| Logic host     | `AstryxLogicHost` (Swift)         | Runs a logic core bundle in JavaScriptCore, decodes each tree into `AstryxNode`, and sends views' actions back. A Hermes host speaks the same bridge.                                                                                                                                                        |

Contracts cover Badge, Button, Card, Divider, Heading, HStack, ProgressBar,
Selector, Switch, Text, TextInput, and VStack. The `Astryx` Swift product draws
Text, Heading, Button, TextInput, Card, and Banner, and `apple/Templates/` the
`login` template, in SwiftUI.
React Native and Android bindings are not built yet; see
[the experiment matrix](#experiment-matrix).

```ts
// tsconfig.json for an iOS app: "customConditions": ["ios"]
import type {SelectorProps} from '@astryxdesign/native/components';

const props: SelectorProps = {
  label: 'Shipping',
  options: [{value: 'standard', label: 'Standard'}],
  menuStyle: 'pullDown', // iOS-only prop; an Android build rejects it
};
```

How core documentation becomes a contract:

- A callback whose arguments are values followed by the DOM event that caused
  them, such as `(checked: boolean, e: ChangeEvent) => void`, keeps the values
  in the core; the event stays on the web.
- A callback that carries only an event stays on the web, unless the component
  names it in `callbacks`, as Button does for `onClick`. Its core form takes no
  arguments. A callback with an event before a value stays on the web either
  way.
- Free-form content becomes a typed slot only where a component declares one
  in `slots`; `text` is a string, as for a badge's label or a heading's words,
  and `content` is child Astryx components, as for a stack's or a card's
  children. A SwiftUI view takes content as a view builder, so `<Name>Props`
  leaves it out; `<Name>Node` carries it as child nodes.
- A closed set of numbers, such as a heading level, is a Swift enum with raw
  values.
- A core prop may share a platform toolkit's name only when the component
  declares in `sameMeaning` that it means the same thing there.

### The wire (arm C)

A TypeScript core sends a tree of nodes and receives actions. A node lists the
callbacks the core listens to in `events`; a view gets only those callbacks.

```ts
// tsconfig: "customConditions": ["ios"]
import type {AstryxAction, AstryxNode} from '@astryxdesign/native/components';

const screen: AstryxNode = {
  component: 'VStack',
  key: 'root',
  props: {
    gap: 2,
    children: [
      {
        component: 'Switch',
        key: 'wifi',
        props: {label: 'Wi-Fi', value: true},
        events: ['onChange'],
      },
    ],
  },
};
// What the host sends back when the switch is turned off:
const action: AstryxAction = {
  key: 'wifi',
  component: 'Switch',
  event: 'onChange',
  args: [false],
};
```

```swift
let host = AstryxLogicHost(bundle: bundleSource) // calls the bundle's global astryxStart(host)
if case .switch(let wifi) = host.root {
  let props = wifi.viewProps(send: host.send)
}
```

```ts
// tsconfig: "customConditions": ["ios"]
import type {AstryxAction, AstryxNode} from '@astryxdesign/native/components';
import {connectBridge, createLogicCore} from '@astryxdesign/native/logic';
import type {Bridge, BridgeHost} from '@astryxdesign/native/logic';

const core = createLogicCore<{wifi: boolean}, AstryxNode, AstryxAction>({
  initial: {wifi: true},
  view: state => ({
    component: 'Switch',
    key: 'wifi',
    props: {label: 'Wi-Fi', value: state.wifi},
    events: ['onChange'],
  }),
  reduce: (state, action) =>
    action.component === 'Switch' && action.event === 'onChange'
      ? {wifi: action.args[0]}
      : state,
});
// The bundle's entry: the native host calls it with its two calls in and
// gets back the bridge it reads snapshots from and dispatches actions to.
(globalThis as {astryxStart?: (host: BridgeHost) => Bridge}).astryxStart =
  host => connectBridge(core, host);
```

## Working on it

```sh
pnpm -F @astryxdesign/native typecheck        # source and tests
pnpm -F @astryxdesign/native build            # dist/, including platform types
pnpm -F @astryxdesign/native typecheck:types  # every platform's types, after build
pnpm -F @astryxdesign/native generate:apple   # regenerate apple/Sources/.../Generated
pnpm -F @astryxdesign/native generate:swift-ios # regenerate the Astryx product's typed tokens, every published theme, and strings
pnpm vitest run --project node packages/native
```

Generated Swift is committed so a Swift package can pin a commit. A test fails
when it drifts from the contracts.

**Cleanup needed.** Committing the generated Swift
(`apple/Sources/AstryxNative/Generated`) is temporary. It is there only because
Swift Package Manager installs a package from a git commit and cannot run the
Node generator. The intended replacement: CI generates the Swift files and
publishes them to a Swift-only branch or tag that apps pin, and the generated
files are ignored on `main`.

Boundaries, checked by `pnpm check:package-boundaries`:

- `@astryxdesign/core` never imports this package.
- No file in this package, in any folder, imports core, apart from the
  build-time reads AST-082 FR16 lists until core's portable entry ships: the
  theme generator in `scripts/` may import `@astryxdesign/core/theme` and
  `@astryxdesign/core/theme/tokens`; `scripts/swift-ios-strings.mjs` may
  read core's locale catalogs (`@astryxdesign/core/locales/*.json`); and
  `scripts/core-docs.mjs` reads core's component documentation and built-in
  icon names as data.
- The check reads source text in every folder except `node_modules`, `dist`,
  `.build`, and `.swiftpm`. It flags any other module specifier that names
  core (`import`, `require`, `require.resolve`, `import.meta.resolve`, or a
  relative path into `packages/core`). It also flags a path to core's package,
  written as adjacent string segments (`'@astryxdesign', 'core'`,
  `'node_modules', '@astryxdesign/core'`, `'packages', 'core'`) or inside one
  string (`node_modules/@astryxdesign/core`, `packages/core`). In
  `scripts/core-docs.mjs` it allows exactly one such path, the `CORE_ROOT`
  definition, and only the listed reads under `CORE_ROOT`. It does not follow
  paths computed in other ways.

## Experiment matrix

Every arm runs the same subjects on the same devices and is scored against a
**reference**: the same screens hand-built with the platform toolkit (SwiftUI,
Jetpack Compose, WinUI).

| Arm                       | How components are built                                                                 | iOS | Android | macOS | Windows |
| ------------------------- | ---------------------------------------------------------------------------------------- | --- | ------- | ----- | ------- |
| A. Pure native            | Platform views (SwiftUI, Compose, WinUI) on generated contracts                          | ✓   | ✓       | ✓     | ✓       |
| B. React Native           | React Native components; desktop through `react-native-macos` and `react-native-windows` | ✓   | ✓       | ✓     | ✓       |
| C. Shared logic core      | Component logic in TypeScript running in Hermes, driving platform views                  | ✓   | ✓       | ✓     | —       |
| D. Web on native          | Web React components through a native renderer, such as Expo's experimental fork         | ✓   | ✓       | —     | —       |
| E. Web in a desktop shell | Astryx's web components unchanged inside Electron                                        | —   | —       | ✓     | ✓       |

Arms D and E are measured but cannot become required runtimes as written:
arm D depends on a third-party fork and arm E on Electron, a third-party
runtime (AST-082 FR13). Arm E is the baseline for how far plain web gets on
desktop.

### Test subjects

Templates come first because their web version is a known reference for
content and states.

1. **Wave 1:** `checkout-wizard` (forms, stepper, pickers, validation, keyboard),
   `table-inbox` (long list, row actions, search, compose sheet), `dashboard`
   (charts, tables, scrolling).
2. **Wave 2:** `settings`, `kanban-board`, `ai-chat`, `product-detail`.
3. **Component flows:** Selector, text entry, dialog and sheet, list with row
   actions.

Each subject has one scripted interaction that every arm replays.

Visual scores come from real screens. Every scripted step is captured as a
screenshot on the device, every behavior (sheet open and dismiss, navigation
transitions, gestures, scrolling, press feedback, keyboard) as a short video or
GIF, and every scenario as a recording, for each arm, the
reference, and the web version, in light and dark and at the largest text size.
Reviewers compare captures side by side with arm names hidden, and pixel checks
read colors and sizes from the captures, never from source.

### Metrics

| Area            | Measure                        | How                                                                                                                                                                                                           | Unit                  |
| --------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Gate            | Required runtimes              | Dependency manifest against FR13                                                                                                                                                                              | pass/fail             |
| Gate            | Screen-reader parity           | VoiceOver, TalkBack, Narrator task script                                                                                                                                                                     | pass/fail             |
| Gate            | Completeness                   | Every subject renders every state                                                                                                                                                                             | pass/fail             |
| Experience      | Platform feel                  | Blind reviewer rating of captured screens and recordings against the reference, plus a platform-conventions checklist                                                                                         | score, % of checklist |
| Experience      | Behavior and motion            | Blind reviewer rating of behavior videos against the reference: timing, easing, gesture response, interruptibility                                                                                            | score per behavior    |
| Experience      | Time to adopt a new OS feature | Days from OS release to shipping it in the arm (for example, Liquid Glass)                                                                                                                                    | days                  |
| Performance     | Startup to first content       | Release build, cold start, median of runs                                                                                                                                                                     | ms                    |
| Performance     | Smoothness                     | Dropped frames during the scripted interaction                                                                                                                                                                | % frames              |
| Performance     | Input latency                  | Touch or key to visible response                                                                                                                                                                              | ms                    |
| Performance     | Memory and size                | Peak memory during the script; app download size                                                                                                                                                              | MB                    |
| Maintenance     | Change cost                    | Time to ship one real Astryx change on the arm (a new prop, a new token)                                                                                                                                      | hours                 |
| Developer speed | Iteration                      | Edit to visible on device                                                                                                                                                                                     | seconds               |
| Developer speed | Sharing                        | Share of app code reused across platforms                                                                                                                                                                     | % lines               |
| Design          | Brand preservation             | Blind designer review of whether the brand is recognizable from the web version while the screen still feels native, plus pixel checks on the captures for the theme's color, type, shape, spacing, and icons | score, % token checks |
| Fidelity        | Match to web                   | Content and states matching the web template                                                                                                                                                                  | % checks              |

### Judging

1. An arm that fails a gate is out for that platform.
2. The remaining arms are compared per platform, each measure relative to the
   reference on the same device.
3. Whether the measures are weighted into one score or ranked side by side is
   not decided yet.
