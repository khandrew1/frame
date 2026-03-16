import { EventEmitter } from "node:events"
import type { Readable, Writable } from "node:stream"

import {
  type CodexClientNotification,
  type CodexClientRequest,
  jsonRpcMessageSchema,
  type JsonRpcId,
  type JsonRpcNotification,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from "@workspace/protocol"
import { WebSocket, type RawData } from "ws"

import { type ServerV2Config } from "./config.js"
import { encodeJsonLine, JsonLineParser } from "./jsonl.js"
import {
  createBrowserMessageValidator,
  type BrowserMessageValidator,
} from "./validation.js"

export type ChildProcessLike = EventEmitter & {
  stdin: Writable
  stdout: Readable
  stderr: Readable
  kill(signal?: NodeJS.Signals | number): boolean
}

export type SpawnProcess = () => ChildProcessLike

function isJsonRpcRequest(message: unknown): message is JsonRpcRequest {
  return (
    typeof message === "object" &&
    message !== null &&
    "id" in message &&
    "method" in message
  )
}

function isJsonRpcNotification(
  message: unknown
): message is JsonRpcNotification {
  return (
    typeof message === "object" &&
    message !== null &&
    "method" in message &&
    !("id" in message)
  )
}

function isJsonRpcResponse(message: unknown): message is JsonRpcResponse {
  return (
    typeof message === "object" &&
    message !== null &&
    "id" in message &&
    ("result" in message || "error" in message)
  )
}

function toCloseReason(message: string) {
  return message.slice(0, 123)
}

export class CodexBridge {
  #config: ServerV2Config
  #validator: BrowserMessageValidator
  #ws: WebSocket
  #process: ChildProcessLike
  #parser = new JsonLineParser()
  #pendingServerRequestIds = new Set<JsonRpcId>()
  #initializeRequestId: JsonRpcId | null = null
  #initializeRequestSeen = false
  #initializedNotificationSeen = false
  #initializeTimer: NodeJS.Timeout | null = null
  #closed = false

  constructor(
    config: ServerV2Config,
    ws: WebSocket,
    spawnProcess: SpawnProcess,
    validator = createBrowserMessageValidator()
  ) {
    this.#config = config
    this.#validator = validator
    this.#ws = ws
    this.#process = spawnProcess()
  }

  start() {
    this.#wireBrowserSocket()
    this.#wireChildProcess()
  }

  close() {
    if (this.#closed) {
      return
    }

    this.#closed = true
    if (this.#initializeTimer) {
      clearTimeout(this.#initializeTimer)
      this.#initializeTimer = null
    }

    this.#pendingServerRequestIds.clear()
    this.#process.kill()
  }

  #wireBrowserSocket() {
    this.#ws.on("message", (raw: RawData) => {
      this.#handleBrowserMessage(raw)
    })

    this.#ws.on("close", () => {
      this.close()
    })

    this.#ws.on("error", () => {
      this.close()
    })
  }

  #wireChildProcess() {
    this.#process.stdout.on("data", (chunk: Buffer | string) => {
      try {
        const messages = this.#parser.push(chunk)
        for (const message of messages) {
          this.#handleUpstreamMessage(message)
        }
      } catch (error) {
        this.#closeWithInternalError(
          error instanceof Error
            ? error.message
            : "Failed to parse codex app-server output."
        )
      }
    })

    this.#process.stderr.on("data", (chunk: Buffer | string) => {
      const text = chunk.toString().trim()
      if (text.length > 0) {
        console.error(`[server] codex stderr: ${text}`)
      }
    })

    this.#process.on("error", (error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to start codex app-server."

      this.#closeWithInternalError(message)
    })

    this.#process.on(
      "exit",
      (code: number | null, signal: NodeJS.Signals | null) => {
        if (this.#closed) {
          return
        }

        const message =
          signal === null
            ? `Codex app-server exited with code ${code ?? 0}.`
            : `Codex app-server exited from signal ${signal}.`

        this.#closeWithInternalError(message)
      }
    )
  }

  #handleBrowserMessage(raw: RawData) {
    if (this.#closed) {
      return
    }

    let decoded: unknown
    try {
      decoded = JSON.parse(raw.toString())
    } catch {
      this.#closeWithPolicyViolation("Invalid JSON payload from browser.")
      return
    }

    const validation = this.#validator.validate(decoded)
    if (!validation.ok) {
      this.#closeWithPolicyViolation(validation.error)
      return
    }

    const message = validation.value
    if (isJsonRpcRequest(message)) {
      this.#handleBrowserRequest(message as CodexClientRequest)
      return
    }

    if (isJsonRpcNotification(message)) {
      this.#handleBrowserNotification(message as CodexClientNotification)
      return
    }

    if (isJsonRpcResponse(message)) {
      this.#handleBrowserResponse(message)
      return
    }

    this.#closeWithPolicyViolation("Unsupported JSON-RPC message from browser.")
  }

  #handleBrowserRequest(message: CodexClientRequest) {
    if (!this.#initializeRequestSeen) {
      if (message.method !== "initialize") {
        this.#sendJson({
          id: message.id,
          error: {
            code: -32002,
            message: "Connection not initialized.",
          },
        })
        return
      }

      this.#initializeRequestSeen = true
      this.#initializeRequestId = message.id
      this.#initializeTimer = setTimeout(() => {
        this.#closeWithInternalError(
          "Timed out waiting for initialize response."
        )
      }, this.#config.initializeTimeoutMs)
      this.#writeUpstream(message)
      return
    }

    if (message.method === "initialize") {
      this.#sendJson({
        id: message.id,
        error: {
          code: -32600,
          message: "Initialize may only be sent once per connection.",
        },
      })
      return
    }

    if (!this.#initializedNotificationSeen) {
      this.#sendJson({
        id: message.id,
        error: {
          code: -32002,
          message: "Connection not initialized.",
        },
      })
      return
    }

    this.#writeUpstream(message)
  }

  #handleBrowserNotification(message: CodexClientNotification) {
    if (!this.#initializeRequestSeen || message.method !== "initialized") {
      this.#closeWithPolicyViolation(
        "Unexpected JSON-RPC notification before initialization completed."
      )
      return
    }

    if (this.#initializedNotificationSeen) {
      this.#closeWithPolicyViolation(
        "Initialized notification may only be sent once per connection."
      )
      return
    }

    this.#initializedNotificationSeen = true
    this.#writeUpstream(message)
  }

  #handleBrowserResponse(message: JsonRpcResponse) {
    if (!this.#pendingServerRequestIds.has(message.id)) {
      this.#closeWithPolicyViolation(
        "Unexpected JSON-RPC response from browser."
      )
      return
    }

    this.#pendingServerRequestIds.delete(message.id)
    this.#writeUpstream(message)
  }

  #handleUpstreamMessage(message: unknown) {
    const parsed = jsonRpcMessageSchema.safeParse(message)
    if (!parsed.success) {
      this.#closeWithInternalError(
        "Received invalid JSON-RPC message from codex."
      )
      return
    }

    const jsonRpcMessage = parsed.data
    if (isJsonRpcResponse(jsonRpcMessage)) {
      if (
        this.#initializeRequestId !== null &&
        jsonRpcMessage.id === this.#initializeRequestId
      ) {
        if (this.#initializeTimer) {
          clearTimeout(this.#initializeTimer)
          this.#initializeTimer = null
        }
        this.#initializeRequestId = null
      }

      this.#sendJson(jsonRpcMessage)
      return
    }

    if (isJsonRpcRequest(jsonRpcMessage)) {
      this.#pendingServerRequestIds.add(jsonRpcMessage.id)
      this.#sendJson(jsonRpcMessage)
      return
    }

    this.#sendJson(jsonRpcMessage)
  }

  #writeUpstream(
    message: CodexClientRequest | CodexClientNotification | JsonRpcResponse
  ) {
    this.#process.stdin.write(encodeJsonLine(message))
  }

  #sendJson(message: JsonRpcRequest | JsonRpcNotification | JsonRpcResponse) {
    if (this.#ws.readyState !== WebSocket.OPEN) {
      return
    }

    this.#ws.send(JSON.stringify(message))
  }

  #closeWithPolicyViolation(message: string) {
    if (this.#ws.readyState === WebSocket.OPEN) {
      this.#ws.close(1008, toCloseReason(message))
    }
    this.close()
  }

  #closeWithInternalError(message: string) {
    if (this.#ws.readyState === WebSocket.OPEN) {
      this.#ws.close(1011, toCloseReason(message))
    }
    this.close()
  }
}
