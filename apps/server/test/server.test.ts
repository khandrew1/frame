import { afterEach, describe, expect, it } from "vitest"

import { loadConfig } from "../src/config.js"
import { SessionRegistry } from "../src/codex/session-registry.js"
import { createApp } from "../src/app.js"
import { createHttpServer } from "../src/ws.js"
import { FakeChildProcess } from "./fakes.js"

async function waitForOpen(socket: WebSocket) {
  if (socket.readyState === WebSocket.OPEN) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true })
    socket.addEventListener("error", (event) => reject(event), { once: true })
  })
}

async function waitForMessage(socket: WebSocket) {
  return new Promise<unknown>((resolve) => {
    socket.addEventListener(
      "message",
      (event) => {
        resolve(JSON.parse(String(event.data)))
      },
      { once: true }
    )
  })
}

async function waitForCondition(check: () => boolean, timeoutMs = 1_000) {
  const start = Date.now()

  while (!check()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition.")
    }

    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

async function closeSocket(socket: WebSocket) {
  if (socket.readyState === WebSocket.CLOSED) {
    return
  }

  await new Promise<void>((resolve) => {
    socket.addEventListener("close", () => resolve(), { once: true })
    socket.close()
  })
}

describe("server smoke test", () => {
  const servers: Array<ReturnType<typeof createHttpServer>> = []
  const sockets: WebSocket[] = []

  afterEach(async () => {
    await Promise.all(sockets.map((socket) => closeSocket(socket)))
    sockets.length = 0

    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => {
              if (error) {
                reject(error)
                return
              }

              resolve()
            })
          })
      )
    )
    servers.length = 0
  })

  it("creates a session and streams notifications over websocket", async () => {
    const fake = new FakeChildProcess()
    const config = loadConfig()
    const registry = new SessionRegistry({
      reconnectTtlMs: 50,
      initializeTimeoutMs: 100,
      experimentalApi: false,
      clientInfo: config.clientInfo,
      spawnProcess: () => fake,
    })
    queueMicrotask(() => {
      fake.send({ id: 0, result: {} })
    })

    const app = createApp(config, registry)
    const server = createHttpServer(app, registry)
    servers.push(server)

    await new Promise<void>((resolve) => {
      server.listen(0, resolve)
    })

    const address = server.address()
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP server address.")
    }

    const baseUrl = `http://127.0.0.1:${address.port}`
    const createResponse = await fetch(`${baseUrl}/api/sessions`, {
      method: "POST",
    })
    const createPayload = (await createResponse.json()) as {
      sessionId: string
      wsUrl: string
    }

    const socket = new WebSocket(createPayload.wsUrl)
    sockets.push(socket)
    await waitForOpen(socket)

    const readyMessage = await waitForMessage(socket)
    expect(readyMessage).toEqual({
      type: "session.ready",
      sessionId: createPayload.sessionId,
    })

    fake.send({
      method: "turn/started",
      params: {
        turn: { id: "turn_123" },
      },
    })

    const notification = await waitForMessage(socket)
    expect(notification).toEqual({
      type: "rpc.notification",
      message: {
        method: "turn/started",
        params: {
          turn: { id: "turn_123" },
        },
      },
    })

    socket.send(
      JSON.stringify({
        type: "rpc.request",
        message: {
          id: 10,
          method: "thread/start",
          params: {
            model: "gpt-5.1-codex",
          },
        },
      })
    )

    await waitForCondition(() =>
      fake.writtenMessages.some(
        (message) =>
          typeof message === "object" &&
          message !== null &&
          "id" in message &&
          message.id === 10
      )
    )

    fake.send({
      id: 10,
      result: {
        thread: {
          id: "thr_123",
        },
      },
    })

    const response = await waitForMessage(socket)
    expect(response).toEqual({
      type: "rpc.response",
      message: {
        id: 10,
        result: {
          thread: {
            id: "thr_123",
          },
        },
      },
    })
  })

  it("returns a degraded health response when codex is unavailable", async () => {
    const config = {
      ...loadConfig(),
      codexCommand: "/definitely/missing/codex",
    }
    const registry = new SessionRegistry({
      reconnectTtlMs: 50,
      initializeTimeoutMs: 100,
      experimentalApi: false,
      clientInfo: config.clientInfo,
      spawnProcess: () => new FakeChildProcess(),
    })
    const app = createApp(config, registry)

    const response = await app.request("http://localhost/healthz")
    const payload = (await response.json()) as {
      ok: boolean
      codexAvailable: boolean
      version: string | null
      error: string | null
    }

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(false)
    expect(payload.codexAvailable).toBe(false)
    expect(payload.version).toBeNull()
    expect(payload.error).toBeTruthy()
  })

  it("expires sessions that never attach a websocket", async () => {
    const fake = new FakeChildProcess()
    const config = loadConfig()
    const registry = new SessionRegistry({
      reconnectTtlMs: 25,
      initializeTimeoutMs: 100,
      experimentalApi: false,
      clientInfo: config.clientInfo,
      spawnProcess: () => fake,
    })

    queueMicrotask(() => {
      fake.send({ id: 0, result: {} })
    })

    const sessionId = await registry.createSession()
    expect(registry.hasSession(sessionId)).toBe(true)

    await waitForCondition(() => !registry.hasSession(sessionId))
  })
})
