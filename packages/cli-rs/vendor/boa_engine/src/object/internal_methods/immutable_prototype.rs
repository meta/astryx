use crate::{
    Context, JsResult,
    object::{JsObject, JsPrototype},
};

use super::{InternalObjectMethods, ORDINARY_INTERNAL_METHODS};

/// Definitions of the internal object methods for [**Immutable Prototype Exotic Objects**][spec].
///
/// [spec]: https://tc39.es/ecma262/#sec-immutable-prototype-exotic-objects
pub(crate) static IMMUTABLE_PROTOTYPE_EXOTIC_INTERNAL_METHODS: InternalObjectMethods =
    InternalObjectMethods {
        __set_prototype_of__: immutable_prototype_exotic_set_prototype_of,
        ..ORDINARY_INTERNAL_METHODS
    };

/// [`[[SetPrototypeOf]] ( V )`][spec].
///
/// [spec]: https://tc39.es/ecma262/#sec-immutable-prototype-exotic-objects-setprototypeof-v
#[allow(clippy::needless_pass_by_value)]
pub(crate) fn immutable_prototype_exotic_set_prototype_of(
    obj: &JsObject,
    val: JsPrototype,
    context: &mut Context,
) -> JsResult<bool> {
    // 1. Return ? SetImmutablePrototype(O, V).

    // inlined since other implementations can just use `set_prototype_of` directly.

    // SetImmutablePrototype ( O, V )
    // <https://tc39.es/ecma262/#sec-set-immutable-prototype>

    // 1. Let current be ? O.[[GetPrototypeOf]]().
    let current = obj.__get_prototype_of__(context)?;

    // 2. If SameValue(V, current) is true, return true.
    // 3. Return false.
    Ok(val == current)
}
