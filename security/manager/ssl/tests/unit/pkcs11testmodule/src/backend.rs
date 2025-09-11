/* -*- Mode: rust; rust-indent-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use pkcs11_bindings::*;
use rsclientcerts::error::Error;
use rsclientcerts::manager::{ClientCertsBackend, CryptokiObject, Sign};
use rsclientcerts::util::*;

pub struct Key {}

impl CryptokiObject for Key {
    fn matches(&self, _attrs: &[(CK_ATTRIBUTE_TYPE, Vec<u8>)]) -> bool {
        unreachable!()
    }

    fn get_attribute(&self, _attribute: CK_ATTRIBUTE_TYPE) -> Option<&[u8]> {
        unreachable!()
    }
}

impl Sign for Key {
    fn get_signature_length(
        &mut self,
        _data: &[u8],
        _params: &Option<CK_RSA_PKCS_PSS_PARAMS>,
    ) -> Result<usize, Error> {
        unreachable!()
    }

    fn sign(
        &mut self,
        _data: &[u8],
        _params: &Option<CK_RSA_PKCS_PSS_PARAMS>,
    ) -> Result<Vec<u8>, Error> {
        unreachable!()
    }
}

pub struct Backend {
    slot_description: &'static [u8; 64],
    token_label: &'static [u8; 32],
    slot_flags: CK_FLAGS,
    token_flags: CK_FLAGS,
    logged_in: bool,
}

const TOKEN_MODEL_BYTES: &[u8; 16] = b"Test Model      ";
const TOKEN_SERIAL_NUMBER_BYTES: &[u8; 16] = b"0000000000000000";

impl Backend {
    pub fn new(
        slot_description: &'static [u8; 64],
        token_label: &'static [u8; 32],
        slot_flags: CK_FLAGS,
        token_flags: CK_FLAGS,
    ) -> Backend {
        Backend {
            slot_description,
            token_label,
            slot_flags,
            token_flags,
            logged_in: false,
        }
    }
}

impl ClientCertsBackend for Backend {
    type Key = Key;

    fn find_objects(&mut self) -> Result<(Vec<CryptokiCert>, Vec<Key>), Error> {
        Ok((Vec::new(), Vec::new()))
    }

    fn get_slot_info(&self) -> CK_SLOT_INFO {
        CK_SLOT_INFO {
            slotDescription: *self.slot_description,
            manufacturerID: *crate::MANUFACTURER_ID_BYTES,
            flags: self.slot_flags,
            ..Default::default()
        }
    }

    fn get_token_info(&self) -> CK_TOKEN_INFO {
        CK_TOKEN_INFO {
            label: *self.token_label,
            manufacturerID: *crate::MANUFACTURER_ID_BYTES,
            model: *TOKEN_MODEL_BYTES,
            serialNumber: *TOKEN_SERIAL_NUMBER_BYTES,
            flags: self.token_flags,
            ..Default::default()
        }
    }

    fn get_mechanism_list(&self) -> Vec<CK_MECHANISM_TYPE> {
        Vec::new()
    }

    fn login(&mut self) {
        self.logged_in = true;
    }

    fn logout(&mut self) {
        self.logged_in = false;
    }

    fn is_logged_in(&self) -> bool {
        self.logged_in
    }
}
