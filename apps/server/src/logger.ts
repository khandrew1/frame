import type {
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
} from "@workspace/protocol"

import type { RpcLogMode } from "./config.js"

type RpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse

export type RpcLogDirection =
  | "browser->server"
  | "server->codex"
  | "codex->server"
  | "server->browser"

type RpcLogPhase = "parse" | "validate"

const VERBOSE_PREVIEW_LIMIT = 400

function getTimestamp() {
  return new Date().toISOString()
}

function quoteValue(value: unknown) {
  return JSON.stringify(String(value))
}

function isResponse(message: RpcMessage): message is JsonRpcResponse {
  return "id" in message && ("result" in message || "error" in message)
}

function getKind(message: RpcMessage) {
  if ("method" in message) {
    return "id" in message ? "request" : "notification"
  }

  return "response"
}

function buildHeader(direction: RpcLogDirection, message: RpcMessage) {
  const parts = ["DEBUG", "rpc", direction, getKind(message)]

  if ("id" in message) {
    parts.push(`id=${quoteValue(message.id)}`)
  }

  if ("method" in message) {
    parts.push(`method=${message.method}`)
  }

  if (isResponse(message)) {
    parts.push(`status=${"error" in message ? "error" : "ok"}`)
  }

  return `${getTimestamp()} ${parts.join(" ")}`
}

function stringifyJson(value: unknown, spacing?: number) {
  const result = JSON.stringify(value, null, spacing)
  return result ?? String(value)
}

function buildPreview(value: unknown) {
  const preview = stringifyJson(value)
  if (preview.length <= VERBOSE_PREVIEW_LIMIT) {
    return preview
  }

  return `${preview.slice(0, VERBOSE_PREVIEW_LIMIT)}...`
}

export function logRpcMessage(
  mode: RpcLogMode,
  direction: RpcLogDirection,
  message: RpcMessage
) {
  if (mode === "off") {
    return
  }

  const header = buildHeader(direction, message)

  if (mode === "summary") {
    console.debug(header)
    return
  }

  if (mode === "verbose") {
    console.debug(`${header} payload=${buildPreview(message)}`)
    return
  }

  console.debug(`${header}\n${stringifyJson(message, 2)}`)
}

export function logRpcFailure(
  mode: RpcLogMode,
  direction: RpcLogDirection,
  phase: RpcLogPhase,
  error: string,
  payload?: unknown
) {
  if (mode === "off") {
    return
  }

  const header = `${getTimestamp()} ERROR rpc ${direction} ${phase} error=${quoteValue(error)}`

  if (payload === undefined || mode === "summary") {
    console.error(header)
    return
  }

  if (mode === "verbose") {
    console.error(`${header} payload=${buildPreview(payload)}`)
    return
  }

  const body = typeof payload === "string" ? payload : stringifyJson(payload, 2)
  console.error(`${header}\n${body}`)
}
