//! This module implements the `JsObject` structure.
//!
//! The `JsObject` is a garbage collected Object.

use super::{
    JsPrototype, NativeObject, Object, ObjectData, PrivateName, PropertyMap,
    internal_methods::{InternalObjectMethods, ORDINARY_INTERNAL_METHODS},
    shape::RootShape,
};
use crate::{
    Context, JsData, JsResult, JsString, JsSymbol, JsValue,
    builtins::{
        array::ARRAY_EXOTIC_INTERNAL_METHODS,
        array_buffer::{ArrayBuffer, BufferObject, SharedArrayBuffer},
        object::OrdinaryObject,
    },
    context::intrinsics::Intrinsics,
    error::JsNativeError,
    js_error, js_string,
    property::{PropertyDescriptor, PropertyKey},
    value::PreferredType,
};
use boa_gc::{self, Finalize, Gc, GcRef, GcRefCell, GcRefMut, Trace};
use core::ptr::fn_addr_eq;
use std::collections::HashSet;
use std::{
    cell::RefCell,
    collections::HashMap,
    error::Error,
    fmt::{self, Debug, Display},
    hash::Hash,
    result::Result as StdResult,
};
use thin_vec::ThinVec;

#[cfg(not(feature = "jsvalue-enum"))]
use boa_gc::GcBox;

#[cfg(not(feature = "jsvalue-enum"))]
use std::ptr::NonNull;

/// A wrapper type for an immutably borrowed type T.
pub type Ref<'a, T> = GcRef<'a, T>;

/// A wrapper type for a mutably borrowed type T.
pub type RefMut<'a, T> = GcRefMut<'a, T>;

pub(crate) type ErasedVTableObject = VTableObject<ErasedObjectData>;

/// An `Object` with inner data set to `ErasedObjectData`.
pub type ErasedObject = Object<ErasedObjectData>;

/// A erased object data type that must never be used directly.
#[derive(Debug, Trace, Finalize)]
pub struct ErasedObjectData {}

impl JsData for ErasedObjectData {}

/// Garbage collected `Object`.
#[derive(Trace, Finalize)]
#[boa_gc(unsafe_no_drop)]
pub struct JsObject<T: NativeObject = ErasedObjectData> {
    inner: Gc<VTableObject<T>>,
}

impl<T: NativeObject> Clone for JsObject<T> {
    fn clone(&self) -> Self {
        Self {
            inner: self.inner.clone(),
        }
    }
}

/// An `Object` that has an additional `vtable` with its internal methods.
// We have to skip implementing `Debug` for this because not using the
// implementation of `Debug` for `JsObject` could easily cause stack overflows,
// so we have to force our users to debug the `JsObject` instead.
#[allow(missing_debug_implementations)]
#[derive(Trace, Finalize)]
pub(crate) struct VTableObject<T: NativeObject + ?Sized> {
    #[unsafe_ignore_trace]
    vtable: &'static InternalObjectMethods,
    object: GcRefCell<Object<T>>,
}

impl JsObject {
    /// Converts the `JsObject` into a raw pointer to its inner `GcBox<ErasedVTableObject>`.
    #[cfg(not(feature = "jsvalue-enum"))]
    pub(crate) fn into_raw(self) -> NonNull<GcBox<ErasedVTableObject>> {
        Gc::into_raw(self.inner)
    }

    /// Creates a new `JsObject` from a raw pointer.
    ///
    /// # Safety
    /// The caller must ensure that the pointer is valid and points to a `GcBox<ErasedVTableObject>`.
    /// The pointer must not be null.
    #[cfg(not(feature = "jsvalue-enum"))]
    pub(crate) unsafe fn from_raw(raw: NonNull<GcBox<ErasedVTableObject>>) -> Self {
        // SAFETY: The caller guaranteed the value to be a valid pointer to a `GcBox<ErasedVTableObject>`.
        let inner = unsafe { Gc::from_raw(raw) };

        JsObject { inner }
    }

    /// Creates a new ordinary object with its prototype set to the `Object` prototype.
    ///
    /// This is an alias for [`Self::with_object_proto`].
    ///
    /// # Examples
    ///
    /// ```
    /// # use boa_engine::{Context, JsObject};
    /// let context = &mut Context::default();
    /// let obj = JsObject::default(context.intrinsics());
    ///
    /// assert!(obj.is_ordinary());
    /// ```
    #[inline]
    #[must_use]
    pub fn default(intrinsics: &Intrinsics) -> Self {
        Self::with_object_proto(intrinsics)
    }

    /// Creates a new `JsObject` from its inner object and its vtable.
    pub(crate) fn from_object_and_vtable<T: NativeObject>(
        object: Object<T>,
        vtable: &'static InternalObjectMethods,
    ) -> Self {
        let inner = Gc::new(VTableObject {
            object: GcRefCell::new(object),
            vtable,
        });

        JsObject { inner }.upcast()
    }

    /// Creates a new ordinary object with its prototype set to the `Object` prototype.
    ///
    /// This is equivalent to calling the specification's abstract operation
    /// [`OrdinaryObjectCreate(%Object.prototype%)`][call].
    ///
    /// [call]: https://tc39.es/ecma262/#sec-ordinaryobjectcreate
    ///
    /// # Examples
    ///
    /// ```
    /// # use boa_engine::{Context, JsObject};
    /// let context = &mut Context::default();
    /// let obj = JsObject::with_object_proto(context.intrinsics());
    ///
    /// assert!(obj.is_ordinary());
    /// assert!(obj.prototype().is_some());
    /// ```
    #[inline]
    #[must_use]
    pub fn with_object_proto(intrinsics: &Intrinsics) -> Self {
        Self::from_proto_and_data(
            intrinsics.constructors().object().prototype(),
            OrdinaryObject,
        )
    }

