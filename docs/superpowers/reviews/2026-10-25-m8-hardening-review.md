# M8 hardening review — 2026-10-25 (KST)

One fresh read-only gpt-6-astra/high review covered `5dddfee..81a3c71`. Verdict: approve, no Critical/Important/Minor findings. The reviewer independently checked96 directory/separator combinations, retained runtime filenames and actual ASAR70,975,174 bytes/5473 entries/82 notices. Korean/space arguments, unchanged ownership guards and NSIS /D semantics were inspected. No second review or fix pass was needed.

## Rulings

- Use builder exclusions plus independent archive validation for named nonruntime dependency directories. This resolves the measured deferred fixture finding without mutating node_modules; future runtime use of reserved directory names needs review and a narrow exception.
- Extend owned QA paths with Korean/spaces while retaining hosted-device limits. This verifies one concrete path case; clean-client/GPU/signing/accessibility acceptance remains open.
- Reviewer deferred actual Windows lifecycle and new artifact evidence: require this revision's hosted CI and saved reports before claiming Windows success. Linux alone is insufficient.
- Reviewer deferred clean Windows10/11/GPU/models/signing/SmartScreen/accessibility: retain explicit manual gates; hosted results do not establish end-device readiness.
- Reviewer did not independently rerun the full suite or reconstruct RED→GREEN: executor observed the regression fail, then type/lint and146 tests pass; this is not a second independent full test run.
- Reviewer deferred future dependency runtime compatibility: current pinned payload was inspected and the exception policy documented; dependency upgrades require actual packaging/runtime revalidation.

## Evidence

Local type/lint/JS146/build/payload PASS. Nested dependency regression RED→GREEN. Actual copied Linux packaged executable and profile with Korean/spaces passed seed/restart/data retention/external Python status and asserted runtime cwd/profile. ASAR shrank72,077,484→70,975,174 bytes. No app version change, merge, public release or signed-build claim. Exact Windows/Ubuntu CI and artifact evidence is added after the draft PR run.

Final evidence: implementation `f31decee8634f720b1cb1ac95537a5e103532f0d` passed [Windows/Ubuntu CI43](https://github.com/nalkarowndal/rgdqwer/actions/runs/40153440698): type/lint/build, JS146/Python22/browser16/HTTP/20-cycle soak. Actual Windows Korean/space installation/profile paths passed installed ASAR seed/restart/reinstall/uninstall, data retention and external Python status. The new installer/checksum artifact12583985492 uploaded; its metadata and actual installed payload5473 entries/82 notices were inspected. QA ZIP digest was checked before retaining the lifecycle report. Thus pending hosted Windows/artifact evidence is resolved. No findings remain in this follow-up; actual-device/signing/accessibility and future-dependency gates stand. Draft PR9 remains unmerged; final follow-up is documentation/QA JSON only.
