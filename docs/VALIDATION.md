# Validation of the portfolio copy

Validated November 13, 2026. This records the portfolio run, not historical private-repository results. [Windows and Linux workflow 43373241379](https://github.com/NukeItGames/OpportunityCannon-Portfolio/actions/runs/43373241379) completed successfully at source commit `8de631b61e7da39066623bd6fa8a5f4d753e7943`. Subsequent presentation commits retain the same application source; each push also runs the workflow.

| Check | Observed result |
|---|---|
| Clean dependency install | `npm ci` passed locally and on fresh Linux/Windows runners |
| Baseline automated tests | 63 passed, zero failed/skipped/cancelled on Linux and Windows; the Windows native host is compiled first |
| TypeScript | `npx tsc --noEmit` passed on both operating systems |
| Production build | Vite renderer, esbuild main/preload, and Windows C# host passed |
| Windows packaging | Fresh x64 NSIS installer built with publishing disabled; unsigned |
| Desktop acceptance | Seven suites passed against the extracted installer application: onboarding, migration, preferences, eligibility, discovery UI, repair, privacy |
| Final UI acceptance | Ten checks passed across both workspaces and five viewport sizes: 1920, 1366, 1280, 1024, and 950 pixels wide |
| Fresh-user privacy | Empty identity, sources, history, research, and credentials; fictional isolated storage verified |
| Encryption and recovery | Windows DPAPI/SQLite plaintext checks, encrypted backup export, wrong-password rejection, preview, merge, restore to fresh storage, and restart passed |
| Application protection | Applied/Rejected opening guards, semantic duplicate imports, notes, and history persistence passed |
| Browser form controls | Actual Chrome and Edge passed supported fields, preservation, dynamic controls, ambiguity, and no submission |
| Edge extension page | Real extension page, icon, initial state, and retry/disconnected feedback passed; native messaging untested |
| Chrome popup | Not tested: Chrome did not load the unpacked extension via the tested command-line flags; no manual installation performed |
| Resource/privacy audit | 1,137 ASAR entries passed application resource allowlisting; external extension/native resources passed |
| Full distribution scan | 1,081 examinations, 521,418,709 bytes, zero unresolved findings; three random executable pattern matches confirmed in unmodified vendor Electron |
| Branding | Executable and installer icon resources inspected; actual packaged onboarding logo rendered |
| Licenses | Electron/Chromium notices retained; 28 runtime notice documents exported beside installer; lockfile dependencies declare permissive licenses |
| Dependency security | Full local npm audit and CI audit reported zero known vulnerabilities at validation time |
| Public source | Complete tracked-tree privacy gate passed; 88 retained files match the verified source hashes in SOURCE-PROVENANCE.json |

The Linux production check built the renderer and Electron bundles, then stopped at the Windows-only PowerShell/compiler step. The Windows workflow completed that full build and packaging path. The locked Electron package needs `node node_modules/electron/install.js` after `npm ci`; the README and workflow include it.

The successful run exported the artifact **Opportunity-Cannon-0.3.1-unsigned** (30-day retention) with installer, blockmap, runtime notices, fictional captures, and structured summaries. [Download from this run](https://github.com/NukeItGames/OpportunityCannon-Portfolio/actions/runs/43373241379). Installer size: 113,298,284 bytes. Installer SHA-256:

```text
ebea8f754bb44dc8afba0c7cd2a397d47fa53fabe34917f87dfd6aa3d6ed73a1
```

The downloaded artifact ZIP matched GitHub's recorded digest `9ad6f83bc97a6467ad89662c65e8e28dec64850d8705ee9c0d18fb1bd14a27df`. Selected screenshots were visually reviewed and copied without editing. Generated databases, logs, builder diagnostics, and browser profiles are excluded from the public source and exported artifact selection.

The manually triggered release workflow requires a successful validation run for its exact source revision, verifies the seven/ten acceptance summaries and empty privacy findings, checks that the PE certificate table is empty, and uploads installer, runtime notices, and SHA256SUMS.txt. Release files have their own checksums; the checksum above identifies the first documented successful run. Only the release job has repository write permission, and it refuses to replace an already published release.

## Explicit boundaries

- Interactive installation, upgrade, uninstall, Windows permission prompts, default-browser dispatch, and OS display scaling are not tested by launching an unpacked executable.
- Chrome/Edge form-control injection is separate from extension popup loading and native handoff. A browser refusing command-line extension loading does not count as a popup pass.
- Native handoff and registry-changing acceptance are not included in the default workflow.
- Live third-party application submission, live OAuth/Sheets/paid provider integrations, cross-machine DPAPI, and a full accessibility certification are not tested.
- File-picker dialogs in the final UI backup walkthrough are stubbed; encryption and preview/merge logic remain real.
- The Windows installer is unsigned. No signing or installation lifecycle claim is made.
- Live public-network discovery coverage was not rerun in this portfolio session. Deterministic discovery fixtures and desktop UI were tested; synthetic screenshots do not establish provider availability or real eligibility.
