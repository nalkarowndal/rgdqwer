# Windows standalone folder distribution

The user wants a studio executable like the screenshot, rather than only a setup program. Deliver an additional Windows x64 ZIP containing `rgdqwer.exe`, Electron runtime files, `resources`, licenses and a root quick-start document. Extract all files into one folder and double-click the exe; no installer or Node development environment is required.

## Approaches and decision

Use electron-builder's ZIP target over the existing packaged app. This directly matches the requested folder/executable experience. A self-extracting `portable` exe would unpack into temporary storage on launch and obscure the folder layout; a custom launcher adds unnecessary code. The executor chose ZIP based on the supplied screenshot and direct instruction to start.

Keep existing NSIS output. Name the new package `rgdqwer-0.9.0-windows-x64-unsigned-standalone.zip` and publish it as a separate Actions artifact with its own SHA256 manifest. Keep release publishing disabled. App behavior and security remain unchanged.

Data stays at `%APPDATA%\rgdqwer\studio`, shared with the installed version on the same Windows account. This is installation-free distribution, not a USB-contained data profile. The whole extracted directory must stay together; moving only the exe cannot work. Moving the directory on the same PC preserves existing data. No automatic data migration or concurrent independent profiles are added. External model/engine/Python/FFmpeg prerequisites remain.

## Verification

Add meaningful artifact-selection/checksum regression coverage (missing, ambiguous and unrelated files). Build and extract the actual ZIP on Windows into an owned Korean/space temp path. Launch the extracted exe with an isolated QA profile, seed settings/import a synthetic model, close, move the application directory, restart and verify retained data and security/resource checks. Keep existing NSIS lifecycle coverage. Upload ZIP only after validation passes. No real GPU/inference/signing claims.

References: https://electronjs.org/docs/latest/tutorial/application-distribution and Context7 electron-builder Windows/target documentation; pinned ArchiveTarget.js confirms Windows ZIP contains app files at archive root.
