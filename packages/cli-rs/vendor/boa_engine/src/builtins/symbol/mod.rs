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

#[cfg(test)]
mod tests;

use std::{hash::BuildHasherDefault, sync::LazyLock};

use crate::{
    Context, JsArgs, JsResult, JsString,
    builtins::BuiltInObject,
    context::intrinsics::{Intrinsics, StandardConstructor, StandardConstructors},
    error::JsNativeError,
    js_string,
    object::JsObject,
    property::Attribute,
    realm::Realm,
    string::StaticJsStrings,
    symbol::JsSymbol,
    value::JsValue,
};
use dashmap::DashMap;
use rustc_hash::FxHasher;

use super::{BuiltInBuilder, BuiltInConstructor, IntrinsicObject};

static GLOBAL_SYMBOL_REGISTRY: LazyLock<GlobalSymbolRegistry> =
    LazyLock::new(GlobalSymbolRegistry::new);

type FxDashMap<K, V> = DashMap<K, V, BuildHasherDefault<FxHasher>>;

// We previously used `JsString` instead of `Box<[u16]>` for this, but since the glocal symbol
// registry needed to be global, we had to either make `JsString` thread-safe or directly store
// its info into the registry. `JsSymbol` is already a pretty niche feature of JS, and we expect only
// advanced users to utilize it. On the other hand, almost every JS programmer uses `JsString`s, and
// the first option would impact performance for all `JsString`s in general. For those reasons, we
// opted for the second option, but we should try to optimize this in the future.
struct GlobalSymbolRegistry {
    keys: FxDashMap<Box<[u16]>, JsSymbol>,
    symbols: FxDashMap<JsSymbol, Box<[u16]>>,
}

impl GlobalSymbolRegistry {
    fn new() -> Self {
        Self {
            keys: FxDashMap::default(),
            symbols: FxDashMap::default(),
        }
    }

    fn get_or_create_symbol(&self, key: &JsString) -> JsResult<JsSymbol> {
        let slice = key.iter().collect::<Vec<_>>();
        if let Some(symbol) = self.keys.get(&slice[..]) {
            return Ok(symbol.clone());
        }

        let symbol = JsSymbol::new(Some(key.clone())).ok_or_else(|| {
            JsNativeError::range()
                .with_message("reached the maximum number of symbols that can be created")
        })?;
        self.keys
            .insert(slice.clone().into_boxed_slice(), symbol.clone());
        self.symbols
            .insert(symbol.clone(), slice.into_boxed_slice());
        Ok(symbol)
    }

    fn get_key(&self, sym: &JsSymbol) -> Option<JsString> {
        if let Some(key) = self.symbols.get(sym) {
            return Some(js_string!(&**key));
        }

        None
    }
}

/// The internal representation of a `Symbol` object.
#[derive(Debug, Clone, Copy)]
pub struct Symbol;

