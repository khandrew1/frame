# Architecture

This document describes the backend architecture that currently exists in this repo for the Codex GUI wrapper, why it is shaped this way, and what is still missing.

## Purpose

The goal of this project is to present a GUI on top of `codex app-server`.

The current backend does not try to reimplement Codex behavior. It acts as a thin bridge between:

- a browser client
- a Node/Hono server
- a local `codex app-server` child process

The backend is responsible for:

- spawning and owning Codex app-server processes
- performing the required Codex initialize handshake
- exposing a stable browser-facing HTTP + WebSocket API
- relaying JSON-RPC traffic between the browser and Codex
- handling session lifecycle, reconnect windows, and basic error cases

The backend is intentionally small right now. It is mostly transport and lifecycle management.

## Workspace layout

Relevant packages:

- [`apps/server`](apps/server): Node/Hono backend that talks to Codex app-server
- [`apps/web`](apps/web): frontend app
- [`packages/protocol`](packages/protocol): shared message schemas and types used between browser and backend

This split is intentional:

- `apps/server` contains runtime code, process management, and network I/O
- `packages/protocol` contains the transport contract that the frontend can safely import without reaching into backend internals

## High-level flow

The current request path looks like this:

```text
Browser
  -> POST /api/sessions
  -> receive { sessionId, wsUrl }
  -> connect to /ws/:sessionId
  -> send browser wrapper messages over WebSocket

apps/server
  -> creates a SessionRegistry entry
  -> spawns `codex app-server`
  -> sends initialize
  -> sends initialized
  -> relays JSON-RPC messages in both directions

codex app-server
  -> receives JSONL over stdio
  -> emits responses, notifications, and server-initiated requests
```

The important design choice is that Codex is treated as the source of truth for agent behavior, thread state, approvals, and streaming events. The backend only wraps transport and session ownership.

## Current server components

### 1. Startup and config

Files:

- [`apps/server/src/index.ts`](apps/server/src/index.ts)
- [`apps/server/src/config.ts`](apps/server/src/config.ts)

`index.ts` wires the backend together:

1. load config
2. construct a `SessionRegistry`
3. construct the Hono app
4. create the HTTP server with WebSocket upgrade handling
5. listen on the configured port

Current config values:

- `PORT`
  Default: `8787`
- `SESSION_RECONNECT_TTL_MS`
  Default: `30000`
- `CODEX_INITIALIZE_TIMEOUT_MS`
  Default: `10000`
- `CODEX_COMMAND`
  Default: `codex`
- `CODEX_APP_SERVER_ARGS`
  Default: `app-server`
- `FRAME_CODEX_EXPERIMENTAL_API`
  Default: `false`

The server also sends a fixed `clientInfo` block during Codex initialization:

- `name: frame_gui`
- `title: Frame GUI`
- `version: 0.0.1`

### 2. HTTP API

File:

- [`apps/server/src/app.ts`](apps/server/src/app.ts)

Current endpoints:

- `GET /healthz`
- `POST /api/sessions`

`GET /healthz`:

- runs `codex --version` using `spawnSync`
- reports whether the binary is executable
- safely returns a degraded response when the binary is missing or invalid

`POST /api/sessions`:

- asks `SessionRegistry` to create a new session
- returns:
  - `sessionId`
  - `wsUrl`

The backend does not yet have auth, user identity, persistence, rate limiting, or admin endpoints.

### 3. WebSocket transport

File:

- [`apps/server/src/ws.ts`](apps/server/src/ws.ts)

The backend uses a plain Node HTTP server plus `ws` for upgrades.

Why:

- Hono handles the HTTP side cleanly
- `ws` gives direct control over upgrade lifecycle and socket ownership
- the frontend needs a bidirectional connection because Codex can send:
  - streaming notifications
  - server-initiated approval requests
  - other server requests

Current WebSocket route:

- `/ws/:sessionId`

Upgrade flow:

1. parse `sessionId` from the URL
2. ask `SessionRegistry` to attach the socket
3. if attach fails, return a `session.error` message and close
4. validate every incoming browser message with `zod`
5. pass valid messages to `SessionRegistry`

The server does not currently support multiple browser sockets per session. A session is effectively single-client.

