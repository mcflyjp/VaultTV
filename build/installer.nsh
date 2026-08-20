; Shared NSIS customization for both electron-builder.config.cjs and
; server-builder.config.cjs. Deletes the downloaded installer .exe itself once
; install finishes, so re-downloading an update doesn't just pile another
; 150-180MB file up in Downloads on top of every previous version.
;
; Safe despite deleting a file the running process is executing from: NSIS
; only reaches this point once its own code is already fully memory-mapped,
; and Windows allows removing a file whose only remaining reference is an
; already-open memory mapping (the actual bytes stay valid until the process
; exits) — this is the standard, widely-used self-delete-the-installer
; pattern, not something fragile or version-specific.
!macro customInstall
  Delete "$EXEPATH"
!macroend