impl IntrinsicObject for Symbol {
    fn init(realm: &Realm) {
        let symbol_async_iterator = JsSymbol::async_iterator();
        let symbol_has_instance = JsSymbol::has_instance();
        let symbol_is_concat_spreadable = JsSymbol::is_concat_spreadable();
        let symbol_iterator = JsSymbol::iterator();
        let symbol_match = JsSymbol::r#match();
        let symbol_match_all = JsSymbol::match_all();
        let symbol_replace = JsSymbol::replace();
        let symbol_search = JsSymbol::search();
        let symbol_species = JsSymbol::species();
        let symbol_split = JsSymbol::split();
        let symbol_to_primitive = JsSymbol::to_primitive();
        let symbol_to_string_tag = JsSymbol::to_string_tag();
        let symbol_unscopables = JsSymbol::unscopables();
        let symbol_dispose = JsSymbol::dispose();
        let symbol_async_dispose = JsSymbol::async_dispose();

        let attribute = Attribute::READONLY | Attribute::NON_ENUMERABLE | Attribute::PERMANENT;

        let to_primitive = BuiltInBuilder::callable(realm, Self::to_primitive)
            .name(js_string!("[Symbol.toPrimitive]"))
            .length(1)
            .build();

        let get_description = BuiltInBuilder::callable(realm, Self::get_description)
            .name(js_string!("get description"))
            .build();

        BuiltInBuilder::from_standard_constructor::<Self>(realm)
            .static_method(Self::for_, js_string!("for"), 1)
            .static_method(Self::key_for, js_string!("keyFor"), 1)
            .static_property(
                js_string!("asyncIterator"),
                symbol_async_iterator,
                attribute,
            )
            .static_property(js_string!("hasInstance"), symbol_has_instance, attribute)
            .static_property(
                js_string!("isConcatSpreadable"),
                symbol_is_concat_spreadable,
                attribute,
            )
            .static_property(js_string!("iterator"), symbol_iterator, attribute)
            .static_property(js_string!("match"), symbol_match, attribute)
            .static_property(js_string!("matchAll"), symbol_match_all, attribute)
            .static_property(js_string!("replace"), symbol_replace, attribute)
            .static_property(js_string!("search"), symbol_search, attribute)
            .static_property(js_string!("species"), symbol_species, attribute)
            .static_property(js_string!("split"), symbol_split, attribute)
            .static_property(
                js_string!("toPrimitive"),
                symbol_to_primitive.clone(),
                attribute,
            )
            .static_property(
                js_string!("toStringTag"),
                symbol_to_string_tag.clone(),
                attribute,
            )
            .static_property(js_string!("unscopables"), symbol_unscopables, attribute)
            .static_property(js_string!("dispose"), symbol_dispose, attribute)
            .static_property(js_string!("asyncDispose"), symbol_async_dispose, attribute)
            .method(Self::to_string, js_string!("toString"), 0)
            .method(Self::value_of, js_string!("valueOf"), 0)
            .accessor(
                js_string!("description"),
                Some(get_description),
                None,
                Attribute::CONFIGURABLE | Attribute::NON_ENUMERABLE,
            )
            .property(
                symbol_to_string_tag,
                Self::NAME,
                Attribute::READONLY | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .property(
                symbol_to_primitive,
                to_primitive,
                Attribute::READONLY | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .build();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        Self::STANDARD_CONSTRUCTOR(intrinsics.constructors()).constructor()
    }
}

impl BuiltInObject for Symbol {
    const NAME: JsString = StaticJsStrings::SYMBOL;
}

impl BuiltInConstructor for Symbol {
    const CONSTRUCTOR_ARGUMENTS: usize = 0;
    const PROTOTYPE_STORAGE_SLOTS: usize = 6;
    const CONSTRUCTOR_STORAGE_SLOTS: usize = 17;

    const STANDARD_CONSTRUCTOR: fn(&StandardConstructors) -> &StandardConstructor =
        StandardConstructors::symbol;

    /// The `Symbol()` constructor returns a value of type symbol.
    ///
    /// It is incomplete as a constructor because it does not support
    /// the syntax `new Symbol()` and it is not intended to be subclassed.
    ///
    /// More information:
    /// - [ECMAScript reference][spec]
    /// - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-symbol-description
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol/Symbol
    fn constructor(
        new_target: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. If NewTarget is not undefined, throw a TypeError exception.
        if !new_target.is_undefined() {
            return Err(JsNativeError::typ()
                .with_message("Symbol is not a constructor")
                .into());
        }

        // 2. If description is undefined, let descString be undefined.
        // 3. Else, let descString be ? ToString(description).
        let description = match args.first() {
            Some(value) if !value.is_undefined() => Some(value.to_string(context)?),
            _ => None,
        };

        // 4. Return a new unique Symbol value whose [[Description]] value is descString.
        Ok(JsSymbol::new(description)
            .ok_or_else(|| {
                JsNativeError::range()
                    .with_message("reached the maximum number of symbols that can be created")
            })?
            .into())
    }
}

impl Symbol {
    fn this_symbol_value(value: &JsValue) -> JsResult<JsSymbol> {
        value
            .as_symbol()
            .or_else(|| {
                value
                    .as_object()
                    .and_then(|obj| obj.downcast_ref::<JsSymbol>().as_deref().cloned())
            })
            .ok_or_else(|| {
                JsNativeError::typ()
                    .with_message("'this' is not a Symbol")
                    .into()
            })
    }

    /// `Symbol.prototype.toString()`
    ///
    /// This method returns a string representing the specified `Symbol` object.
    ///
    /// More information:
    /// - [MDN documentation][mdn]
    /// - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-symbol.prototype.tostring
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol/toString
    #[allow(clippy::wrong_self_convention)]
    pub(crate) fn to_string(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Let sym be ? thisSymbolValue(this value).
        let symbol = Self::this_symbol_value(this)?;

        // 2. Return SymbolDescriptiveString(sym).
        Ok(symbol.descriptive_string().into())
    }

    /// `Symbol.prototype.valueOf()`
    ///
    /// This method returns a `Symbol` that is the primitive value of the specified `Symbol` object.
    ///
    /// More information:
    /// - [MDN documentation][mdn]
    /// - [ECMAScript reference][spec]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol/valueOf
    /// [spec]: https://tc39.es/ecma262/#sec-symbol.prototype.valueof
    pub(crate) fn value_of(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Return ? thisSymbolValue(this value).
        let symbol = Self::this_symbol_value(this)?;
        Ok(symbol.into())
    }

    /// `get Symbol.prototype.description`
    ///
    /// This accessor returns the description of the `Symbol` object.
    ///
    /// More information:
    /// - [MDN documentation][mdn]
    /// - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-symbol.prototype.description
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol/description
    pub(crate) fn get_description(
        this: &JsValue,
        _: &[JsValue],
        _: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let s be the this value.
        // 2. Let sym be ? thisSymbolValue(s).
        let sym = Self::this_symbol_value(this)?;

        // 3. Return sym.[[Description]].
        Ok(sym
            .description()
            .map_or(JsValue::undefined(), JsValue::from))
    }

    /// `Symbol.for( key )`
    ///
    /// More information:
    /// - [MDN documentation][mdn]
    /// - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-symbol.prototype.for
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol/for
    pub(crate) fn for_(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let stringKey be ? ToString(key).
        let string_key = args
            .first()
            .cloned()
            .unwrap_or_default()
            .to_string(context)?;
        // 2. For each element e of the GlobalSymbolRegistry List, do
        //     a. If SameValue(e.[[Key]], stringKey) is true, return e.[[Symbol]].
        // 3. Assert: GlobalSymbolRegistry does not currently contain an entry for stringKey.
        // 4. Let newSymbol be a new unique Symbol value whose [[Description]] value is stringKey.
        // 5. Append the Record { [[Key]]: stringKey, [[Symbol]]: newSymbol } to the GlobalSymbolRegistry List.
        // 6. Return newSymbol.
        GLOBAL_SYMBOL_REGISTRY
            .get_or_create_symbol(&string_key)
            .map(JsValue::from)
    }

    /// `Symbol.keyFor( sym )`
    ///
    ///
    /// More information:
    /// - [MDN documentation][mdn]
    /// - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-symbol.prototype.keyfor
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol/keyFor
    pub(crate) fn key_for(_: &JsValue, args: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. If Type(sym) is not Symbol, throw a TypeError exception.
        let sym = args.get_or_undefined(0).as_symbol().ok_or_else(|| {
            JsNativeError::typ().with_message("Symbol.keyFor: sym is not a symbol")
        })?;

        // 2. For each element e of the GlobalSymbolRegistry List (see 20.4.2.2), do
        //     a. If SameValue(e.[[Symbol]], sym) is true, return e.[[Key]].
        // 3. Assert: GlobalSymbolRegistry does not currently contain an entry for sym.
        // 4. Return undefined.

        Ok(GLOBAL_SYMBOL_REGISTRY
            .get_key(&sym)
            .map(JsValue::from)
            .unwrap_or_default())
    }

    /// `Symbol.prototype [ @@toPrimitive ]`
    ///
    /// This function is called by ECMAScript language operators to convert a Symbol object to a primitive value.
    /// NOTE: The argument is ignored
    ///
    /// More information:
    /// - [MDN documentation][mdn]
    /// - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/multipage/#sec-symbol.prototype-@@toprimitive
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol/@@toPrimitive
    pub(crate) fn to_primitive(
        this: &JsValue,
        _: &[JsValue],
        _: &mut Context,
    ) -> JsResult<JsValue> {
        let sym = Self::this_symbol_value(this)?;
        // 1. Return ? thisSymbolValue(this value).
        Ok(sym.into())
    }
}
