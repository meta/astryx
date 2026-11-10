use std::{
    any::TypeId,
    borrow::Cow,
    cell::Cell,
    collections::{BTreeMap, BTreeSet, BinaryHeap, HashMap, HashSet, LinkedList, VecDeque},
    hash::{BuildHasher, Hash},
    marker::PhantomData,
    num::{
        NonZeroI8, NonZeroI16, NonZeroI32, NonZeroI64, NonZeroI128, NonZeroIsize, NonZeroU8,
        NonZeroU16, NonZeroU32, NonZeroU64, NonZeroU128, NonZeroUsize,
    },
    path::{Path, PathBuf},
    rc::Rc,
    sync::atomic,
};

use boa_gc::{Ephemeron, Finalize, Gc, GcRefCell, Trace, WeakGc, WeakMap};

use super::internal_methods::{InternalObjectMethods, ORDINARY_INTERNAL_METHODS};

/// Represents a type that can be stored inside a `JsObject`.
///
/// This can be automatically derived using a macro.
///
/// # Example
///
/// ```
/// use boa_engine::{Finalize, JsData, JsObject, Trace};
///
/// #[derive(Trace, Finalize, JsData)]
/// struct CustomStruct {
///     #[unsafe_ignore_trace]
///     counter: usize,
/// }
///
/// let object =
///     JsObject::from_proto_and_data(None, CustomStruct { counter: 5 });
///
/// assert_eq!(object.downcast_ref::<CustomStruct>().unwrap().counter, 5);
/// ```
pub trait JsData {
    #[doc(hidden)]
    fn internal_methods(&self) -> &'static InternalObjectMethods
    where
        Self: Sized, // Avoids adding this method to `NativeObject`'s vtable.
    {
        &ORDINARY_INTERNAL_METHODS
    }
}

macro_rules! default_impls {
    ($($T:ty),*$(,)?) => {
        $(
            impl JsData for $T {}
        )*
    }
}

default_impls![
    (),
    bool,
    isize,
    usize,
    i8,
    u8,
    i16,
    u16,
    i32,
    u32,
    i64,
    u64,
    i128,
    u128,
    f32,
    f64,
    char,
    TypeId,
    String,
    Path,
    PathBuf,
    NonZeroIsize,
    NonZeroUsize,
    NonZeroI8,
    NonZeroU8,
    NonZeroI16,
    NonZeroU16,
    NonZeroI32,
    NonZeroU32,
    NonZeroI64,
    NonZeroU64,
    NonZeroI128,
    NonZeroU128,
];

#[cfg(target_has_atomic = "8")]
default_impls![atomic::AtomicBool, atomic::AtomicI8, atomic::AtomicU8];

#[cfg(target_has_atomic = "16")]
default_impls![atomic::AtomicI16, atomic::AtomicU16];

#[cfg(target_has_atomic = "32")]
default_impls![atomic::AtomicI32, atomic::AtomicU32];

#[cfg(target_has_atomic = "64")]
default_impls![atomic::AtomicI64, atomic::AtomicU64];

#[cfg(target_has_atomic = "ptr")]
default_impls![atomic::AtomicIsize, atomic::AtomicUsize];

impl<T, const N: usize> JsData for [T; N] {}

macro_rules! fn_one {
    ($ty:ty $(,$args:ident)*) => {
        impl<Ret $(,$args)*> JsData for $ty {}
    }
}

macro_rules! fn_impls {
    () => {
        fn_one!(extern "Rust" fn () -> Ret);
        fn_one!(extern "C" fn () -> Ret);
        fn_one!(unsafe extern "Rust" fn () -> Ret);
        fn_one!(unsafe extern "C" fn () -> Ret);
    };
    ($($args:ident),*) => {
        fn_one!(extern "Rust" fn ($($args),*) -> Ret, $($args),*);
        fn_one!(extern "C" fn ($($args),*) -> Ret, $($args),*);
        fn_one!(extern "C" fn ($($args),*, ...) -> Ret, $($args),*);
        fn_one!(unsafe extern "Rust" fn ($($args),*) -> Ret, $($args),*);
        fn_one!(unsafe extern "C" fn ($($args),*) -> Ret, $($args),*);
        fn_one!(unsafe extern "C" fn ($($args),*, ...) -> Ret, $($args),*);
    }
}

macro_rules! tuple_impls {
    () => {}; // This case is handled above, by default_impls!().
    ($($args:ident),*) => {
        impl<$($args),*> JsData for ($($args,)*) {}
    }
}

