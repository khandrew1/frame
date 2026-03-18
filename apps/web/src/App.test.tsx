import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { App } from "@/App"
import { MockWebSocket } from "@/test/mock-websocket"

function createThread() {
  return {
    id: "thr_123",
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

function createTurn(status = "in_progress") {
  return {
    id: "turn_123",
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

async function connectUi() {
  const socket = MockWebSocket.latest()

  socket.serverOpen()

  await waitFor(() => {
    expect(socket.sentMessages()[0]).toMatchObject({
      method: "initialize",
    })
  })

  socket.serverSend({
    id: 0,
    result: {
      userAgent: "frame",
    },
  })

  await waitFor(() => {
    expect(screen.getByText("Connected")).toBeInTheDocument()
  })

  await waitFor(() => {
    expect(socket.sentMessages()[2]).toMatchObject({
      method: "model/list",
      params: {
        limit: 20,
      },
    })
  })

  socket.serverSend({
    id: 1,
    result: {
      data: createModels(),
      nextCursor: null,
    },
  })

  await waitFor(() => {
    expect(
      screen.getByRole("button", { name: "Model selector" })
    ).toHaveTextContent("GPT-5.4")
  })

  return socket
}

describe("App", () => {
  it("starts a thread and renders streamed messages", async () => {
    render(<App />)
    const socket = await connectUi()

    const composer = screen.getByPlaceholderText(
      "Ask Codex anything, @ to add files, / for commands"
    )
    expect(composer).toBeDisabled()

    fireEvent.click(screen.getByRole("button", { name: "Model selector" }))
    fireEvent.click(screen.getByText("GPT-5.1 Codex"))

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Model selector" })
      ).toHaveTextContent("GPT-5.1 Codex")
      expect(
        screen.getByRole("button", { name: "Thinking level selector" })
      ).toHaveTextContent("High")
    })

    fireEvent.click(
      screen.getByRole("button", { name: "Thinking level selector" })
    )
    fireEvent.click(screen.getByText("X-High"))

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Thinking level selector" })
      ).toHaveTextContent("X-High")
    })

    fireEvent.click(screen.getByRole("button", { name: "Start Thread" }))

    await waitFor(() => {
      expect(socket.sentMessages()[3]).toMatchObject({
        method: "thread/start",
        params: {
          model: "gpt-5.1-codex",
          cwd: "/tmp/frame-web-test",
          experimentalRawEvents: false,
        },
      })
    })

    socket.serverSend({
      id: 2,
      result: {
        thread: createThread(),
      },
    })

    await waitFor(() => {
      expect(screen.getByText("Thread ready")).toBeInTheDocument()
      expect(composer).not.toBeDisabled()
    })

    fireEvent.change(composer, {
      target: { value: "Hello from the UI" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Send message" }))

    await waitFor(() => {
      expect(socket.sentMessages()[4]).toMatchObject({
        method: "turn/start",
        params: {
          threadId: "thr_123",
          model: "gpt-5.1-codex",
          effort: "xhigh",
        },
      })
    })

    socket.serverSend({
      id: 3,
      result: {
        turn: createTurn(),
      },
    })

    await waitFor(() => {
      expect(screen.getByDisplayValue("")).toBeInTheDocument()
      expect(screen.getByText("Hello from the UI")).toBeInTheDocument()
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
        delta: "Assistant reply",
      },
    })
    socket.serverSend({
      method: "turn/completed",
      params: {
        threadId: "thr_123",
        turn: createTurn("completed"),
      },
    })

    await waitFor(() => {
      expect(screen.getByText("Assistant reply")).toBeInTheDocument()
      expect(composer).not.toBeDisabled()
    })
  })
})