### 4. Session registry

File:

- [`apps/server/src/codex/session-registry.ts`](apps/server/src/codex/session-registry.ts)

`SessionRegistry` is the main backend coordinator.

It owns a map of:

- `sessionId -> SessionRecord`

Where `SessionRecord` contains:

- `session`: the `CodexSession` instance
- `socket`: the currently attached browser WebSocket, if any
- `expiryTimer`: reconnect / orphan cleanup timer

Responsibilities:

- spawn new Codex-backed sessions
- attach and detach browser sockets
- enforce one active socket per session
- close sessions when TTL expires
- forward browser messages to the correct session
- forward session events back to the active socket

Important lifecycle behavior:

- after `createSession()` completes initialization, it immediately starts a TTL
- if the browser never opens the WebSocket, the session is eventually cleaned up
- when a socket attaches, the TTL is cleared
- when a socket disconnects, the TTL is started again
- if the TTL fires, the child process is killed and the session is removed

This fixes a real resource leak case: a client can create a session but never attach a socket.

### 5. Codex session transport

File:

- [`apps/server/src/codex/session.ts`](apps/server/src/codex/session.ts)

`CodexSession` wraps one `codex app-server` process.

It owns:

- the child process
- a JSONL parser for stdout
- a pending request map keyed by JSON-RPC `id`
- readiness state

Responsibilities:

- send the Codex initialize handshake
- write JSON-RPC requests, notifications, and responses to stdin
- parse JSONL messages from stdout
- classify each inbound message as:
  - response
  - request
  - notification
- emit normalized backend events for the `SessionRegistry`

Initialize sequence:

1. start listening to child stdout/stderr/error/exit
2. send:
   - `initialize`
3. wait for response `id: 0`
4. send:
   - `initialized`
5. mark session ready

The session currently treats Codex messages generically. It validates JSON-RPC shape, but it does not validate method-specific payloads like `turn/start.params` or `item/started.params`.

### 6. JSONL framing

File:

- [`apps/server/src/codex/jsonl.ts`](apps/server/src/codex/jsonl.ts)

Codex stdio uses newline-delimited JSON.

This helper does two jobs:

- `encodeJsonLine(message)` serializes one outbound message plus `\n`
- `JsonLineParser` buffers partial chunks and emits parsed JSON objects per complete line

This matters because process stdout may arrive in arbitrary chunk boundaries.

### 7. Shared browser/backend protocol

File:

- [`packages/protocol/src/index.ts`](packages/protocol/src/index.ts)

This package defines the contract between the frontend and backend.

It currently contains:

- generic JSON-RPC schemas
  - request
  - response
  - notification
- browser-to-server wrapper messages
  - `rpc.request`
  - `serverRequest.respond`
  - `session.close`
- server-to-browser wrapper messages
  - `session.ready`
  - `rpc.response`
  - `rpc.notification`
  - `serverRequest.request`
  - `session.error`

Current state:

- the wrapper transport messages are still defined locally in `packages/protocol`
- the inner Codex request / notification / server-request unions now come from generated `codex app-server generate-ts` output checked into `packages/protocol/src/generated/codex`
- runtime validation remains envelope-level plus method-name filtering
- compile-time safety for stable app-server methods now comes from the generated TypeScript bindings

Operational note:

- regenerate the checked-in Codex bindings with `pnpm --filter @workspace/protocol codex:generate` whenever the local Codex CLI version changes

## Message flow in detail

### Creating a session

1. frontend calls `POST /api/sessions`
2. backend spawns `codex app-server`
3. backend performs `initialize` and `initialized`
4. backend stores the session in `SessionRegistry`
5. backend returns `{ sessionId, wsUrl }`
6. backend starts orphan cleanup TTL immediately

### Attaching the browser

1. frontend connects to `/ws/:sessionId`
2. backend verifies the session exists and does not already have an active socket
3. backend clears the expiry timer
4. backend sends:
   - `session.ready`

### Sending a normal Codex request

1. frontend sends:
   - `type: "rpc.request"`
2. backend validates the wrapper schema
3. backend forwards the inner JSON-RPC request to Codex stdin
4. Codex responds on stdout
5. backend matches the response by `id`
6. backend sends:
   - `type: "rpc.response"`

