import { describe, expect, it, vi } from "vitest"

import { CodexSession } from "../src/codex/session.js"
import { FakeChildProcess } from "./fakes.js"

function createSession(process = new FakeChildProcess()) {
  const session = new CodexSession({
    process,
    initializeTimeoutMs: 100,
    experimentalApi: false,
    clientInfo: {
      name: "frame_gui",
      title: "Frame GUI",
      version: "0.0.1",
    },
  })

  return { process, session }
}

describe("CodexSession", () => {
  it("initializes and forwards notifications", async () => {
    const { process, session } = createSession()
    const messages: unknown[] = []
    session.on("message", (message) => {
      messages.push(message)
    })

    queueMicrotask(() => {
      process.send({
        id: 0,
        result: {
          userAgent: "frame",
        },
      })
      process.send({
        method: "turn/started",
        params: {
          turn: { id: "turn_123" },
        },
      })
    })

    await session.initialize()

    expect(process.writtenMessages).toEqual([
      {
        id: 0,
        method: "initialize",
        params: {
          clientInfo: {
            name: "frame_gui",
            title: "Frame GUI",
            version: "0.0.1",
          },
        },
      },
      {
        method: "initialized",
        params: {},
      },
    ])

    expect(messages).toContainEqual({
      type: "rpc.notification",
      message: {
        method: "turn/started",
        params: {
          turn: { id: "turn_123" },
        },
      },
    })
  })

  it("routes server-initiated requests to the browser transport", async () => {
    const { process, session } = createSession()
    const messages: unknown[] = []
    session.on("message", (message) => {
      messages.push(message)
    })

    queueMicrotask(() => {
      process.send({ id: 0, result: {} })
    })

    await session.initialize()

    process.send({
      id: "approval-1",
      method: "item/fileChange/requestApproval",
      params: {
        itemId: "item_123",
      },
    })

    expect(messages).toContainEqual({
      type: "serverRequest.request",
      message: {
        id: "approval-1",
        method: "item/fileChange/requestApproval",
        params: {
          itemId: "item_123",
        },
      },
    })
  })

  it("emits a session error when the child exits after ready", async () => {
    const { process, session } = createSession()
    const handler = vi.fn()
    session.on("message", handler)

    queueMicrotask(() => {
      process.send({ id: 0, result: {} })
    })

    await session.initialize()
    process.crash(2)

    expect(handler).toHaveBeenCalledWith({
      type: "session.error",
      code: "child_exit",
      message: "Codex app-server exited with code 2.",
      retryable: true,
    })
  })
})
