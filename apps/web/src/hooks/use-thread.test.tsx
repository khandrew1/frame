import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { useThread } from "@/hooks/use-thread"
import { MockWebSocket } from "@/test/mock-websocket"

function createThread(
  threadId = "thr_123",
  overrides: Partial<ReturnType<typeof createThreadBase>> = {}
) {
  return {
    ...createThreadBase(threadId),
    ...overrides,
  }
}

function createThreadBase(threadId: string) {
  return {
    id: threadId,
    preview: "",
    modelProvider: "openai",
    createdAt: 0,
    updatedAt: 0,
    path: null,
    cwd: "/tmp/frame-web-test",
    cliVersion: "0.0.1",
    source: "appServer",
    gitInfo: null,
    turns: [],
  }
}

function createTurn(
  turnId = "turn_123",
  status = "in_progress",
  items: Array<unknown> = []
) {
  return {
    id: turnId,
    items,
    status,
    error: null,
  }
}

function createModels() {
  return [
    {
      id: "gpt-5.4",
      model: "gpt-5.4",
      upgrade: null,
      displayName: "GPT-5.4",
      description: "Default model",
      supportedReasoningEfforts: [
        { reasoningEffort: "low", description: "Low" },
        { reasoningEffort: "medium", description: "Medium" },
        { reasoningEffort: "high", description: "High" },
      ],
      defaultReasoningEffort: "high",
      inputModalities: ["text"],
      supportsPersonality: true,
      isDefault: true,
    },
    {
      id: "gpt-5.1-codex",
      model: "gpt-5.1-codex",
      upgrade: null,
      displayName: "GPT-5.1 Codex",
      description: "Codex model",
      supportedReasoningEfforts: [
        { reasoningEffort: "medium", description: "Medium" },
        { reasoningEffort: "high", description: "High" },
        { reasoningEffort: "xhigh", description: "X-High" },
      ],
      defaultReasoningEffort: "medium",
      inputModalities: ["text"],
      supportsPersonality: true,
      isDefault: false,
    },
  ]
}

async function completeHandshake(socket: MockWebSocket) {
  act(() => {
    socket.serverOpen()
  })

  await waitFor(() => {
    expect(socket.sentMessages()[0]).toMatchObject({
      method: "initialize",
      params: {
        clientInfo: {
          name: "frame_web",
          title: "Frame Web",
          version: "0.0.1",
        },
        capabilities: null,
      },
    })
  })

  act(() => {
    socket.serverSend({
      id: 0,
      result: {
        userAgent: "frame",
      },
    })
  })

  await waitFor(() => {
    expect(socket.sentMessages()[1]).toEqual({
      method: "initialized",
    })
  })

  await waitFor(() => {
    expect(socket.sentMessages()[2]).toMatchObject({
      method: "model/list",
      params: {
        limit: 20,
      },
    })
  })

  act(() => {
    socket.serverSend({
      id: 1,
      result: {
        data: createModels(),
        nextCursor: null,
      },
    })
  })
}

describe("useThread", () => {
  it("does not connect on mount", () => {
    const { result } = renderHook(() => useThread())

    expect(result.current.status).toBe("idle")
    expect(MockWebSocket.instances).toHaveLength(0)
  })

  it("starts a thread through a lazy connection", async () => {
    const { result } = renderHook(() => useThread())

    let startPromise!: Promise<ReturnType<typeof createThread> | null>
    act(() => {
      startPromise = result.current.startThread({ cwd: "/tmp/frame-web-test" })
    })

    const socket = MockWebSocket.latest()
    expect(result.current.status).toBe("starting-thread")

    await completeHandshake(socket)

    await waitFor(() => {
      expect(socket.sentMessages()[3]).toMatchObject({
        method: "thread/start",
        params: {
          model: "gpt-5.4",
          cwd: "/tmp/frame-web-test",
          experimentalRawEvents: false,
        },
      })
    })

    act(() => {
      socket.serverSend({
        id: 2,
        result: {
          thread: createThread(),
        },
      })
    })

    await act(async () => {
      await startPromise
    })

    await waitFor(() => {
      expect(result.current.thread?.id).toBe("thr_123")
      expect(result.current.models).toHaveLength(2)
      expect(result.current.status).toBe("thread-ready")
    })
  })

  it("resumes a thread and hydrates message history", async () => {
    const { result } = renderHook(() => useThread())

    let resumePromise!: Promise<ReturnType<typeof createThread> | null>
    act(() => {
      resumePromise = result.current.resumeThread({ threadId: "thr_resume" })
    })

    const socket = MockWebSocket.latest()
    await completeHandshake(socket)

    await waitFor(() => {
      expect(socket.sentMessages()[3]).toMatchObject({
        method: "thread/resume",
        params: {
          threadId: "thr_resume",
        },
      })
    })

    act(() => {
      socket.serverSend({
        id: 2,
        result: {
          thread: createThread("thr_resume", {
            preview: "Summarize this repo.",
            turns: [
              createTurn("turn_1", "completed", [
                {
                  id: "msg_user_1",
                  type: "userMessage",
                  content: [
                    {
                      type: "text",
                      text: "Summarize this repo.",
                      text_elements: [],
                    },
                  ],
                },
                {
                  id: "msg_assistant_1",
                  type: "agentMessage",
                  text: "Repo summary",
                },
              ]),
            ],
          }),
          model: "gpt-5.1-codex",
          modelProvider: "openai",
          cwd: "/tmp/frame-web-test",
          approvalPolicy: "on-request",
          sandbox: {
            mode: "read-only",
            writableRoots: [],
            networkAccess: false,
            excludeTmpdirEnvVar: false,
            excludeSlashTmp: false,
          },
          reasoningEffort: "medium",
        },
      })
    })

    await act(async () => {
      await resumePromise
    })

    await waitFor(() => {
      expect(result.current.thread?.id).toBe("thr_resume")
      expect(result.current.selectedModelId).toBe("gpt-5.1-codex")
      expect(result.current.selectedEffort).toBe("medium")
      expect(result.current.messages).toEqual([
        {
          id: "msg_user_1",
          role: "user",
          text: "Summarize this repo.",
          status: "complete",
          turnId: "turn_1",
        },
        {
          id: "msg_assistant_1",
          role: "assistant",
          text: "Repo summary",
          status: "complete",
          turnId: "turn_1",
        },
      ])
    })
  })

  it("forwards thread name updates after connecting", async () => {
    const onThreadNameUpdated = vi.fn()
    const { result } = renderHook(() =>
      useThread({
        onThreadNameUpdated,
      })
    )

    let startPromise!: Promise<ReturnType<typeof createThread> | null>
    act(() => {
      startPromise = result.current.startThread({ cwd: "/tmp/frame-web-test" })
    })

    const socket = MockWebSocket.latest()
    await completeHandshake(socket)

    await waitFor(() => {
      expect(socket.sentMessages()[3]).toMatchObject({
        method: "thread/start",
        params: {
          model: "gpt-5.4",
          cwd: "/tmp/frame-web-test",
          experimentalRawEvents: false,
        },
      })
    })

    act(() => {
      socket.serverSend({
        id: 2,
        result: {
          thread: createThread(),
        },
      })
    })

    await act(async () => {
      await startPromise
    })

    act(() => {
      socket.serverSend({
        method: "thread/name/updated",
        params: {
          threadId: "thr_123",
          threadName: "Repo summary thread",
        },
      })
    })

    await waitFor(() => {
      expect(onThreadNameUpdated).toHaveBeenCalledWith(
        "thr_123",
        "Repo summary thread"
      )
    })
  })
})
