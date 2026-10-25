# M8 package hardening

Continue the user's direct execution workflow after PR8. Address the documented deferred package-fixture finding and expand installed-app path coverage; do not invent a new product milestone or claim real-device acceptance.

Use electron-builder negative file globs to omit named test/spec/fixture/benchmark directories inside production dependency contents, and independently reject them in the actual archive validator. Preserve runtime JS/JSON/WASM and notices. Prefer declarative exclusions over deleting installed node_modules or post-build archive surgery. Pinned dependencies are inspected before exclusion; future dependencies using these reserved directory names for runtime code require review and a narrowly documented exception.

Exercise existing seed/restart/reinstall/uninstall QA with Korean and spaces in owned installation/profile paths. Do not remove existing-install/profile guards or alter NSIS /D syntax (absolute, last, unquoted). Inspect the actual runtime cwd/profile as before. Hosted Windows evidence covers these paths on that runner; clean-client/GPU/signing/accessibility gates remain.

Update stale M8 roadmap status and document measured payload change and exact CI/artifact evidence. Keep version0.9.0, unsigned publish-never, no merge/public release. Create a follow-up draft PR over codex/m8-windows-release. One inline implementer and one final fresh reviewer.
