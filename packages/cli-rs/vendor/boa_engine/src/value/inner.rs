//! Module implementing the operations for the inner value of a `[super::JsValue]`.
use cfg_if::cfg_if;

cfg_if!(
    if #[cfg(feature = "jsvalue-enum")] {
        mod legacy;
        pub(crate) use legacy::EnumBasedValue as InnerValue;
    } else {
        mod nan_boxed;
        pub(crate) use nan_boxed::NanBoxedValue as InnerValue;
    }
);
