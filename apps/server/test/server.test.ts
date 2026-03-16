import { once } from "node:events"
import { readFileSync } from "node:fs"

import { afterEach, describe, expect, it } from "vitest"
import { getCodexSchemaBundlePath } from "@workspace/protocol"
import { WebSocket, type RawData } from "ws"

import type { ServerV2Config } from "../src/config.js"
import { createHttpServer } from "../src/server.js"
import { FakeChildProcess } from "./fakes.js"

function createTestConfig(
  overrides: Partial<ServerV2Config> = {}
): ServerV2Config {
  return {
    port: 8788,
    initializeTimeoutMs: 100,
    codexCommand: "codex",
    codexArgs: ["app-server"],
    clientInfo: {
      name: "frame_server_v2",
      title: "Frame Server V2",
      version: "0.0.1",
    },
    ...overrides,
  }
}

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

async function waitForMessages(socket: WebSocket, count: number) {
  return new Promise<unknown[]>((resolve) => {
    const messages: unknown[] = []
    const handler = (data: RawData) => {
      messages.push(JSON.parse(data.toString()))
      if (messages.length === count) {
        socket.off("message", handler)
        resolve(messages)
      }
    }

    socket.on("message", handler)
  })
}

async function waitForClose(socket: WebSocket) {
  const [code, reason] = await once(socket, "close")
  return {
    code: code as number,
    reason: reason.toString(),
  }
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

describe("server", () => {
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

  it("loads the generated schema bundle from the protocol package", () => {
    const schema = JSON.parse(
      readFileSync(getCodexSchemaBundlePath(), "utf8")
    ) as {
      definitions?: Record<string, unknown>
    }

    expect(schema.definitions?.ClientRequest).toBeDefined()
    expect(schema.definitions?.JSONRPCMessage).toBeDefined()
  })

  it("serves health and version endpoints", async () => {
    const server = createHttpServer(createTestConfig(), {
      healthCheck: () => ({
        ok: true,
        codexAvailable: true,
        version: "1.2.3",
        error: null,
      }),
    })
    servers.push(server)

    await new Promise<void>((resolve) => {
      server.listen(0, resolve)
    })

    const address = server.address()
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP server address.")
    }

    const baseUrl = `http://127.0.0.1:${address.port}`
    const healthResponse = await fetch(`${baseUrl}/healthz`)
    const healthPayload = (await healthResponse.json()) as {
      ok: boolean
      version: string
    }
    expect(healthPayload).toEqual({
      ok: true,
      codexAvailable: true,
      version: "1.2.3",
      error: null,
    })

    const versionResponse = await fetch(`${baseUrl}/version`)
    const versionPayload = (await versionResponse.json()) as {
      name: string
    }
    expect(versionPayload.name).toBe("frame_server_v2")

    const missingResponse = await fetch(`${baseUrl}/missing`)
    expect(missingResponse.status).toBe(404)
  })

  it("rejects websocket upgrades on unexpected paths", async () => {
    const server = createHttpServer(createTestConfig(), {
      spawnProcess: () => new FakeChildProcess(),
      healthCheck: () => ({
        ok: true,
        codexAvailable: true,
        version: "1.2.3",
        error: null,
      }),
    })
    servers.push(server)

    await new Promise<void>((resolve) => {
      server.listen(0, resolve)
    })

    const address = server.address()
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP server address.")
    }

    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/bad`)
    sockets.push(socket)

    await expect(
      Promise.race([
        once(socket, "error").then(() => undefined),
        once(socket, "close").then(() => undefined),
      ])
    ).resolves.toBeUndefined()
  })

  it("proxies initialize, model/list, thread/start, and turn/start over raw JSON-RPC", async () => {
    const fake = new FakeChildProcess()
    const server = createHttpServer(createTestConfig(), {
      spawnProcess: () => fake,
      healthCheck: () => ({
        ok: true,
        codexAvailable: true,
        version: "1.2.3",
        error: null,
      }),
    })
    servers.push(server)

    await new Promise<void>((resolve) => {
      server.listen(0, resolve)
    })

    const address = server.address()
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP server address.")
    }

    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`)
    sockets.push(socket)
    await waitForOpen(socket)

    socket.send(
      JSON.stringify({
        id: 0,
        method: "initialize",
        params: {
          clientInfo: {
            name: "frame_web",
            title: "Frame Web",
            version: "0.0.1",
          },
        },
      })
    )
    socket.send(JSON.stringify({ method: "initialized" }))

    await waitForCondition(() => fake.writtenMessages.length === 2)
    expect(fake.writtenMessages).toEqual([
      {
        id: 0,
        method: "initialize",
        params: {
          clientInfo: {
            name: "frame_web",
            title: "Frame Web",
            version: "0.0.1",
          },
        },
      },
      {
        method: "initialized",
      },
    ])

    const initializeResponsePromise = waitForMessage(socket)
    fake.send({
      id: 0,
      result: {
        userAgent: "frame",
      },
    })
    expect(await initializeResponsePromise).toEqual({
      id: 0,
      result: {
        userAgent: "frame",
      },
    })

    socket.send(
      JSON.stringify({
        id: 1,
        method: "model/list",
        params: {
          includeHidden: false,
          limit: 20,
        },
      })
    )

    await waitForCondition(() =>
      fake.writtenMessages.some(
        (message) =>
          typeof message === "object" &&
          message !== null &&
          "id" in message &&
          message.id === 1
      )
    )

    const modelListResponsePromise = waitForMessage(socket)
    fake.send({
      id: 1,
      result: {
        data: [{ id: "gpt-5.4" }],
        nextCursor: null,
      },
    })
    expect(await modelListResponsePromise).toEqual({
      id: 1,
      result: {
        data: [{ id: "gpt-5.4" }],
        nextCursor: null,
      },
    })

    socket.send(
      JSON.stringify({
        id: 2,
        method: "thread/start",
        params: {
          model: "gpt-5.1-codex",
          experimentalRawEvents: false,
        },
      })
    )
    const threadMessagesPromise = waitForMessages(socket, 2)
    fake.send({
      id: 2,
      result: {
        thread: {
          id: "thr_123",
        },
      },
    })
    fake.send({
      method: "thread/started",
      params: {
        thread: {
          id: "thr_123",
        },
      },
    })
    expect(await threadMessagesPromise).toEqual([
      {
        id: 2,
        result: {
          thread: {
            id: "thr_123",
          },
        },
      },
      {
        method: "thread/started",
        params: {
          thread: {
            id: "thr_123",
          },
        },
      },
    ])

    socket.send(
      JSON.stringify({
        id: 3,
        method: "turn/start",
        params: {
          threadId: "thr_123",
          input: [{ type: "text", text: "Summarize this repo." }],
        },
      })
    )
    const turnMessagesPromise = waitForMessages(socket, 3)
    fake.send({
      id: 3,
      result: {
        turn: {
          id: "turn_123",
        },
      },
    })
    fake.send({
      method: "item/started",
      params: {
        item: {
          id: "item_1",
          type: "agentMessage",
          text: "",
        },
      },
    })
    fake.send({
      method: "turn/completed",
      params: {
        turn: {
          id: "turn_123",
          status: "completed",
        },
      },
    })

    expect(await turnMessagesPromise).toEqual([
      {
        id: 3,
        result: {
          turn: {
            id: "turn_123",
          },
        },
      },
      {
        method: "item/started",
        params: {
          item: {
            id: "item_1",
            type: "agentMessage",
            text: "",
          },
        },
      },
      {
        method: "turn/completed",
        params: {
          turn: {
            id: "turn_123",
            status: "completed",
          },
        },
      },
    ])
  })

  it("routes server-initiated requests back upstream by id", async () => {
    const fake = new FakeChildProcess()
    const server = createHttpServer(createTestConfig(), {
      spawnProcess: () => fake,
      healthCheck: () => ({
        ok: true,
        codexAvailable: true,
        version: "1.2.3",
        error: null,
      }),
    })
    servers.push(server)

    await new Promise<void>((resolve) => {
      server.listen(0, resolve)
    })

    const address = server.address()
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP server address.")
    }

    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`)
    sockets.push(socket)
    await waitForOpen(socket)

    socket.send(
      JSON.stringify({
        id: 0,
        method: "initialize",
        params: {
          clientInfo: {
            name: "frame_web",
            version: "0.0.1",
          },
        },
      })
    )
    socket.send(JSON.stringify({ method: "initialized" }))
    const initializeResponsePromise = waitForMessage(socket)
    fake.send({ id: 0, result: {} })
    await initializeResponsePromise

    const serverRequestPromise = waitForMessage(socket)
    fake.send({
      id: "request-1",
      method: "item/tool/requestUserInput",
      params: {
        questions: [],
      },
    })
    expect(await serverRequestPromise).toEqual({
      id: "request-1",
      method: "item/tool/requestUserInput",
      params: {
        questions: [],
      },
    })

    socket.send(
      JSON.stringify({
        id: "request-1",
        result: {
          answers: {
            workspace: {
              answers: ["Use the current repo"],
            },
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
          message.id === "request-1"
      )
    )
  })

  it("rejects requests before initialize and closes invalid payloads", async () => {
    const fake = new FakeChildProcess()
    const server = createHttpServer(createTestConfig(), {
      spawnProcess: () => fake,
      healthCheck: () => ({
        ok: true,
        codexAvailable: true,
        version: "1.2.3",
        error: null,
      }),
    })
    servers.push(server)

    await new Promise<void>((resolve) => {
      server.listen(0, resolve)
    })

    const address = server.address()
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP server address.")
    }

    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`)
    sockets.push(socket)
    await waitForOpen(socket)

    socket.send(
      JSON.stringify({
        id: 99,
        method: "model/list",
        params: {
          includeHidden: false,
          limit: 20,
        },
      })
    )

    expect(await waitForMessage(socket)).toEqual({
      id: 99,
      error: {
        code: -32002,
        message: "Connection not initialized.",
      },
    })

    socket.send("not-json")
    expect(await waitForClose(socket)).toMatchObject({
      code: 1008,
    })
  })

  it("times out waiting for initialize and closes when upstream exits", async () => {
    const timeoutServer = createHttpServer(
      createTestConfig({
        initializeTimeoutMs: 50,
      }),
      {
        spawnProcess: () => new FakeChildProcess(),
        healthCheck: () => ({
          ok: true,
          codexAvailable: true,
          version: "1.2.3",
          error: null,
        }),
      }
    )
    servers.push(timeoutServer)

    await new Promise<void>((resolve) => {
      timeoutServer.listen(0, resolve)
    })

    const timeoutAddress = timeoutServer.address()
    if (!timeoutAddress || typeof timeoutAddress === "string") {
      throw new Error("Expected TCP server address.")
    }

    const timeoutSocket = new WebSocket(
      `ws://127.0.0.1:${timeoutAddress.port}/ws`
    )
    sockets.push(timeoutSocket)
    await waitForOpen(timeoutSocket)
    timeoutSocket.send(
      JSON.stringify({
        id: 0,
        method: "initialize",
        params: {
          clientInfo: {
            name: "frame_web",
            version: "0.0.1",
          },
        },
      })
    )
    expect(await waitForClose(timeoutSocket)).toMatchObject({
      code: 1011,
    })

    const fake = new FakeChildProcess()
    const exitServer = createHttpServer(createTestConfig(), {
      spawnProcess: () => fake,
      healthCheck: () => ({
        ok: true,
        codexAvailable: true,
        version: "1.2.3",
        error: null,
      }),
    })
    servers.push(exitServer)

    await new Promise<void>((resolve) => {
      exitServer.listen(0, resolve)
    })

    const exitAddress = exitServer.address()
    if (!exitAddress || typeof exitAddress === "string") {
      throw new Error("Expected TCP server address.")
    }

    const exitSocket = new WebSocket(`ws://127.0.0.1:${exitAddress.port}/ws`)
    sockets.push(exitSocket)
    await waitForOpen(exitSocket)
    exitSocket.send(
      JSON.stringify({
        id: 0,
        method: "initialize",
        params: {
          clientInfo: {
            name: "frame_web",
            version: "0.0.1",
          },
        },
      })
    )
    exitSocket.send(JSON.stringify({ method: "initialized" }))
    const initializeResponsePromise = waitForMessage(exitSocket)
    fake.send({ id: 0, result: {} })
    await initializeResponsePromise

    fake.crash(2)
    expect(await waitForClose(exitSocket)).toMatchObject({
      code: 1011,
      reason: "Codex app-server exited with code 2.",
    })
  })
})
