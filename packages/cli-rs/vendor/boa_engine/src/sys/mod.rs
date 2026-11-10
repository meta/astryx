// We could use `web-time` directly, but that would make it harder to add support
// for other platforms in the future e.g. `no_std` targets.
// We could also pull `web-time` and customize it for our target selection
cfg_if::cfg_if! {
    if #[cfg(all(
        target_family = "wasm",
        not(any(target_os = "emscripten", target_os = "wasi")),
        feature = "js"
    ))] {
        mod js;
        pub(crate) use self::js::*;
    } else {
        mod fallback;
        pub(crate) use self::fallback::*;
    }
}
