# Server V2 Architecture

## Purpose

`server-v2` is a local development bridge between the `web` app and `codex app-server`.

The design goal is to remove the extra server-side session layer from the legacy server and replace it with a thinner transport proxy:

- Browser to `server-v2`: WebSocket carrying raw JSON-RPC 2.0 messages
- `server-v2` to `codex app-server`: stdio carrying newline-delimited JSON

For v1, one browser WebSocket owns one upstream `codex app-server` process. That single upstream connection can already manage multiple Codex threads and turns, so `server-v2` does not add a separate multi-session manager yet.

## What Changed

Compared with the legacy `apps/server` package, `server-v2` makes these structural changes:

- Removed the Hono app layer in favor of `node:http`.
- Removed the server-created `/api/sessions` lifecycle.
- Removed the custom browser/server envelope as the primary v2 transport contract.
- Removed the reconnectable `SessionRegistry` model from the request path.
- Moved browser communication to direct JSON-RPC 2.0 over a single WebSocket endpoint.
- Kept the upstream transport on stdio and implemented JSONL parsing with a small local parser.
- Added runtime validation based on JSON Schema generated from `codex app-server`.

The practical effect is that the browser no longer asks the server to create and manage a named session. Instead, opening a WebSocket creates an upstream Codex process immediately, and closing the socket tears that process down.

## Package Layout

`apps/server-v2` is intentionally small:

