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
          capabilities: null,
          clientInfo: {
            name: "frame_gui",
            title: "Frame GUI",
            version: "0.0.1",
          },
        },
      },
      {
        method: "initialized",
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
      id: "question-1",
      method: "item/tool/requestUserInput",
      params: {
        questions: [],
      },
    })

    expect(messages).toContainEqual({
      type: "serverRequest.request",
      message: {
        id: "question-1",
        method: "item/tool/requestUserInput",
        params: {
          questions: [],
        },
      },
    })
  })

  it("writes server request responses back to the child transport", async () => {
    const { process, session } = createSession()

    queueMicrotask(() => {
      process.send({ id: 0, result: {} })
    })

    await session.initialize()

    session.sendServerRequestResponse({
      id: "question-1",
      result: {
        answers: {
          workspace: {
            answers: ["Use the current repo"],
          },
        },
      },
    })

    expect(process.writtenMessages.at(-1)).toEqual({
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

  it("rejects initialize immediately when the child emits an error", async () => {
    const { process, session } = createSession()

    queueMicrotask(() => {
      process.emitError(new Error("spawn ENOENT"))
    })

    await expect(session.initialize()).rejects.toThrow("spawn ENOENT")
  })
})
