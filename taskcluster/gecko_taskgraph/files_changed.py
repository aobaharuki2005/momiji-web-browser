# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""
Support for optimizing tasks based on the set of files that have changed.
"""

from subprocess import CalledProcessError

from mozbuild.util import memoize
from mozversioncontrol import InvalidRepoPath, get_repository_object


def _get_locally_changed_files(repo):
    try:
        vcs = get_repository_object(repo)
        s = set(vcs.get_outgoing_files("AM"))
        return s
    except (InvalidRepoPath, CalledProcessError):
        return set()


class PreloadedGetLocallyChangedFiles:
    """
    Function-like class that performs eager computation of _get_locally_changed_files
    for what looks the default repo.

    The rationale is the following:
    - computing _get_locally_changed_files is relatively slow (~600ms)
    - it's already done through an external command

    So we do that in a background thread as soon as possible, so that at the
    point when we need the result, it's already `prefetched'.
    """

    def __init__(self):
        self.preloaded_repo = None
        self.preloading_thread = None
        self.preloaded_answer = None

    def preload(self, repo):
        """
        Fire off preloading of get_locally_changed_files(repo).

        For the sake of simplicity, there can be only one preloaded repo.
        """
        import threading
        from pathlib import Path

        if self.preloaded_repo is not None:
            raise ValueError("Can only preload one repo")

        self.preloaded_repo = Path(repo)

        def preloading():
            self.preloaded_answer = _get_locally_changed_files(self.preloaded_repo)

        self.preloading_thread = threading.Thread(target=preloading, daemon=True)
        self.preloading_thread.start()

    @memoize
    def __call__(self, repo):
        if repo == self.preloaded_repo:
            # A thread can be joined many times, but it's going to happen only
            # once, thanks to @memoize.
            self.preloading_thread.join()
            return self.preloaded_answer
        return _get_locally_changed_files(repo)


get_locally_changed_files = PreloadedGetLocallyChangedFiles()
