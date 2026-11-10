---
'@astryxdesign/core': patch
---

[fix] Toast: the `useToast` fallback warning and its server-rendering error no longer tell you to wrap the app in `<AppShell>`. AppShell provides no layer context, so that advice left the warning in place. They now name only `<LayerProvider>`, which removes it.

@cixzhang
