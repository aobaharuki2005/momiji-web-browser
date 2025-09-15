/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Crash pings.

use crate::std::mock;

mod glean;

pub struct CrashPing<'a> {
    pub extra: &'a serde_json::Value,
    pub minidump_hash: Option<&'a str>,
}

impl CrashPing<'_> {
    /// Send the crash ping.
    pub fn send(&self) {
        // Glean ping tests have to be run serially (because the glean interface is a global), but
        // we can run tests that are uninterested in glean pings in parallel by disabling the pings
        // here.
        if mock::hook(true, "enable_glean_pings") {
            if let Err(e) = self.send_glean() {
                log::error!("failed to send glean ping: {e:#}");
            }
        }
    }

    fn send_glean(&self) -> anyhow::Result<()> {
        glean::set_crash_ping_metrics(self.extra, self.minidump_hash)?;
        log::debug!("submitting Glean crash ping");
        crate::glean::crash.submit(Some("crash"));
        Ok(())
    }
}
