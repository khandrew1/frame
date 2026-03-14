import { EventEmitter } from "node:events"
import { randomUUID } from "node:crypto"
import type { Readable, Writable } from "node:stream"

import {
  encodeJsonLine,
  JsonLineParser,
} from "./jsonl.js"
import {
  type CodexClientNotification,
  type CodexClientRequest,
  type CodexServerRequestResponse,
  isCodexServerNotification,
  isCodexServerRequest,
  jsonRpcMessageSchema,
  type JsonRpcError,
  type JsonRpcId,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type ServerToBrowserMessage,
  type SessionErrorCode,
} from "@workspace/protocol"

export type ChildProcessLike = EventEmitter & {
  stdin: Writable
  stdout: Readable
  stderr: Readable
  kill(signal?: NodeJS.Signals | number): boolean
}

export type SessionEventMap = {
  message: [message: ServerToBrowserMessage]
  exit: [code: number | null, signal: NodeJS.Signals | null]
  ready: []
}

export type SessionOptions = {
  process: ChildProcessLike
  sessionId?: string
  initializeTimeoutMs: number
  experimentalApi: boolean
  clientInfo: {
    name: string
    title: string
    version: string
  }
}

type PendingRequest = {
  resolve: (message: JsonRpcResponse) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout | null
}

function isResponse(message: unknown): message is JsonRpcResponse {
  return (
    typeof message === "object" &&
    message !== null &&
    "id" in message &&
    ("result" in message || "error" in message)
  )
}

function isErrorResponse(message: JsonRpcResponse): message is JsonRpcError {
  return "error" in message
}

function isRequest(message: unknown): message is JsonRpcRequest {
  return (
    typeof message === "object" &&
    message !== null &&
    "id" in message &&
    "method" in message
  )
}

function toErrorMessage(
  code: SessionErrorCode,
  message: string,
  retryable = false
) {
  return {
    type: "session.error" as const,
    code,
    message,
    retryable,
  }
}

export class CodexSession extends EventEmitter<SessionEventMap> {
  readonly sessionId: string

  #process: ChildProcessLike
  #initializeTimeoutMs: number
  #experimentalApi: boolean
  #clientInfo: SessionOptions["clientInfo"]
  #parser = new JsonLineParser()
  #pendingRequests = new Map<JsonRpcId, PendingRequest>()
  #isClosed = false
  #isReady = false

  constructor(options: SessionOptions) {
    super()
    this.sessionId = options.sessionId ?? randomUUID()
    this.#process = options.process
    this.#initializeTimeoutMs = options.initializeTimeoutMs
    this.#experimentalApi = options.experimentalApi
    this.#clientInfo = options.clientInfo
  }

