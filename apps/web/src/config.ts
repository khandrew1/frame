import type { ReasoningEffort } from "@workspace/protocol/generated/codex/ReasoningEffort"

export const SERVER_V2_WS_URL =
  import.meta.env.VITE_SERVER_V2_WS_URL ?? "ws://localhost:8788/ws"

export const THREAD_TEST_CWD = "/tmp/frame-web-test"

export const DEFAULT_MODEL = "gpt-5.4"

export const DEFAULT_REASONING_EFFORT: ReasoningEffort = "high"
