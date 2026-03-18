import {
  startTransition,
  useEffect,
  useEffectEvent,
  useReducer,
  useRef,
} from "react"

import type { ReasoningEffort } from "@workspace/protocol/generated/codex/ReasoningEffort"
import type { ServerNotification } from "@workspace/protocol/generated/codex/ServerNotification"
import type { ServerRequest } from "@workspace/protocol/generated/codex/ServerRequest"
import type { Model } from "@workspace/protocol/generated/codex/v2/Model"
import type { Thread } from "@workspace/protocol/generated/codex/v2/Thread"
import type { ThreadItem } from "@workspace/protocol/generated/codex/v2/ThreadItem"
import type { UserInput } from "@workspace/protocol/generated/codex/v2/UserInput"

import {
  DEFAULT_MODEL,
  DEFAULT_REASONING_EFFORT,
  SERVER_V2_WS_URL,
} from "@/config"
import {
  createCodexWebClient,
  type ClientCloseInfo,
  type ModelListRequest,
  type ThreadResumeRequest,
  type ThreadStartRequest,
  type TurnStartRequest,
} from "@/lib/codex-web-client"

type ThreadStatus =
  | "idle"
  | "ready"
  | "starting-thread"
  | "resuming-thread"
  | "thread-ready"
  | "sending"
  | "streaming"
  | "failed"

export type ThreadMessage = {
  id: string
  role: "user" | "assistant"
  text: string
  status: "pending" | "streaming" | "complete"
  turnId: string | null
}

type ThreadState = {
  status: ThreadStatus
  isConnected: boolean
  thread: Thread | null
  models: Model[]
  selectedModelId: string
  selectedEffort: ReasoningEffort
  messages: ThreadMessage[]
  pendingTurnId: string | null
  lastCompletedTurnId: string | null
  lastError: string | null
}

type ThreadAction =
  | { type: "transport.connected" }
  | {
      type: "models.loaded"
      models: Model[]
      selectedModelId: string
      selectedEffort: ReasoningEffort
    }
  | { type: "selection.updated"; modelId: string; effort: ReasoningEffort }
  | { type: "thread.starting" }
  | { type: "thread.resuming" }
  | {
      type: "thread.ready"
      thread: Thread
      messages: ThreadMessage[]
      selectedModelId?: string
      selectedEffort?: ReasoningEffort
    }
  | { type: "thread.cleared" }
  | { type: "turn.sending"; message: ThreadMessage }
  | { type: "turn.accepted"; turnId: string }
  | {
      type: "agent.started"
      item: Extract<ThreadItem, { type: "agentMessage" }>
      turnId: string
    }
  | { type: "agent.delta"; itemId: string; delta: string; turnId: string }
  | {
      type: "agent.completed"
      item: Extract<ThreadItem, { type: "agentMessage" }>
      turnId: string
    }
  | { type: "turn.completed"; turnId: string }
  | { type: "error.nonfatal"; message: string }
  | { type: "error.fatal"; message: string }

type UseThreadOptions = {
  onThreadNameUpdated?: (threadId: string, title: string) => void
}

const initialState: ThreadState = {
  status: "idle",
  isConnected: false,
  thread: null,
  models: [],
  selectedModelId: DEFAULT_MODEL,
  selectedEffort: DEFAULT_REASONING_EFFORT,
  messages: [],
  pendingTurnId: null,
  lastCompletedTurnId: null,
  lastError: null,
}

const fallbackEfforts: ReasoningEffort[] = ["low", "medium", "high"]

function findModel(models: Model[], modelId: string) {
  return models.find((model) => model.id === modelId) ?? null
}

function getSupportedEfforts(model: Model | null) {
  if (!model || model.supportedReasoningEfforts.length === 0) {
    return fallbackEfforts
  }

  return model.supportedReasoningEfforts.map((option) => option.reasoningEffort)
}

