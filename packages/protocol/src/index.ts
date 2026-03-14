import { z } from "zod"

import type { ClientNotification } from "./generated/codex/ClientNotification.js"
import type { ClientRequest } from "./generated/codex/ClientRequest.js"
import type { ServerNotification } from "./generated/codex/ServerNotification.js"
import type { ServerRequest } from "./generated/codex/ServerRequest.js"
import type { ChatgptAuthTokensRefreshResponse } from "./generated/codex/v2/ChatgptAuthTokensRefreshResponse.js"
import type { CommandExecutionRequestApprovalResponse } from "./generated/codex/v2/CommandExecutionRequestApprovalResponse.js"
import type { DynamicToolCallResponse } from "./generated/codex/v2/DynamicToolCallResponse.js"
import type { FileChangeRequestApprovalResponse } from "./generated/codex/v2/FileChangeRequestApprovalResponse.js"
import type { ToolRequestUserInputResponse } from "./generated/codex/v2/ToolRequestUserInputResponse.js"

export type CodexClientRequest = ClientRequest
export type CodexClientNotification = ClientNotification

type LegacyBrowserRequestMethod =
  | "newConversation"
  | "getConversationSummary"
  | "listConversations"
  | "resumeConversation"
  | "forkConversation"
  | "archiveConversation"
  | "sendUserMessage"
  | "sendUserTurn"
  | "interruptConversation"
  | "addConversationListener"
  | "removeConversationListener"
  | "gitDiffToRemote"
  | "loginApiKey"
  | "loginChatGpt"
  | "cancelLoginChatGpt"
  | "logoutChatGpt"
  | "getAuthStatus"
  | "getUserSavedConfig"
  | "setDefaultModel"
  | "getUserAgent"
  | "userInfo"
  | "fuzzyFileSearch"
  | "execOneOffCommand"
type BrowserExcludedMethod = "initialize" | LegacyBrowserRequestMethod

export type CodexBrowserRequest = Exclude<
  CodexClientRequest,
  { method: BrowserExcludedMethod }
>

export type CodexServerNotification = ServerNotification

type LegacyServerRequestMethod = "applyPatchApproval" | "execCommandApproval"

export type CodexServerRequest = Exclude<
  ServerRequest,
  { method: LegacyServerRequestMethod }
>

type CodexServerRequestSuccessResult =
  | ChatgptAuthTokensRefreshResponse
  | CommandExecutionRequestApprovalResponse
  | DynamicToolCallResponse
  | FileChangeRequestApprovalResponse
  | ToolRequestUserInputResponse

export const codexBrowserRequestMethods = [
  "thread/start",
  "thread/resume",
  "thread/fork",
  "thread/archive",
  "thread/name/set",
  "thread/unarchive",
  "thread/compact/start",
  "thread/rollback",
  "thread/list",
  "thread/loaded/list",
  "thread/read",
  "skills/list",
  "skills/remote/read",
  "skills/remote/write",
  "app/list",
  "skills/config/write",
  "turn/start",
  "turn/steer",
  "turn/interrupt",
  "review/start",
  "model/list",
  "experimentalFeature/list",
  "mcpServer/oauth/login",
  "config/mcpServer/reload",
  "mcpServerStatus/list",
  "account/login/start",
  "account/login/cancel",
  "account/logout",
  "account/rateLimits/read",
  "feedback/upload",
  "command/exec",
  "config/read",
  "config/value/write",
  "config/batchWrite",
  "configRequirements/read",
  "account/read",
] as const satisfies readonly CodexBrowserRequest["method"][]

export const codexServerNotificationMethods = [
  "error",
  "thread/started",
  "thread/name/updated",
  "thread/tokenUsage/updated",
  "turn/started",
  "turn/completed",
  "turn/diff/updated",
  "turn/plan/updated",
  "item/started",
  "item/completed",
  "rawResponseItem/completed",
  "item/agentMessage/delta",
  "item/plan/delta",
  "item/commandExecution/outputDelta",
  "item/commandExecution/terminalInteraction",
  "item/fileChange/outputDelta",
  "item/mcpToolCall/progress",
  "mcpServer/oauthLogin/completed",
  "account/updated",
  "account/rateLimits/updated",
  "app/list/updated",
  "item/reasoning/summaryTextDelta",
  "item/reasoning/summaryPartAdded",
  "item/reasoning/textDelta",
  "thread/compacted",
  "deprecationNotice",
  "configWarning",
  "windows/worldWritableWarning",
  "account/login/completed",
  "authStatusChange",
  "loginChatGptComplete",
  "sessionConfigured",
] as const satisfies readonly CodexServerNotification["method"][]

export const codexServerRequestMethods = [
  "item/commandExecution/requestApproval",
  "item/fileChange/requestApproval",
  "item/tool/requestUserInput",
  "item/tool/call",
  "account/chatgptAuthTokens/refresh",
] as const satisfies readonly CodexServerRequest["method"][]

const codexBrowserRequestMethodSet = new Set<string>(codexBrowserRequestMethods)
const codexServerNotificationMethodSet = new Set<string>(
  codexServerNotificationMethods
)
const codexServerRequestMethodSet = new Set<string>(codexServerRequestMethods)

export const jsonRpcIdSchema = z.union([z.string(), z.number()])

export const jsonRpcRequestSchema = z.object({
  id: jsonRpcIdSchema,
  method: z.string(),
  params: z.unknown().optional(),
})

