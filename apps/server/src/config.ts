const DEFAULT_PORT = 8788
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

export type ServerV2Config = {
  port: number
  initializeTimeoutMs: number
  codexCommand: string
  codexArgs: string[]
  clientInfo: {
    name: string
    title: string
    version: string
  }
}

export function loadConfig(): ServerV2Config {
  const codexCommand = process.env.CODEX_COMMAND ?? "codex"
  const codexArgs = process.env.CODEX_APP_SERVER_ARGS
    ? process.env.CODEX_APP_SERVER_ARGS.split(" ").filter(Boolean)
    : ["app-server"]

  return {
    port: parseNumber(process.env.PORT, DEFAULT_PORT),
    initializeTimeoutMs: parseNumber(
      process.env.CODEX_INITIALIZE_TIMEOUT_MS,
      DEFAULT_INITIALIZE_TIMEOUT_MS
    ),
    codexCommand,
    codexArgs,
    clientInfo: {
      name: "frame_server_v2",
      title: "Frame Server V2",
      version: "0.0.1",
    },
  }
}