function pickModel(models: Model[], preferredModelId: string) {
  return (
    findModel(models, preferredModelId) ??
    models.find((model) => model.isDefault) ??
    models[0] ??
    null
  )
}

function pickEffort(
  model: Model | null,
  preferredEffort: ReasoningEffort
): ReasoningEffort {
  const supportedEfforts = getSupportedEfforts(model)

  if (supportedEfforts.includes(preferredEffort)) {
    return preferredEffort
  }

  if (model) {
    return model.defaultReasoningEffort
  }

  return DEFAULT_REASONING_EFFORT
}

function formatEffortLabel(effort: ReasoningEffort) {
  return effort === "xhigh"
    ? "X-High"
    : effort.charAt(0).toUpperCase() + effort.slice(1)
}

function findMessageIndex(messages: ThreadMessage[], messageId: string) {
  return messages.findIndex((message) => message.id === messageId)
}

function upsertAssistantMessage(
  messages: ThreadMessage[],
  nextMessage: ThreadMessage
) {
  const index = findMessageIndex(messages, nextMessage.id)

  if (index === -1) {
    return [...messages, nextMessage]
  }

  return messages.map((message, messageIndex) =>
    messageIndex === index ? nextMessage : message
  )
}

function extractUserInputText(content: UserInput[]) {
  const textParts = content
    .filter(
      (input): input is Extract<UserInput, { type: "text" }> =>
        input.type === "text"
    )
    .map((input) => input.text)

  return textParts.join("\n").trim()
}

function hydrateThreadMessages(thread: Thread): ThreadMessage[] {
  return thread.turns.flatMap((turn) =>
    turn.items.flatMap((item) => {
      if (item.type === "userMessage") {
        const text = extractUserInputText(item.content)
        if (!text) {
          return []
        }

        return [
          {
            id: item.id,
            role: "user" as const,
            text,
            status: "complete" as const,
            turnId: turn.id,
          },
        ]
      }

      if (item.type === "agentMessage") {
        return [
          {
            id: item.id,
            role: "assistant" as const,
            text: item.text,
            status:
              turn.status === "in_progress"
                ? ("streaming" as const)
                : ("complete" as const),
            turnId: turn.id,
          },
        ]
      }

      return []
    })
  )
}

