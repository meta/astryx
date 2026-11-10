//! A Rust API wrapper for the `Proxy` Builtin ECMAScript Object
use super::JsFunction;
use crate::{
    Context, JsExpect, JsNativeError, JsResult, JsValue,
    builtins::Proxy,
    js_string,
    native_function::{NativeFunction, NativeFunctionPointer},
    object::{FunctionObjectBuilder, JsObject},
    value::TryFromJs,
};
use boa_gc::{Finalize, Trace};

/// `JsProxy` provides a wrapper for Boa's implementation of the ECMAScript `Proxy` object
///
/// This is a wrapper type for the [`Proxy`][proxy] API that allows customizing
/// essential behaviour for an object, like [property accesses][get] or the
/// [`delete`][delete] operator.
///
/// The only way to construct this type is to use the [`JsProxyBuilder`] type; also
/// accessible from [`JsProxy::builder`].
///
/// [get]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/get
/// [delete]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/deleteProperty
/// [proxy]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy
#[derive(Debug, Clone, Trace, Finalize)]
pub struct JsProxy {
    inner: JsObject,
}

impl JsProxy {
    /// Creates a new [`JsProxyBuilder`] to easily construct a [`JsProxy`].
    pub fn builder(target: JsObject) -> JsProxyBuilder {
        JsProxyBuilder::new(target)
    }

    /// Create a [`JsProxy`] from a [`JsObject`], if the object is not a `Proxy` throw a
    /// `TypeError`.
    #[inline]
    pub fn from_object(object: JsObject) -> JsResult<Self> {
        if object.is::<Proxy>() {
            Ok(Self { inner: object })
        } else {
            Err(JsNativeError::typ()
                .with_message("object is not a Proxy")
                .into())
        }
    }
}

impl From<JsProxy> for JsObject {
    #[inline]
    fn from(o: JsProxy) -> Self {
        o.inner.clone()
    }
}

impl From<JsProxy> for JsValue {
    #[inline]
    fn from(o: JsProxy) -> Self {
        o.inner.clone().into()
    }
}

impl std::ops::Deref for JsProxy {
    type Target = JsObject;

    #[inline]
    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

impl TryFromJs for JsProxy {
    fn try_from_js(value: &JsValue, _context: &mut Context) -> JsResult<Self> {
        if let Some(o) = value.as_object() {
            Self::from_object(o.clone())
        } else {
            Err(JsNativeError::typ()
                .with_message("value is not a Proxy object")
                .into())
        }
    }
}

/// `JsRevocableProxy` provides a wrapper for `JsProxy` that can be disabled.
///
/// Safe interface for the [`Proxy.revocable`][revocable] method that creates a
/// proxy that can be disabled using the [`JsRevocableProxy::revoke`] method.
/// The internal proxy is accessible using the [`Deref`][`std::ops::Deref`] operator.
///
/// The only way to construct this type is to use the [`JsProxyBuilder`] type; also
/// accessible from [`JsProxy::builder`]; with the [`JsProxyBuilder::build_revocable`]
/// method.
///
/// [proxy]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy
/// [revocable]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/revocable
#[derive(Debug, Trace, Finalize)]
pub struct JsRevocableProxy {
    proxy: JsProxy,
    revoker: JsFunction,
}

impl JsRevocableProxy {
    /// Disables the traps of the internal `proxy` object, essentially
    /// making it unusable and throwing `TypeError`s for all the traps.
    #[inline]
    pub fn revoke(self, context: &mut Context) -> JsResult<()> {
        self.revoker.call(&JsValue::undefined(), &[], context)?;
        Ok(())
    }
}

impl std::ops::Deref for JsRevocableProxy {
    type Target = JsProxy;