macro_rules! type_arg_tuple_based_impls {
    ($(($($args:ident),*);)*) => {
        $(
            fn_impls!($($args),*);
            tuple_impls!($($args),*);
        )*
    }
}

type_arg_tuple_based_impls![
    ();
    (A);
    (A, B);
    (A, B, C);
    (A, B, C, D);
    (A, B, C, D, E);
    (A, B, C, D, E, F);
    (A, B, C, D, E, F, G);
    (A, B, C, D, E, F, G, H);
    (A, B, C, D, E, F, G, H, I);
    (A, B, C, D, E, F, G, H, I, J);
    (A, B, C, D, E, F, G, H, I, J, K);
    (A, B, C, D, E, F, G, H, I, J, K, L);
];

impl<T: ?Sized> JsData for Box<T> {}

impl<T: ?Sized> JsData for Rc<T> {}

impl<T> JsData for Vec<T> {}

impl<T> JsData for thin_vec::ThinVec<T> {}

impl<T> JsData for Option<T> {}

impl<T, E> JsData for Result<T, E> {}

impl<T: Ord> JsData for BinaryHeap<T> {}

impl<K, V> JsData for BTreeMap<K, V> {}

impl<T> JsData for BTreeSet<T> {}

impl<K: Eq + Hash, V, S: BuildHasher> JsData for hashbrown::hash_map::HashMap<K, V, S> {}

impl<K: Eq + Hash, V, S: BuildHasher> JsData for HashMap<K, V, S> {}

impl<T: Eq + Hash, S: BuildHasher> JsData for HashSet<T, S> {}

impl<T: Eq + Hash> JsData for LinkedList<T> {}

impl<T> JsData for PhantomData<T> {}

impl<T> JsData for VecDeque<T> {}

impl<T: ToOwned + ?Sized> JsData for Cow<'static, T> {}

impl<T> JsData for Cell<Option<T>> {}

#[cfg(feature = "intl")]
default_impls!(icu_locale::Locale);

impl<T: Trace + ?Sized> JsData for Gc<T> {}

impl<T: Trace + ?Sized> JsData for WeakGc<T> {}

impl<T: Trace + ?Sized, V: Trace> JsData for Ephemeron<T, V> {}

impl<T: Trace + ?Sized> JsData for GcRefCell<T> {}

impl<K: Trace + ?Sized, V: Trace> JsData for WeakMap<K, V> {}

/// Wrapper type to enforce consistent alignment for all [`JsData`] types.
///
/// Ensures alignment is exactly 8 bytes:
/// - Minimum alignment is set via `#[repr(align(8))]`.
/// - Maximum alignment is enforced at compile time with a const assertion.
///
///
/// Use [`ObjectData::new`] to construct safely. Inner data is accessible via [`AsRef`] and [`AsMut`].
#[derive(Debug, Finalize, Trace)]
// SAFETY: This does not implement drop, so this is safe.
#[boa_gc(unsafe_no_drop)]
#[repr(C, align(8))]
#[non_exhaustive]
pub(crate) struct ObjectData<T: ?Sized> {
    // MUST BE PRIVATE, should not be constructed directly. i.e. { data: ... }
    // Because we want to trigger the compile-time const assertion below.
    //
    // It is fine if we have as_ref/as_mut to it or any access.
    data: T,
}

impl<T: Default> Default for ObjectData<T> {
    #[inline]
    fn default() -> Self {
        Self::new(T::default())
    }
}

static_assertions::const_assert!(align_of::<Box<()>>() <= 8);

impl<T> ObjectData<T> {
    const OBJECT_DATA_ALIGNMENT_REQUIREMENT: () = assert!(
        align_of::<T>() <= 8,
        "Alignment of JsData must be <= 8, consider wrapping the data in a Box<T>."
    );

    pub(crate) fn new(value: T) -> Self {
        // force assertion to trigger when we instantiate `ObjectData<T>::new`.
        let () = Self::OBJECT_DATA_ALIGNMENT_REQUIREMENT;

        Self { data: value }
    }
}

impl<T: ?Sized> AsRef<T> for ObjectData<T> {
    #[inline]
    fn as_ref(&self) -> &T {
        &self.data
    }
}

impl<T: ?Sized> AsMut<T> for ObjectData<T> {
    #[inline]
    fn as_mut(&mut self) -> &mut T {
        &mut self.data
    }
}
