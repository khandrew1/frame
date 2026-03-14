import { z } from "zod"

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

export const browserRpcRequestSchema = z.object({
  type: z.literal("rpc.request"),
  message: jsonRpcRequestSchema,
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

export type BrowserRpcRequestMessage = z.infer<typeof browserRpcRequestSchema>
export type BrowserServerRequestRespondMessage = z.infer<
  typeof browserServerRequestRespondSchema
>
export type BrowserSessionCloseMessage = z.infer<
  typeof browserSessionCloseSchema
>
export type BrowserToServerMessage = z.infer<
  typeof browserToServerMessageSchema
>

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
  message: jsonRpcNotificationSchema,
})

export const serverRequestMessageSchema = z.object({
  type: z.literal("serverRequest.request"),
  message: jsonRpcRequestSchema,
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
export type ServerRpcResponseMessage = z.infer<typeof serverRpcResponseSchema>
export type ServerRpcNotificationMessage = z.infer<
  typeof serverRpcNotificationSchema
>
export type ServerRequestMessage = z.infer<typeof serverRequestMessageSchema>
export type ServerSessionErrorMessage = z.infer<typeof serverSessionErrorSchema>
export type ServerToBrowserMessage = z.infer<
  typeof serverToBrowserMessageSchema
>
