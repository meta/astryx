//! Boa's implementation of ECMAScript's global `Symbol` object.
//!
//! The data type symbol is a primitive data type.
//! The `Symbol()` function returns a value of type symbol, has static properties that expose
//! several members of built-in objects, has static methods that expose the global symbol registry,
//! and resembles a built-in object class, but is incomplete as a constructor because it does not
//! support the syntax "`new Symbol()`".
//!
//! Every symbol value returned from `Symbol()` is unique.
//!
//! More information:
//! - [MDN documentation][mdn]
//! - [ECMAScript reference][spec]
//!
//! [spec]: https://tc39.es/ecma262/#sec-symbol-value
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol

#![deny(
    unsafe_op_in_unsafe_fn,
    clippy::undocumented_unsafe_blocks,
    clippy::missing_safety_doc
)]

use crate::{
    js_string,
    string::{JsString, StaticJsStrings},
};
use boa_gc::{Finalize, Trace};
use tag_ptr::{Tagged, UnwrappedTagged};

use boa_macros::{JsData, js_str};
use num_enum::{IntoPrimitive, TryFromPrimitive};

use std::{
    hash::{Hash, Hasher},
    mem::ManuallyDrop,
    ptr::NonNull,
    sync::{Arc, atomic::Ordering},
};

use portable_atomic::AtomicU64;

/// Reserved number of symbols.
///
/// This is the maximum number of well known and internal engine symbols
/// that can be defined.
const RESERVED_SYMBOL_HASHES: u64 = 127;

fn get_id() -> Option<u64> {
    // Symbol hash.
    //
    // For now this is an incremented u64 number.
    static SYMBOL_HASH_COUNT: AtomicU64 = AtomicU64::new(RESERVED_SYMBOL_HASHES + 1);

    SYMBOL_HASH_COUNT
        .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |value| {
            value.checked_add(1)
        })
        .ok()
}

/// List of well known symbols.
#[derive(Debug, Clone, Copy, TryFromPrimitive, IntoPrimitive)]
#[repr(u8)]
enum WellKnown {
    AsyncIterator,
    HasInstance,
    IsConcatSpreadable,
    Iterator,
    Match,
    MatchAll,
    Replace,
    Search,
    Species,
    Split,
    ToPrimitive,
    ToStringTag,
    Unscopables,
    Dispose,
    AsyncDispose,
}

impl WellKnown {
    const fn description(self) -> JsString {
        match self {
            Self::AsyncIterator => StaticJsStrings::SYMBOL_ASYNC_ITERATOR,
            Self::HasInstance => StaticJsStrings::SYMBOL_HAS_INSTANCE,
            Self::IsConcatSpreadable => StaticJsStrings::SYMBOL_IS_CONCAT_SPREADABLE,
            Self::Iterator => StaticJsStrings::SYMBOL_ITERATOR,
            Self::Match => StaticJsStrings::SYMBOL_MATCH,
            Self::MatchAll => StaticJsStrings::SYMBOL_MATCH_ALL,
            Self::Replace => StaticJsStrings::SYMBOL_REPLACE,
            Self::Search => StaticJsStrings::SYMBOL_SEARCH,
            Self::Species => StaticJsStrings::SYMBOL_SPECIES,
            Self::Split => StaticJsStrings::SYMBOL_SPLIT,
            Self::ToPrimitive => StaticJsStrings::SYMBOL_TO_PRIMITIVE,
            Self::ToStringTag => StaticJsStrings::SYMBOL_TO_STRING_TAG,
            Self::Unscopables => StaticJsStrings::SYMBOL_UNSCOPABLES,
            Self::Dispose => StaticJsStrings::SYMBOL_DISPOSE,
            Self::AsyncDispose => StaticJsStrings::SYMBOL_ASYNC_DISPOSE,
        }
    }

