import { createServer, type Server as HttpServer } from "node:http"

import { getRequestListener } from "@hono/node-server"
import {
  browserToServerMessageSchema,
  type BrowserToServerMessage,
} from "@workspace/protocol"
import type { Hono } from "hono"
import { WebSocketServer, type WebSocket } from "ws"

import type { SessionRegistry } from "./codex/session-registry.js"

function getSessionId(pathname: string) {
  const match = pathname.match(/^\/ws\/([^/]+)$/)
  return match?.[1] ?? null
}

export function createHttpServer(app: Hono, sessionRegistry: SessionRegistry) {
  const requestListener = getRequestListener(app.fetch)
  const server = createServer(requestListener)

  attachWebSocketServer(server, sessionRegistry)
  return server
}

export function attachWebSocketServer(
  server: HttpServer,
  sessionRegistry: SessionRegistry
) {
  const wss = new WebSocketServer({ noServer: true })

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost")
    const sessionId = getSessionId(url.pathname)

    if (!sessionId) {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n")
      socket.destroy()
      return
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      const attached = sessionRegistry.attachSocket(sessionId, ws)
      if (!attached.ok) {
        ws.send(
          JSON.stringify({
            type: "session.error",
            code: attached.code,
            message: attached.message,
            retryable: attached.code === "session_not_found",
          })
        )
        ws.close()
        return
      }

      ws.on("message", async (raw) => {
        let decoded: unknown

        try {
          decoded = JSON.parse(raw.toString())
        } catch {
          ws.send(
            JSON.stringify({
              type: "session.error",
              code: "invalid_message",
              message: "Invalid JSON payload from browser WebSocket.",
              retryable: false,
            })
          )
          return
        }

        const parsed = browserToServerMessageSchema.safeParse(decoded)
        if (!parsed.success) {
          ws.send(
            JSON.stringify({
              type: "session.error",
              code: "invalid_message",
              message: "Invalid browser WebSocket message.",
              retryable: false,
            })
          )
          return
        }

        try {
          await sessionRegistry.handleBrowserMessage(
            sessionId,
            parsed.data as BrowserToServerMessage
          )
        } catch (error) {
          ws.send(
            JSON.stringify({
              type: "session.error",
              code: "protocol_error",
              message:
                error instanceof Error
                  ? error.message
                  : "Failed to process message.",
              retryable: false,
            })
          )
        }
      })

      ws.on("close", () => {
        sessionRegistry.detachSocket(sessionId, ws as WebSocket)
      })
    })
  })

  return wss
}
