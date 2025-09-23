/* -*- Mode: rust; rust-indent-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

extern crate byteorder;
extern crate pkcs11_bindings;

pub mod error;
pub mod manager;
pub mod util;

// Helper macro to prefix log messages with the current thread ID.
#[macro_export]
macro_rules! log_with_thread_id {
    ($log_level:ident, $($message:expr),*) => {
        $log_level!("{:?} {}", std::thread::current().id(), format_args!($($message),*));
    };
}

#[macro_export]
macro_rules! declare_unsupported_pkcs11_functions {
    () => {
        extern "C" fn C_GetMechanismInfo(
            _slotID: CK_SLOT_ID,
            _type: CK_MECHANISM_TYPE,
            _pInfo: CK_MECHANISM_INFO_PTR,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_GetMechanismInfo: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_InitToken(
            _slotID: CK_SLOT_ID,
            _pPin: CK_UTF8CHAR_PTR,
            _ulPinLen: CK_ULONG,
            _pLabel: CK_UTF8CHAR_PTR,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_InitToken: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_InitPIN(
            _hSession: CK_SESSION_HANDLE,
            _pPin: CK_UTF8CHAR_PTR,
            _ulPinLen: CK_ULONG,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_InitPIN: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_SetPIN(
            _hSession: CK_SESSION_HANDLE,
            _pOldPin: CK_UTF8CHAR_PTR,
            _ulOldLen: CK_ULONG,
            _pNewPin: CK_UTF8CHAR_PTR,
            _ulNewLen: CK_ULONG,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_SetPIN: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_GetOperationState(
            _hSession: CK_SESSION_HANDLE,
            _pOperationState: CK_BYTE_PTR,
            _pulOperationStateLen: CK_ULONG_PTR,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_GetOperationState: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_SetOperationState(
            _hSession: CK_SESSION_HANDLE,
            _pOperationState: CK_BYTE_PTR,
            _ulOperationStateLen: CK_ULONG,
            _hEncryptionKey: CK_OBJECT_HANDLE,
            _hAuthenticationKey: CK_OBJECT_HANDLE,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_SetOperationState: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_CreateObject(
            _hSession: CK_SESSION_HANDLE,
            _pTemplate: CK_ATTRIBUTE_PTR,
            _ulCount: CK_ULONG,
            _phObject: CK_OBJECT_HANDLE_PTR,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_InitPIN: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_CopyObject(
            _hSession: CK_SESSION_HANDLE,
            _hObject: CK_OBJECT_HANDLE,
            _pTemplate: CK_ATTRIBUTE_PTR,
            _ulCount: CK_ULONG,
            _phNewObject: CK_OBJECT_HANDLE_PTR,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_CopyObject: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_DestroyObject(
            _hSession: CK_SESSION_HANDLE,
            _hObject: CK_OBJECT_HANDLE,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_DestroyObject: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_GetObjectSize(
            _hSession: CK_SESSION_HANDLE,
            _hObject: CK_OBJECT_HANDLE,
            _pulSize: CK_ULONG_PTR,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_GetObjectSize: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_SetAttributeValue(
            _hSession: CK_SESSION_HANDLE,
            _hObject: CK_OBJECT_HANDLE,
            _pTemplate: CK_ATTRIBUTE_PTR,
            _ulCount: CK_ULONG,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_SetAttributeValue: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_EncryptInit(
            _hSession: CK_SESSION_HANDLE,
            _pMechanism: CK_MECHANISM_PTR,
            _hKey: CK_OBJECT_HANDLE,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_EncryptInit: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_Encrypt(
            _hSession: CK_SESSION_HANDLE,
            _pData: CK_BYTE_PTR,
            _ulDataLen: CK_ULONG,
            _pEncryptedData: CK_BYTE_PTR,
            _pulEncryptedDataLen: CK_ULONG_PTR,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_Encrypt: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_EncryptUpdate(
            _hSession: CK_SESSION_HANDLE,
            _pPart: CK_BYTE_PTR,
            _ulPartLen: CK_ULONG,
            _pEncryptedPart: CK_BYTE_PTR,
            _pulEncryptedPartLen: CK_ULONG_PTR,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_EncryptUpdate: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_EncryptFinal(
            _hSession: CK_SESSION_HANDLE,
            _pLastEncryptedPart: CK_BYTE_PTR,
            _pulLastEncryptedPartLen: CK_ULONG_PTR,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_EncryptFinal: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_DecryptInit(
            _hSession: CK_SESSION_HANDLE,
            _pMechanism: CK_MECHANISM_PTR,
            _hKey: CK_OBJECT_HANDLE,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_DecryptInit: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_Decrypt(
            _hSession: CK_SESSION_HANDLE,
            _pEncryptedData: CK_BYTE_PTR,
            _ulEncryptedDataLen: CK_ULONG,
            _pData: CK_BYTE_PTR,
            _pulDataLen: CK_ULONG_PTR,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_Decrypt: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_DecryptUpdate(
            _hSession: CK_SESSION_HANDLE,
            _pEncryptedPart: CK_BYTE_PTR,
            _ulEncryptedPartLen: CK_ULONG,
            _pPart: CK_BYTE_PTR,
            _pulPartLen: CK_ULONG_PTR,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_DecryptUpdate: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_DecryptFinal(
            _hSession: CK_SESSION_HANDLE,
            _pLastPart: CK_BYTE_PTR,
            _pulLastPartLen: CK_ULONG_PTR,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_DecryptFinal: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_DigestInit(
            _hSession: CK_SESSION_HANDLE,
            _pMechanism: CK_MECHANISM_PTR,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_DigestInit: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_Digest(
            _hSession: CK_SESSION_HANDLE,
            _pData: CK_BYTE_PTR,
            _ulDataLen: CK_ULONG,
            _pDigest: CK_BYTE_PTR,
            _pulDigestLen: CK_ULONG_PTR,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_Digest: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_DigestUpdate(
            _hSession: CK_SESSION_HANDLE,
            _pPart: CK_BYTE_PTR,
            _ulPartLen: CK_ULONG,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_DigestUpdate: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_DigestKey(_hSession: CK_SESSION_HANDLE, _hKey: CK_OBJECT_HANDLE) -> CK_RV {
            log_with_thread_id!(error, "C_DigestKey: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_DigestFinal(
            _hSession: CK_SESSION_HANDLE,
            _pDigest: CK_BYTE_PTR,
            _pulDigestLen: CK_ULONG_PTR,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_DigestFinal: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_SignUpdate(
            _hSession: CK_SESSION_HANDLE,
            _pPart: CK_BYTE_PTR,
            _ulPartLen: CK_ULONG,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_SignUpdate: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_SignFinal(
            _hSession: CK_SESSION_HANDLE,
            _pSignature: CK_BYTE_PTR,
            _pulSignatureLen: CK_ULONG_PTR,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_SignFinal: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_SignRecoverInit(
            _hSession: CK_SESSION_HANDLE,
            _pMechanism: CK_MECHANISM_PTR,
            _hKey: CK_OBJECT_HANDLE,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_SignRecoverInit: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_SignRecover(
            _hSession: CK_SESSION_HANDLE,
            _pData: CK_BYTE_PTR,
            _ulDataLen: CK_ULONG,
            _pSignature: CK_BYTE_PTR,
            _pulSignatureLen: CK_ULONG_PTR,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_SignRecover: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_VerifyInit(
            _hSession: CK_SESSION_HANDLE,
            _pMechanism: CK_MECHANISM_PTR,
            _hKey: CK_OBJECT_HANDLE,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_VerifyInit: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_Verify(
            _hSession: CK_SESSION_HANDLE,
            _pData: CK_BYTE_PTR,
            _ulDataLen: CK_ULONG,
            _pSignature: CK_BYTE_PTR,
            _ulSignatureLen: CK_ULONG,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_Verify: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_VerifyUpdate(
            _hSession: CK_SESSION_HANDLE,
            _pPart: CK_BYTE_PTR,
            _ulPartLen: CK_ULONG,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_VerifyUpdate: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_VerifyFinal(
            _hSession: CK_SESSION_HANDLE,
            _pSignature: CK_BYTE_PTR,
            _ulSignatureLen: CK_ULONG,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_VerifyFinal: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_VerifyRecoverInit(
            _hSession: CK_SESSION_HANDLE,
            _pMechanism: CK_MECHANISM_PTR,
            _hKey: CK_OBJECT_HANDLE,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_VerifyRecoverInit: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_VerifyRecover(
            _hSession: CK_SESSION_HANDLE,
            _pSignature: CK_BYTE_PTR,
            _ulSignatureLen: CK_ULONG,
            _pData: CK_BYTE_PTR,
            _pulDataLen: CK_ULONG_PTR,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_VerifyRecover: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_DigestEncryptUpdate(
            _hSession: CK_SESSION_HANDLE,
            _pPart: CK_BYTE_PTR,
            _ulPartLen: CK_ULONG,
            _pEncryptedPart: CK_BYTE_PTR,
            _pulEncryptedPartLen: CK_ULONG_PTR,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_DigestEncryptUpdate: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_DecryptDigestUpdate(
            _hSession: CK_SESSION_HANDLE,
            _pEncryptedPart: CK_BYTE_PTR,
            _ulEncryptedPartLen: CK_ULONG,
            _pPart: CK_BYTE_PTR,
            _pulPartLen: CK_ULONG_PTR,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_DecryptDigestUpdate: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_SignEncryptUpdate(
            _hSession: CK_SESSION_HANDLE,
            _pPart: CK_BYTE_PTR,
            _ulPartLen: CK_ULONG,
            _pEncryptedPart: CK_BYTE_PTR,
            _pulEncryptedPartLen: CK_ULONG_PTR,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_SignEncryptUpdate: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_DecryptVerifyUpdate(
            _hSession: CK_SESSION_HANDLE,
            _pEncryptedPart: CK_BYTE_PTR,
            _ulEncryptedPartLen: CK_ULONG,
            _pPart: CK_BYTE_PTR,
            _pulPartLen: CK_ULONG_PTR,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_DecryptVerifyUpdate: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_GenerateKey(
            _hSession: CK_SESSION_HANDLE,
            _pMechanism: CK_MECHANISM_PTR,
            _pTemplate: CK_ATTRIBUTE_PTR,
            _ulCount: CK_ULONG,
            _phKey: CK_OBJECT_HANDLE_PTR,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_GenerateKey: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_GenerateKeyPair(
            _hSession: CK_SESSION_HANDLE,
            _pMechanism: CK_MECHANISM_PTR,
            _pPublicKeyTemplate: CK_ATTRIBUTE_PTR,
            _ulPublicKeyAttributeCount: CK_ULONG,
            _pPrivateKeyTemplate: CK_ATTRIBUTE_PTR,
            _ulPrivateKeyAttributeCount: CK_ULONG,
            _phPublicKey: CK_OBJECT_HANDLE_PTR,
            _phPrivateKey: CK_OBJECT_HANDLE_PTR,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_GenerateKeyPair: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_WrapKey(
            _hSession: CK_SESSION_HANDLE,
            _pMechanism: CK_MECHANISM_PTR,
            _hWrappingKey: CK_OBJECT_HANDLE,
            _hKey: CK_OBJECT_HANDLE,
            _pWrappedKey: CK_BYTE_PTR,
            _pulWrappedKeyLen: CK_ULONG_PTR,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_WrapKey: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_UnwrapKey(
            _hSession: CK_SESSION_HANDLE,
            _pMechanism: CK_MECHANISM_PTR,
            _hUnwrappingKey: CK_OBJECT_HANDLE,
            _pWrappedKey: CK_BYTE_PTR,
            _ulWrappedKeyLen: CK_ULONG,
            _pTemplate: CK_ATTRIBUTE_PTR,
            _ulAttributeCount: CK_ULONG,
            _phKey: CK_OBJECT_HANDLE_PTR,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_UnwrapKey: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_DeriveKey(
            _hSession: CK_SESSION_HANDLE,
            _pMechanism: CK_MECHANISM_PTR,
            _hBaseKey: CK_OBJECT_HANDLE,
            _pTemplate: CK_ATTRIBUTE_PTR,
            _ulAttributeCount: CK_ULONG,
            _phKey: CK_OBJECT_HANDLE_PTR,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_DeriveKey: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_SeedRandom(
            _hSession: CK_SESSION_HANDLE,
            _pSeed: CK_BYTE_PTR,
            _ulSeedLen: CK_ULONG,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_SeedRandom: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_GenerateRandom(
            _hSession: CK_SESSION_HANDLE,
            _RandomData: CK_BYTE_PTR,
            _ulRandomLen: CK_ULONG,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_GenerateRandom: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_GetFunctionStatus(_hSession: CK_SESSION_HANDLE) -> CK_RV {
            log_with_thread_id!(error, "C_GetFunctionStatus: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_CancelFunction(_hSession: CK_SESSION_HANDLE) -> CK_RV {
            log_with_thread_id!(error, "C_CancelFunction: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }

        extern "C" fn C_WaitForSlotEvent(
            _flags: CK_FLAGS,
            _pSlot: CK_SLOT_ID_PTR,
            _pRserved: CK_VOID_PTR,
        ) -> CK_RV {
            log_with_thread_id!(error, "C_WaitForSlotEvent: CKR_FUNCTION_NOT_SUPPORTED");
            CKR_FUNCTION_NOT_SUPPORTED
        }
    };
}
