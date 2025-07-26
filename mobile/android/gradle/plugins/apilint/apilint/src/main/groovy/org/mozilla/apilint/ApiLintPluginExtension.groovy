/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

class ApiLintPluginExtension {
    String packageFilter = '.' // By default all packages are part of the api
    String apiOutputFileName = 'api.txt'
    String currentApiRelativeFilePath = 'api.txt'
    String jsonResultFileName = 'apilint-result.json'
    List<String> skipClassesRegex = []

    String changelogFileName
    List<String> lintFilters
    List<String> allowedPackages
    String deprecationAnnotation
    Integer libraryVersion
}