- [src/index.ts](/Users/andrew/dev/frame/apps/server-v2/src/index.ts#L1): process entrypoint
- [src/config.ts](/Users/andrew/dev/frame/apps/server-v2/src/config.ts#L1): environment-driven config
- [src/server.ts](/Users/andrew/dev/frame/apps/server-v2/src/server.ts#L1): HTTP routing and WebSocket upgrade handling
- [src/codex-bridge.ts](/Users/andrew/dev/frame/apps/server-v2/src/codex-bridge.ts#L62): per-connection bridge between browser and Codex
- [src/jsonl.ts](/Users/andrew/dev/frame/apps/server-v2/src/jsonl.ts#L1): newline-delimited JSON encoding and parsing
- [src/validation.ts](/Users/andrew/dev/frame/apps/server-v2/src/validation.ts#L58): schema-backed browser message validation

## Runtime Model

### 1. HTTP Surface

`server-v2` uses `createServer()` from `node:http` and a small manual router in [src/server.ts](/Users/andrew/dev/frame/apps/server-v2/src/server.ts#L65).

Supported routes:

- `GET /healthz`
- `GET /version`
- everything else returns `404`

There is no framework routing layer, middleware stack, or REST API for creating sessions.

### 2. WebSocket Upgrade

The HTTP server listens for `upgrade` events and only accepts the `/ws` path in [src/server.ts](/Users/andrew/dev/frame/apps/server-v2/src/server.ts#L104).

`ws` is used with `noServer: true`, which keeps HTTP ownership in Node core while delegating RFC6455 details to the library. This matches the v2 constraint of using Node APIs for server lifecycle and allowing `ws` only for WebSocket framing.

### 3. One Socket, One Upstream Process

When a WebSocket is accepted, `server-v2` constructs a `CodexBridge` and immediately spawns `codex app-server` over stdio in [src/codex-bridge.ts](/Users/andrew/dev/frame/apps/server-v2/src/codex-bridge.ts#L75).

This is the core ownership rule:

- one browser WebSocket connection
- one `CodexBridge`
- one child process running `codex app-server`

That upstream Codex connection then handles all `thread/*` and `turn/*` operations for that browser connection.

## Browser Protocol

The browser-facing protocol is raw JSON-RPC 2.0.

`server-v2` expects the browser to send:

- `initialize` as the first request
- `initialized` as the follow-up notification
- normal Codex client requests afterward, such as `model/list`, `thread/start`, `thread/resume`, `thread/list`, `thread/read`, `turn/start`, `turn/steer`, and `turn/interrupt`

`server-v2` forwards upstream JSON-RPC messages unchanged:

- responses
- notifications
- server-initiated requests

This is intentionally different from the legacy server, which wrapped messages in custom envelope types like `rpc.request`, `rpc.response`, `serverRequest.respond`, and `session.ready`.

## Handshake Rules

Handshake enforcement lives in [src/codex-bridge.ts](/Users/andrew/dev/frame/apps/server-v2/src/codex-bridge.ts#L208).

Rules:

- The first browser request must be `initialize`.
- Before `initialize` is seen, non-initialize requests receive a JSON-RPC error response with code `-32002`.
- After `initialize`, the browser must send `initialized`.
- Duplicate `initialize` or duplicate `initialized` messages are treated as protocol violations.
- `initialize` must complete before the configured timeout or the connection is closed.

The bridge tracks the in-flight initialize request ID so it can clear the timeout when the upstream initialize response arrives.

## Upstream Transport

Upstream communication is done over stdio.

- Outbound messages are serialized to JSON and terminated with `\n` in [src/jsonl.ts](/Users/andrew/dev/frame/apps/server-v2/src/jsonl.ts#L3).
- Inbound stdout is buffered until newline boundaries and parsed as JSON in [src/jsonl.ts](/Users/andrew/dev/frame/apps/server-v2/src/jsonl.ts#L7).

This keeps the transport logic simple and aligned with `codex app-server`'s JSONL stdio model.

## Request And Response Routing

The bridge has three routing paths in [src/codex-bridge.ts](/Users/andrew/dev/frame/apps/server-v2/src/codex-bridge.ts#L170):

- Browser requests are forwarded upstream after handshake checks.
- Browser notifications are forwarded upstream after handshake checks.
- Browser JSON-RPC responses are only accepted if they match an upstream server-initiated request ID.

For upstream traffic:

- upstream responses are forwarded to the browser
- upstream notifications are forwarded to the browser
- upstream server requests are forwarded to the browser and their IDs are tracked in `#pendingServerRequestIds`

That ID tracking is what allows approval requests and user-input requests from Codex to round-trip through the browser safely.

## Validation Strategy

Validation in v2 is split into two layers:

### Compile-Time

The shared `@workspace/protocol` package still provides the generated TypeScript types consumed by `server-v2`.

### Runtime

`server-v2` validates inbound browser JSON-RPC messages against JSON Schema generated from `codex app-server`.

The validator is implemented in [src/validation.ts](/Users/andrew/dev/frame/apps/server-v2/src/validation.ts#L58) and loads the generated schema bundle through [packages/protocol/src/index.ts](/Users/andrew/dev/frame/packages/protocol/src/index.ts#L355).

The runtime validator currently accepts these browser-originated shapes:

- `ClientRequest`
- `ClientNotification`
- `JSONRPCResponse`

If parsing or validation fails, the server closes the WebSocket with a policy violation rather than attempting to continue in an undefined state.

## Protocol Package Changes

The shared protocol package was updated so generated artifacts are part of the normal workflow.

In [packages/protocol/package.json](/Users/andrew/dev/frame/packages/protocol/package.json#L6):

- `codex:generate` now generates both TypeScript and JSON Schema
- `build` now copies generated schema assets into `dist`

Generated schema assets are committed under:

- `/Users/andrew/dev/frame/packages/protocol/src/generated/schemas/`

This keeps local development and test runs deterministic without requiring generation during package install.

One important nuance: the protocol package still contains legacy envelope types used by `apps/server`. `server-v2` does not use those envelopes for its transport path, but they remain in the shared package while the legacy server still exists.

## Configuration

Runtime configuration is loaded from environment variables in [src/config.ts](/Users/andrew/dev/frame/apps/server-v2/src/config.ts#L29).

Supported values:

- `PORT`
- `CODEX_COMMAND`
- `CODEX_APP_SERVER_ARGS`
- `CODEX_INITIALIZE_TIMEOUT_MS`

Defaults:

- port `8788`
- command `codex`
- args `app-server`
- initialize timeout `10000ms`

The server also reports fixed local client metadata through `/version`.

## Failure Handling

`server-v2` treats protocol and process failures explicitly:

- invalid browser JSON closes the socket
- invalid browser JSON-RPC shape closes the socket
- unexpected browser response IDs close the socket
- unexpected notifications during handshake close the socket
- initialize timeout closes the socket
- upstream process errors close the socket
- upstream process exit closes the socket

This is stricter than the legacy server's envelope-based error reporting because v2 is acting as a direct JSON-RPC bridge, not a higher-level session broker.

## Why There Is No Manager Yet

The original design discussion considered a server-side manager for multiple app servers. That was deliberately deferred for v1.

Reasons:

- one upstream Codex connection already supports multiple threads
- the browser can keep separate WebSocket connections when it wants isolated upstream processes
- a manager would add lifecycle and ownership complexity before the core transport is stable

If a future version needs shared process pools, reconnectability, or explicit thread-to-process placement, that should be added behind the WebSocket handler and `CodexBridge` boundary rather than by changing the browser contract again.

## Testing Coverage

The test suite in [test/server.test.ts](/Users/andrew/dev/frame/apps/server-v2/test/server.test.ts#L106) covers the current contract:

- generated schema bundle loads
- `/healthz` and `/version` work
- invalid WebSocket upgrade paths are rejected
- `initialize` and `initialized` are proxied correctly
- pre-initialize requests are rejected
- `model/list`, `thread/start`, and `turn/start` round-trip over raw JSON-RPC
- upstream server requests are forwarded and browser responses route back upstream
- invalid JSON closes the socket
- initialize timeout closes the socket
- upstream exit closes the socket

## Current Scope

`server-v2` is only the server scaffold for the new architecture. It does not yet include:

- browser-side integration in `web`
- reconnection or resumable browser transport
- a shared multi-process manager
- richer HTTP control APIs

Those can be layered on top of this transport once the browser contract is wired in and the thread/turn UX is validated.
