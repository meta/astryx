---
title: 'Introducing Astryx RichText: a rich text field for your forms'
description: '@astryxdesign/richtext is stable: a labelled rich text field built on Lexical, styled by your Astryx theme, that reads and writes Markdown losslessly.'
date: '2026-10-20'
type: 'update'
draft: false
authors:
  - 'cixzhang'
  - 'potatowagon'
  - 'ernest'
tags:
  - 'Release'
  - 'Components'
  - 'Accessibility'
relatedDocs:
  - title: 'RichTextEditor'
    href: '/components/RichTextEditor'
---

`@astryxdesign/richtext` is now a stable Astryx package. It gives your forms a rich text field: people write with headings, lists, links, tables and code, and your app stores what they wrote. Since v0.7.1 it installs at the same version as `@astryxdesign/core` and follows the same compatibility policy.

![Writing in an empty Launch notes rich text field. The toolbar's style menu turns the first line into a Q4 launch plan heading; the Bold button makes "rich text" bold; an Insert link dialog turns "every form" into a link; then the style menu switches to Bulleted list and two items, Feedback form and Release notes, are typed.](/blog/introducing-astryx-richtext/richtext-toolbar.gif)

```bash
npm install @astryxdesign/richtext @astryxdesign/core
```

Then install the `lexical` and `@lexical/*` peers at 0.52 (`npm view @astryxdesign/richtext peerDependencies` lists them). RichText ships prebuilt CSS, like Core: import its stylesheet beside Core's and your theme's.

```tsx
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css'; // or your theme's CSS
import '@astryxdesign/richtext/richtext.css';
```

```tsx
import {RichTextEditor, RichTextEditorToolbar} from '@astryxdesign/richtext';

<RichTextEditor
  label="Release notes"
  description="Capture formatted context for your team."
  toolbar={<RichTextEditorToolbar />}
  onChange={editorState => save(JSON.stringify(editorState.toJSON()))}
/>;
```

## A form field first

`RichTextEditor` is a labelled field, like `TextArea`: label, description, required and optional states, status messages, read-only and disabled states, a character limit, and the same border and focus ring as the rest of your form. `RichTextView` shows saved content read-only, with the same typography.

![A Launch notes rich text field with its description and toolbar, holding a Q4 launch plan heading, a paragraph with bold text and a link, a This week heading over a bulleted list with inline code, a three-column table of surfaces, owners and status, and a tsx code block.](/blog/introducing-astryx-richtext/richtext-editor@2x.png)

The value you store is Lexical editor state, serialized as JSON. Pass it to `RichTextEditor`'s `defaultValue` to keep editing, or to `RichTextView`'s `value` to show it.

## Markdown in and out, losslessly

`markdownToEditorStateJSON` and `editorStateJSONToMarkdown` convert in both directions without mounting an editor, including on the server. Open Markdown, change nothing, and export it: you get back the exact bytes. Change one paragraph and everything else comes back as written: list markers, escapes, spacing and character references.

```ts
import {
  editorStateJSONToMarkdown,
  markdownToEditorStateJSON,
} from '@astryxdesign/richtext/markdown';

const editorState = markdownToEditorStateJSON(markdown); // pass to defaultValue
editorStateJSONToMarkdown(editorState) === markdown; // true until someone edits
```

## The same document in read and edit mode

A RichText document matches the same document rendered by Astryx `Markdown`: same type scale, block spacing, measure, list markers and code frames, in light and dark, left-to-right and right-to-left. Switching a page between `Markdown` and `RichTextEditor` keeps every block in the same order with the same spacing; the editor adds only its field frame. Long code lines wrap in both, so phone readers never scroll code sideways.

![One Markdown source shown twice. Top, labelled Markdown, read mode: a Release notes heading, a paragraph with bold, italic, struck-through and inline code text, a link and a bare URL, then a What changed heading. Bottom, labelled RichText, edit mode: the same content inside the editor's field frame and toolbar, wrapping on the same words.](/blog/introducing-astryx-richtext/read-and-edit@2x.png)

## A toolbar that matches your theme

`RichTextEditorToolbar` is built from Astryx `Toolbar`, `Selector`, `ToggleButton` and `Dialog`, so it follows your theme: undo and redo, paragraph and heading styles, lists and quotes, bold, italic, underline, strikethrough, inline code and links. When space is tight it scrolls rather than hiding controls in a menu, and every icon can be replaced from your theme. Add your own controls in its `endContent` slot.

## Built on Lexical

RichText is built on [Lexical](https://lexical.dev), the extensible text editing framework. Add your own nodes, Markdown transformers and Lexical plugins directly; `onChange` gives you Lexical editor state. RichText supports one Lexical minor at a time: 0.52 today, declared as `^0.52.0` peer dependencies, so your app installs Lexical rather than RichText bundling its own copy.

Markdown plugins you wrote with `createMarkdownPlugin` to add syntax to Astryx `Markdown` work in the editor too: adopt one with `createRichTextExtension`, and its nodes render as `Markdown` renders them and edit as one unit. A plugin that transforms the whole document is refused with a `RichTextExtensionError`.

## Accessibility you do not have to build

Screen readers announce the editor properly: they read out the field's label and say it is a multi-line text box, so someone using one knows what they are typing into. The whole toolbar works from the keyboard — arrow keys move between the buttons, no mouse needed — and Tab indents as it does in a word processor, while Escape, then Tab moves focus out of the editor. Screen readers announce that hint, so keyboard users never get stuck. Checkboxes in task lists can be checked from the keyboard, and screen readers call them checkboxes. Button tooltips, the link dialog and the editor's announcements come from the Astryx message catalog, so you translate them the same way as the rest of Astryx.

## Get started

- Install the package and the Lexical peers shown above.
- Read the [RichTextEditor docs](/components/RichTextEditor), or run `npx @astryxdesign/cli component RichTextEditor` in a project that has the package installed.
- Try every feature together in the [RichText playground story](https://astryx.atmeta.com/storybook/?path=/story/richtext-richtexteditor--playground).