function reduceThreadState(
  state: ThreadState,
  action: ThreadAction
): ThreadState {
  switch (action.type) {
    case "transport.connected":
      return {
        ...state,
        isConnected: true,
        status: state.status === "idle" ? "ready" : state.status,
        lastError: null,
      }
    case "models.loaded":
      return {
        ...state,
        models: action.models,
        selectedModelId: action.selectedModelId,
        selectedEffort: action.selectedEffort,
      }
    case "selection.updated":
      return {
        ...state,
        selectedModelId: action.modelId,
        selectedEffort: action.effort,
      }
    case "thread.starting":
      return {
        ...state,
        status: "starting-thread",
        thread: null,
        messages: [],
        pendingTurnId: null,
        lastCompletedTurnId: null,
        lastError: null,
      }
    case "thread.resuming":
      return {
        ...state,
        status: "resuming-thread",
        thread: null,
        messages: [],
        pendingTurnId: null,
        lastCompletedTurnId: null,
        lastError: null,
      }
    case "thread.ready":
      return {
        ...state,
        status: "thread-ready",
        isConnected: true,
        thread: action.thread,
        messages: action.messages,
        selectedModelId: action.selectedModelId ?? state.selectedModelId,
        selectedEffort: action.selectedEffort ?? state.selectedEffort,
        pendingTurnId: null,
        lastCompletedTurnId: null,
        lastError: null,
      }
    case "thread.cleared":
      return {
        ...state,
        status: state.isConnected ? "ready" : "idle",
        thread: null,
        messages: [],
        pendingTurnId: null,
        lastCompletedTurnId: null,
        lastError: null,
      }
    case "turn.sending":
      return {
        ...state,
        status: "sending",
        messages: [...state.messages, action.message],
        lastCompletedTurnId: null,
        lastError: null,
      }
    case "turn.accepted":
      if (state.lastCompletedTurnId === action.turnId) {
        return state
      }

      return {
        ...state,
        pendingTurnId: action.turnId,
        status: "sending",
      }
    case "agent.started": {
      const assistantMessage: ThreadMessage = {
        id: action.item.id,
        role: "assistant",
        text: action.item.text,
        status: "streaming",
        turnId: action.turnId,
      }

      return {
        ...state,
        status: "streaming",
        messages: upsertAssistantMessage(state.messages, assistantMessage),
      }
    }
    case "agent.delta": {
      const currentIndex = findMessageIndex(state.messages, action.itemId)
      const currentMessage =
        currentIndex === -1
          ? {
              id: action.itemId,
              role: "assistant" as const,
              text: "",
              status: "streaming" as const,
              turnId: action.turnId,
            }
          : state.messages[currentIndex]

      return {
        ...state,
        status: "streaming",
        messages: upsertAssistantMessage(state.messages, {
          ...currentMessage,
          text: `${currentMessage.text}${action.delta}`,
          status: "streaming",
        }),
      }
    }
    case "agent.completed":
      return {
        ...state,
        messages: upsertAssistantMessage(state.messages, {
          id: action.item.id,
          role: "assistant",
          text: action.item.text,
          status: "complete",
          turnId: action.turnId,
        }),
      }
    case "turn.completed":
      return {
        ...state,
        status: state.thread
          ? "thread-ready"
          : state.isConnected
            ? "ready"
            : "idle",
        pendingTurnId: null,
        lastCompletedTurnId: action.turnId,
      }
    case "error.nonfatal":
      return {
        ...state,
        status:
          state.status === "starting-thread" ||
          state.status === "resuming-thread" ||
          state.pendingTurnId ||
          state.status === "sending" ||
          state.status === "streaming"
            ? state.thread
              ? "thread-ready"
              : state.isConnected
                ? "ready"
                : "idle"
            : state.status,
        pendingTurnId: null,
        lastCompletedTurnId: null,
        lastError: action.message,
      }
    case "error.fatal":
      return {
        ...state,
        isConnected: false,
        status: "failed",
        pendingTurnId: null,
        lastCompletedTurnId: null,
        lastError: action.message,
      }
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error."
}

function getCloseMessage(info: ClientCloseInfo) {
  if (info.reason.trim().length > 0) {
    return info.reason
  }

  return `Socket closed with code ${info.code}.`
}

function isJsonRpcError<TResult>(
  response: { error: { message: string } } | { result: TResult }
): response is { error: { message: string } } {
  return "error" in response
}

export function useThread(options: UseThreadOptions = {}) {
  const [state, dispatch] = useReducer(reduceThreadState, initialState)
  const stateRef = useRef(state)
  const clientRef = useRef<ReturnType<typeof createCodexWebClient> | null>(null)
  const unsupportedServerRequestsRef = useRef<ServerRequest[]>([])
  const optimisticMessageCountRef = useRef(0)
  const modelsLoadedRef = useRef(false)

  stateRef.current = state

  const handleNotification = useEffectEvent(
    (notification: ServerNotification) => {
      startTransition(() => {
        switch (notification.method) {
          case "thread/started":
            dispatch({
              type: "thread.ready",
              thread: notification.params.thread,
              messages: hydrateThreadMessages(notification.params.thread),
            })
            break
          case "thread/name/updated":
            if (notification.params.threadName) {
              options.onThreadNameUpdated?.(
                notification.params.threadId,
                notification.params.threadName
              )
            }
            break
          case "turn/started":
            dispatch({
              type: "turn.accepted",
              turnId: notification.params.turn.id,
            })
            break
          case "item/started":
            if (notification.params.item.type !== "agentMessage") {
              return
            }

            dispatch({
              type: "agent.started",
              item: notification.params.item,
              turnId: notification.params.turnId,
            })
            break
          case "item/agentMessage/delta":
            dispatch({
              type: "agent.delta",
              itemId: notification.params.itemId,
              delta: notification.params.delta,
              turnId: notification.params.turnId,
            })
            break
          case "item/completed":
            if (notification.params.item.type !== "agentMessage") {
              return
            }

            dispatch({
              type: "agent.completed",
              item: notification.params.item,
              turnId: notification.params.turnId,
            })
            break
          case "turn/completed":
            dispatch({
              type: "turn.completed",
              turnId: notification.params.turn.id,
            })
            break
          case "error":
            dispatch({
              type: "error.nonfatal",
              message: notification.params.error.message,
            })
            break
          default:
            break
        }
      })
    }
  )

  const handleServerRequest = useEffectEvent((request: ServerRequest) => {
    unsupportedServerRequestsRef.current = [
      ...unsupportedServerRequestsRef.current,
      request,
    ]

    clientRef.current?.respond({
      id: request.id,
      error: {
        code: -32_000,
        message: "Server request is not supported in the web client yet.",
      },
    })
  })

  const handleTransportError = useEffectEvent((error: Error) => {
    startTransition(() => {
      dispatch({
        type: "error.fatal",
        message: error.message,
      })
    })
  })

  const handleTransportClose = useEffectEvent((info: ClientCloseInfo) => {
    startTransition(() => {
      dispatch({
        type: "error.fatal",
        message: getCloseMessage(info),
      })
    })
  })

  const createClient = useEffectEvent(() => {
    const existingClient = clientRef.current
    if (existingClient) {
      return existingClient
    }

    const client = createCodexWebClient({
      url: SERVER_V2_WS_URL,
      onNotification: handleNotification,
      onServerRequest: handleServerRequest,
      onClose: handleTransportClose,
      onError: handleTransportError,
    })

    clientRef.current = client
    return client
  })

  const loadModels = useEffectEvent(
    async (client: ReturnType<typeof createCodexWebClient>) => {
      if (modelsLoadedRef.current) {
        return
      }

      try {
        const response = await client.request<ModelListRequest>({
          method: "model/list",
          params: {
            limit: 20,
          },
        })

        if (isJsonRpcError(response)) {
          return
        }

        const currentState = stateRef.current
        const nextModel = pickModel(
          response.result.data,
          currentState.selectedModelId
        )
        const nextEffort = pickEffort(nextModel, currentState.selectedEffort)

        modelsLoadedRef.current = true
        dispatch({
          type: "models.loaded",
          models: response.result.data,
          selectedModelId: nextModel?.id ?? currentState.selectedModelId,
          selectedEffort: nextEffort,
        })
      } catch {
        // Keep the default model selection if model/list fails during lazy connect.
      }
    }
  )

  const ensureConnected = useEffectEvent(async () => {
    const client = createClient()

    await client.connect()
    await loadModels(client)

    if (!stateRef.current.isConnected) {
      dispatch({
        type: "transport.connected",
      })
    }

    return client
  })

  useEffect(() => {
    return () => {
      clientRef.current?.dispose()
      clientRef.current = null
    }
  }, [])

  const setSelectedModel = (modelId: string) => {
    const model = findModel(state.models, modelId)
    const effort = pickEffort(model, state.selectedEffort)

    dispatch({
      type: "selection.updated",
      modelId,
      effort,
    })
  }

  const setSelectedEffort = (effort: ReasoningEffort) => {
    dispatch({
      type: "selection.updated",
      modelId: state.selectedModelId,
      effort,
    })
  }

  const startThread = async ({ cwd }: { cwd: string }) => {
    dispatch({
      type: "thread.starting",
    })

    try {
      const client = await ensureConnected()
      const response = await client.request<ThreadStartRequest>({
        method: "thread/start",
        params: {
          model: stateRef.current.selectedModelId,
          cwd,
          experimentalRawEvents: false,
        },
      })

      if (isJsonRpcError(response)) {
        dispatch({
          type: "error.nonfatal",
          message: response.error.message,
        })
        return null
      }

      dispatch({
        type: "thread.ready",
        thread: response.result.thread,
        messages: hydrateThreadMessages(response.result.thread),
      })
      return response.result.thread
    } catch (error) {
      if (stateRef.current.status !== "failed") {
        dispatch({
          type: "error.nonfatal",
          message: getErrorMessage(error),
        })
      }

      return null
    }
  }

  const resumeThread = async ({ threadId }: { threadId: string }) => {
    dispatch({
      type: "thread.resuming",
    })

    try {
      const client = await ensureConnected()
      const response = await client.request<ThreadResumeRequest>({
        method: "thread/resume",
        params: {
          threadId,
        },
      })

      if (isJsonRpcError(response)) {
        dispatch({
          type: "error.nonfatal",
          message: response.error.message,
        })
        return null
      }

      const selectedModel = pickModel(
        stateRef.current.models,
        response.result.model
      )
      const selectedEffort = pickEffort(
        selectedModel,
        response.result.reasoningEffort ?? stateRef.current.selectedEffort
      )

      dispatch({
        type: "thread.ready",
        thread: response.result.thread,
        messages: hydrateThreadMessages(response.result.thread),
        selectedModelId: selectedModel?.id ?? response.result.model,
        selectedEffort,
      })
      return response.result.thread
    } catch (error) {
      if (stateRef.current.status !== "failed") {
        dispatch({
          type: "error.nonfatal",
          message: getErrorMessage(error),
        })
      }

      return null
    }
  }

  const clearLoadedThread = () => {
    dispatch({
      type: "thread.cleared",
    })
  }

  const sendMessage = async (text: string) => {
    const client = clientRef.current
    if (!client || !state.thread || state.pendingTurnId !== null) {
      return false
    }

    const trimmedText = text.trim()
    if (trimmedText.length === 0) {
      return false
    }

    optimisticMessageCountRef.current += 1
    dispatch({
      type: "turn.sending",
      message: {
        id: `user-${optimisticMessageCountRef.current}`,
        role: "user",
        text: trimmedText,
        status: "complete",
        turnId: null,
      },
    })

    try {
      const response = await client.request<TurnStartRequest>({
        method: "turn/start",
        params: {
          threadId: state.thread.id,
          model: state.selectedModelId,
          effort: state.selectedEffort,
          input: [
            {
              type: "text",
              text: trimmedText,
              text_elements: [],
            },
          ],
        },
      })

      if (isJsonRpcError(response)) {
        dispatch({
          type: "error.nonfatal",
          message: response.error.message,
        })
        return false
      }

      dispatch({
        type: "turn.accepted",
        turnId: response.result.turn.id,
      })
      return true
    } catch (error) {
      dispatch({
        type: "error.nonfatal",
        message: getErrorMessage(error),
      })
      return false
    }
  }

  const selectedModel = findModel(state.models, state.selectedModelId)
  const availableEfforts = getSupportedEfforts(selectedModel)

  return {
    status: state.status,
    thread: state.thread,
    models: state.models,
    selectedModelId: state.selectedModelId,
    selectedModelDisplayName:
      selectedModel?.displayName ?? state.selectedModelId,
    selectedEffort: state.selectedEffort,
    selectedEffortLabel: formatEffortLabel(state.selectedEffort),
    availableEfforts,
    messages: state.messages,
    pendingTurnId: state.pendingTurnId,
    lastError: state.lastError,
    isTurnPending:
      state.pendingTurnId !== null ||
      state.status === "sending" ||
      state.status === "streaming",
    setSelectedModel,
    setSelectedEffort,
    startThread,
    resumeThread,
    clearLoadedThread,
    sendMessage,
  }
}