    /// Creates a new ordinary object, with its prototype set to null.
    ///
    /// This is equivalent to calling the specification's abstract operation
    /// [`OrdinaryObjectCreate(null)`][call].
    ///
    /// [call]: https://tc39.es/ecma262/#sec-ordinaryobjectcreate
    ///
    /// # Examples
    ///
    /// ```
    /// # use boa_engine::JsObject;
    /// let obj = JsObject::with_null_proto();
    /// assert!(obj.prototype().is_none());
    /// assert!(obj.is_ordinary());
    /// ```
    #[inline]
    #[must_use]
    pub fn with_null_proto() -> Self {
        Self::from_proto_and_data(None, OrdinaryObject)
    }

    /// Creates a new object with the provided prototype and object data.
    ///
    /// This is equivalent to calling the specification's abstract operation [`OrdinaryObjectCreate`],
    /// with the difference that the `additionalInternalSlotsList` parameter is determined by
    /// the provided `data`.
    ///
    /// [`OrdinaryObjectCreate`]: https://tc39.es/ecma262/#sec-ordinaryobjectcreate
    ///
    /// # Examples
    ///
    /// ```
    /// # use boa_engine::{Context, JsObject};
    /// # use boa_engine::builtins::object::OrdinaryObject;
    /// let context = &mut Context::default();
    /// let obj = JsObject::from_proto_and_data(
    ///     context.intrinsics().constructors().object().prototype(),
    ///     OrdinaryObject,
    /// );
    ///
    /// assert!(obj.is_ordinary());
    /// assert!(obj.prototype().is_some());
    ///
    /// // Create an object with no prototype.
    /// let null_obj = JsObject::from_proto_and_data(None, OrdinaryObject);
    /// assert!(null_obj.prototype().is_none());
    /// ```
    pub fn from_proto_and_data<O: Into<Option<Self>>, T: NativeObject>(
        prototype: O,
        data: T,
    ) -> Self {
        let internal_methods = data.internal_methods();
        let inner = Gc::new(VTableObject {
            object: GcRefCell::new(Object {
                data: ObjectData::new(data),
                properties: PropertyMap::from_prototype_unique_shape(prototype.into()),
                extensible: true,
                private_elements: ThinVec::new(),
            }),
            vtable: internal_methods,
        });

        JsObject { inner }.upcast()
    }

    /// Creates a new object with the provided prototype and object data.
    ///
    /// This is equivalent to calling the specification's abstract operation [`OrdinaryObjectCreate`],
    /// with the difference that the `additionalInternalSlotsList` parameter is determined by
    /// the provided `data`.
    ///
    /// [`OrdinaryObjectCreate`]: https://tc39.es/ecma262/#sec-ordinaryobjectcreate
    pub(crate) fn from_proto_and_data_with_shared_shape<O: Into<Option<Self>>, T: NativeObject>(
        root_shape: &RootShape,
        prototype: O,
        data: T,
    ) -> JsObject<T> {
        let internal_methods = data.internal_methods();
        let inner = Gc::new(VTableObject {
            object: GcRefCell::new(Object {
                data: ObjectData::new(data),
                properties: PropertyMap::from_prototype_with_shared_shape(
                    root_shape,
                    prototype.into(),
                ),
                extensible: true,
                private_elements: ThinVec::new(),
            }),
            vtable: internal_methods,
        });

        JsObject { inner }
    }

    /// Downcasts the object's inner data if the object is of type `T`.
    ///
    /// # Panics
    ///
    /// Panics if the object is currently mutably borrowed.
    ///
    /// # Examples
    ///
    /// ```
    /// # use boa_engine::{JsObject, JsData, Trace, Finalize};
    /// # use boa_engine::builtins::object::OrdinaryObject;
    /// #[derive(Debug, Trace, Finalize, JsData)]
    /// struct CustomStruct;
    ///
    /// let obj = JsObject::from_proto_and_data(None, OrdinaryObject);
    ///
    /// // Downcast consumes the object on success.
    /// let typed = obj.downcast::<OrdinaryObject>();
    /// assert!(typed.is_ok());
    ///
    /// // Downcast fails for a wrong type, returning the original object.
    /// let obj = JsObject::from_proto_and_data(None, OrdinaryObject);
    /// let result = obj.downcast::<CustomStruct>();
    /// assert!(result.is_err());
    /// ```
    pub fn downcast<T: NativeObject>(self) -> Result<JsObject<T>, Self> {
        if self.is::<T>() {
            // SAFETY: We have verified that the object is of type `T`, so we can safely cast it.
            let object = unsafe { self.downcast_unchecked::<T>() };

            Ok(object)
        } else {
            Err(self)
        }
    }

    /// Downcasts the object's inner data to `T` without verifying the inner type of `T`.
    ///
    /// # Safety
    ///
    /// For this cast to be sound, `self` must contain an instance of `T` inside its inner data.
    #[must_use]
    pub unsafe fn downcast_unchecked<T: NativeObject>(self) -> JsObject<T> {
        // SAFETY: The caller guarantees `T` is the original inner data type of the underlying
        // object.
        // The pointer is guaranteed to be valid because we just created it.
        // `VTableObject<ErasedObjectData>` and `VTableObject<T>` have the same size and alignment.
        let inner = unsafe { Gc::cast_unchecked::<VTableObject<T>>(self.inner) };

        JsObject { inner }
    }

