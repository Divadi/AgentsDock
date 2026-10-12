# Desktop connection sharing

Settings → Server provides explicit actions on each saved server, including
inactive or offline profiles:

- Copy the saved access token into the native clipboard.
- Display a locally generated connection QR code and save it as a PNG.

No server upgrade or new HTTP endpoint is required. Token copying reads the
selected profile's credential in the desktop main process and returns no token
to the renderer. Normal profile listing still exposes only credential presence.
QR pixels themselves contain the credential, remain in the open component's
memory, and are not written to settings, analytics or logs. Saving is an explicit
native file-picker action. Credential changes invalidate pending reads and
saved-image requests. A stored token may no longer be valid on the server;
copying it does not reauthenticate or rotate it.

The code contains the saved URL. Loopback and wildcard addresses produce an
explicit local-only warning. Users need a phone-reachable address and a server
that listens on that address; generating a QR does not change network binding,
firewall rules or Tailscale membership. This grants the access of the existing
operator token, rather than read-only access to an individual chat.

## Mobile contract (not yet wired into the mobile app)

The payload is `agentsdock://connect#` followed by URL-encoded fragment fields:

| Field | Meaning |
| --- | --- |
| `v` | Required format version, currently `1` |
| `url` | HTTP(S) server URL, without URL credentials, query or fragment |
| `token` | Saved server access token |
| `name` | Suggested display name |
| `identity` | Expected durable server identity, when already known |

The serializer and strict parser are in
`electron/src/shared/server-connection-link.ts`. Special characters and Unicode
must round-trip through URL encoding. Reject unsupported versions, duplicate or
unknown fields, empty tokens and oversized payloads. The size limit is 1,800
UTF-8 bytes for the complete link. Treat the whole link and QR image as secrets.

A separately scoped mobile integration must:

1. Accept scanned/imported images and/or the registered connection deep link.
2. Parse the payload and show the server address/name for confirmation.
3. Test authenticated health at that address and compare the expected identity
   before saving. Never silently overwrite an existing server or bypass TLS.
4. Store the token in the existing mobile secure store, preserving profile
   identity isolation and deduplication.
5. Explain unreachable/local-only addresses and expired/rotated credentials.

Current mobile code does not handle this connection route. A desktop-generated
QR is not evidence that mobile scanning and connection saving already work.

## Acceptance

- Focused desktop service, IPC, preload, QR contract and component checks cover
  profile targeting, unchanged active selection, credential changes, rejected
  untrusted callers, missing credentials, save cancellation and stale saves.
- Native offscreen desktop interaction verified the copy action with the real
  macOS clipboard and authenticated health on a local test server, and verified
  displaying the QR plus the local-only warning.
- An independent macOS Vision decode of an image produced by the shared encoder
  recovered the expected URL/token and authenticated to that same test server.
  Automated service tests verify the saved PNG bytes with a mocked destination
  picker. This is not a mobile scan test.
- The computer-control policy blocked interacting with Electron's native save
  picker. Completing that picker, visual acceptance across both themes/narrow
  layouts, and real mobile import remain pending; do not report full acceptance.

Manual desktop check: copy tokens from two different profiles without switching
servers, confirm the matching credentials, open/close the QR, save/cancel the PNG
picker, reopen the app, and repeat. Use disposable connection profiles and keep
token-bearing screenshots and PNGs out of public reports.
