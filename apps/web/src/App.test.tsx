import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { App } from "@/App"
import { MockWebSocket } from "@/test/mock-websocket"

function createThread(threadId = "thr_123", preview = "") {
  return {
    id: threadId,
    preview,
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

function createResumedThread(threadId = "thr_123") {
  return {
    ...createThread(threadId, "Hello from the UI"),
    turns: [
      createTurn("turn_1", "completed", [
        {
          id: "msg_user_1",
          type: "userMessage",
          content: [
            {
              type: "text",
              text: "Hello from the UI",
              text_elements: [],
            },
          ],
        },
        {
          id: "msg_assistant_1",
          type: "agentMessage",
          text: "Assistant reply",
        },
      ]),
    ],
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
}

function addProject(path = "/tmp/frame-web-test") {
  fireEvent.click(screen.getByRole("button", { name: "Add project" }))
  fireEvent.change(screen.getByLabelText("Project path"), {
    target: { value: path },
  })
  fireEvent.click(screen.getByRole("button", { name: "Add" }))
}

describe("App", () => {
  it("requires a selected project before starting a new thread", async () => {
    render(<App />)

    const newThreadButton = screen.getByRole("button", { name: "New Thread" })
    expect(newThreadButton).toBeDisabled()
    expect(screen.getByText("Select a project")).toBeInTheDocument()

    addProject()

    await waitFor(() => {
      expect(
        screen.getAllByText("Start coding in frame-web-test").length
      ).toBeGreaterThan(0)
      expect(newThreadButton).not.toBeDisabled()
    })
  })

  it("starts a thread in the selected project, persists it, and resumes it from the sidebar", async () => {
    const { unmount } = render(<App />)

    addProject()

    fireEvent.click(screen.getByRole("button", { name: "New Thread" }))
    const startSocket = MockWebSocket.latest()
    await completeHandshake(startSocket)

    await waitFor(() => {
      expect(startSocket.sentMessages()[3]).toMatchObject({
        method: "thread/start",
        params: {
          model: "gpt-5.4",
          cwd: "/tmp/frame-web-test",
          experimentalRawEvents: false,
        },
      })
    })

    startSocket.serverSend({
      id: 2,
      result: {
        thread: createThread("thr_123"),
      },
    })

    const composer = screen.getByPlaceholderText(
      "Ask Codex anything, @ to add files, / for commands"
    )

    await waitFor(() => {
      expect(screen.getByText("Thread ready")).toBeInTheDocument()
      expect(composer).not.toBeDisabled()
      expect(
        screen.getByRole("button", { name: "New Thread" })
      ).toBeInTheDocument()
      expect(screen.getByText("New thread")).toBeInTheDocument()
    })

    fireEvent.change(composer, {
      target: { value: "Hello from the UI" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Send message" }))

    await waitFor(() => {
      expect(startSocket.sentMessages()[4]).toMatchObject({
        method: "turn/start",
        params: {
          threadId: "thr_123",
          model: "gpt-5.4",
          effort: "high",
        },
      })
    })

    startSocket.serverSend({
      id: 3,
      result: {
        turn: createTurn(),
      },
    })
    startSocket.serverSend({
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
    startSocket.serverSend({
      method: "item/agentMessage/delta",
      params: {
        threadId: "thr_123",
        turnId: "turn_123",
        itemId: "item_1",
        delta: "Assistant reply",
      },
    })
    startSocket.serverSend({
      method: "turn/completed",
      params: {
        threadId: "thr_123",
        turn: createTurn("turn_123", "completed"),
      },
    })

    await waitFor(() => {
      expect(screen.getByText("Assistant reply")).toBeInTheDocument()
    })

    unmount()

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText("New thread")).toBeInTheDocument()
      expect(
        screen.getAllByText("Start coding in frame-web-test").length
      ).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getByText("New thread"))

    const resumeSocket = MockWebSocket.latest()
    await completeHandshake(resumeSocket)

    await waitFor(() => {
      expect(resumeSocket.sentMessages()[3]).toMatchObject({
        method: "thread/resume",
        params: {
          threadId: "thr_123",
        },
      })
    })

    resumeSocket.serverSend({
      id: 2,
      result: {
        thread: createResumedThread("thr_123"),
        model: "gpt-5.4",
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
        reasoningEffort: "high",
      },
    })

    await waitFor(() => {
      expect(screen.getAllByText("Hello from the UI").length).toBeGreaterThan(0)
      expect(screen.getByText("Assistant reply")).toBeInTheDocument()
    })
  })
})
