import { spawnSync } from "node:child_process"

import { Hono } from "hono"

import type { ServerConfig } from "./config.js"
import type { SessionRegistry } from "./codex/session-registry.js"

export function createApp(
  config: ServerConfig,
  sessionRegistry: SessionRegistry
) {
  const app = new Hono()

  app.get("/healthz", (c) => {
    const result = spawnSync(config.codexCommand, ["--version"], {
      encoding: "utf8",
    })
    const stdout =
      typeof result.stdout === "string" && result.stdout.trim().length > 0
        ? result.stdout.trim()
        : null
    const stderr =
      typeof result.stderr === "string" && result.stderr.trim().length > 0
        ? result.stderr.trim()
        : null

    return c.json({
      ok: result.status === 0,
      codexAvailable: result.status === 0,
      version: stdout,
      error:
        result.status === 0
          ? null
          : result.error?.message ?? stderr ?? "codex not available",
    })
  })

  app.post("/api/sessions", async (c) => {
    try {
      const sessionId = await sessionRegistry.createSession()
      const url = new URL(c.req.url)
      const protocol = url.protocol === "https:" ? "wss" : "ws"

      return c.json({
        sessionId,
        wsUrl: `${protocol}://${url.host}/ws/${sessionId}`,
      })
    } catch (error) {
      return c.json(
        {
          error: error instanceof Error ? error.message : "Failed to create session.",
        },
        500
      )
    }
  })

  return app
}
