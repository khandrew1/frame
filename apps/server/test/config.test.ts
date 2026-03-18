import { describe, expect, it } from "vitest"

import { loadConfig, type RpcLogMode } from "../src/config.js"

function createEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    PORT: undefined,
    CODEX_COMMAND: undefined,
    CODEX_APP_SERVER_ARGS: undefined,
    CODEX_INITIALIZE_TIMEOUT_MS: undefined,
    FRAME_LOG_RPC: undefined,
    ...overrides,
  }
}

describe("loadConfig", () => {
  it("defaults rpc logging to off", () => {
    const config = loadConfig(createEnv())

    expect(config.rpcLogMode).toBe("off")
  })

  it.each<RpcLogMode>(["off", "summary", "verbose", "trace"])(
    "parses %s as a valid rpc log mode",
    (rpcLogMode) => {
      const config = loadConfig(
        createEnv({
          FRAME_LOG_RPC: rpcLogMode,
        })
      )

      expect(config.rpcLogMode).toBe(rpcLogMode)
    }
  )

  it("falls back to off for unknown rpc log modes", () => {
    const config = loadConfig(
      createEnv({
        FRAME_LOG_RPC: "loud",
      })
    )

    expect(config.rpcLogMode).toBe("off")
  })
})
