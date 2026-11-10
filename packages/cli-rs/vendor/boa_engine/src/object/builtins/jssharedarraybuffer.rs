//! A Rust API wrapper for Boa's `SharedArrayBuffer` Builtin ECMAScript Object
use crate::{
    Context, JsResult, JsValue,
    builtins::array_buffer::{SharedArrayBuffer, utils::SliceRef},
    error::JsNativeError,
    object::JsObject,
    value::TryFromJs,
};
use boa_gc::{Finalize, Trace};
use std::{ops::Deref, sync::atomic::Ordering};

/// `JsSharedArrayBuffer` provides a wrapper for Boa's implementation of the ECMAScript `ArrayBuffer` object
#[derive(Debug, Clone, Trace, Finalize)]
#[boa_gc(unsafe_no_drop)]
pub struct JsSharedArrayBuffer {
    inner: JsObject<SharedArrayBuffer>,
}

impl From<JsSharedArrayBuffer> for JsObject<SharedArrayBuffer> {
    #[inline]
    fn from(value: JsSharedArrayBuffer) -> Self {
        value.inner
    }
}

impl From<JsObject<SharedArrayBuffer>> for JsSharedArrayBuffer {
    #[inline]
    fn from(value: JsObject<SharedArrayBuffer>) -> Self {
        JsSharedArrayBuffer { inner: value }
    }
}

impl JsSharedArrayBuffer {
    /// Creates a new [`JsSharedArrayBuffer`] with `byte_length` bytes of allocated space.
    #[inline]
    pub fn new(byte_length: usize, context: &mut Context) -> JsResult<Self> {
        let inner = SharedArrayBuffer::allocate(
            &context
                .intrinsics()
                .constructors()
                .shared_array_buffer()
                .constructor()
                .into(),
            byte_length as u64,
            None,
            context,
        )?;

        Ok(Self { inner })
    }

    /// Creates a [`JsSharedArrayBuffer`] from a shared raw buffer.
    #[inline]
    pub fn from_buffer(buffer: SharedArrayBuffer, context: &mut Context) -> Self {
        let proto = context
            .intrinsics()
            .constructors()
            .shared_array_buffer()
            .prototype();

        let inner = JsObject::new(context.root_shape(), proto, buffer);

        Self { inner }
    }

    /// Creates a [`JsSharedArrayBuffer`] from a [`JsObject`], throwing a `TypeError` if the object
    /// is not a shared array buffer.
    ///
    /// This does not clone the fields of the shared array buffer, it only does a shallow clone of
    /// the object.
    #[inline]
    pub fn from_object(object: JsObject) -> JsResult<Self> {
        object
            .downcast::<SharedArrayBuffer>()
            .map(|inner| Self { inner })
            .map_err(|_| {
                JsNativeError::typ()
                    .with_message("object is not a SharedArrayBuffer")
                    .into()
            })
    }

    /// Returns the byte length of the array buffer.
    #[inline]
    #[must_use]
    pub fn byte_length(&self) -> usize {
        self.borrow().data().len(Ordering::SeqCst)
    }

    /// Copies the contents of this [`JsSharedArrayBuffer`] into a new [`Vec<u8>`].
    ///
    /// Each byte is loaded with `SeqCst` ordering into the returned buffer.
    /// GC-safe and safe for concurrent access within Boa's memory model.
    ///
    /// # Example
    ///
    /// ```
    /// # use boa_engine::{Context, JsResult, object::builtins::JsSharedArrayBuffer};
    /// # fn main() -> JsResult<()> {
    /// let context = &mut Context::default();
    /// let sab = JsSharedArrayBuffer::new(64, context)?;
    /// let bytes = sab.to_vec();
    /// assert_eq!(bytes.len(), 64);
    /// # Ok(())
    /// # }
    /// ```
    #[must_use]
    pub fn to_vec(&self) -> Vec<u8> {
        let obj = self.borrow();
        let src = obj.data().bytes(Ordering::SeqCst);
        let src = SliceRef::AtomicSlice(src);
        src.to_vec()
    }

    /// Gets the raw buffer of this `JsSharedArrayBuffer`.
    #[inline]
    #[must_use]
    pub fn inner(&self) -> SharedArrayBuffer {
        self.borrow().data().clone()
    }
}

impl From<JsSharedArrayBuffer> for JsObject {
    #[inline]
    fn from(o: JsSharedArrayBuffer) -> Self {
        o.inner.upcast()
    }
}

impl From<JsSharedArrayBuffer> for JsValue {
    #[inline]
    fn from(o: JsSharedArrayBuffer) -> Self {
        o.inner.upcast().into()
    }
}

impl Deref for JsSharedArrayBuffer {
    type Target = JsObject<SharedArrayBuffer>;

    #[inline]
    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

impl TryFromJs for JsSharedArrayBuffer {
    fn try_from_js(value: &JsValue, _context: &mut Context) -> JsResult<Self> {
        if let Some(o) = value.as_object() {
            Self::from_object(o.clone())
        } else {
            Err(JsNativeError::typ()
                .with_message("value is not a SharedArrayBuffer object")
                .into())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shared_array_buffer_to_vec_roundtrip() {
        let context = &mut Context::default();
        let len = 64;
        let sab = JsSharedArrayBuffer::new(len, context).unwrap();
        assert_eq!(sab.byte_length(), len);

        // Write a pattern at multiple indices and ensure `to_vec` observes it.
        let inner = sab.inner();
        let atoms = inner.bytes(Ordering::SeqCst);
        atoms[0].store(1, Ordering::SeqCst);
        atoms[1].store(2, Ordering::SeqCst);
        atoms[len - 1].store(255, Ordering::SeqCst);

        let bytes = sab.to_vec();
        assert_eq!(bytes.len(), len);
        assert_eq!(bytes[0], 1);
        assert_eq!(bytes[1], 2);
        assert_eq!(bytes[len - 1], 255);
    }

    #[test]
    fn shared_array_buffer_to_vec_zero_length() {
        let context = &mut Context::default();
        let sab = JsSharedArrayBuffer::new(0, context).unwrap();
        assert_eq!(sab.byte_length(), 0);

        let bytes = sab.to_vec();
        assert!(bytes.is_empty());
    }
}
