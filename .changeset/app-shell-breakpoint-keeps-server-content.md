---
'@astryxdesign/core': patch
---

[fix] AppShell keeps server-rendered content when a screen is narrower than the server assumed. On a phone, the shell learned its mobile layout in an urgent update right after it hydrated. When the content inside the shell had not hydrated yet, because its code streams in or loads later, React rendered that content again in place of its server HTML: a visitor lost scroll position and focus, and images inside loaded twice. The shell now takes the client's breakpoint answer in a transition, which waits for that content to hydrate. A client-rendered app and a correct `mobileNav.defaultIsMobile` hint behave as before. No API changes.

@nynexman4464