    #[inline]
    fn deref(&self) -> &Self::Target {
        &self.proxy
    }
}

/// Utility builder to create [`JsProxy`] objects from native functions.
///
/// This builder can be used when you need to create [`Proxy`] objects
/// from Rust instead of Javascript, which should generate faster
/// trap functions than its Javascript counterparts.
#[must_use]
#[derive(Clone)]
pub struct JsProxyBuilder {
    target: JsObject,
    apply: Option<NativeFunctionPointer>,
    construct: Option<NativeFunctionPointer>,
    define_property: Option<NativeFunctionPointer>,
    delete_property: Option<NativeFunctionPointer>,
    get: Option<NativeFunctionPointer>,
    get_own_property_descriptor: Option<NativeFunctionPointer>,
    get_prototype_of: Option<NativeFunctionPointer>,
    has: Option<NativeFunctionPointer>,
    is_extensible: Option<NativeFunctionPointer>,
    own_keys: Option<NativeFunctionPointer>,
    prevent_extensions: Option<NativeFunctionPointer>,
    set: Option<NativeFunctionPointer>,
    set_prototype_of: Option<NativeFunctionPointer>,
}

impl std::fmt::Debug for JsProxyBuilder {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        #[derive(Debug)]
        struct NativeFunction;
        f.debug_struct("ProxyBuilder")
            .field("target", &self.target)
            .field("apply", &self.apply.map(|_| NativeFunction))
            .field("construct", &self.construct.map(|_| NativeFunction))
            .field(
                "define_property",
                &self.define_property.map(|_| NativeFunction),
            )
            .field(
                "delete_property",
                &self.delete_property.map(|_| NativeFunction),
            )
            .field("get", &self.get.map(|_| NativeFunction))
            .field(
                "get_own_property_descriptor",
                &self.get_own_property_descriptor.map(|_| NativeFunction),
            )
            .field(
                "get_prototype_of",
                &self.get_prototype_of.map(|_| NativeFunction),
            )
            .field("has", &self.has.map(|_| NativeFunction))
            .field("is_extensible", &self.is_extensible.map(|_| NativeFunction))
            .field("own_keys", &self.own_keys.map(|_| NativeFunction))
            .field(
                "prevent_extensions",
                &self.prevent_extensions.map(|_| NativeFunction),
            )
            .field("set", &self.set.map(|_| NativeFunction))
            .field(
                "set_prototype_of",
                &self.set_prototype_of.map(|_| NativeFunction),
            )
            .finish()
    }
}

impl JsProxyBuilder {
    /// Create a new `ProxyBuilder` with every trap set to `undefined`.
    #[inline]
    pub fn new(target: JsObject) -> Self {
        Self {
            target,
            apply: None,
            construct: None,
            define_property: None,
            delete_property: None,
            get: None,
            get_own_property_descriptor: None,
            get_prototype_of: None,
            has: None,
            is_extensible: None,
            own_keys: None,
            prevent_extensions: None,
            set: None,
            set_prototype_of: None,
        }
    }

    /// Set the `apply` proxy trap to the specified native function.
    ///
    /// More information:
    ///
    /// - [MDN documentation][mdn]
    ///
    /// # Note
    ///
    /// If the `target` object is not a function, then `apply` will be ignored
    /// when trying to call the proxy, which will throw a type error.
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/apply
    #[inline]
    pub fn apply(mut self, apply: NativeFunctionPointer) -> Self {
        self.apply = Some(apply);
        self
    }

    /// Set the `construct` proxy trap to the specified native function.
    ///
    /// More information:
    ///
    /// - [MDN documentation][mdn]
    ///
    /// # Note
    ///
    /// If the `target` object is not a constructor, then `construct` will be ignored
    /// when trying to construct an object using the proxy, which will throw a type error.
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/construct
    #[inline]
    pub fn construct(mut self, construct: NativeFunctionPointer) -> Self {
        self.construct = Some(construct);
        self
    }

    /// Set the `defineProperty` proxy trap to the specified native function.
    ///
    /// More information:
    ///
    /// - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/defineProperty
    #[inline]
    pub fn define_property(mut self, define_property: NativeFunctionPointer) -> Self {
        self.define_property = Some(define_property);
        self
    }

    /// Set the `deleteProperty` proxy trap to the specified native function.
    ///
    /// More information:
    ///
    /// - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/deleteProperty
    #[inline]
    pub fn delete_property(mut self, delete_property: NativeFunctionPointer) -> Self {
        self.delete_property = Some(delete_property);
        self
    }

    /// Set the `get` proxy trap to the specified native function.
    ///
    /// More information:
    ///
    /// - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/get
    #[inline]
    pub fn get(mut self, get: NativeFunctionPointer) -> Self {
        self.get = Some(get);
        self
    }