    const fn fn_name(self) -> JsString {
        match self {
            Self::AsyncIterator => StaticJsStrings::FN_SYMBOL_ASYNC_ITERATOR,
            Self::HasInstance => StaticJsStrings::FN_SYMBOL_HAS_INSTANCE,
            Self::IsConcatSpreadable => StaticJsStrings::FN_SYMBOL_IS_CONCAT_SPREADABLE,
            Self::Iterator => StaticJsStrings::FN_SYMBOL_ITERATOR,
            Self::Match => StaticJsStrings::FN_SYMBOL_MATCH,
            Self::MatchAll => StaticJsStrings::FN_SYMBOL_MATCH_ALL,
            Self::Replace => StaticJsStrings::FN_SYMBOL_REPLACE,
            Self::Search => StaticJsStrings::FN_SYMBOL_SEARCH,
            Self::Species => StaticJsStrings::FN_SYMBOL_SPECIES,
            Self::Split => StaticJsStrings::FN_SYMBOL_SPLIT,
            Self::ToPrimitive => StaticJsStrings::FN_SYMBOL_TO_PRIMITIVE,
            Self::ToStringTag => StaticJsStrings::FN_SYMBOL_TO_STRING_TAG,
            Self::Unscopables => StaticJsStrings::FN_SYMBOL_UNSCOPABLES,
            Self::Dispose => StaticJsStrings::FN_SYMBOL_DISPOSE,
            Self::AsyncDispose => StaticJsStrings::FN_SYMBOL_ASYNC_DISPOSE,
        }
    }

    const fn hash(self) -> u64 {
        self as u64
    }

    fn from_tag(tag: usize) -> Option<Self> {
        Self::try_from_primitive(u8::try_from(tag).ok()?).ok()
    }
}

/// The inner representation of a JavaScript symbol.
#[derive(Debug, Clone)]
pub(crate) struct RawJsSymbol {
    hash: u64,
    // must be a `Box`, since this needs to be shareable between many threads.
    description: Option<Box<[u16]>>,
}

/// This represents a JavaScript symbol primitive.
#[derive(Trace, Finalize, JsData)]
// Safety: JsSymbol does not contain any objects which needs to be traced,
// so this is safe.
#[boa_gc(unsafe_empty_trace)]
#[allow(clippy::module_name_repetitions)]
pub struct JsSymbol {
    repr: Tagged<RawJsSymbol>,
}

// SAFETY: `JsSymbol` uses `Arc` to do the reference counting, making this type thread-safe.
unsafe impl Send for JsSymbol {}
// SAFETY: `JsSymbol` uses `Arc` to do the reference counting, making this type thread-safe.
unsafe impl Sync for JsSymbol {}

