# Local file handoff

The landing page accepts DOCX, XLSX, PPTX and PDF, up to 100 MiB. Validation and routing live in src/lib/files/pending-file.ts.

The selected File is stored in IndexedDB erpcons-file-transfer-v1 / pending under a random token. The editor URL carries only that token. Files are never posted to a server.

editor-shell/open-file.js reads the queued file after navigation, verifies the editor path and expiry, and waits for eframe's canvas drop listener. A canceled synthetic drop confirms eframe accepted the File through its existing browser file-drop path. The queue entry and URL token are then removed. This confirms delivery, not successful document parsing; format errors remain the editor's responsibility.

Files shared to the installed app from Android's share sheet take the same path: the manifest's share_target posts them to /share-target/, which never reaches the server because editor-shell/sw.js answers it. The worker applies the same type and size rules, queues the first supported file under a random token and redirects to its editor with ?open=<token>. A post whose referrer is another site is refused. It only works once the worker controls the site, which installing the app guarantees.

Unconsumed entries expire after one hour and are pruned on the next file selection. Storage failures, missing entries and startup timeouts give a recovery link. The existing editor File menu remains available.

scripts/assemble.mts injects the bridge beside the existing shell script. No Rust changes or editor rebuild are needed. Any eframe update affecting drop event cancellation must be checked with all four editors.

The discovery catalog keeps tools without confirmed URLs as awaiting links, without actionable links or pricing claims.

Navigation between exported pages uses ordinary links, avoiding RSC segment rewrite requirements on static hosting.
