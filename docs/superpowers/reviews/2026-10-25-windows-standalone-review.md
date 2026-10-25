# Windows standalone review — 2026-10-25 (KST)

One fresh read-only gpt-6-astra/high reviewer inspected `e5c6f88..adf11b4`, including pinned electron-builder filename precedence and ZIP archive layout. No Critical or code-level Important issues. One documentation finding: standalone instructions referenced `$resources`, absent from the Worker example. The actual variable is `$studioInstall`.

## Disposition and rulings

- The reviewer called the variable mismatch Minor. Executor grades its effect Important for ZIP-only users following the sole Worker setup path: the unchanged example would select a nonexistent installed directory. Corrected the instruction to assign `$studioInstall` to the extracted app root, feeding both `$studioPythonSources` and the later voice launch. The before/after references were checked directly against both examples. Per developer guidance, this reversible documentation fix adds no implementation-mirroring test; runtime code is unchanged and the full suite was already green. No second review was dispatched.
- Choose a full folder ZIP over a self-extracting launcher: it matches the requested visible exe/folder experience without adding startup extraction or launcher code. The exe depends on accompanying resources/DLLs; docs explicitly require whole-folder extraction.
- Keep existing AppData storage and app identity. This is installation-free launch, not a USB-contained profile. Cross-PC data/model migration and automatic migration are outside scope and not claimed.
- Reviewer declined actual extracted/relocated Windows execution until CI: require successful current Windows CI plus archive/report inspection before completion. Linux tests alone do not prove this behavior.
- Reviewer declined clean Windows10/11, SmartScreen, real GPU/model inference and microphone behavior: manual validation remains open; unsigned hosted validation does not establish those properties.
- Reviewer declined live installed/ZIP coexistence against a real default profile: runtime identity and path code are unchanged; isolated lifecycle tests protect user data but do not prove a live-user migration. Shared default AppData is documented, with the existing single-instance behavior; no independent coexistence test is claimed.
- Reviewer declined signing, automatic updates and public-release readiness: they remain excluded. No publishing or merging is authorized/performed.
- Reviewer did not independently rerun the full suite: executor observed two new tests RED then GREEN, all148 JS tests/typecheck/lint/build pass, and pinned builder schema validation pass. CI is independent execution evidence, not independent reproduction of the RED step.
- Existing checkout reused on a new branch, preserving previous branches. Cloud skill helper scripts were unavailable, so equivalent plan/ledger/review artifacts were maintained manually. No implementation delegation.

## Verification

Local: `npm run check` passed typecheck, lint and148 tests across26 files; `npm run build` passed. Artifact selection tests cover unrelated/missing/ambiguous files, standalone/installer separation and matching blockmap. The actual Windows ZIP extraction/relocation CI and artifact evidence will be appended after completion. Default user-profile and real-inference limitations remain explicit.


Final evidence: packaged revision `e92c5015675d045f34d0d7fa80c728865abb3e94` passed [Windows/Ubuntu CI49](https://github.com/nalkarowndal/rgdqwer/actions/runs/40170610776). Both platforms passed type/lint/build, JS148/Python22/browser16, real Worker HTTP smoke and20-cycle simulated-engine soak. Windows also passed the existing actual NSIS install/reinstall/uninstall retention checks and the new actual extracted/relocated ZIP smoke. Thus the review's pending hosted Windows gate is resolved.

The Windows QA artifact12590186646 was downloaded and its SHA256 `2cc3d0386e8c61d0cf29d1a583aa41aee29dd3f7a6895debe2d0b47472b36bc1` verified before reading seed/moved reports. Both report app.asar under the original/moved Korean/space app path; cwd and profile remain the same isolated profile. Settings and synthetic model bytes persist. Sandbox/contextIsolation/webSecurity are true, nodeIntegration false; no Linux sandbox override. Payload5473 entries/82 dependency notices; external Python status works without actual model runtimes. Summary preserved in `docs/qa/windows-standalone.json`.

[Standalone artifact12590301455](https://github.com/nalkarowndal/rgdqwer/actions/runs/40170610776/artifacts/12590301455):165,515,826 bytes, expires2026-11-08T07:03:01Z. The outer GitHub artifact SHA256 is `809000d016ea8227e8be97a0d0da5f901243595fc8383de73d08489673098c5c`. The actual inner standalone ZIP SHA256, generated and verified against the extracted package by Windows CI, is **`cc449c627b344900b9d58eaf49a454faff4b060ae2bf15cd23da90eeaaeae974`**. These are different files/digests. Full archive payload execution was verified on the Windows runner; the executor locally downloaded the smaller QA artifact, not the165MB distribution. [Setup artifact12590665658](https://github.com/nalkarowndal/rgdqwer/actions/runs/40170610776/artifacts/12590665658) remains available separately.

No unresolved findings remain. Final changes after e92c501 are documentation/QA evidence only (including README download discovery and stale installer-absence wording). Draft PR10 remains unmerged; no public release or signing claim. Clean devices, live-user profile coexistence, actual GPU/model/microphone inference, signing/SmartScreen and cross-PC portability limits remain as ruled above.
