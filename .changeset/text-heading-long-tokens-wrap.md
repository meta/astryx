---
'@astryxdesign/core': patch
---

[fix] Text and Heading: a long unbroken word, URL or ID in text that isn't truncated now wraps instead of running past its container, so a phone-width page (320 px) no longer scrolls sideways. Ordinary text lays out exactly as before, and truncation (`maxLines`) is unchanged. Inside a flex row, the flex child still needs `min-width: 0` to shrink.

@cixzhang