### Receiving Codex notifications

1. Codex emits a JSON-RPC notification such as `turn/started`
2. backend parses it as a notification
3. backend sends:
   - `type: "rpc.notification"`

### Handling server-initiated requests

This is used for approvals and other Codex-initiated interactions.

1. Codex emits a JSON-RPC request with an `id`
2. backend classifies it as `serverRequest.request`
3. frontend renders UI and decides how to answer
4. frontend sends:
   - `type: "serverRequest.respond"`
5. backend writes the JSON-RPC response back to Codex stdin

## Current error handling

Current explicit server-side error classes:

- invalid browser WebSocket JSON
- invalid browser wrapper message shape
- session not found
- session already has an active socket
- malformed JSON from Codex stdout
- child stderr output
- child process spawn failure
- child process exit
- unknown JSON-RPC response id
- initialize timeout

Notable recent fixes:

- `/healthz` no longer crashes when `codex` is missing
- sessions that never attach a browser socket now expire
- child-process `error` rejects pending initialize instead of waiting for timeout

## Test coverage that exists today

Files:

- [`apps/server/test/jsonl.test.ts`](apps/server/test/jsonl.test.ts)
- [`apps/server/test/session.test.ts`](apps/server/test/session.test.ts)
- [`apps/server/test/server.test.ts`](apps/server/test/server.test.ts)

Current coverage includes:

- JSONL framing and partial chunk handling
- initialize handshake
- forwarding notifications
- routing server-initiated requests
- forwarding `serverRequest.respond` payloads back to the child process
- rejecting browser-side `initialize` requests before they reach Codex
- child exit behavior
- spawn-error fast failure
- degraded health check when `codex` is unavailable
- session expiry when no WebSocket ever attaches
- end-to-end smoke test for HTTP session creation + WebSocket traffic

## What is intentionally missing right now

The backend is still a v1 bridge. It is not yet a complete product backend.

Missing or partial areas:

- no persistent session store
- no user auth or multi-user isolation beyond per-session process ownership
- no reconnect token or browser identity check
- no session resume after backend restart
- no metrics, structured logging, or tracing
- no rate limiting or abuse controls on `POST /api/sessions`
- no cleanup policy based on max session count or memory pressure
- no frontend integration layer yet in `apps/web`
- no higher-level SDK for the frontend to consume this transport
- no handling for some operational edge cases, such as explicit backpressure or process pools

## Recommended next steps

These are the highest-value follow-ups.

### 1. Build a frontend transport client

Add a small browser-side client in `apps/web` or `packages/` that:

- creates sessions
- owns the WebSocket lifecycle
- exposes methods for RPC requests
- exposes event subscriptions for notifications
- handles `serverRequest.request` for approvals

Right now the protocol is usable, but the frontend does not yet have a dedicated client abstraction.

### 2. Add stronger lifecycle controls

Useful next controls:

- maximum concurrent sessions
- maximum idle lifetime
- shutdown cleanup for active child processes
- explicit session status endpoint
- better reconnection semantics than "same session id within TTL"

### 3. Add structured logs and observability

At minimum:

- session create / attach / detach / expire
- child spawn / initialize / exit
- request method names
- failure reasons

This will matter quickly once the frontend starts exercising real turns.

### 5. Decide where method-specific backend logic belongs

Right now the backend is mostly transparent. That is good.

But some behavior may eventually need backend-specific handling, for example:

- auth/account flows
- approval UX simplification
- connector/app-specific policies
- model or sandbox defaults

When adding those, preserve the current principle:

- keep Codex as the source of truth
- keep the backend thin unless there is a clear product reason to add interpretation

## Mental model

The simplest way to think about the current system is:

- `apps/server` is a session manager and transport bridge
- `packages/protocol` is the browser/backend envelope contract
- `codex app-server` is the actual agent engine

If you are debugging behavior, ask these questions in order:

1. Did the browser send the correct wrapper message?
2. Did `apps/server` forward the correct inner JSON-RPC message?
3. Did `codex app-server` respond or emit a notification?
4. Did the backend classify that message correctly and relay it back to the browser?

That is the architecture as it exists today.