  async initialize() {
    this.#wireProcess()

    const params: Extract<
      CodexClientRequest,
      { method: "initialize" }
    >["params"] = {
      clientInfo: this.#clientInfo,
      capabilities: null,
    }

    if (this.#experimentalApi) {
      params.capabilities = {
        experimentalApi: true,
      }
    }

    const response = await this.sendRequest(
      {
        id: 0,
        method: "initialize",
        params,
      },
      { timeoutMs: this.#initializeTimeoutMs }
    )

    if (isErrorResponse(response)) {
      const message = response.error.message || "Codex initialize failed."
      throw new Error(message)
    }

    this.sendNotification({
      method: "initialized",
    })

    this.#isReady = true
    this.emit("ready")
  }

  sendRequest(
    message: CodexClientRequest,
    options?: {
      timeoutMs?: number
    }
  ) {
    return new Promise<JsonRpcResponse>((resolve, reject) => {
      const timeout =
        options?.timeoutMs === undefined
          ? null
          : setTimeout(() => {
              this.#pendingRequests.delete(message.id)
              reject(new Error(`Timed out waiting for ${message.method} response.`))
            }, options.timeoutMs)

      this.#pendingRequests.set(message.id, {
        resolve: (response) => {
          if (timeout) {
            clearTimeout(timeout)
          }
          resolve(response)
        },
        reject: (error) => {
          if (timeout) {
            clearTimeout(timeout)
          }
          reject(error)
        },
        timeout,
      })

      this.#write(message)
    })
  }

  sendNotification(message: CodexClientNotification) {
    this.#write(message)
  }

  sendServerRequestResponse(message: CodexServerRequestResponse) {
    this.#write(message)
  }

  close() {
    if (this.#isClosed) {
      return
    }

    this.#isClosed = true
    for (const pending of this.#pendingRequests.values()) {
      pending.reject(new Error("Session closed before response was received."))
    }
    this.#pendingRequests.clear()
    this.#process.kill()
  }

  get isReady() {
    return this.#isReady
  }

  #write(
    message: CodexClientRequest | CodexClientNotification | JsonRpcResponse
  ) {
    this.#process.stdin.write(encodeJsonLine(message))
  }

  #wireProcess() {
    this.#process.stdout.on("data", (chunk) => {
      try {
        const messages = this.#parser.push(chunk)
        for (const message of messages) {
          this.#handleIncomingMessage(message)
        }
      } catch (error) {
        this.emit(
          "message",
          toErrorMessage(
            "invalid_message",
            error instanceof Error ? error.message : "Failed to parse child output."
          )
        )
      }
    })

    this.#process.stderr.on("data", (chunk) => {
      const text = chunk.toString().trim()
      if (!text) {
        return
      }

      this.emit("message", toErrorMessage("child_stderr", text))
    })

    this.#process.on("error", (error) => {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to start Codex app-server."

      this.#rejectPendingRequests(new Error(message))
      this.emit(
        "message",
        toErrorMessage(
          "spawn_failed",
          message,
          true
        )
      )
    })

    this.#process.on("exit", (code, signal) => {
      this.#isClosed = true
      this.#rejectPendingRequests(
        new Error("Codex app-server exited before responding.")
      )

      if (this.#isReady) {
        const reason = signal
          ? `Codex app-server exited with signal ${signal}.`
          : `Codex app-server exited with code ${code ?? "unknown"}.`
        this.emit("message", toErrorMessage("child_exit", reason, true))
      }

      this.emit("exit", code, signal)
    })
  }

  #handleIncomingMessage(message: unknown) {
    const parsed = jsonRpcMessageSchema.safeParse(message)
    if (!parsed.success) {
      throw new Error("Received invalid JSON-RPC message from Codex app-server.")
    }

    if (isResponse(parsed.data)) {
      const pending = this.#pendingRequests.get(parsed.data.id)
      if (!pending) {
        this.emit(
          "message",
          toErrorMessage(
            "protocol_error",
            `Received response for unknown request id ${String(parsed.data.id)}.`
          )
        )
        return
      }

      this.#pendingRequests.delete(parsed.data.id)
      pending.resolve(parsed.data)
      if (this.#isReady) {
        this.emit("message", {
          type: "rpc.response",
          message: parsed.data,
        })
      }
      return
    }

    if (isRequest(parsed.data)) {
      if (!isCodexServerRequest(parsed.data)) {
        this.emit(
          "message",
          toErrorMessage(
            "protocol_error",
            `Received unsupported server request method ${parsed.data.method}.`
          )
        )
        return
      }

      this.emit("message", {
        type: "serverRequest.request",
        message: parsed.data,
      })
      return
    }

    if (!isCodexServerNotification(parsed.data)) {
      this.emit(
        "message",
        toErrorMessage(
          "protocol_error",
          `Received unsupported server notification method ${parsed.data.method}.`
        )
      )
      return
    }

    this.emit("message", {
      type: "rpc.notification",
      message: parsed.data,
    })
  }

  #rejectPendingRequests(error: Error) {
    for (const pending of this.#pendingRequests.values()) {
      pending.reject(error)
    }
    this.#pendingRequests.clear()
  }
}
