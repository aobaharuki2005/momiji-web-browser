/* -*- Mode: rust; rust-indent-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#![allow(non_snake_case)]

#[macro_use]
extern crate rsclientcerts;

use log::error;
use pkcs11_bindings::*;
use rsclientcerts::{declare_unsupported_pkcs11_functions, log_with_thread_id};
use rsclientcerts::manager::{IsSearchingForClientCerts, Manager};
use std::convert::TryInto;
use std::sync::Mutex;

mod backend;

use backend::Backend;

/// The singleton `Manager` that handles state with respect to PKCS #11. Only one thread
/// may use it at a time, but there is no restriction on which threads may use it.
static MANAGER: Mutex<Option<Manager<Backend, IsGeckoSearchingForClientCerts>>> = Mutex::new(None);

// Obtaining a handle on the manager is a two-step process. First the mutex must be locked, which
// (if successful), results in a mutex guard object. We must then get a mutable refence to the
// underlying manager (if set - otherwise we return an error). This can't happen all in one macro
// without dropping a reference that needs to live long enough for this to be safe. In
// practice, this looks like:
//   let mut manager_guard = try_to_get_manager_guard!();
//   let manager = manager_guard_to_manager!(manager_guard);
macro_rules! try_to_get_manager_guard {
    () => {
        match MANAGER.lock() {
            Ok(maybe_manager) => maybe_manager,
            Err(_) => return CKR_DEVICE_ERROR,
        }
    };
}

macro_rules! manager_guard_to_manager {
    ($manager_guard:ident) => {
        match $manager_guard.as_mut() {
            Some(manager) => manager,
            None => return CKR_DEVICE_ERROR,
        }
    };
}

extern "C" {
    fn IsGeckoSearchingForClientAuthCertificates() -> bool;
}

struct IsGeckoSearchingForClientCerts;

impl IsSearchingForClientCerts for IsGeckoSearchingForClientCerts {
    fn is_searching_for_client_certs() -> bool {
        unsafe { IsGeckoSearchingForClientAuthCertificates() }
    }
}

/// This gets called to initialize the module. For this implementation, this consists of
/// instantiating the `Manager`.
extern "C" fn C_Initialize(_pInitArgs: CK_VOID_PTR) -> CK_RV {
    let mut manager_guard = try_to_get_manager_guard!();
    let _unexpected_previous_manager = manager_guard.replace(Manager::new(vec![Backend::new()]));
    CKR_OK
}

extern "C" fn C_Finalize(_pReserved: CK_VOID_PTR) -> CK_RV {
    // Drop the manager. When C_Finalize is called, there should be only one
    // reference to this module (which is going away), so there shouldn't be
    // any concurrency issues.
    let mut manager_guard = try_to_get_manager_guard!();
    match manager_guard.take() {
        Some(_) => CKR_OK,
        None => CKR_CRYPTOKI_NOT_INITIALIZED,
    }
}

// The specification mandates that these strings be padded with spaces to the appropriate length.
// Since the length of fixed-size arrays in rust is part of the type, the compiler enforces that
// these byte strings are of the correct length.
const MANUFACTURER_ID_BYTES: &[u8; 32] = b"Mozilla Corporation             ";
const LIBRARY_DESCRIPTION_BYTES: &[u8; 32] = b"IPC Client Cert Module          ";

/// This gets called to gather some information about the module. In particular, this implementation
/// supports (portions of) cryptoki (PKCS #11) version 2.2.
extern "C" fn C_GetInfo(pInfo: CK_INFO_PTR) -> CK_RV {
    if pInfo.is_null() {
        return CKR_ARGUMENTS_BAD;
    }
    let info = CK_INFO {
        cryptokiVersion: CK_VERSION { major: 2, minor: 2 },
        manufacturerID: *MANUFACTURER_ID_BYTES,
        flags: 0,
        libraryDescription: *LIBRARY_DESCRIPTION_BYTES,
        libraryVersion: CK_VERSION::default(),
    };
    unsafe {
        *pInfo = info;
    }
    CKR_OK
}

/// This gets called twice: once with a null `pSlotList` to get the number of slots (returned via
/// `pulCount`) and a second time to get the ID for each slot.
extern "C" fn C_GetSlotList(
    tokenPresent: CK_BBOOL,
    pSlotList: CK_SLOT_ID_PTR,
    pulCount: CK_ULONG_PTR,
) -> CK_RV {
    if pulCount.is_null() {
        return CKR_ARGUMENTS_BAD;
    }
    let mut manager_guard = try_to_get_manager_guard!();
    let manager = manager_guard_to_manager!(manager_guard);
    let slot_ids = manager.get_slot_ids(if tokenPresent == CK_TRUE { true } else { false });
    let slot_count: CK_ULONG = slot_ids.len().try_into().unwrap();
    if !pSlotList.is_null() {
        if unsafe { *pulCount } < slot_count {
            return CKR_BUFFER_TOO_SMALL;
        }
        unsafe {
            std::ptr::copy_nonoverlapping(slot_ids.as_ptr(), pSlotList, slot_ids.len());
        }
    };
    unsafe {
        *pulCount = slot_count;
    }
    CKR_OK
}

/// This gets called to obtain information about slots. In this implementation, the tokens are
/// always present in the slots.
extern "C" fn C_GetSlotInfo(slotID: CK_SLOT_ID, pInfo: CK_SLOT_INFO_PTR) -> CK_RV {
    if pInfo.is_null() {
        return CKR_ARGUMENTS_BAD;
    }
    let mut manager_guard = try_to_get_manager_guard!();
    let manager = manager_guard_to_manager!(manager_guard);
    let Ok(slot_info) = manager.get_slot_info(slotID) else {
        return CKR_ARGUMENTS_BAD;
    };
    unsafe {
        *pInfo = slot_info;
    }
    CKR_OK
}

/// This gets called to obtain some information about tokens. This implementation has two slots,
/// so it has two tokens. This information is primarily for display purposes.
extern "C" fn C_GetTokenInfo(slotID: CK_SLOT_ID, pInfo: CK_TOKEN_INFO_PTR) -> CK_RV {
    if pInfo.is_null() {
        return CKR_ARGUMENTS_BAD;
    }
    let mut manager_guard = try_to_get_manager_guard!();
    let manager = manager_guard_to_manager!(manager_guard);
    let Ok(token_info) = manager.get_token_info(slotID) else {
        return CKR_ARGUMENTS_BAD;
    };
    unsafe {
        *pInfo = token_info;
    }
    CKR_OK
}

extern "C" fn C_GetMechanismList(
    slotID: CK_SLOT_ID,
    pMechanismList: CK_MECHANISM_TYPE_PTR,
    pulCount: CK_ULONG_PTR,
) -> CK_RV {
    if pulCount.is_null() {
        return CKR_ARGUMENTS_BAD;
    }
    let mut manager_guard = try_to_get_manager_guard!();
    let manager = manager_guard_to_manager!(manager_guard);
    let Ok(mechanisms) = manager.get_mechanism_list(slotID) else {
        return CKR_ARGUMENTS_BAD;
    };
    let mechanisms_len: CK_ULONG = mechanisms.len().try_into().unwrap();
    if !pMechanismList.is_null() {
        if unsafe { *pulCount } < mechanisms_len {
            return CKR_ARGUMENTS_BAD;
        }
        unsafe {
            std::ptr::copy_nonoverlapping(mechanisms.as_ptr(), pMechanismList, mechanisms.len());
        }
    }
    unsafe {
        *pulCount = mechanisms_len;
    }
    CKR_OK
}

/// This gets called to create a new session. This module defers to the `Manager` to implement this.
extern "C" fn C_OpenSession(
    slotID: CK_SLOT_ID,
    _flags: CK_FLAGS,
    _pApplication: CK_VOID_PTR,
    _Notify: CK_NOTIFY,
    phSession: CK_SESSION_HANDLE_PTR,
) -> CK_RV {
    if phSession.is_null() {
        return CKR_ARGUMENTS_BAD;
    }
    let mut manager_guard = try_to_get_manager_guard!();
    let manager = manager_guard_to_manager!(manager_guard);
    let session_handle = match manager.open_session(slotID) {
        Ok(session_handle) => session_handle,
        Err(_) => return CKR_DEVICE_ERROR,
    };
    unsafe {
        *phSession = session_handle;
    }
    CKR_OK
}

/// This gets called to close a session. This is handled by the `Manager`.
extern "C" fn C_CloseSession(hSession: CK_SESSION_HANDLE) -> CK_RV {
    let mut manager_guard = try_to_get_manager_guard!();
    let manager = manager_guard_to_manager!(manager_guard);
    if manager.close_session(hSession).is_err() {
        return CKR_SESSION_HANDLE_INVALID;
    }
    CKR_OK
}

/// This gets called to close all open sessions at once. This is handled by the `Manager`.
extern "C" fn C_CloseAllSessions(slotID: CK_SLOT_ID) -> CK_RV {
    let mut manager_guard = try_to_get_manager_guard!();
    let manager = manager_guard_to_manager!(manager_guard);
    match manager.close_all_sessions(slotID) {
        Ok(()) => CKR_OK,
        Err(_) => CKR_DEVICE_ERROR,
    }
}

extern "C" fn C_GetSessionInfo(_hSession: CK_SESSION_HANDLE, _pInfo: CK_SESSION_INFO_PTR) -> CK_RV {
    CKR_FUNCTION_NOT_SUPPORTED
}

extern "C" fn C_Login(
    _hSession: CK_SESSION_HANDLE,
    _userType: CK_USER_TYPE,
    _pPin: CK_UTF8CHAR_PTR,
    _ulPinLen: CK_ULONG,
) -> CK_RV {
    CKR_FUNCTION_NOT_SUPPORTED
}

/// This gets called to log out and drop any authenticated resources. Because this module does not
/// hold on to authenticated resources, this module "implements" this by doing nothing and
/// returning a success result.
extern "C" fn C_Logout(_hSession: CK_SESSION_HANDLE) -> CK_RV {
    CKR_OK
}

/// This gets called to obtain the values of a number of attributes of an object identified by the
/// given handle. This module implements this by requesting that the `Manager` find the object and
/// attempt to get the value of each attribute. If a specified attribute is not defined on the
/// object, the length of that attribute is set to -1 to indicate that it is not available.
/// This gets called twice: once to obtain the lengths of the attributes and again to get the
/// values.
extern "C" fn C_GetAttributeValue(
    hSession: CK_SESSION_HANDLE,
    hObject: CK_OBJECT_HANDLE,
    pTemplate: CK_ATTRIBUTE_PTR,
    ulCount: CK_ULONG,
) -> CK_RV {
    if pTemplate.is_null() {
        return CKR_ARGUMENTS_BAD;
    }
    let mut attr_types = Vec::with_capacity(ulCount as usize);
    for i in 0..ulCount {
        let attr = unsafe { &*pTemplate.offset(i as isize) };
        attr_types.push(attr.type_);
    }
    let mut manager_guard = try_to_get_manager_guard!();
    let manager = manager_guard_to_manager!(manager_guard);
    let values = match manager.get_attributes(hSession, hObject, attr_types) {
        Ok(values) => values,
        Err(_) => return CKR_ARGUMENTS_BAD,
    };
    if values.len() != ulCount as usize {
        return CKR_DEVICE_ERROR;
    }
    for i in 0..ulCount as usize {
        let attr = unsafe { &mut *pTemplate.offset(i as isize) };
        // NB: the safety of this array access depends on the length check above
        if let Some(attr_value) = &values[i] {
            if attr.pValue.is_null() {
                attr.ulValueLen = attr_value.len() as CK_ULONG;
            } else {
                let ptr: *mut u8 = attr.pValue as *mut u8;
                if attr_value.len() != attr.ulValueLen as usize {
                    return CKR_ARGUMENTS_BAD;
                }
                unsafe {
                    std::ptr::copy_nonoverlapping(attr_value.as_ptr(), ptr, attr_value.len());
                }
            }
        } else {
            attr.ulValueLen = (0 - 1) as CK_ULONG;
        }
    }
    CKR_OK
}

const RELEVANT_ATTRIBUTES: &[CK_ATTRIBUTE_TYPE] = &[
    CKA_CLASS,
    CKA_EC_PARAMS,
    CKA_ID,
    CKA_ISSUER,
    CKA_KEY_TYPE,
    CKA_LABEL,
    CKA_MODULUS,
    CKA_PRIVATE,
    CKA_SERIAL_NUMBER,
    CKA_SUBJECT,
    CKA_TOKEN,
    CKA_VALUE,
];

/// This gets called to initialize a search for objects matching a given list of attributes. This
/// module implements this by gathering the attributes and passing them to the `Manager` to start
/// the search.
extern "C" fn C_FindObjectsInit(
    hSession: CK_SESSION_HANDLE,
    pTemplate: CK_ATTRIBUTE_PTR,
    ulCount: CK_ULONG,
) -> CK_RV {
    if pTemplate.is_null() {
        return CKR_ARGUMENTS_BAD;
    }
    let mut attrs = Vec::new();
    for i in 0..ulCount {
        let attr = unsafe { &*pTemplate.offset(i as isize) };
        // Copy out the attribute type to avoid making a reference to an unaligned field.
        let attr_type = attr.type_;
        if !RELEVANT_ATTRIBUTES.contains(&attr_type) {
            return CKR_ATTRIBUTE_TYPE_INVALID;
        }
        let slice = unsafe {
            std::slice::from_raw_parts(attr.pValue as *const u8, attr.ulValueLen as usize)
        };
        attrs.push((attr_type, slice.to_owned()));
    }
    let mut manager_guard = try_to_get_manager_guard!();
    let manager = manager_guard_to_manager!(manager_guard);
    match manager.start_search(hSession, attrs) {
        Ok(()) => {}
        Err(_) => return CKR_ARGUMENTS_BAD,
    }
    CKR_OK
}

/// This gets called after `C_FindObjectsInit` to get the results of a search. This module
/// implements this by looking up the search in the `Manager` and copying out the matching
/// object handles.
extern "C" fn C_FindObjects(
    hSession: CK_SESSION_HANDLE,
    phObject: CK_OBJECT_HANDLE_PTR,
    ulMaxObjectCount: CK_ULONG,
    pulObjectCount: CK_ULONG_PTR,
) -> CK_RV {
    if phObject.is_null() || pulObjectCount.is_null() || ulMaxObjectCount == 0 {
        return CKR_ARGUMENTS_BAD;
    }
    let mut manager_guard = try_to_get_manager_guard!();
    let manager = manager_guard_to_manager!(manager_guard);
    let handles = match manager.search(hSession, ulMaxObjectCount as usize) {
        Ok(handles) => handles,
        Err(_) => return CKR_ARGUMENTS_BAD,
    };
    if handles.len() > ulMaxObjectCount as usize {
        return CKR_DEVICE_ERROR;
    }
    unsafe {
        *pulObjectCount = handles.len() as CK_ULONG;
    }
    for (index, handle) in handles.iter().enumerate() {
        if index < ulMaxObjectCount as usize {
            unsafe {
                *(phObject.add(index)) = *handle;
            }
        }
    }
    CKR_OK
}

/// This gets called after `C_FindObjectsInit` and `C_FindObjects` to finish a search. The module
/// tells the `Manager` to clear the search.
extern "C" fn C_FindObjectsFinal(hSession: CK_SESSION_HANDLE) -> CK_RV {
    let mut manager_guard = try_to_get_manager_guard!();
    let manager = manager_guard_to_manager!(manager_guard);
    // It would be an error if there were no search for this session, but we can be permissive here.
    match manager.clear_search(hSession) {
        Ok(()) => CKR_OK,
        Err(_) => CKR_DEVICE_ERROR,
    }
}

/// This gets called to set up a sign operation. The module essentially defers to the
/// `Manager`.
extern "C" fn C_SignInit(
    hSession: CK_SESSION_HANDLE,
    pMechanism: CK_MECHANISM_PTR,
    hKey: CK_OBJECT_HANDLE,
) -> CK_RV {
    if pMechanism.is_null() {
        return CKR_ARGUMENTS_BAD;
    }
    // Presumably we should validate the mechanism against hKey, but the specification doesn't
    // actually seem to require this.
    let mechanism = unsafe { *pMechanism };
    let mechanism_params = if mechanism.mechanism == CKM_RSA_PKCS_PSS {
        if mechanism.ulParameterLen as usize != std::mem::size_of::<CK_RSA_PKCS_PSS_PARAMS>() {
            return CKR_ARGUMENTS_BAD;
        }
        Some(unsafe { *(mechanism.pParameter as *const CK_RSA_PKCS_PSS_PARAMS) })
    } else {
        None
    };
    let mut manager_guard = try_to_get_manager_guard!();
    let manager = manager_guard_to_manager!(manager_guard);
    match manager.start_sign(hSession, hKey, mechanism_params) {
        Ok(()) => {}
        Err(_) => return CKR_GENERAL_ERROR,
    };
    CKR_OK
}

/// NSS calls this after `C_SignInit` (there are more ways in the PKCS #11 specification to sign
/// data, but this is the only way supported by this module). The module essentially defers to the
/// `Manager` and copies out the resulting signature.
extern "C" fn C_Sign(
    hSession: CK_SESSION_HANDLE,
    pData: CK_BYTE_PTR,
    ulDataLen: CK_ULONG,
    pSignature: CK_BYTE_PTR,
    pulSignatureLen: CK_ULONG_PTR,
) -> CK_RV {
    if pData.is_null() || pulSignatureLen.is_null() {
        return CKR_ARGUMENTS_BAD;
    }
    let data = unsafe { std::slice::from_raw_parts(pData, ulDataLen as usize) };
    if pSignature.is_null() {
        let mut manager_guard = try_to_get_manager_guard!();
        let manager = manager_guard_to_manager!(manager_guard);
        match manager.get_signature_length(hSession, data.to_vec()) {
            Ok(signature_length) => unsafe {
                *pulSignatureLen = signature_length as CK_ULONG;
            },
            Err(_) => return CKR_GENERAL_ERROR,
        }
    } else {
        let mut manager_guard = try_to_get_manager_guard!();
        let manager = manager_guard_to_manager!(manager_guard);
        match manager.sign(hSession, data.to_vec()) {
            Ok(signature) => {
                let signature_capacity = unsafe { *pulSignatureLen } as usize;
                if signature_capacity < signature.len() {
                    return CKR_ARGUMENTS_BAD;
                }
                let ptr: *mut u8 = pSignature as *mut u8;
                unsafe {
                    std::ptr::copy_nonoverlapping(signature.as_ptr(), ptr, signature.len());
                    *pulSignatureLen = signature.len() as CK_ULONG;
                }
            }
            Err(_) => return CKR_GENERAL_ERROR,
        }
    }
    CKR_OK
}

declare_unsupported_pkcs11_functions!();

/// To be a valid PKCS #11 module, this list of functions must be supported. At least cryptoki 2.2
/// must be supported for this module to work in NSS.
static FUNCTION_LIST: CK_FUNCTION_LIST = CK_FUNCTION_LIST {
    version: CK_VERSION { major: 2, minor: 2 },
    C_Initialize: Some(C_Initialize),
    C_Finalize: Some(C_Finalize),
    C_GetInfo: Some(C_GetInfo),
    C_GetFunctionList: None,
    C_GetSlotList: Some(C_GetSlotList),
    C_GetSlotInfo: Some(C_GetSlotInfo),
    C_GetTokenInfo: Some(C_GetTokenInfo),
    C_GetMechanismList: Some(C_GetMechanismList),
    C_GetMechanismInfo: Some(C_GetMechanismInfo),
    C_InitToken: Some(C_InitToken),
    C_InitPIN: Some(C_InitPIN),
    C_SetPIN: Some(C_SetPIN),
    C_OpenSession: Some(C_OpenSession),
    C_CloseSession: Some(C_CloseSession),
    C_CloseAllSessions: Some(C_CloseAllSessions),
    C_GetSessionInfo: Some(C_GetSessionInfo),
    C_GetOperationState: Some(C_GetOperationState),
    C_SetOperationState: Some(C_SetOperationState),
    C_Login: Some(C_Login),
    C_Logout: Some(C_Logout),
    C_CreateObject: Some(C_CreateObject),
    C_CopyObject: Some(C_CopyObject),
    C_DestroyObject: Some(C_DestroyObject),
    C_GetObjectSize: Some(C_GetObjectSize),
    C_GetAttributeValue: Some(C_GetAttributeValue),
    C_SetAttributeValue: Some(C_SetAttributeValue),
    C_FindObjectsInit: Some(C_FindObjectsInit),
    C_FindObjects: Some(C_FindObjects),
    C_FindObjectsFinal: Some(C_FindObjectsFinal),
    C_EncryptInit: Some(C_EncryptInit),
    C_Encrypt: Some(C_Encrypt),
    C_EncryptUpdate: Some(C_EncryptUpdate),
    C_EncryptFinal: Some(C_EncryptFinal),
    C_DecryptInit: Some(C_DecryptInit),
    C_Decrypt: Some(C_Decrypt),
    C_DecryptUpdate: Some(C_DecryptUpdate),
    C_DecryptFinal: Some(C_DecryptFinal),
    C_DigestInit: Some(C_DigestInit),
    C_Digest: Some(C_Digest),
    C_DigestUpdate: Some(C_DigestUpdate),
    C_DigestKey: Some(C_DigestKey),
    C_DigestFinal: Some(C_DigestFinal),
    C_SignInit: Some(C_SignInit),
    C_Sign: Some(C_Sign),
    C_SignUpdate: Some(C_SignUpdate),
    C_SignFinal: Some(C_SignFinal),
    C_SignRecoverInit: Some(C_SignRecoverInit),
    C_SignRecover: Some(C_SignRecover),
    C_VerifyInit: Some(C_VerifyInit),
    C_Verify: Some(C_Verify),
    C_VerifyUpdate: Some(C_VerifyUpdate),
    C_VerifyFinal: Some(C_VerifyFinal),
    C_VerifyRecoverInit: Some(C_VerifyRecoverInit),
    C_VerifyRecover: Some(C_VerifyRecover),
    C_DigestEncryptUpdate: Some(C_DigestEncryptUpdate),
    C_DecryptDigestUpdate: Some(C_DecryptDigestUpdate),
    C_SignEncryptUpdate: Some(C_SignEncryptUpdate),
    C_DecryptVerifyUpdate: Some(C_DecryptVerifyUpdate),
    C_GenerateKey: Some(C_GenerateKey),
    C_GenerateKeyPair: Some(C_GenerateKeyPair),
    C_WrapKey: Some(C_WrapKey),
    C_UnwrapKey: Some(C_UnwrapKey),
    C_DeriveKey: Some(C_DeriveKey),
    C_SeedRandom: Some(C_SeedRandom),
    C_GenerateRandom: Some(C_GenerateRandom),
    C_GetFunctionStatus: Some(C_GetFunctionStatus),
    C_CancelFunction: Some(C_CancelFunction),
    C_WaitForSlotEvent: Some(C_WaitForSlotEvent),
};

/// This is the only function this module exposes. The C stub calls it when NSS
/// calls its exposed C_GetFunctionList function to obtain the list of functions
/// comprising this module.
#[no_mangle]
pub extern "C" fn IPCCC_GetFunctionList(ppFunctionList: CK_FUNCTION_LIST_PTR_PTR) -> CK_RV {
    if ppFunctionList.is_null() {
        return CKR_ARGUMENTS_BAD;
    }
    unsafe {
        // CK_FUNCTION_LIST_PTR is a *mut CK_FUNCTION_LIST, but as per the
        // specification, the caller must treat it as *const CK_FUNCTION_LIST.
        *ppFunctionList = std::ptr::addr_of!(FUNCTION_LIST) as CK_FUNCTION_LIST_PTR;
    }
    CKR_OK
}

#[cfg_attr(
    any(target_os = "macos", target_os = "ios"),
    link(name = "Security", kind = "framework")
)]
extern "C" {}