    /// Downcasts a reference to the object,
    /// if the object is of type `T`.
    ///
    /// # Panics
    ///
    /// Panics if the object is currently mutably borrowed.
    ///
    /// # Examples
    ///
    /// ```
    /// # use boa_engine::{JsObject, JsData, Trace, Finalize};
    /// # use boa_engine::builtins::object::OrdinaryObject;
    /// #[derive(Debug, Trace, Finalize, JsData)]
    /// struct CustomStruct;
    ///
    /// let obj = JsObject::from_proto_and_data(None, OrdinaryObject);
    ///
    /// // Downcast ref succeeds for the correct type.
    /// assert!(obj.downcast_ref::<OrdinaryObject>().is_some());
    ///
    /// // Returns `None` for a wrong type.
    /// assert!(obj.downcast_ref::<CustomStruct>().is_none());
    /// ```
    #[must_use]
    #[track_caller]
    pub fn downcast_ref<T: NativeObject>(&self) -> Option<Ref<'_, T>> {
        if self.is::<T>() {
            let obj = self.borrow();

            // SAFETY: We have verified that the object is of type `T`, so we can safely cast it.
            let obj = unsafe { GcRef::cast::<Object<T>>(obj) };

            return Some(Ref::map(obj, |r| r.data()));
        }
        None
    }

    /// Downcasts a mutable reference to the object,
    /// if the object is type native object type `T`.
    ///
    /// # Panics
    ///
    /// Panics if the object is currently borrowed.
    ///
    /// # Examples
    ///
    /// ```
    /// # use boa_engine::{JsObject, JsData, Trace, Finalize};
    /// # use boa_engine::builtins::object::OrdinaryObject;
    /// #[derive(Debug, Trace, Finalize, JsData)]
    /// struct CustomStruct;
    ///
    /// let obj = JsObject::from_proto_and_data(None, OrdinaryObject);
    ///
    /// // Downcast mut succeeds for the correct type.
    /// assert!(obj.downcast_mut::<OrdinaryObject>().is_some());
    ///
    /// // Returns `None` for a wrong type.
    /// assert!(obj.downcast_mut::<CustomStruct>().is_none());
    /// ```
    #[must_use]
    #[track_caller]
    pub fn downcast_mut<T: NativeObject>(&self) -> Option<RefMut<'_, T>> {
        if self.is::<T>() {
            let obj = self.borrow_mut();

            // SAFETY: We have verified that the object is of type `T`, so we can safely cast it.
            let obj = unsafe { GcRefMut::cast::<Object<T>>(obj) };

            return Some(RefMut::map(obj, |c| c.data_mut()));
        }
        None
    }

    /// Checks if this object is an instance of a certain `NativeObject`.
    ///
    /// # Panics
    ///
    /// Panics if the object is currently mutably borrowed.
    ///
    /// # Examples
    ///
    /// ```
    /// # use boa_engine::{JsObject, JsData, Trace, Finalize};
    /// # use boa_engine::builtins::object::OrdinaryObject;
    /// #[derive(Debug, Trace, Finalize, JsData)]
    /// struct CustomStruct;
    ///
    /// let obj = JsObject::from_proto_and_data(None, OrdinaryObject);
    ///
    /// assert!(obj.is::<OrdinaryObject>());
    /// assert!(!obj.is::<CustomStruct>());
    /// ```
    #[inline]
    #[must_use]
    #[track_caller]
    pub fn is<T: NativeObject>(&self) -> bool {
        Gc::is::<VTableObject<T>>(&self.inner)
    }

    /// Checks if it's an ordinary object.
    ///
    /// # Panics
    ///
    /// Panics if the object is currently mutably borrowed.
    ///
    /// # Examples
    ///
    /// ```
    /// # use boa_engine::{Context, JsObject};
    /// let context = &mut Context::default();
    /// let obj = JsObject::with_object_proto(context.intrinsics());
    ///
    /// assert!(obj.is_ordinary());
    /// ```
    #[inline]
    #[must_use]
    #[track_caller]
    pub fn is_ordinary(&self) -> bool {
        self.is::<OrdinaryObject>()
    }

    /// Checks if it's an `Array` object.
    ///
    /// # Examples
    ///
    /// ```
    /// # use boa_engine::{Context, JsObject, JsValue ,JsResult};
    /// # use boa_engine::object::builtins::JsArray;
    /// # fn main() -> JsResult<()> {
    /// let context = &mut Context::default();
    ///
    /// let array = JsArray::new(context)?;
    /// // A JsArray's inner JsObject is an array.
    /// assert!(JsObject::from(array).is_array());
    ///
    /// // An ordinary object is not an array.
    /// let obj = JsObject::with_object_proto(context.intrinsics());
    /// assert!(!obj.is_array());
    /// # Ok(())
    /// # }
    /// ```
    #[inline]
    #[must_use]
    #[track_caller]
    pub fn is_array(&self) -> bool {
        std::ptr::eq(self.vtable(), &raw const ARRAY_EXOTIC_INTERNAL_METHODS)
    }

    /// The inner implementation of `deep_strict_equals`, which keeps a list of values we've
    /// seen to avoid recursive objects.
    pub(crate) fn deep_strict_equals_inner(
        lhs: &Self,
        rhs: &Self,
        encounters: &mut HashSet<usize>,
        context: &mut Context,
    ) -> JsResult<bool> {
        // Loop through all the keys and if one is not equal, return false.
        fn key_loop(
            lhs: &JsObject,
            rhs: &JsObject,
            encounters: &mut HashSet<usize>,
            context: &mut Context,
        ) -> JsResult<bool> {
            let l_keys = lhs.own_property_keys(context)?;
            let r_keys = rhs.own_property_keys(context)?;

            if l_keys.len() != r_keys.len() {
                return Ok(false);
            }

            for key in &l_keys {
                let vl = lhs.get_property(key);
                let vr = rhs.get_property(key);

                match (vl, vr) {
                    (None, None) => {}
                    (Some(vl), Some(vr)) => match (vl.value(), vr.value()) {
                        (None, None) => {}
                        (Some(lv), Some(rv)) => {
                            if !lv.deep_strict_equals_inner(rv, encounters, context)? {
                                return Ok(false);
                            }
                        }
                        _ => {
                            return Ok(false);
                        }
                    },
                    _ => {
                        return Ok(false);
                    }
                }
            }
            Ok(true)
        }

        let addr_l = std::ptr::from_ref::<Self>(lhs) as usize;
        let addr_r = std::ptr::from_ref::<Self>(rhs) as usize;

        if addr_r == addr_l {
            return Ok(true);
        }

        let contains_l = encounters.contains(&addr_l);
        let contains_r = encounters.contains(&addr_r);
        if contains_l || contains_r {
            return Ok(false);
        }

        encounters.insert(addr_l);
        encounters.insert(addr_r);

        // Make sure we clean up after the recursion.
        let result = key_loop(lhs, rhs, encounters, context);
        encounters.remove(&addr_l);
        encounters.remove(&addr_r);
        result
    }

    /// Checks that all own property keys and values are equal (recursively).
    ///
    /// # Examples
    ///
    /// ```
    /// # use boa_engine::{Context, JsObject, JsResult, js_string};
    /// # fn main() -> JsResult<()> {
    /// let context = &mut Context::default();
    ///
    /// let obj1 = JsObject::with_object_proto(context.intrinsics());
    /// obj1.set(js_string!("key"), 42, false, context)?;
    ///
    /// let obj2 = JsObject::with_object_proto(context.intrinsics());
    /// obj2.set(js_string!("key"), 42, false, context)?;
    ///
    /// assert!(JsObject::deep_strict_equals(&obj1, &obj2, context)?);
    /// # Ok(())
    /// # }
    /// ```
    #[inline]
    pub fn deep_strict_equals(lhs: &Self, rhs: &Self, context: &mut Context) -> JsResult<bool> {
        Self::deep_strict_equals_inner(lhs, rhs, &mut HashSet::new(), context)
    }

    /// The abstract operation `ToPrimitive` takes an input argument and an optional argument
    /// `PreferredType`.
    ///
    /// <https://tc39.es/ecma262/#sec-toprimitive>
    pub fn to_primitive(
        &self,
        context: &mut Context,
        preferred_type: PreferredType,
    ) -> JsResult<JsValue> {
        // a. Let exoticToPrim be ? GetMethod(input, @@toPrimitive).
        let Some(exotic_to_prim) = self.get_method(JsSymbol::to_primitive(), context)? else {
            // c. If preferredType is not present, let preferredType be number.
            let preferred_type = match preferred_type {
                PreferredType::Default | PreferredType::Number => PreferredType::Number,
                PreferredType::String => PreferredType::String,
            };
            return self.ordinary_to_primitive(context, preferred_type);
        };

        // b. If exoticToPrim is not undefined, then
        //    i. If preferredType is not present, let hint be "default".
        //    ii. Else if preferredType is string, let hint be "string".
        //    iii. Else,
        //        1. Assert: preferredType is number.
        //        2. Let hint be "number".
        let hint = match preferred_type {
            PreferredType::Default => js_string!("default"),
            PreferredType::String => js_string!("string"),
            PreferredType::Number => js_string!("number"),
        }
        .into();

        //    iv. Let result be ? Call(exoticToPrim, input, « hint »).
        let result = exotic_to_prim.call(&self.clone().into(), &[hint], context)?;

        //    v. If Type(result) is not Object, return result.
        //    vi. Throw a TypeError exception.
        if result.is_object() {
            Err(js_error!(
                TypeError: "method `[Symbol.toPrimitive]` cannot return an object"
            ))
        } else {
            Ok(result)
        }
    }

    /// Converts an object to a primitive.
    ///
    /// Diverges from the spec to prevent a stack overflow when the object is recursive.
    /// For example,
    /// ```javascript
    /// let a = [1];
    /// a[1] = a;
    /// console.log(a.toString()); // We print "1,"
    /// ```
    /// The spec doesn't mention what to do in this situation, but a naive implementation
    /// would overflow the stack recursively calling `toString()`. We follow v8 and SpiderMonkey
    /// instead by returning a default value for the given `hint` -- either `0.` or `""`.
    /// Example in v8: <https://repl.it/repls/IvoryCircularCertification#index.js>
    ///
    /// More information:
    ///  - [ECMAScript][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-ordinarytoprimitive
    pub(crate) fn ordinary_to_primitive(
        &self,
        context: &mut Context,
        hint: PreferredType,
    ) -> JsResult<JsValue> {
        // 1. Assert: Type(O) is Object.
        //      Already is JsObject by type.
        // 2. Assert: Type(hint) is String and its value is either "string" or "number".
        debug_assert!(hint == PreferredType::String || hint == PreferredType::Number);

        // Diverge from the spec here to make sure we aren't going to overflow the stack by converting
        // a recursive structure
        // We can follow v8 & SpiderMonkey's lead and return a default value for the hint in this situation
        // (see https://repl.it/repls/IvoryCircularCertification#index.js)
        let recursion_limiter = RecursionLimiter::new(self.as_ref());
        if recursion_limiter.live {
            // we're in a recursive object, bail
            return Ok(match hint {
                PreferredType::Number => JsValue::new(0),
                PreferredType::String => JsValue::new(js_string!()),
                PreferredType::Default => unreachable!("checked type hint in step 2"),
            });
        }

        // 3. If hint is "string", then
        //    a. Let methodNames be « "toString", "valueOf" ».
        // 4. Else,
        //    a. Let methodNames be « "valueOf", "toString" ».
        let method_names = if hint == PreferredType::String {
            [js_string!("toString"), js_string!("valueOf")]
        } else {
            [js_string!("valueOf"), js_string!("toString")]
        };

        // 5. For each name in methodNames in List order, do
        for name in method_names {
            // a. Let method be ? Get(O, name).
            let method = self.get(name, context)?;

            // b. If IsCallable(method) is true, then
            if let Some(method) = method.as_callable() {
                // i. Let result be ? Call(method, O).
                let result = method.call(&self.clone().into(), &[], context)?;

                // ii. If Type(result) is not Object, return result.
                if !result.is_object() {
                    return Ok(result);
                }
            }
        }

        // 6. Throw a TypeError exception.
        Err(JsNativeError::typ()
            .with_message("cannot convert object to primitive value")
            .into())
    }

    /// The abstract operation `ToPropertyDescriptor`.
    ///
    /// More information:
    /// - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-topropertydescriptor
    pub fn to_property_descriptor(&self, context: &mut Context) -> JsResult<PropertyDescriptor> {
        // 1 is implemented on the method `to_property_descriptor` of value

        // 2. Let desc be a new Property Descriptor that initially has no fields.
        let mut desc = PropertyDescriptor::builder();

        // 3. Let hasEnumerable be ? HasProperty(Obj, "enumerable").
        // 4. If hasEnumerable is true, then ...
        if let Some(enumerable) = self.try_get(js_string!("enumerable"), context)? {
            // a. Let enumerable be ! ToBoolean(? Get(Obj, "enumerable")).
            // b. Set desc.[[Enumerable]] to enumerable.
            desc = desc.enumerable(enumerable.to_boolean());
        }

        // 5. Let hasConfigurable be ? HasProperty(Obj, "configurable").
        // 6. If hasConfigurable is true, then ...
        if let Some(configurable) = self.try_get(js_string!("configurable"), context)? {
            // a. Let configurable be ! ToBoolean(? Get(Obj, "configurable")).
            // b. Set desc.[[Configurable]] to configurable.
            desc = desc.configurable(configurable.to_boolean());
        }

        // 7. Let hasValue be ? HasProperty(Obj, "value").
        // 8. If hasValue is true, then ...
        if let Some(value) = self.try_get(js_string!("value"), context)? {
            // a. Let value be ? Get(Obj, "value").
            // b. Set desc.[[Value]] to value.
            desc = desc.value(value);
        }

        // 9. Let hasWritable be ? HasProperty(Obj, ).
        // 10. If hasWritable is true, then ...
        if let Some(writable) = self.try_get(js_string!("writable"), context)? {
            // a. Let writable be ! ToBoolean(? Get(Obj, "writable")).
            // b. Set desc.[[Writable]] to writable.
            desc = desc.writable(writable.to_boolean());
        }

        // 11. Let hasGet be ? HasProperty(Obj, "get").
        // 12. If hasGet is true, then
        // 12.a. Let getter be ? Get(Obj, "get").
        let get = if let Some(getter) = self.try_get(js_string!("get"), context)? {
            // b. If IsCallable(getter) is false and getter is not undefined, throw a TypeError exception.
            // todo: extract IsCallable to be callable from Value
            if !getter.is_undefined() && getter.as_object().is_none_or(|o| !o.is_callable()) {
                return Err(JsNativeError::typ()
                    .with_message("Property descriptor getter must be callable")
                    .into());
            }
            // c. Set desc.[[Get]] to getter.
            Some(getter)
        } else {
            None
        };

        // 13. Let hasSet be ? HasProperty(Obj, "set").
        // 14. If hasSet is true, then
        // 14.a. Let setter be ? Get(Obj, "set").
        let set = if let Some(setter) = self.try_get(js_string!("set"), context)? {
            // 14.b. If IsCallable(setter) is false and setter is not undefined, throw a TypeError exception.
            // todo: extract IsCallable to be callable from Value
            if !setter.is_undefined() && setter.as_object().is_none_or(|o| !o.is_callable()) {
                return Err(JsNativeError::typ()
                    .with_message("Property descriptor setter must be callable")
                    .into());
            }
            // 14.c. Set desc.[[Set]] to setter.
            Some(setter)
        } else {
            None
        };

        // 15. If desc.[[Get]] is present or desc.[[Set]] is present, then ...
        // a. If desc.[[Value]] is present or desc.[[Writable]] is present, throw a TypeError exception.
        if get.as_ref().or(set.as_ref()).is_some() && desc.inner().is_data_descriptor() {
            return Err(JsNativeError::typ()
                .with_message(
                    "Invalid property descriptor.\
Cannot both specify accessors and a value or writable attribute",
                )
                .into());
        }

        desc = desc.maybe_get(get).maybe_set(set);

        // 16. Return desc.
        Ok(desc.build())
    }

    // Allow lint, false positive.
    #[allow(clippy::assigning_clones)]
    pub(crate) fn get_property(&self, key: &PropertyKey) -> Option<PropertyDescriptor> {
        let mut obj = Some(self.clone());

        while let Some(o) = obj {
            if let Some(v) = o.borrow().properties.get(key) {
                return Some(v);
            }
            obj = o.borrow().prototype().clone();
        }
        None
    }

    /// Casts to a `BufferObject` if the object is an `ArrayBuffer` or a `SharedArrayBuffer`.
    #[inline]
    pub(crate) fn into_buffer_object(self) -> Result<BufferObject, JsObject> {
        match self.downcast::<ArrayBuffer>() {
            Ok(buffer) => Ok(BufferObject::Buffer(buffer)),
            Err(object) => object
                .downcast::<SharedArrayBuffer>()
                .map(BufferObject::SharedBuffer),
        }
    }
}

