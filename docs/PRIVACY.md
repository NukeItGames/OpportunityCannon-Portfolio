# Publication privacy review

The portfolio working tree was exported from verified source commit `94a4f0e416b2fcf40d1da7382ec699d0e7a034ee` without copying `.git`. The source repository was accessed read-only. Historical audit reports were omitted to avoid carrying over unrelated evidence or release claims. No older build was used.

The publication includes application code, tests, build configuration, original branding, and new portfolio documentation. It excludes databases, real profiles, application histories, credentials, local settings, document references, backups, logs, browser profiles, generated output, and installers from source control. Tests use explicitly fictional data and reserved example domains. Public provider endpoints and synthetic URL parsing fixtures are code, not personal research history.

Review covers publication filenames and UTF-8/UTF-16 content, contact addresses, account paths, credential families, Google document identifiers, configuration defaults, test fixtures, image assets, package metadata, and Git author metadata. The source privacy gate is supplemented by a publication manifest and full-tree audit. Packaged resources and extracted installer payloads receive separate checks in Windows CI before installer artifacts are uploaded.

NukeItGames branding, application IDs, native-host identity, and the extension's public RSA manifest key are retained. They identify the publisher/application; the manifest key is not a private signing key. Public dependency maintainer metadata and required license notices are attributed upstream material, not the application's owner profile.

Fresh onboarding and distribution scans must pass before a Windows installer is offered. A pattern scan cannot establish the absence of every unknown secret. No real user-data locations are read or modified by the portfolio preparation or fictional acceptance suites.

## Completed findings

The clean source gate passed locally and on both CI platforms. The fresh-user privacy suite, DPAPI onboarding, migration/backup recovery, and protected history suites passed against the extracted Windows application. Distribution scanning examined 1,081 file/entry representations with zero unresolved findings. Three executable byte-pattern matches were confirmed against the unmodified vendor Electron binary. No real profile, application record, credential, Google document ID, or owner-specific path was found in the publication inputs or distribution.

The four documentation screenshots were inspected visually; all 27 exported PNGs passed metadata checks and an OCR text privacy scan. They contain blank or explicitly fictional fields and no owner information. The application source, tests, build inputs, and original assets remain unchanged from the verified snapshot; [the provenance manifest](SOURCE-PROVENANCE.json) records 88 retained file hashes. New files provide portfolio presentation, publication auditing, dependency notice export, and CI.

The original remote HEAD was checked against the verified commit after publication. No write operation targeted the private repository. No real user-data directory or personal account was opened. Git author metadata uses the publisher's GitHub noreply identity; no private Git objects or ancestry were imported.