macro_rules! well_known_symbols {
    ( $( $(#[$attr:meta])* ($name:ident, $variant:path) ),+$(,)? ) => {
        $(
            $(#[$attr])* #[must_use] pub const fn $name() -> JsSymbol {
                JsSymbol {
                    // the cast shouldn't matter since we only have 127 const symbols
                    repr: Tagged::from_tag($variant.hash() as usize),
                }
            }
        )+
    };
}

impl JsSymbol {
    /// Creates a new symbol.
    ///
    /// Returns `None` if the maximum number of possible symbols has been reached (`u64::MAX`).
    #[inline]
    #[must_use]
    pub fn new(description: Option<JsString>) -> Option<Self> {
        let hash = get_id()?;
        let arc = Arc::new(RawJsSymbol {
            hash,
            description: description.map(|s| s.iter().collect::<Vec<_>>().into_boxed_slice()),
        });

        Some(Self {
            // SAFETY: Pointers returned by `Arc::into_raw` must be non-null.
            repr: unsafe { Tagged::from_ptr(Arc::into_raw(arc).cast_mut()) },
        })
    }

    /// Returns the `Symbol` description.
    #[inline]
    #[must_use]
    pub fn description(&self) -> Option<JsString> {
        match self.repr.unwrap() {
            UnwrappedTagged::Ptr(ptr) => {
                // SAFETY: `ptr` comes from `Arc`, which ensures the validity of the pointer
                // as long as we correctly call `Arc::from_raw` on `Drop`.
                unsafe { ptr.as_ref().description.as_ref().map(|v| js_string!(&**v)) }
            }
            UnwrappedTagged::Tag(tag) => {
                // SAFETY: All tagged reprs always come from `WellKnown` itself, making
                // this operation always safe.
                let wk = unsafe { WellKnown::from_tag(tag).unwrap_unchecked() };
                Some(wk.description())
            }
        }
    }

    /// Returns the `Symbol` as a function name.
    ///
    /// Equivalent to `[description]`, but returns the empty string if the symbol doesn't have a
    /// description.
    #[inline]
    #[must_use]
    pub fn fn_name(&self) -> JsString {
        if let UnwrappedTagged::Tag(tag) = self.repr.unwrap() {
            // SAFETY: All tagged reprs always come from `WellKnown` itself, making
            // this operation always safe.
            let wk = unsafe { WellKnown::from_tag(tag).unwrap_unchecked() };
            return wk.fn_name();
        }
        self.description()
            .map(|s| js_string!(js_str!("["), &s, js_str!("]")))
            .unwrap_or_default()
    }

    /// Returns the `Symbol`s hash.
    ///
    /// The hash is guaranteed to be unique.
    #[inline]
    #[must_use]
    pub fn hash(&self) -> u64 {
        match self.repr.unwrap() {
            UnwrappedTagged::Ptr(ptr) => {
                // SAFETY: `ptr` comes from `Arc`, which ensures the validity of the pointer
                // as long as we correctly call `Arc::from_raw` on `Drop`.
                unsafe { ptr.as_ref().hash }
            }
            UnwrappedTagged::Tag(tag) => {
                // SAFETY: All tagged reprs always come from `WellKnown` itself, making
                // this operation always safe.
                unsafe { WellKnown::from_tag(tag).unwrap_unchecked().hash() }
            }
        }
    }

    /// Abstract operation `SymbolDescriptiveString ( sym )`
    ///
    /// More info:
    /// - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-symboldescriptivestring
    #[must_use]
    pub fn descriptive_string(&self) -> JsString {
        self.description().as_ref().map_or_else(
            || js_string!("Symbol()"),
            |desc| js_string!(js_str!("Symbol("), desc, js_str!(")")),
        )
    }

    /// Consumes the [`JsSymbol`], returning a pointer to `RawJsSymbol`.
    ///
    /// To avoid a memory leak the pointer must be converted back to a `JsSymbol` using
    /// [`JsSymbol::from_raw`].
    #[inline]
    #[must_use]
    #[allow(unused, reason = "only used in nan-boxed implementation of JsValue")]
    pub(crate) fn into_raw(self) -> NonNull<RawJsSymbol> {
        ManuallyDrop::new(self).repr.as_inner_ptr()
    }

    /// Constructs a `JsSymbol` from a pointer to `RawJsSymbol`.
    ///
    /// The raw pointer must have been previously returned by a call to
    /// [`JsSymbol::into_raw`].
    ///
    /// # Safety
    ///
    /// This function is unsafe because improper use may lead to memory unsafety,
    /// even if the returned `JsSymbol` is never accessed.
    #[inline]
    #[must_use]
    #[allow(unused, reason = "only used in nan-boxed implementation of JsValue")]
    pub(crate) unsafe fn from_raw(ptr: NonNull<RawJsSymbol>) -> Self {
        Self {
            repr: Tagged::from_non_null(ptr),
        }
    }

    well_known_symbols! {
        /// Gets the static `JsSymbol` for `"Symbol.asyncIterator"`.
        (async_iterator, WellKnown::AsyncIterator),
        /// Gets the static `JsSymbol` for `"Symbol.hasInstance"`.
        (has_instance, WellKnown::HasInstance),
        /// Gets the static `JsSymbol` for `"Symbol.isConcatSpreadable"`.
        (is_concat_spreadable, WellKnown::IsConcatSpreadable),
        /// Gets the static `JsSymbol` for `"Symbol.iterator"`.
        (iterator, WellKnown::Iterator),
        /// Gets the static `JsSymbol` for `"Symbol.match"`.
        (r#match, WellKnown::Match),
        /// Gets the static `JsSymbol` for `"Symbol.matchAll"`.
        (match_all, WellKnown::MatchAll),
        /// Gets the static `JsSymbol` for `"Symbol.replace"`.
        (replace, WellKnown::Replace),
        /// Gets the static `JsSymbol` for `"Symbol.search"`.
        (search, WellKnown::Search),
        /// Gets the static `JsSymbol` for `"Symbol.species"`.
        (species, WellKnown::Species),
        /// Gets the static `JsSymbol` for `"Symbol.split"`.
        (split, WellKnown::Split),
        /// Gets the static `JsSymbol` for `"Symbol.toPrimitive"`.
        (to_primitive, WellKnown::ToPrimitive),
        /// Gets the static `JsSymbol` for `"Symbol.toStringTag"`.
        (to_string_tag, WellKnown::ToStringTag),
        /// Gets the static `JsSymbol` for `"Symbol.unscopables"`.
        (unscopables, WellKnown::Unscopables),
        /// Gets the static `JsSymbol` for `"Symbol.dispose"`.
        (dispose, WellKnown::Dispose),
        /// Gets the static `JsSymbol` for `"Symbol.asyncDispose"`.
        (async_dispose, WellKnown::AsyncDispose),
    }
}

impl Clone for JsSymbol {
    fn clone(&self) -> Self {
        if let UnwrappedTagged::Ptr(ptr) = self.repr.unwrap() {
            // SAFETY: the pointer returned by `self.repr` must be a valid pointer
            // that came from an `Arc::into_raw` call.
            unsafe {
                let arc = Arc::from_raw(ptr.as_ptr().cast_const());
                // Don't need the Arc since `self` is already a copyable pointer, just need to
                // trigger the `clone` impl.
                std::mem::forget(arc.clone());
                std::mem::forget(arc);
            }
        }
        Self { repr: self.repr }
    }
}

impl Drop for JsSymbol {
    fn drop(&mut self) {
        if let UnwrappedTagged::Ptr(ptr) = self.repr.unwrap() {
            // SAFETY: the pointer returned by `self.repr` must be a valid pointer
            // that came from an `Arc::into_raw` call.
            unsafe { drop(Arc::from_raw(ptr.as_ptr().cast_const())) }
        }
    }
}

impl std::fmt::Debug for JsSymbol {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("JsSymbol")
            .field("hash", &self.hash())
            .field("description", &self.description())
            .finish()
    }
}

impl std::fmt::Display for JsSymbol {
    #[inline]
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match &self.description() {
            Some(desc) => write!(f, "Symbol({})", desc.to_std_string_escaped()),
            None => write!(f, "Symbol()"),
        }
    }
}

impl Eq for JsSymbol {}

impl PartialEq for JsSymbol {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        self.hash() == other.hash()
    }
}