impl<T: NativeObject> JsObject<T> {
    /// Immutably borrows the `Object`.
    ///
    /// The borrow lasts until the returned `Ref` exits scope.
    /// Multiple immutable borrows can be taken out at the same time.
    ///
    /// # Panics
    ///
    /// Panics if the object is currently mutably borrowed.
    ///
    /// # Examples
    ///
    /// ```
    /// # use boa_engine::JsObject;
    /// # use boa_engine::builtins::object::OrdinaryObject;
    /// let obj = JsObject::from_proto_and_data(None, OrdinaryObject);
    ///
    /// // Multiple immutable borrows are allowed.
    /// let borrowed = obj.borrow();
    /// assert!(borrowed.prototype().is_none());
    /// ```
    #[inline]
    #[must_use]
    #[track_caller]
    pub fn borrow(&self) -> Ref<'_, Object<T>> {
        self.try_borrow().expect("Object already mutably borrowed")
    }

    /// Mutably borrows the Object.
    ///
    /// The borrow lasts until the returned `RefMut` exits scope.
    /// The object cannot be borrowed while this borrow is active.
    ///
    /// # Panics
    /// Panics if the object is currently borrowed.
    ///
    /// # Examples
    ///
    /// ```
    /// # use boa_engine::{Context, JsObject};
    /// # use boa_engine::builtins::object::OrdinaryObject;
    /// let context = &mut Context::default();
    /// let obj = JsObject::from_proto_and_data(
    ///     context.intrinsics().constructors().object().prototype(),
    ///     OrdinaryObject,
    /// );
    ///
    /// // Set the prototype to `None` via a mutable borrow.
    /// obj.borrow_mut().set_prototype(None);
    /// assert!(obj.prototype().is_none());
    /// ```
    #[inline]
    #[must_use]
    #[track_caller]
    pub fn borrow_mut(&self) -> RefMut<'_, Object<T>> {
        self.try_borrow_mut().expect("Object already borrowed")
    }

    /// Immutably borrows the `Object`, returning an error if the value is currently mutably borrowed.
    ///
    /// The borrow lasts until the returned `GcCellRef` exits scope.
    /// Multiple immutable borrows can be taken out at the same time.
    ///
    /// This is the non-panicking variant of [`borrow`](#method.borrow).
    ///
    /// # Examples
    ///
    /// ```
    /// # use boa_engine::JsObject;
    /// # use boa_engine::builtins::object::OrdinaryObject;
    /// let obj = JsObject::from_proto_and_data(None, OrdinaryObject);
    ///
    /// // Non-panicking immutable borrow.
    /// let result = obj.try_borrow();
    /// assert!(result.is_ok());
    /// ```
    #[inline]
    pub fn try_borrow(&self) -> StdResult<Ref<'_, Object<T>>, BorrowError> {
        self.inner.object.try_borrow().map_err(|_| BorrowError)
    }

    /// Mutably borrows the object, returning an error if the value is currently borrowed.
    ///
    /// The borrow lasts until the returned `GcCellRefMut` exits scope.
    /// The object be borrowed while this borrow is active.
    ///
    /// This is the non-panicking variant of [`borrow_mut`](#method.borrow_mut).
    ///
    /// # Examples
    ///
    /// ```
    /// # use boa_engine::JsObject;
    /// # use boa_engine::builtins::object::OrdinaryObject;
    /// let obj = JsObject::from_proto_and_data(None, OrdinaryObject);
    ///
    /// // Non-panicking mutable borrow.
    /// let result = obj.try_borrow_mut();
    /// assert!(result.is_ok());
    /// ```
    #[inline]
    pub fn try_borrow_mut(&self) -> StdResult<RefMut<'_, Object<T>>, BorrowMutError> {
        self.inner
            .object
            .try_borrow_mut()
            .map_err(|_| BorrowMutError)
    }

    /// Checks if the garbage collected memory is the same.
    ///
    /// # Examples
    ///
    /// ```
    /// # use boa_engine::JsObject;
    /// # use boa_engine::builtins::object::OrdinaryObject;
    /// let obj = JsObject::from_proto_and_data(None, OrdinaryObject);
    /// let clone = obj.clone();
    ///
    /// // A clone points to the same GC allocation.
    /// assert!(JsObject::equals(&obj, &clone));
    ///
    /// // A separate object is different, even with identical data.
    /// let other = JsObject::from_proto_and_data(None, OrdinaryObject);
    /// assert!(!JsObject::equals(&obj, &other));
    /// ```
    #[must_use]
    #[inline]
    pub fn equals(lhs: &Self, rhs: &Self) -> bool {
        Gc::ptr_eq(lhs.inner(), rhs.inner())
    }

    /// Get the prototype of the object.
    ///
    /// # Panics
    ///
    /// Panics if the object is currently mutably borrowed.
    ///
    /// # Examples
    ///
    /// ```
    /// # use boa_engine::{Context, JsObject};
    /// let context = &mut Context::default();
    ///
    /// let obj = JsObject::with_object_proto(context.intrinsics());
    /// assert!(obj.prototype().is_some());
    ///
    /// let null_obj = JsObject::with_null_proto();
    /// assert!(null_obj.prototype().is_none());
    /// ```
    #[inline]
    #[must_use]
    #[track_caller]
    pub fn prototype(&self) -> JsPrototype {
        self.borrow().prototype()
    }

    /// Get the extensibility of the object.
    ///
    /// # Panics
    ///
    /// Panics if the object is currently mutably borrowed.
    pub(crate) fn extensible(&self) -> bool {
        self.borrow().extensible
    }

    /// Set the prototype of the object.
    ///
    /// # Panics
    ///
    /// Panics if the object is currently mutably borrowed
    ///
    /// # Examples
    ///
    /// ```
    /// # use boa_engine::{Context, JsObject};
    /// let context = &mut Context::default();
    /// let obj = JsObject::with_object_proto(context.intrinsics());
    ///
    /// assert!(obj.prototype().is_some());
    ///
    /// // Set the prototype to `None`.
    /// obj.set_prototype(None);
    /// assert!(obj.prototype().is_none());
    /// ```
    #[inline]
    #[track_caller]
    #[allow(clippy::must_use_candidate)]
    pub fn set_prototype(&self, prototype: JsPrototype) -> bool {
        self.borrow_mut().set_prototype(prototype)
    }

    /// Helper function for property insertion.
    #[track_caller]
    pub(crate) fn insert<K, P>(&self, key: K, property: P) -> bool
    where
        K: Into<PropertyKey>,
        P: Into<PropertyDescriptor>,
    {
        self.borrow_mut().insert(key, property)
    }

    /// Inserts a field in the object `properties` without checking if it's writable.
    ///
    /// If a field was already in the object with the same name, than `true` is returned
    /// with that field, otherwise `false` is returned.
    pub fn insert_property<K, P>(&self, key: K, property: P) -> bool
    where
        K: Into<PropertyKey>,
        P: Into<PropertyDescriptor>,
    {
        self.insert(key.into(), property)
    }

    /// It determines if Object is a callable function with a `[[Call]]` internal method.
    ///
    /// More information:
    /// - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-iscallable
    #[inline]
    #[must_use]
    pub fn is_callable(&self) -> bool {
        !fn_addr_eq(
            self.inner.vtable.__call__,
            ORDINARY_INTERNAL_METHODS.__call__,
        )
    }

    /// It determines if Object is a function object with a `[[Construct]]` internal method.
    ///
    /// More information:
    /// - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-isconstructor
    #[inline]
    #[must_use]
    pub fn is_constructor(&self) -> bool {
        !fn_addr_eq(
            self.inner.vtable.__construct__,
            ORDINARY_INTERNAL_METHODS.__construct__,
        )
    }

    pub(crate) fn vtable(&self) -> &'static InternalObjectMethods {
        self.inner.vtable
    }

    pub(crate) fn inner(&self) -> &Gc<VTableObject<T>> {
        &self.inner
    }

    pub(crate) fn from_inner(inner: Gc<VTableObject<T>>) -> Self {
        Self { inner }
    }

    /// Create a new private name with this object as the unique identifier.
    pub(crate) fn private_name(&self, description: JsString) -> PrivateName {
        let ptr: *const _ = self.as_ref();
        PrivateName::new(description, ptr.cast::<()>() as usize)
    }
}

