/* -*- Mode: rust; rust-indent-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use pkcs11_bindings::*;
use rsclientcerts::error::Error;
use rsclientcerts::manager::{ClientCertsBackend, CryptokiObject, Sign};
use rsclientcerts::util::*;

use base64::prelude::*;
use num_bigint::BigUint;

#[derive(Clone)]
pub struct Key {
    cryptoki_key: CryptokiKey,
    modulus: BigUint,
    private_exponent: BigUint,
}

impl Key {
    fn new(private_key_info: Vec<u8>, cert: Vec<u8>) -> Result<Key, Error> {
        let rsa_private_key_bytes = read_private_key_info(&private_key_info).unwrap();
        Ok(Key {
            cryptoki_key: CryptokiKey::new(
                Some(rsa_private_key_bytes.modulus.clone()),
                None,
                &cert,
            )
            .unwrap(),
            modulus: BigUint::from_bytes_be(rsa_private_key_bytes.modulus.as_ref()),
            private_exponent: BigUint::from_bytes_be(
                rsa_private_key_bytes.private_exponent.as_ref(),
            ),
        })
    }
}

impl CryptokiObject for Key {
    fn matches(&self, attrs: &[(CK_ATTRIBUTE_TYPE, Vec<u8>)]) -> bool {
        self.cryptoki_key.matches(attrs)
    }

    fn get_attribute(&self, attribute: CK_ATTRIBUTE_TYPE) -> Option<&[u8]> {
        self.cryptoki_key.get_attribute(attribute)
    }
}

// Implements EMSA-PKCS1-v1_5-ENCODE as per RFC 8017 section 9.2, except that the message `M` has
// already been hashed and encoded into a `DigestInfo` with the appropriate digest algorithm.
fn emsa_pkcs1v1_5_encode(digest_info: &[u8], em_len: usize) -> Vec<u8> {
    assert!(em_len >= digest_info.len() + 11);
    let mut ps = vec![0xff; em_len - digest_info.len() - 3];
    let mut em = vec![0x00, 0x01];
    em.append(&mut ps);
    em.push(0x00);
    em.extend_from_slice(digest_info);
    em
}

impl Sign for Key {
    fn get_signature_length(
        &mut self,
        _data: &[u8],
        _params: &Option<CK_RSA_PKCS_PSS_PARAMS>,
    ) -> Result<usize, Error> {
        Ok(((self.modulus.bits() + 7) / 8).try_into().unwrap())
    }

    fn sign(
        &mut self,
        data: &[u8],
        params: &Option<CK_RSA_PKCS_PSS_PARAMS>,
    ) -> Result<Vec<u8>, Error> {
        let encoded = if let Some(params) = params.as_ref() {
            let em_bits = self.modulus.bits() - 1;
            emsa_pss_encode(data, em_bits.try_into().unwrap(), params).unwrap()
        } else {
            emsa_pkcs1v1_5_encode(data, self.get_signature_length(data, params).unwrap())
        };
        let message = BigUint::from_bytes_be(&encoded);
        // NB: Do not use this implementation where maintaining the secrecy of the private key is
        // important. In particular, the underlying exponentiation implementation may not be
        // constant-time and could leak information. This is intended to only be used in tests.
        // Additionally, the "private" key in use is already not at all a secret.
        let signature = message.modpow(&self.private_exponent, &self.modulus);
        Ok(signature.to_bytes_be())
    }
}

pub struct Backend {
    slot_description: &'static [u8; 64],
    token_label: &'static [u8; 32],
    slot_flags: CK_FLAGS,
    token_flags: CK_FLAGS,
    logged_in: bool,
    certs: Vec<CryptokiCert>,
    keys: Vec<Key>,
}

const TOKEN_MODEL_BYTES: &[u8; 16] = b"Test Model      ";
const TOKEN_SERIAL_NUMBER_BYTES: &[u8; 16] = b"0000000000000000";

impl Backend {
    pub fn new(
        slot_description: &'static [u8; 64],
        token_label: &'static [u8; 32],
        slot_flags: CK_FLAGS,
        token_flags: CK_FLAGS,
        certs_pem: Vec<&'static str>,
        keys_pem: Vec<&'static str>,
    ) -> Backend {
        let certs_der = certs_pem
            .into_iter()
            .map(pem_to_base64)
            .map(|base64| BASE64_STANDARD.decode(base64).unwrap());
        let keys_der = keys_pem
            .into_iter()
            .map(pem_to_base64)
            .map(|base64| BASE64_STANDARD.decode(base64).unwrap());
        let mut certs = Vec::new();
        let mut keys = Vec::new();
        for (cert_der, key_der) in std::iter::zip(certs_der, keys_der) {
            let cert = CryptokiCert::new(cert_der.to_vec(), b"test certificate".to_vec()).unwrap();
            certs.push(cert);
            let key = Key::new(key_der.to_vec(), cert_der.to_vec()).unwrap();
            keys.push(key);
        }
        Backend {
            slot_description,
            token_label,
            slot_flags,
            token_flags,
            logged_in: false,
            certs,
            keys,
        }
    }
}

fn pem_to_base64(pem: &str) -> String {
    let lines = pem.split('\n');
    let line_count = lines.clone().count();
    // Strip off "-----BEGIN CERTIFICATE-----" / "-----END CERTIFICATE-----"
    lines
        .skip(1)
        .take(line_count - 3)
        .collect::<Vec<&str>>()
        .join("")
}

impl ClientCertsBackend for Backend {
    type Key = Key;

    fn find_objects(&mut self) -> Result<(Vec<CryptokiCert>, Vec<Key>), Error> {
        Ok((self.certs.clone(), self.keys.clone()))
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
        vec![CKM_RSA_PKCS, CKM_RSA_PKCS_PSS]
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