impl PartialOrd for JsSymbol {
    #[inline]
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for JsSymbol {
    #[inline]
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.hash().cmp(&other.hash())
    }
}

impl Hash for JsSymbol {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.hash().hash(state);
    }
}

#[cfg(test)]
mod tests {
    use boa_macros::js_str;

    use crate::{
        Context, JsObject, JsValue, TestAction, builtins::Json, run_test_actions, string::JsString,
        value::TryIntoJs,
    };

    use super::JsSymbol;
    use std::collections::hash_set::HashSet;

    #[test]
    fn unique() {
        let max_loop_iterations = 100;
        let mut set: HashSet<JsSymbol> = HashSet::new();
        for _ in 0..max_loop_iterations {
            let symbol = JsSymbol::new(None);
            if let Some(symbol) = symbol {
                assert!(set.insert(symbol), "JsSymbol already exists in the set");
            } else {
                panic!("JsSymbol::new() failed when creating up to {max_loop_iterations} symbols");
            }
        }
    }

    #[test]
    fn hidden_in_enumeration() {
        let mut context = Context::default();
        let symbol1 = JsSymbol::new(None).unwrap();
        let symbol2 = JsSymbol::new(None).unwrap();
        let test_obj = JsObject::from_proto_and_data(None, ());
        test_obj
            .set(symbol1, js_str!("Can't see me"), false, &mut context)
            .unwrap();
        test_obj
            .set(js_str!("visible"), true, false, &mut context)
            .unwrap();
        test_obj
            .set(symbol2, js_str!("Still can't see me"), false, &mut context)
            .unwrap();
        let values = test_obj
            .enumerable_own_property_names(crate::property::PropertyNameKind::Value, &mut context)
            .expect("Test data should be enumerable");
        assert!(
            values.len() == 1,
            "Test data should have exactly one enumerable value, instead found {}",
            values.len()
        );
    }