impl<T: NativeObject> JsObject<T> {
    /// Creates a new `JsObject` from its root shape, prototype, and data.
    ///
    /// Note that the returned object will not be erased to be convertible to a
    /// `JsValue`. To erase the pointer, call [`JsObject::upcast`].
    ///
    /// # Examples
    ///
    /// ```
    /// # use boa_engine::{Context, JsObject};
    /// # use boa_engine::builtins::object::OrdinaryObject;
    /// let context = &mut Context::default();
    ///
    /// let typed_obj = JsObject::new(
    ///     context.root_shape(),
    ///     context.intrinsics().constructors().object().prototype(),
    ///     OrdinaryObject,
    /// );
    ///
    /// // Upcast to an erased JsObject to use with JsValue.
    /// let obj = typed_obj.upcast();
    /// assert!(obj.is_ordinary());
    /// ```
    pub fn new<O: Into<Option<JsObject>>>(root_shape: &RootShape, prototype: O, data: T) -> Self {
        let internal_methods = data.internal_methods();
        let inner = Gc::new(VTableObject {
            object: GcRefCell::new(Object {
                data: ObjectData::new(data),
                properties: PropertyMap::from_prototype_with_shared_shape(
                    root_shape,
                    prototype.into(),
                ),
                extensible: true,
                private_elements: ThinVec::new(),
            }),
            vtable: internal_methods,
        });

        Self { inner }
    }

