# macOS capture permissions

## An enabled switch can belong to an older build

macOS checks the application's code identity, not just its name or icon. With an ad-hoc signature, the designated requirement identifies one code hash. Re-signing or replacing that build changes its identity. A stale Screen Recording record may therefore remain enabled in System Settings while macOS denies the current executable.

The characteristic TCC diagnostic is:

> Failed to match existing code requirement for subject com.cue.overlay and service kTCCServiceScreenCapture

Apple explains code identity and permission continuity in [TN3127](https://developer.apple.com/documentation/technotes/tn3127-inside-code-signing-requirements). Apple DTS also confirms the ad-hoc-signing failure mode in [this ScreenCaptureKit discussion](https://developer.apple.com/forums/thread/819406).

## Signing and updates

Public releases require Developer ID signing and notarization. End users should not need development certificates or Terminal commands.

For development on one Mac, an explicitly approved local signing identity can keep the same certificate-bound designated requirement across builds. The optional setup script requires acknowledgement before creating a non-extractable Keychain private key and a user-domain trust entry limited to code signing. It does not add web/TLS trust or change Gatekeeper, SIP, or system-wide trust settings. Apple describes self-signed identities for internal development in its [Code Signing Guide](https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/Procedures/Procedures.html).

Run the local signing script only after all bundle files are finalized. It checks that the resulting identity is bound to the configured certificate, verifies the complete bundle, and tests the previous designated requirement before accepting an update. Never overwrite that final signature with ad-hoc signing.

## Recovery in Cue

The permission review offers **Repair Cue’s screen grant** when screen access is unavailable in the installed macOS app. The action:

1. Saves pending mode edits and stops capture.
2. Resets `ScreenCapture` for `com.cue.overlay` only.
3. Restarts that exact executable with a one-use recovery request.
4. Lets macOS ask for the current app's Screen Recording access.

The recovery switch is consumed. Ordinary restarts do not repeat the request. Microphone access, keys, modes, reference files, sessions, and other applications' privacy grants are preserved.

Startup, Check Again, focus refreshes, and the review's refresh timer only read status. They never capture the desktop or prompt. The overlay yields its always-on-top level while permission review is open so that macOS authentication and Allow dialogs can appear normally. Cue also holds a single-instance lock per profile.

## Verification

Unit tests cover signature classification, certificate-bound signing, previous-requirement verification, scoped repair, and one-use relaunch arguments. The isolated permission interaction suite tests both normal startup and a recovery launch without touching real TCC records or requesting real microphone access. Other interaction suites cover the preserved window controls, tray, model pickers, and meeting modes.

After a real install, verify native status and an actual local capture, discard the diagnostic pixels, then relaunch the unchanged signed app and verify access again. A passing mocked test alone does not prove the Mac's grant is repaired.
