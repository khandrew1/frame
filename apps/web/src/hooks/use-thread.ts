import { startTransition, useEffect, useEffectEvent, useReducer, useRef } from "react"

import type { ReasoningEffort } from "@workspace/protocol/generated/codex/ReasoningEffort"
import type { ServerNotification } from "@workspace/protocol/generated/codex/ServerNotification"
import type { ServerRequest } from "@workspace/protocol/generated/codex/ServerRequest"
import type { Model } from "@workspace/protocol/generated/codex/v2/Model"
import type { Thread } from "@workspace/protocol/generated/codex/v2/Thread"
import type { ThreadItem } from "@workspace/protocol/generated/codex/v2/ThreadItem"

import {
  DEFAULT_MODEL,
  DEFAULT_REASONING_EFFORT,
  SERVER_V2_WS_URL,
  THREAD_TEST_CWD,
} from "@/config"
import {
  createCodexWebClient,
  type ClientCloseInfo,
  type ModelListRequest,
  type ThreadStartRequest,
  type TurnStartRequest,
} from "@/lib/codex-web-client"

type ThreadStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "starting-thread"
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
  | { type: "transport.connecting" }
  | { type: "transport.ready" }
  | {
      type: "models.loaded"
      models: Model[]
      selectedModelId: string
      selectedEffort: ReasoningEffort
    }
  | { type: "selection.updated"; modelId: string; effort: ReasoningEffort }
  | { type: "thread.starting" }
  | { type: "thread.ready"; thread: Thread }
  | { type: "turn.sending"; message: ThreadMessage }
  | { type: "turn.accepted"; turnId: string }
  | { type: "agent.started"; item: Extract<ThreadItem, { type: "agentMessage" }>; turnId: string }
  | { type: "agent.delta"; itemId: string; delta: string; turnId: string }
  | { type: "agent.completed"; item: Extract<ThreadItem, { type: "agentMessage" }>; turnId: string }
  | { type: "turn.completed"; turnId: string }
  | { type: "error.nonfatal"; message: string }
  | { type: "error.fatal"; message: string }

const initialState: ThreadState = {
  status: "idle",
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

function reduceThreadState(state: ThreadState, action: ThreadAction): ThreadState {
  switch (action.type) {
    case "transport.connecting":
      return {
        ...state,
        status: "connecting",
        lastError: null,
      }
    case "transport.ready":
      return {
        ...state,
        status: state.thread ? "thread-ready" : "ready",
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
        lastError: null,
      }
    case "thread.ready":
      return {
        ...state,
        status: "thread-ready",
        thread: action.thread,
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
        status: state.thread ? "thread-ready" : "ready",
        pendingTurnId: null,
        lastCompletedTurnId: action.turnId,
      }
    case "error.nonfatal":
      return {
        ...state,
        status:
          state.status === "starting-thread" ||
          state.pendingTurnId ||
          state.status === "sending" ||
          state.status === "streaming"
            ? state.thread
              ? "thread-ready"
              : "ready"
            : state.status,
        pendingTurnId: null,
        lastCompletedTurnId: null,
        lastError: action.message,
      }
    case "error.fatal":
      return {
        ...state,
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

export function useThread() {
  const [state, dispatch] = useReducer(reduceThreadState, initialState)
  const clientRef = useRef<ReturnType<typeof createCodexWebClient> | null>(null)
  const unsupportedServerRequestsRef = useRef<ServerRequest[]>([])
  const optimisticMessageCountRef = useRef(0)

  const handleNotification = useEffectEvent((notification: ServerNotification) => {
    startTransition(() => {
      switch (notification.method) {
        case "thread/started":
          dispatch({
            type: "thread.ready",
            thread: notification.params.thread,
          })
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
  })

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

  const loadModels = useEffectEvent(async () => {
    const client = clientRef.current
    if (!client) {
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
        dispatch({
          type: "error.nonfatal",
          message: response.error.message,
        })
        return
      }

      const nextModel = pickModel(response.result.data, state.selectedModelId)
      const nextEffort = pickEffort(nextModel, state.selectedEffort)

      dispatch({
        type: "models.loaded",
        models: response.result.data,
        selectedModelId: nextModel?.id ?? state.selectedModelId,
        selectedEffort: nextEffort,
      })
    } catch (error) {
      dispatch({
        type: "error.nonfatal",
        message: getErrorMessage(error),
      })
    }
  })

  useEffect(() => {
    startTransition(() => {
      dispatch({
        type: "transport.connecting",
      })
    })

    const client = createCodexWebClient({
      url: SERVER_V2_WS_URL,
      onNotification: handleNotification,
      onServerRequest: handleServerRequest,
      onClose: handleTransportClose,
      onError: handleTransportError,
    })

    clientRef.current = client

    void client
      .connect()
      .then(() => {
        startTransition(() => {
          dispatch({
            type: "transport.ready",
          })
        })
        void loadModels()
      })
      .catch((error) => {
        startTransition(() => {
          dispatch({
            type: "error.fatal",
            message: getErrorMessage(error),
          })
        })
      })

    return () => {
      clientRef.current = null
      client.dispose()
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

  const startThread = async () => {
    const client = clientRef.current
    if (!client || state.status !== "ready") {
      return
    }

    dispatch({
      type: "thread.starting",
    })

    try {
      const response = await client.request<ThreadStartRequest>({
        method: "thread/start",
        params: {
          model: state.selectedModelId,
          cwd: THREAD_TEST_CWD,
          experimentalRawEvents: false,
        },
      })

      if (isJsonRpcError(response)) {
        dispatch({
          type: "error.nonfatal",
          message: response.error.message,
        })
        return
      }

      dispatch({
        type: "thread.ready",
        thread: response.result.thread,
      })
    } catch (error) {
      dispatch({
        type: "error.nonfatal",
        message: getErrorMessage(error),
      })
    }
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
    selectedModelDisplayName: selectedModel?.displayName ?? state.selectedModelId,
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
    sendMessage,
  }
}