    /// Creates a new `JsObject` from prototype, and data.
    ///
    /// Note that the returned object will not be erased to be convertible to a
    /// `JsValue`. To erase the pointer, call [`JsObject::upcast`].
    ///
    /// # Examples
    ///
    /// ```
    /// # use boa_engine::JsObject;
    /// # use boa_engine::builtins::object::OrdinaryObject;
    /// let typed_obj = JsObject::new_unique(None, OrdinaryObject);
    ///
    /// // Upcast to an erased JsObject.
    /// let obj = typed_obj.upcast();
    /// assert!(obj.is_ordinary());
    /// assert!(obj.prototype().is_none());
    /// ```
    pub fn new_unique<O: Into<Option<JsObject>>>(prototype: O, data: T) -> Self {
        let internal_methods = data.internal_methods();
        let inner = Gc::new(VTableObject {
            object: GcRefCell::new(Object {
                data: ObjectData::new(data),
                properties: PropertyMap::from_prototype_unique_shape(prototype.into()),
                extensible: true,
                private_elements: ThinVec::new(),
            }),
            vtable: internal_methods,
        });

        Self { inner }
    }

    /// Upcasts this object's inner data from a specific type `T` to an erased type
    /// `dyn NativeObject`.
    ///
    /// # Examples
    ///
    /// ```
    /// # use boa_engine::JsObject;
    /// # use boa_engine::builtins::object::OrdinaryObject;
    /// // Create a typed JsObject<OrdinaryObject>.
    /// let typed_obj = JsObject::new_unique(None, OrdinaryObject);
    ///
    /// // Upcast erases the type, producing an untyped JsObject.
    /// let obj: JsObject = typed_obj.upcast();
    /// assert!(obj.is_ordinary());
    /// ```
    #[must_use]
    pub fn upcast(self) -> JsObject {
        // SAFETY: The pointer is guaranteed to be valid.
        // `VTableObject<ErasedObjectData>` and `VTableObject<T>` have the same size and alignment.
        let inner = unsafe { Gc::cast_unchecked::<ErasedVTableObject>(self.inner) };

        JsObject { inner }
    }
}

