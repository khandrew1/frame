import { describe, expect, it, vi } from "vitest"

import { createCodexWebClient } from "@/lib/codex-web-client"
import { MockWebSocket } from "@/test/mock-websocket"

describe("createCodexWebClient", () => {
  it("rejects connect when the socket closes before initialize", async () => {
    const onNotification = vi.fn()
    const onServerRequest = vi.fn()
    const onClose = vi.fn()
    const onError = vi.fn()

    const client = createCodexWebClient({
      url: "ws://localhost:8788/ws",
      onNotification,
      onServerRequest,
      onClose,
      onError,
    })

    const connectPromise = client.connect()
    const socket = MockWebSocket.latest()

    socket.serverClose(1006, "Connection refused", false)

    await expect(connectPromise).rejects.toThrow("Connection refused")
    expect(onClose).toHaveBeenCalledWith({
      code: 1006,
      reason: "Connection refused",
      wasClean: false,
    })
  })
})
