import type { ClientNotification } from "@workspace/protocol/generated/codex/ClientNotification"
import type { ClientRequest } from "@workspace/protocol/generated/codex/ClientRequest"
import type { InitializeResponse } from "@workspace/protocol/generated/codex/InitializeResponse"
import type { ServerNotification } from "@workspace/protocol/generated/codex/ServerNotification"
import type { ServerRequest } from "@workspace/protocol/generated/codex/ServerRequest"
import type { ModelListResponse } from "@workspace/protocol/generated/codex/v2/ModelListResponse"
import type { ThreadStartResponse } from "@workspace/protocol/generated/codex/v2/ThreadStartResponse"
import type { TurnStartResponse } from "@workspace/protocol/generated/codex/v2/TurnStartResponse"

type JsonRpcId = string | number

type JsonRpcRequest = {
  id: JsonRpcId
  method: string
  params?: unknown
}

type JsonRpcNotification = {
  method: string
  params?: unknown
}

type JsonRpcErrorObject = {
  code: number
  message: string
  data?: unknown
}

type JsonRpcSuccess<TResult> = {
  id: JsonRpcId
  result: TResult
}

type JsonRpcError = {
  id: JsonRpcId
  error: JsonRpcErrorObject
}

type JsonRpcResponse<TResult = unknown> = JsonRpcSuccess<TResult> | JsonRpcError

export type InitializeRequest = Extract<ClientRequest, { method: "initialize" }>
export type ModelListRequest = Extract<ClientRequest, { method: "model/list" }>
export type ThreadStartRequest = Extract<
  ClientRequest,
  { method: "thread/start" }
>
export type TurnStartRequest = Extract<ClientRequest, { method: "turn/start" }>
type SupportedRequest =
  | InitializeRequest
  | ModelListRequest
  | ThreadStartRequest
  | TurnStartRequest

type ResponseForRequest<TRequest extends SupportedRequest> =
  TRequest extends InitializeRequest
    ? InitializeResponse
    : TRequest extends ModelListRequest
      ? ModelListResponse
      : TRequest extends ThreadStartRequest
        ? ThreadStartResponse
        : TRequest extends TurnStartRequest
          ? TurnStartResponse
          : never

type PendingRequest = {
  resolve: (response: JsonRpcResponse<unknown>) => void
  reject: (error: Error) => void
}

export type ClientCloseInfo = {
  code: number
  reason: string
  wasClean: boolean
}

type CodexWebClientOptions = {
  url: string
  onNotification: (notification: ServerNotification) => void
  onServerRequest: (request: ServerRequest) => void
  onClose: (info: ClientCloseInfo) => void
  onError: (error: Error) => void
}

export type CodexWebClient = {
  connect: () => Promise<void>
  request: <TRequest extends SupportedRequest>(
    request: Omit<TRequest, "id"> & { id?: JsonRpcId }
  ) => Promise<JsonRpcResponse<ResponseForRequest<TRequest>>>
  respond: (response: JsonRpcResponse) => void
  dispose: () => void
}

const INITIALIZE_TIMEOUT_MS = 10_000

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isJsonRpcRequest(message: unknown): message is JsonRpcRequest {
  return (
    isObject(message) &&
    typeof message.id !== "undefined" &&
    typeof message.method === "string"
  )
}

function isJsonRpcNotification(
  message: unknown
): message is JsonRpcNotification {
  return (
    isObject(message) &&
    typeof message.id === "undefined" &&
    typeof message.method === "string"
  )
}

function isJsonRpcResponse(message: unknown): message is JsonRpcResponse {
  return (
    isObject(message) &&
    typeof message.id !== "undefined" &&
    ("result" in message || "error" in message)
  )
}

function isJsonRpcError<TResult>(
  response: JsonRpcResponse<TResult>
): response is JsonRpcError {
  return "error" in response
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error."
}

function serialize(
  message: JsonRpcRequest | JsonRpcNotification | JsonRpcResponse
) {
  return JSON.stringify(message)
}