impl<T: NativeObject> AsRef<GcRefCell<Object<T>>> for JsObject<T> {
    #[inline]
    fn as_ref(&self) -> &GcRefCell<Object<T>> {
        &self.inner.object
    }
}

impl<T: NativeObject> From<Gc<VTableObject<T>>> for JsObject<T> {
    #[inline]
    fn from(inner: Gc<VTableObject<T>>) -> Self {
        Self { inner }
    }
}

impl<T: NativeObject> PartialEq for JsObject<T> {
    fn eq(&self, other: &Self) -> bool {
        Self::equals(self, other)
    }
}

impl<T: NativeObject> Eq for JsObject<T> {}

impl<T: NativeObject> Hash for JsObject<T> {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        std::ptr::hash(self.as_ref(), state);
    }
}

/// An error returned by [`JsObject::try_borrow`](struct.JsObject.html#method.try_borrow).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct BorrowError;

impl Display for BorrowError {
    #[inline]
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt("Object already mutably borrowed", f)
    }
}

impl Error for BorrowError {}

/// An error returned by [`JsObject::try_borrow_mut`](struct.JsObject.html#method.try_borrow_mut).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct BorrowMutError;

impl Display for BorrowMutError {
    #[inline]
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt("Object already borrowed", f)
    }
}

