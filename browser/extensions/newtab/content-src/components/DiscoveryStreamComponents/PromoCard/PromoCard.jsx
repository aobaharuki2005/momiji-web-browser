/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React from "react";

/**
 * The PromoCard component displays a promotional message.
 * It is used next to the AdBanner component in a four-column layout.
 */

const PromoCard = () => {
  return (
    <div className="promo-card-wrapper">
      <div className="promo-card-inner">
        <span
          className="promo-card-label"
          data-l10n-id="promo-card-default-title"
        />
      </div>
    </div>
  );
};

export { PromoCard };
