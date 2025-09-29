/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React, { useRef } from "react";

export const EmbeddedBackupRestore = () => {
  const ref = useRef();

  return (
    <restore-from-backup
      aboutWelcomeEmbedded="true"
      labelFontWeight="600"
      ref={ref}
    ></restore-from-backup>
  );
};
