import { spawn } from "node:child_process"

import { CodexSession, type ChildProcessLike } from "./session.js"
import type {
  BrowserToServerMessage,
  JsonRpcResponse,
  ServerToBrowserMessage,
} from "@workspace/protocol"
import type { WebSocket as NodeWebSocket } from "ws"

type SpawnProcess = () => ChildProcessLike

type SessionRecord = {
  session: CodexSession
  socket: NodeWebSocket | null
  expiryTimer: NodeJS.Timeout | null
}

export type SessionRegistryOptions = {
  reconnectTtlMs: number
  initializeTimeoutMs: number
  experimentalApi: boolean
  codexCommand?: string
  codexArgs?: string[]
  clientInfo: {
    name: string
    title: string
    version: string
  }
  spawnProcess?: SpawnProcess
}

export class SessionRegistry {
  #sessions = new Map<string, SessionRecord>()
  #reconnectTtlMs: number
  #initializeTimeoutMs: number
  #experimentalApi: boolean
  #codexCommand: string
  #codexArgs: string[]
  #clientInfo: SessionRegistryOptions["clientInfo"]
  #spawnProcess: SpawnProcess

  constructor(options: SessionRegistryOptions) {
    this.#reconnectTtlMs = options.reconnectTtlMs
    this.#initializeTimeoutMs = options.initializeTimeoutMs
    this.#experimentalApi = options.experimentalApi
    this.#codexCommand = options.codexCommand ?? "codex"
    this.#codexArgs = options.codexArgs ?? ["app-server"]
    this.#clientInfo = options.clientInfo
    this.#spawnProcess =
      options.spawnProcess ??
      (() =>
        spawn(this.#codexCommand, this.#codexArgs, {
          stdio: ["pipe", "pipe", "pipe"],
        }) as ChildProcessLike)
  }

  async createSession() {
    const session = new CodexSession({
      process: this.#spawnProcess(),
      initializeTimeoutMs: this.#initializeTimeoutMs,
      experimentalApi: this.#experimentalApi,
      clientInfo: this.#clientInfo,
    })

    const record: SessionRecord = {
      session,
      socket: null,
      expiryTimer: null,
    }

    this.#sessions.set(session.sessionId, record)

    session.on("message", (message) => {
      this.#sendToSocket(session.sessionId, message)
    })

    session.on("exit", () => {
      const record = this.#sessions.get(session.sessionId)
      if (!record) {
        return
      }

      record.socket?.close()
      this.#clearExpiryTimer(record)
      this.#sessions.delete(session.sessionId)
    })

    try {
      await session.initialize()
      this.#scheduleExpiry(session.sessionId, record)
      return session.sessionId
    } catch (error) {
      const record = this.#sessions.get(session.sessionId)
      this.#clearExpiryTimer(record ?? null)
      this.#sessions.delete(session.sessionId)
      session.close()
      throw error
    }
  }

  hasSession(sessionId: string) {
    return this.#sessions.has(sessionId)
  }

  attachSocket(sessionId: string, socket: NodeWebSocket) {
    const record = this.#sessions.get(sessionId)
    if (!record) {
      return {
        ok: false as const,
        code: "session_not_found" as const,
        message: "Session was not found or has expired.",
      }
    }

    if (record.socket && record.socket.readyState === WebSocket.OPEN) {
      return {
        ok: false as const,
        code: "session_busy" as const,
        message: "Session already has an active browser connection.",
      }
    }

    this.#clearExpiryTimer(record)
    record.socket = socket
    this.#sendToSocket(sessionId, {
      type: "session.ready",
      sessionId,
    })

    return { ok: true as const }
  }

  detachSocket(sessionId: string, socket: NodeWebSocket) {
    const record = this.#sessions.get(sessionId)
    if (!record || record.socket !== socket) {
      return
    }

    record.socket = null
    this.#scheduleExpiry(sessionId, record)
  }

  async handleBrowserMessage(sessionId: string, message: BrowserToServerMessage) {
    const record = this.#sessions.get(sessionId)
    if (!record) {
      throw new Error("Session was not found.")
    }

    switch (message.type) {
      case "rpc.request":
        record.session.sendRequest(message.message).catch((error) => {
          this.#sendToSocket(sessionId, {
            type: "session.error",
            code: "protocol_error",
            message:
              error instanceof Error ? error.message : "Codex request failed.",
            retryable: false,
          })
        })
        return
      case "serverRequest.respond":
        record.session.sendServerRequestResponse(message.message as JsonRpcResponse)
        return
      case "session.close":
        this.closeSession(sessionId)
        return
    }
  }

  closeSession(sessionId: string) {
    const record = this.#sessions.get(sessionId)
    if (!record) {
      return false
    }

    this.#clearExpiryTimer(record)
    record.socket?.close()
    record.session.close()
    this.#sessions.delete(sessionId)
    return true
  }

  #sendToSocket(sessionId: string, message: ServerToBrowserMessage) {
    const record = this.#sessions.get(sessionId)
    if (!record || !record.socket || record.socket.readyState !== WebSocket.OPEN) {
      return
    }

    record.socket.send(JSON.stringify(message))
  }

  #clearExpiryTimer(record: SessionRecord | null) {
    if (!record?.expiryTimer) {
      return
    }

    clearTimeout(record.expiryTimer)
    record.expiryTimer = null
  }

  #scheduleExpiry(sessionId: string, record: SessionRecord) {
    this.#clearExpiryTimer(record)
    record.expiryTimer = setTimeout(() => {
      this.closeSession(sessionId)
    }, this.#reconnectTtlMs)
  }
}
