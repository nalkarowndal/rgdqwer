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
