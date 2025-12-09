/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

type CanonicalURLSource = "link" | "opengraph" | "jsonLd" | "fallback";
type CanonicalURLSourceResults = {
  [source in CanonicalURLSource]: string | null;
};

interface CanonicalURLIdentifiedEvent {
  type: "CanonicalURL:Identified";
  target: MozBrowser;
  detail: {
    canonicalUrl: string;
    canonicalUrlSources: CanonicalURLSource[];
  };
}

interface TabNoteRecord {
  id: number;
  canonicalUrl: string;
  created: Temporal.Instant;
  text: string;
}

type TabbrowserWebProgressListener<
  ListenerName extends keyof nsIWebProgressListener,
  F = nsIWebProgressListener[ListenerName],
> = F extends (...args: any) => any
  ? (aBrowser: MozBrowser, ...rest: Parameters<F>) => ReturnType<F>
  : never;
