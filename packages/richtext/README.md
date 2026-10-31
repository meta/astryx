# @astryxdesign/richtext

Astryx rich text — a Lexical-based rich text editor and read-only viewer, styled
with Astryx design tokens.

```tsx
import {RichTextEditor, RichTextView} from '@astryxdesign/richtext';

<RichTextEditor label="Notes" onChange={setState} />;
<RichTextView value={serializedState} />;
```

The editor is deliberately minimal and extensible: pass `nodes` and `plugins` to
layer richer behaviour (toolbars, mentions, hover cards) on top without forking.
`RichTextEditorToolbar` is a composable formatting toolbar for the editor's
`toolbar` slot, and `markdownToEditorStateJSON` / `editorStateJSONToMarkdown`
convert Markdown to and from serialized editor state headlessly (no mounted
editor required). The server-safe serializers are also available from
`@astryxdesign/richtext/markdown`.

`RichTextView` and core `Markdown` render the same document the same way, and
Markdown imported into the editor exports back byte for byte when nothing was
edited.

## Built on Lexical

RichText is built on [Lexical](https://lexical.dev) and does not hide it:
`nodes` and `transformers` take Lexical types, `plugins` takes Lexical React
plugins, and `onChange(editorState, editor)` and the editor ref's
`getEditorState()` report Lexical types, so you extend the editor with Lexical
directly. The value you store is serialized Lexical editor state;
`markdownToEditorStateJSON` and `editorStateJSONToMarkdown` convert it to and
from Markdown.

RichText supports one Lexical minor at a time, named by its `lexical` and
`@lexical/*` peer ranges. Those are **optional** peer dependencies, so your
package manager does not add them: install them at that minor alongside
richtext. See the RFC:
[meta/astryx#3899](https://github.com/meta/astryx/issues/3899).

## Install

```bash
npm install @astryxdesign/richtext @astryxdesign/core
```

Then install every `lexical` and `@lexical/*` package listed in richtext's
`peerDependencies`, at the range shown there (`npm view @astryxdesign/richtext
peerDependencies` prints them).

`@astryxdesign/richtext` is released together with `@astryxdesign/core` at the
same version; install matching versions. `lexical` and the `@lexical/*` packages
are optional peer dependencies, so a project that only uses the headless
Markdown serializers installs just those.

RichText ships prebuilt CSS and JS, like `@astryxdesign/core`: import its
stylesheet beside Core's and your theme's, with no StyleX or Babel setup. Never
compile richtext's source.

```tsx
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css'; // or your theme's CSS
import '@astryxdesign/richtext/richtext.css';
```

`richtext.css` emits into `@layer astryx-base`, the layer `astryx.css` opens,
so your theme's token overrides (`@layer astryx-theme`) win over it, as long
as Core's `reset.css` (or a `@layer reset, astryx-base, astryx-theme;` line,
if your app has its own reset) loads first.

## Examples

Interactive examples live in Storybook under **RichText/RichTextEditor**
(`apps/storybook/stories/RichTextEditor.stories.tsx`).