export const jsonRpcNotificationSchema = z.object({
  method: z.string(),
  params: z.unknown().optional(),
})

export const jsonRpcErrorObjectSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: z.unknown().optional(),
})

export const jsonRpcSuccessSchema = z.object({
  id: jsonRpcIdSchema,
  result: z.unknown(),
})

export const jsonRpcErrorSchema = z.object({
  id: jsonRpcIdSchema,
  error: jsonRpcErrorObjectSchema,
})

export const jsonRpcResponseSchema = z.union([
  jsonRpcSuccessSchema,
  jsonRpcErrorSchema,
])

export const jsonRpcMessageSchema = z.union([
  jsonRpcRequestSchema,
  jsonRpcNotificationSchema,
  jsonRpcResponseSchema,
])

export type JsonRpcId = z.infer<typeof jsonRpcIdSchema>
export type JsonRpcRequest = z.infer<typeof jsonRpcRequestSchema>
export type JsonRpcNotification = z.infer<typeof jsonRpcNotificationSchema>
export type JsonRpcErrorObject = z.infer<typeof jsonRpcErrorObjectSchema>
export type JsonRpcSuccess = z.infer<typeof jsonRpcSuccessSchema>
export type JsonRpcError = z.infer<typeof jsonRpcErrorSchema>
export type JsonRpcResponse = z.infer<typeof jsonRpcResponseSchema>
export type JsonRpcMessage = z.infer<typeof jsonRpcMessageSchema>

export type CodexServerRequestResponse =
  | {
      id: JsonRpcId
      result: CodexServerRequestSuccessResult
    }
  | JsonRpcError

export function isCodexBrowserRequest(
  message: JsonRpcRequest
): message is CodexBrowserRequest {
  return codexBrowserRequestMethodSet.has(message.method)
}

export function isCodexServerNotification(
  message: JsonRpcNotification
): message is CodexServerNotification {
  return codexServerNotificationMethodSet.has(message.method)
}

export function isCodexServerRequest(
  message: JsonRpcRequest
): message is CodexServerRequest {
  return codexServerRequestMethodSet.has(message.method)
}

export const browserRpcRequestSchema = z.object({
  type: z.literal("rpc.request"),
  message: jsonRpcRequestSchema.extend({
    method: z.enum(codexBrowserRequestMethods),
  }),
})

export const browserServerRequestRespondSchema = z.object({
  type: z.literal("serverRequest.respond"),
  message: jsonRpcResponseSchema,
})

export const browserSessionCloseSchema = z.object({
  type: z.literal("session.close"),
})

export const browserToServerMessageSchema = z.union([
  browserRpcRequestSchema,
  browserServerRequestRespondSchema,
  browserSessionCloseSchema,
])

export type BrowserRpcRequestMessage = {
  type: "rpc.request"
  message: CodexBrowserRequest
}
export type BrowserServerRequestRespondMessage = {
  type: "serverRequest.respond"
  message: CodexServerRequestResponse
}
export type BrowserSessionCloseMessage = z.infer<
  typeof browserSessionCloseSchema
>
export type BrowserToServerMessage =
  | BrowserRpcRequestMessage
  | BrowserServerRequestRespondMessage
  | BrowserSessionCloseMessage

export const serverSessionReadySchema = z.object({
  type: z.literal("session.ready"),
  sessionId: z.string(),
})

export const serverRpcResponseSchema = z.object({
  type: z.literal("rpc.response"),
  message: jsonRpcResponseSchema,
})

export const serverRpcNotificationSchema = z.object({
  type: z.literal("rpc.notification"),
  message: jsonRpcNotificationSchema.extend({
    method: z.enum(codexServerNotificationMethods),
  }),
})

export const serverRequestMessageSchema = z.object({
  type: z.literal("serverRequest.request"),
  message: jsonRpcRequestSchema.extend({
    method: z.enum(codexServerRequestMethods),
  }),
})

export const sessionErrorCodeSchema = z.enum([
  "session_not_found",
  "session_busy",
  "session_expired",
  "spawn_failed",
  "initialize_failed",
  "child_exit",
  "child_stderr",
  "invalid_message",
  "protocol_error",
])

export const serverSessionErrorSchema = z.object({
  type: z.literal("session.error"),
  code: sessionErrorCodeSchema,
  message: z.string(),
  retryable: z.boolean().default(false),
})

export const serverToBrowserMessageSchema = z.union([
  serverSessionReadySchema,
  serverRpcResponseSchema,
  serverRpcNotificationSchema,
  serverRequestMessageSchema,
  serverSessionErrorSchema,
])

export type SessionErrorCode = z.infer<typeof sessionErrorCodeSchema>
export type ServerSessionReadyMessage = z.infer<typeof serverSessionReadySchema>
export type ServerRpcResponseMessage = {
  type: "rpc.response"
  message: JsonRpcResponse
}
export type ServerRpcNotificationMessage = {
  type: "rpc.notification"
  message: CodexServerNotification
}
export type ServerRequestMessage = {
  type: "serverRequest.request"
  message: CodexServerRequest
}
export type ServerSessionErrorMessage = z.infer<typeof serverSessionErrorSchema>
export type ServerToBrowserMessage =
  | ServerSessionReadyMessage
  | ServerRpcResponseMessage
  | ServerRpcNotificationMessage
  | ServerRequestMessage
  | ServerSessionErrorMessage
