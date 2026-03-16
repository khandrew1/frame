import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { useThread } from "@/hooks/use-thread"
import { MockWebSocket } from "@/test/mock-websocket"

function createThread(threadId = "thr_123") {
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

function createTurn(turnId = "turn_123", status = "in_progress") {
  return {
    id: turnId,
    items: [],
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

async function connectClient() {
  const socket = MockWebSocket.latest()

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

  return socket
}

describe("useThread", () => {
  it("completes the handshake and becomes ready", async () => {
    const { result } = renderHook(() => useThread())
    const socket = await connectClient()

    await waitFor(() => {
      expect(result.current.status).toBe("ready")
    })

    expect(socket.url).toBe("ws://localhost:8788/ws")
  })

  it("starts a thread and streams an assistant message", async () => {
    const { result } = renderHook(() => useThread())
    const socket = await connectClient()

    await waitFor(() => {
      expect(result.current.status).toBe("ready")
      expect(result.current.models).toHaveLength(2)
    })

    let startPromise: Promise<void>
    act(() => {
      startPromise = result.current.startThread()
    })

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
      expect(result.current.status).toBe("thread-ready")
    })

    let sendPromise: Promise<boolean>
    act(() => {
      sendPromise = result.current.sendMessage("Summarize this repo.")
    })

    expect(result.current.messages[0]).toMatchObject({
      role: "user",
      text: "Summarize this repo.",
    })

    await waitFor(() => {
      expect(socket.sentMessages()[4]).toMatchObject({
        method: "turn/start",
        params: {
          threadId: "thr_123",
          model: "gpt-5.4",
          effort: "high",
          input: [
            {
              type: "text",
              text: "Summarize this repo.",
              text_elements: [],
            },
          ],
        },
      })
    })

    act(() => {
      socket.serverSend({
        id: 3,
        result: {
          turn: createTurn(),
        },
      })
      socket.serverSend({
        method: "item/started",
        params: {
          threadId: "thr_123",
          turnId: "turn_123",
          item: {
            id: "item_1",
            type: "agentMessage",
            text: "",
          },
        },
      })
      socket.serverSend({
        method: "item/agentMessage/delta",
        params: {
          threadId: "thr_123",
          turnId: "turn_123",
          itemId: "item_1",
          delta: "Repo summary",
        },
      })
      socket.serverSend({
        method: "turn/completed",
        params: {
          threadId: "thr_123",
          turn: createTurn("turn_123", "completed"),
        },
      })
    })

    await act(async () => {
      await sendPromise
    })

    await waitFor(() => {
      expect(result.current.messages[1]).toMatchObject({
        role: "assistant",
        text: "Repo summary",
      })
      expect(result.current.isTurnPending).toBe(false)
      expect(result.current.status).toBe("thread-ready")
    })
  })

  it("blocks sending before a thread exists and surfaces close errors", async () => {
    const { result } = renderHook(() => useThread())
    const socket = await connectClient()

    await act(async () => {
      await expect(result.current.sendMessage("blocked")).resolves.toBe(false)
    })

    expect(socket.sentMessages()).toHaveLength(3)

    act(() => {
      socket.serverClose(1011, "Codex app-server exited with code 2.", false)
    })

    await waitFor(() => {
      expect(result.current.status).toBe("failed")
      expect(result.current.lastError).toBe("Codex app-server exited with code 2.")
    })
  })
})