export function createCodexWebClient(
  options: CodexWebClientOptions
): CodexWebClient {
  let socket: WebSocket | null = null
  let nextRequestId = 0
  let pendingRequests = new Map<JsonRpcId, PendingRequest>()
  let connectPromise: Promise<void> | null = null
  let isReady = false
  let isDisposed = false
  let initializeTimer: number | null = null

  const clearInitializeTimer = () => {
    if (initializeTimer !== null) {
      window.clearTimeout(initializeTimer)
      initializeTimer = null
    }
  }

  const rejectPendingRequests = (error: Error) => {
    for (const pending of pendingRequests.values()) {
      pending.reject(error)
    }
    pendingRequests = new Map()
  }

  const send = (
    message: JsonRpcRequest | JsonRpcNotification | JsonRpcResponse
  ) => {
    if (socket === null || socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not open.")
    }

    socket.send(serialize(message))
  }

  const handleMessage = (event: MessageEvent) => {
    let payload: unknown

    try {
      payload = JSON.parse(String(event.data))
    } catch {
      socket?.close(1008, "Invalid JSON payload from server.")
      options.onError(new Error("Invalid JSON payload from server."))
      return
    }

    if (isJsonRpcResponse(payload)) {
      const pending = pendingRequests.get(payload.id)
      if (!pending) {
        options.onError(
          new Error(`Unexpected JSON-RPC response id: ${payload.id}`)
        )
        return
      }

      pendingRequests.delete(payload.id)
      pending.resolve(payload)
      return
    }

    if (isJsonRpcNotification(payload)) {
      options.onNotification(payload as ServerNotification)
      return
    }

    if (isJsonRpcRequest(payload)) {
      options.onServerRequest(payload as ServerRequest)
      return
    }

    options.onError(
      new Error("Received an invalid JSON-RPC message from server.")
    )
  }

  const initialize = async () => {
    const initializeRequest: InitializeRequest = {
      id: nextRequestId++,
      method: "initialize",
      params: {
        clientInfo: {
          name: "frame_web",
          title: "Frame Web",
          version: "0.0.1",
        },
        capabilities: null,
      },
    }

    initializeTimer = window.setTimeout(() => {
      if (isReady || isDisposed) {
        return
      }

      socket?.close(1011, "Timed out waiting for initialize response.")
      options.onError(new Error("Timed out waiting for initialize response."))
    }, INITIALIZE_TIMEOUT_MS)

    const response = await request(initializeRequest)
    clearInitializeTimer()

    if (isJsonRpcError(response)) {
      throw new Error(response.error.message)
    }

    const initializedNotification: ClientNotification = {
      method: "initialized",
    }
    send(initializedNotification)
    isReady = true
  }

  const connect = () => {
    if (connectPromise) {
      return connectPromise
    }

    connectPromise = new Promise<void>((resolve, reject) => {
      let didSettle = false
      const rejectConnect = (error: Error) => {
        if (didSettle) {
          return
        }

        didSettle = true
        reject(error)
      }

      const resolveConnect = () => {
        if (didSettle) {
          return
        }

        didSettle = true
        resolve()
      }

      socket = new WebSocket(options.url)

      socket.addEventListener("open", () => {
        void initialize()
          .then(resolveConnect)
          .catch((error) => {
            const clientError = new Error(getErrorMessage(error))
            rejectConnect(clientError)
            options.onError(clientError)
          })
      })

      socket.addEventListener("message", handleMessage)

      socket.addEventListener("error", () => {
        if (!isDisposed) {
          options.onError(new Error("WebSocket connection error."))
        }
      })

      socket.addEventListener("close", (event) => {
        clearInitializeTimer()
        connectPromise = null
        isReady = false
        const closeError =
          event.code === 1000
            ? new Error("WebSocket connection closed.")
            : new Error(event.reason || "WebSocket connection closed.")
        rejectConnect(closeError)
        rejectPendingRequests(closeError)

        if (!isDisposed) {
          options.onClose({
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
          })
        }
      })
    })

    return connectPromise
  }

  function request<TRequest extends SupportedRequest>(
    requestMessage: Omit<TRequest, "id"> & { id?: JsonRpcId }
  ): Promise<JsonRpcResponse<ResponseForRequest<TRequest>>> {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("WebSocket is not connected."))
    }

    const id = requestMessage.id ?? nextRequestId++
    const message = {
      ...requestMessage,
      id,
    } as TRequest

    return new Promise((resolve, reject) => {
      pendingRequests.set(id, {
        resolve: resolve as (response: JsonRpcResponse<unknown>) => void,
        reject,
      })

      try {
        send(message)
      } catch (error) {
        pendingRequests.delete(id)
        reject(new Error(getErrorMessage(error)))
      }
    })
  }

  const respond = (response: JsonRpcResponse) => {
    send(response)
  }

  const dispose = () => {
    isDisposed = true
    clearInitializeTimer()
    rejectPendingRequests(new Error("Web client disposed."))

    if (!socket) {
      return
    }

    if (
      socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING
    ) {
      socket.close(1000, "Client closed connection.")
    }

    socket = null
  }

  return {
    connect,
    request,
    respond,
    dispose,
  }
}
