---
'@astryxdesign/core': patch
---

[fix] Text and Heading: a long unbroken word, URL or ID in text that isn't truncated now wraps instead of running past its container, so in ordinary flow a phone-width page (320 px) no longer scrolls sideways. Ordinary text lays out exactly as before, and truncation (`maxLines`) is unchanged. Text and Heading now set `overflow-wrap: break-word` themselves, so inside a flex row the flex child still needs `min-width: 0`, and a container's `overflow-wrap: anywhere` no longer reaches their text.

@cixzhang
