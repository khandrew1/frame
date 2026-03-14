const DEFAULT_PORT = 8787
const DEFAULT_RECONNECT_TTL_MS = 30_000
const DEFAULT_INITIALIZE_TIMEOUT_MS = 10_000

function parseNumber(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

export type ServerConfig = {
  port: number
  reconnectTtlMs: number
  initializeTimeoutMs: number
  codexCommand: string
  codexArgs: string[]
  experimentalApi: boolean
  clientInfo: {
    name: string
    title: string
    version: string
  }
}

export function loadConfig(): ServerConfig {
  const codexCommand = process.env.CODEX_COMMAND ?? "codex"
  const codexArgs = process.env.CODEX_APP_SERVER_ARGS
    ? process.env.CODEX_APP_SERVER_ARGS.split(" ").filter(Boolean)
    : ["app-server"]

  return {
    port: parseNumber(process.env.PORT, DEFAULT_PORT),
    reconnectTtlMs: parseNumber(
      process.env.SESSION_RECONNECT_TTL_MS,
      DEFAULT_RECONNECT_TTL_MS
    ),
    initializeTimeoutMs: parseNumber(
      process.env.CODEX_INITIALIZE_TIMEOUT_MS,
      DEFAULT_INITIALIZE_TIMEOUT_MS
    ),
    codexCommand,
    codexArgs,
    experimentalApi: process.env.FRAME_CODEX_EXPERIMENTAL_API === "true",
    clientInfo: {
      name: "frame_gui",
      title: "Frame GUI",
      version: "0.0.1",
    },
  }
}
