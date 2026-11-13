# Third-party components

Application code and branding use the rights statement in LICENSE. This repository does not relicense upstream components. The npm lockfile identifies exact dependencies and integrity hashes; installation obtains those packages with their original notices.

The runtime uses React and React DOM (MIT), Cheerio (MIT), Undici (MIT), Electron (MIT and bundled Chromium/Node.js third-party notices), and the Windows .NET Framework APIs. Build/test tools include TypeScript (Apache-2.0), Vite, esbuild, tsx, electron-builder, and Playwright under their respective licenses. Consult each installed package's LICENSE/NOTICE files for authoritative terms.

Packaged Electron distributions retain LICENSE.electron.txt and LICENSES.chromium.html. Windows CI verifies those files and generates runtime dependency notices alongside the installer. Development dependencies are not separately redistributed in source control. No personal documents, commercial data catalog, or third-party resume is bundled.