    #[test]
    fn hidden_in_stringify() {
        let mut context = Context::default();
        let symbol = JsSymbol::new(None).unwrap();
        let test_obj = JsObject::with_object_proto(context.intrinsics());
        test_obj
            .set(symbol, js_str!("This won't show up"), false, &mut context)
            .unwrap();
        let json = test_obj
            .try_into_js(&mut context)
            .expect("try_into_js() failed");
        let json_str = Json::stringify(&JsValue::from(0), &[json], &mut context)
            .expect("Json::stringify() failed")
            .as_string()
            .expect("Json::stringify() did not return string");
        assert_eq!(js_str!("{}"), json_str);
    }
    #[test]
    fn type_conversions() {
        run_test_actions([
            TestAction::assert_eq(
                r#"
            let symbol = Symbol("symbol");
            typeof symbol
        "#,
                js_str!("symbol"),
            ),
            TestAction::assert(
                r#"
            symbol == Object(symbol)
        "#,
            ),
        ]);
    }

    #[test]
    fn new_with_description() {
        let sym = JsSymbol::new(Some(crate::js_string!("foo"))).unwrap();
        assert_eq!(
            sym.description()
                .as_ref()
                .map(JsString::to_std_string_escaped),
            Some(String::from("foo"))
        );
    }

    #[test]
    fn new_without_description() {
        let sym = JsSymbol::new(None).unwrap();
        assert!(sym.description().is_none());
    }

    #[test]
    fn fn_name_with_description() {
        let sym = JsSymbol::new(Some(crate::js_string!("hello"))).unwrap();
        assert_eq!(sym.fn_name().to_std_string_escaped(), "[hello]");
    }

    #[test]
    fn fn_name_without_description() {
        let sym = JsSymbol::new(None).unwrap();
        assert_eq!(sym.fn_name().to_std_string_escaped(), "");
    }

    #[test]
    fn fn_name_well_known() {
        let sym = JsSymbol::iterator();
        assert_eq!(sym.fn_name().to_std_string_escaped(), "[Symbol.iterator]");
    }

    #[test]
    fn descriptive_string_with_description() {
        let sym = JsSymbol::new(Some(crate::js_string!("foo"))).unwrap();
        assert_eq!(
            sym.descriptive_string().to_std_string_escaped(),
            "Symbol(foo)"
        );
    }

    #[test]
    fn descriptive_string_without_description() {
        let sym = JsSymbol::new(None).unwrap();
        assert_eq!(sym.descriptive_string().to_std_string_escaped(), "Symbol()");
    }