    /// Set the `getOwnPropertyDescriptor` proxy trap to the specified native function.
    ///
    /// More information:
    ///
    /// - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/getOwnPropertyDescriptor
    #[inline]
    pub fn get_own_property_descriptor(
        mut self,
        get_own_property_descriptor: NativeFunctionPointer,
    ) -> Self {
        self.get_own_property_descriptor = Some(get_own_property_descriptor);
        self
    }

    /// Set the `getPrototypeOf` proxy trap to the specified native function.
    ///
    /// More information:
    ///
    /// - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/getPrototypeOf
    #[inline]
    pub fn get_prototype_of(mut self, get_prototype_of: NativeFunctionPointer) -> Self {
        self.get_prototype_of = Some(get_prototype_of);
        self
    }

    /// Set the `has` proxy trap to the specified native function.
    ///
    /// More information:
    ///
    /// - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/has
    #[inline]
    pub fn has(mut self, has: NativeFunctionPointer) -> Self {
        self.has = Some(has);
        self
    }

    /// Set the `isExtensible` proxy trap to the specified native function.
    ///
    /// More information:
    ///
    /// - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/isExtensible
    #[inline]
    pub fn is_extensible(mut self, is_extensible: NativeFunctionPointer) -> Self {
        self.is_extensible = Some(is_extensible);
        self
    }

    /// Set the `ownKeys` proxy trap to the specified native function.
    ///
    /// More information:
    ///
    /// - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/ownKeys
    #[inline]
    pub fn own_keys(mut self, own_keys: NativeFunctionPointer) -> Self {
        self.own_keys = Some(own_keys);
        self
    }

    /// Set the `preventExtensions` proxy trap to the specified native function.
    ///
    /// More information:
    ///
    /// - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/preventExtensions
    #[inline]
    pub fn prevent_extensions(mut self, prevent_extensions: NativeFunctionPointer) -> Self {
        self.prevent_extensions = Some(prevent_extensions);
        self
    }

    /// Set the `set` proxy trap to the specified native function.
    ///
    /// More information:
    ///
    /// - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/set
    #[inline]
    pub fn set(mut self, set: NativeFunctionPointer) -> Self {
        self.set = Some(set);
        self
    }

    /// Set the `setPrototypeOf` proxy trap to the specified native function.
    ///
    /// More information:
    ///
    /// - [MDN documentation][mdn]
    ///
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/Proxy/setPrototypeOf
    #[inline]
    pub fn set_prototype_of(mut self, set_prototype_of: NativeFunctionPointer) -> Self {
        self.set_prototype_of = Some(set_prototype_of);
        self
    }

