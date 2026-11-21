---
'@astryxdesign/core': patch
---

[fix] A Link in running text is now underlined at rest in every theme, so readers can find it without relying on its color. Running text is a body, large or supporting `Text` that does not render as a label or heading, and every link Markdown renders through `components={{link: Link}}`. A standalone Link (`isStandalone`), a Link outside such Text, and navigation links keep the hover-only underline. Set `hasUnderline={false}` to keep the hover-only underline inside running text. No new props.

@cixzhang