    #[test]
    fn well_known_symbols_description() {
        let cases = [
            (JsSymbol::async_iterator(), "Symbol.asyncIterator"),
            (JsSymbol::has_instance(), "Symbol.hasInstance"),
            (
                JsSymbol::is_concat_spreadable(),
                "Symbol.isConcatSpreadable",
            ),
            (JsSymbol::iterator(), "Symbol.iterator"),
            (JsSymbol::r#match(), "Symbol.match"),
            (JsSymbol::match_all(), "Symbol.matchAll"),
            (JsSymbol::replace(), "Symbol.replace"),
            (JsSymbol::search(), "Symbol.search"),
            (JsSymbol::species(), "Symbol.species"),
            (JsSymbol::split(), "Symbol.split"),
            (JsSymbol::to_primitive(), "Symbol.toPrimitive"),
            (JsSymbol::to_string_tag(), "Symbol.toStringTag"),
            (JsSymbol::unscopables(), "Symbol.unscopables"),
        ];
        for (sym, expected_desc) in &cases {
            assert_eq!(
                sym.description()
                    .as_ref()
                    .map(JsString::to_std_string_escaped),
                Some(String::from(*expected_desc)),
                "Well-known symbol description mismatch for {expected_desc}"
            );
        }
    }

    #[test]
    fn well_known_symbols_are_equal() {
        assert_eq!(JsSymbol::iterator(), JsSymbol::iterator());
        assert_eq!(JsSymbol::async_iterator(), JsSymbol::async_iterator());
    }

    #[test]
    fn well_known_symbols_different_from_user() {
        let user_sym = JsSymbol::new(Some(crate::js_string!("Symbol.iterator"))).unwrap();
        assert_ne!(user_sym, JsSymbol::iterator());
    }

    #[test]
    fn clone_preserves_identity() {
        let sym = JsSymbol::new(Some(crate::js_string!("cloned"))).unwrap();
        let cloned = sym.clone();
        assert_eq!(sym, cloned);
        assert_eq!(sym.hash(), cloned.hash());
        assert_eq!(
            sym.description()
                .as_ref()
                .map(JsString::to_std_string_escaped),
            cloned
                .description()
                .as_ref()
                .map(JsString::to_std_string_escaped)
        );
    }

    #[test]
    fn clone_well_known_preserves_identity() {
        let sym = JsSymbol::iterator();
        let cloned = sym.clone();
        assert_eq!(sym, cloned);
    }

    #[test]
    fn display_formatting() {
        let sym_with_desc = JsSymbol::new(Some(crate::js_string!("test"))).unwrap();
        assert_eq!(format!("{sym_with_desc}"), "Symbol(test)");

        let sym_without_desc = JsSymbol::new(None).unwrap();
        assert_eq!(format!("{sym_without_desc}"), "Symbol()");
    }

    #[test]
    fn debug_formatting() {
        let sym = JsSymbol::new(Some(crate::js_string!("dbg"))).unwrap();
        let debug_str = format!("{sym:?}");
        assert!(debug_str.contains("JsSymbol"));
        assert!(debug_str.contains("hash"));
        assert!(debug_str.contains("description"));
    }

    #[test]
    fn ordering() {
        let sym_a = JsSymbol::new(None).unwrap();
        let sym_b = JsSymbol::new(None).unwrap();
        // sym_a was created first, so it should have a smaller hash
        assert!(sym_a < sym_b);
        assert!(sym_b > sym_a);
        assert_eq!(sym_a.cmp(&sym_a), std::cmp::Ordering::Equal);
    }

    #[test]
    fn hash_consistency() {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let sym = JsSymbol::new(Some(crate::js_string!("hashme"))).unwrap();
        let cloned = sym.clone();

        let mut hasher1 = DefaultHasher::new();
        Hash::hash(&sym, &mut hasher1);
        let hash1 = hasher1.finish();

        let mut hasher2 = DefaultHasher::new();
        Hash::hash(&cloned, &mut hasher2);
        let hash2 = hasher2.finish();

        assert_eq!(
            hash1, hash2,
            "Hash trait should produce consistent results for equal symbols"
        );
    }
}