    /// Build a [`JsObject`] of kind [`Proxy`].
    ///
    /// Equivalent to the `Proxy ( target, handler )` constructor, but returns a
    /// [`JsObject`] in case there's a need to manipulate the returned object
    /// inside Rust code.
    pub fn build(self, context: &mut Context) -> JsResult<JsProxy> {
        let handler = JsObject::with_object_proto(context.intrinsics());

        if let Some(apply) = self.apply {
            let f = FunctionObjectBuilder::new(context.realm(), NativeFunction::from_fn_ptr(apply))
                .length(3)
                .build();
            handler
                .create_data_property_or_throw(js_string!("apply"), f, context)
                .js_expect("new object should be writable")?;
        }
        if let Some(construct) = self.construct {
            let f =
                FunctionObjectBuilder::new(context.realm(), NativeFunction::from_fn_ptr(construct))
                    .length(3)
                    .build();
            handler
                .create_data_property_or_throw(js_string!("construct"), f, context)
                .js_expect("new object should be writable")?;
        }
        if let Some(define_property) = self.define_property {
            let f = FunctionObjectBuilder::new(
                context.realm(),
                NativeFunction::from_fn_ptr(define_property),
            )
            .length(3)
            .build();
            handler
                .create_data_property_or_throw(js_string!("defineProperty"), f, context)
                .js_expect("new object should be writable")?;
        }
        if let Some(delete_property) = self.delete_property {
            let f = FunctionObjectBuilder::new(
                context.realm(),
                NativeFunction::from_fn_ptr(delete_property),
            )
            .length(2)
            .build();
            handler
                .create_data_property_or_throw(js_string!("deleteProperty"), f, context)
                .js_expect("new object should be writable")?;
        }
        if let Some(get) = self.get {
            let f = FunctionObjectBuilder::new(context.realm(), NativeFunction::from_fn_ptr(get))
                .length(3)
                .build();
            handler
                .create_data_property_or_throw(js_string!("get"), f, context)
                .js_expect("new object should be writable")?;
        }
        if let Some(get_own_property_descriptor) = self.get_own_property_descriptor {
            let f = FunctionObjectBuilder::new(
                context.realm(),
                NativeFunction::from_fn_ptr(get_own_property_descriptor),
            )
            .length(2)
            .build();
            handler
                .create_data_property_or_throw(js_string!("getOwnPropertyDescriptor"), f, context)
                .js_expect("new object should be writable")?;
        }
        if let Some(get_prototype_of) = self.get_prototype_of {
            let f = FunctionObjectBuilder::new(
                context.realm(),
                NativeFunction::from_fn_ptr(get_prototype_of),
            )
            .length(1)
            .build();
            handler
                .create_data_property_or_throw(js_string!("getPrototypeOf"), f, context)
                .js_expect("new object should be writable")?;
        }
        if let Some(has) = self.has {
            let f = FunctionObjectBuilder::new(context.realm(), NativeFunction::from_fn_ptr(has))
                .length(2)
                .build();
            handler
                .create_data_property_or_throw(js_string!("has"), f, context)
                .js_expect("new object should be writable")?;
        }
        if let Some(is_extensible) = self.is_extensible {
            let f = FunctionObjectBuilder::new(
                context.realm(),
                NativeFunction::from_fn_ptr(is_extensible),
            )
            .length(1)
            .build();
            handler
                .create_data_property_or_throw(js_string!("isExtensible"), f, context)
                .js_expect("new object should be writable")?;
        }
        if let Some(own_keys) = self.own_keys {
            let f =
                FunctionObjectBuilder::new(context.realm(), NativeFunction::from_fn_ptr(own_keys))
                    .length(1)
                    .build();
            handler
                .create_data_property_or_throw(js_string!("ownKeys"), f, context)
                .js_expect("new object should be writable")?;
        }
        if let Some(prevent_extensions) = self.prevent_extensions {
            let f = FunctionObjectBuilder::new(
                context.realm(),
                NativeFunction::from_fn_ptr(prevent_extensions),
            )
            .length(1)
            .build();
            handler
                .create_data_property_or_throw(js_string!("preventExtensions"), f, context)
                .js_expect("new object should be writable")?;
        }
        if let Some(set) = self.set {
            let f = FunctionObjectBuilder::new(context.realm(), NativeFunction::from_fn_ptr(set))
                .length(4)
                .build();
            handler
                .create_data_property_or_throw(js_string!("set"), f, context)
                .js_expect("new object should be writable")?;
        }
        if let Some(set_prototype_of) = self.set_prototype_of {
            let f = FunctionObjectBuilder::new(
                context.realm(),
                NativeFunction::from_fn_ptr(set_prototype_of),
            )
            .length(2)
            .build();
            handler
                .create_data_property_or_throw(js_string!("setPrototypeOf"), f, context)
                .js_expect("new object should be writable")?;
        }

        let proxy = JsObject::from_proto_and_data_with_shared_shape(
            context.root_shape(),
            context.intrinsics().constructors().object().prototype(),
            Proxy::new(self.target, handler),
        )
        .upcast();

        Ok(JsProxy { inner: proxy })
    }

    /// Builds a [`JsObject`] of kind [`Proxy`] and a [`JsFunction`] that, when
    /// called, disables the proxy of the object.
    ///
    /// Equivalent to the `Proxy.revocable ( target, handler )` static method,
    /// but returns a [`JsObject`] for the proxy and a [`JsFunction`] for the
    /// revoker in case there's a need to manipulate the returned objects
    /// inside Rust code.
    pub fn build_revocable(self, context: &mut Context) -> JsResult<JsRevocableProxy> {
        let proxy = self.build(context)?;
        let revoker = Proxy::revoker(proxy.inner.clone(), context);

        Ok(JsRevocableProxy { proxy, revoker })
    }
}
