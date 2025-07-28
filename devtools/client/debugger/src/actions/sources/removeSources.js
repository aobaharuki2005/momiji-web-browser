/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

import { getEditor } from "../../utils/editor/index";

export function removeSources(sources, actors) {
  return ({ parserWorker, dispatch }) => {
    // Remove the sources from the reducers first, and most importantly before any async work
    // as we may otherwise remove the source at an unexpected time.
    dispatch({
      type: "REMOVE_SOURCES",
      sources,
      actors,
    });

    const sourceIds = sources.map(source => source.id);

    // Clear the ParserWorker
    parserWorker.clearSources(sourceIds);

    // Clear the shared editor module from related CodeMirror instances
    const editor = getEditor();
    editor.clearSources(sourceIds);
  };
}
