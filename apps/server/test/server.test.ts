import { once } from "node:events"

import { afterEach, describe, expect, it } from "vitest"
import { browserToServerMessageSchema } from "@workspace/protocol"
import { WebSocket } from "ws"

import { loadConfig } from "../src/config.js"
import { SessionRegistry } from "../src/codex/session-registry.js"
import { createApp } from "../src/app.js"
import { createHttpServer } from "../src/ws.js"
import { FakeChildProcess } from "./fakes.js"

async function waitForOpen(socket: WebSocket) {
  if (socket.readyState === WebSocket.OPEN) {
    return
  }

  await Promise.race([
    once(socket, "open").then(() => undefined),
    once(socket, "error").then(([error]) => Promise.reject(error)),
  ])
}

async function waitForMessage(socket: WebSocket) {
  const [data] = await once(socket, "message")
  return JSON.parse(data.toString())
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

  const closePromise = once(socket, "close").then(() => undefined)

  if (socket.readyState === WebSocket.OPEN) {
    socket.close()
  } else {
    socket.terminate()
  }

  await Promise.race([
    closePromise,
    new Promise<void>((resolve) => {
      setTimeout(() => {
        if (socket.readyState !== WebSocket.CLOSED) {
          socket.terminate()
        }
        resolve()
      }, 200)
    }),
  ])
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
      reconnectTtlMs: 500,
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
    const readyMessagePromise = waitForMessage(socket)
    await waitForOpen(socket)

    const readyMessage = await readyMessagePromise
    expect(readyMessage).toEqual({
      type: "session.ready",
      sessionId: createPayload.sessionId,
    })

    const notificationPromise = waitForMessage(socket)
    fake.send({
      method: "turn/started",
      params: {
        turn: { id: "turn_123" },
      },
    })

    const notification = await notificationPromise
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

    const responsePromise = waitForMessage(socket)
    fake.send({
      id: 10,
      result: {
        thread: {
          id: "thr_123",
        },
      },
    })

    const response = await responsePromise
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

  it("routes browser server request responses through the session registry", async () => {
    const fake = new FakeChildProcess()
    const config = loadConfig()
    const registry = new SessionRegistry({
      reconnectTtlMs: 500,
      initializeTimeoutMs: 100,
      experimentalApi: false,
      clientInfo: config.clientInfo,
      spawnProcess: () => fake,
    })
    queueMicrotask(() => {
      fake.send({ id: 0, result: {} })
    })

    const sessionId = await registry.createSession()

    await registry.handleBrowserMessage(sessionId, {
      type: "serverRequest.respond",
      message: {
        id: "question-1",
        result: {
          answers: {
            workspace: {
              answers: ["Use the current repo"],
            },
          },
        },
      },
    })

    await waitForCondition(() =>
      fake.writtenMessages.some(
        (message) =>
          typeof message === "object" &&
          message !== null &&
          "id" in message &&
          message.id === "question-1"
      )
    )

    expect(fake.writtenMessages).toContainEqual({
      id: "question-1",
      result: {
        answers: {
          workspace: {
            answers: ["Use the current repo"],
          },
        },
      },
    })
  })

  it("rejects browser initialize requests at the protocol boundary", async () => {
    const fake = new FakeChildProcess()
    const config = loadConfig()
    const registry = new SessionRegistry({
      reconnectTtlMs: 500,
      initializeTimeoutMs: 100,
      experimentalApi: false,
      clientInfo: config.clientInfo,
      spawnProcess: () => fake,
    })
    queueMicrotask(() => {
      fake.send({ id: 0, result: {} })
    })

    await registry.createSession()

    const parsed = browserToServerMessageSchema.safeParse({
      type: "rpc.request",
      message: {
        id: 11,
        method: "initialize",
        params: {
          clientInfo: {
            name: "bad_client",
            title: "Bad Client",
            version: "0.0.1",
          },
        },
      },
    })

    expect(parsed.success).toBe(false)

    const initializeWrites = fake.writtenMessages.filter(
      (message) =>
        typeof message === "object" &&
        message !== null &&
        "method" in message &&
        message.method === "initialize"
    )
    expect(initializeWrites).toHaveLength(1)
  })

  it("returns a degraded health response when codex is unavailable", async () => {
    const config = {
      ...loadConfig(),
      codexCommand: "/definitely/missing/codex",
    }
    const registry = new SessionRegistry({
      reconnectTtlMs: 500,
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