impl Error for BorrowMutError {}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
enum RecursionValueState {
    /// This value is "live": there's an active `RecursionLimiter` that hasn't been dropped.
    Live,
    /// This value has been seen before, but the recursion limiter has been dropped.
    /// For example:
    /// ```javascript
    /// let b = [];
    /// JSON.stringify([ // Create a recursion limiter for the root here
    ///    b,            // state for b's &JsObject here is None
    ///    b,            // state for b's &JsObject here is Visited
    /// ]);
    /// ```
    Visited,
}

/// Prevents infinite recursion during `Debug::fmt`, `JSON.stringify`, and other conversions.
/// This uses a thread local, so is not safe to use where the object graph will be traversed by
/// multiple threads!
#[derive(Debug)]
pub struct RecursionLimiter {
    /// If this was the first `JsObject` in the tree.
    top_level: bool,
    /// The ptr being kept in the `HashSet`, so we can delete it when we drop.
    ptr: usize,
    /// If this `JsObject` has been visited before in the graph, but not in the current branch.
    pub visited: bool,
    /// If this `JsObject` has been visited in the current branch of the graph.
    pub live: bool,
}

impl Drop for RecursionLimiter {
    fn drop(&mut self) {
        if self.top_level {
            // When the top level of the graph is dropped, we can free the entire map for the next traversal.
            SEEN.with(|hm| hm.borrow_mut().clear());
        } else if !self.live {
            // This was the first RL for this object to become live, so it's no longer live now that it's dropped.
            SEEN.with(|hm| {
                hm.borrow_mut()
                    .insert(self.ptr, RecursionValueState::Visited)
            });
        }
    }
}

thread_local! {
    /// The map of pointers to `JsObject` that have been visited during the current `Debug::fmt` graph,
    /// and the current state of their RecursionLimiter (dropped or live -- see `RecursionValueState`)
    static SEEN: RefCell<HashMap<usize, RecursionValueState>> = RefCell::new(HashMap::new());
}

impl RecursionLimiter {
    /// Determines if the specified `T` has been visited, and returns a struct that will free it when dropped.
    ///
    /// This is done by maintaining a thread-local hashset containing the pointers of `T` values that have been
    /// visited. The first `T` visited will clear the hashset, while any others will check if they are contained
    /// by the hashset.
    pub fn new<T: ?Sized>(o: &T) -> Self {
        let ptr: *const _ = o;
        let ptr = ptr.cast::<()>() as usize;
        let (top_level, visited, live) = SEEN.with(|hm| {
            let mut hm = hm.borrow_mut();
            let top_level = hm.is_empty();
            let old_state = hm.insert(ptr, RecursionValueState::Live);

            (
                top_level,
                old_state == Some(RecursionValueState::Visited),
                old_state == Some(RecursionValueState::Live),
            )
        });

        Self {
            top_level,
            ptr,
            visited,
            live,
        }
    }
}

impl<T: NativeObject> Debug for JsObject<T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let limiter = RecursionLimiter::new(self.as_ref());

        // Typically, using `!limiter.live` would be good enough here.
        // However, the JS object hierarchy involves quite a bit of repetition, and the sheer amount of data makes
        // understanding the Debug output impossible; limiting the usefulness of it.
        //
        // Instead, we check if the object has appeared before in the entire graph. This means that objects will appear
        // at most once, hopefully making things a bit clearer.
        if !limiter.visited && !limiter.live {
            let ptr: *const _ = self.as_ref();
            let ptr = ptr.cast::<()>();
            let obj = self.borrow();
            let kind = obj.data().type_name_of_value();
            if self.is_callable() {
                let name_prop = obj
                    .properties()
                    .get(&PropertyKey::String(js_string!("name")));
                let name = match name_prop {
                    None => JsString::default(),
                    Some(prop) => prop
                        .value()
                        .and_then(JsValue::as_string)
                        .unwrap_or_default(),
                };

                return f.write_fmt(format_args!("({:?}) {:?} 0x{:X}", kind, name, ptr as usize));
            }

            f.write_fmt(format_args!("({:?}) 0x{:X}", kind, ptr as usize))
        } else {
            f.write_str("{ ... }")
        }
    }
}
