/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React, { useRef, useEffect } from "react";
import { AboutWelcomeUtils } from "../lib/aboutwelcome-utils.mjs";

export const EmbeddedBackupRestore = () => {
  const ref = useRef();

  useEffect(() => {
    // Clear the pref used to target the restore screen so that users will not
    // automatically see it again the next time they visit about:welcome.
    AboutWelcomeUtils.handleUserAction({
      type: "SET_PREF",
      data: {
        pref: { name: "showRestoreFromBackup", value: false },
      },
    });
  }, []);

  return (
    <restore-from-backup
      aboutWelcomeEmbedded="true"
      labelFontWeight="600"
      ref={ref}
    ></restore-from-backup>
  );
};
