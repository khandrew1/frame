const DEFAULT_PORT = 8788
const DEFAULT_INITIALIZE_TIMEOUT_MS = 10_000
const RPC_LOG_MODES = ["off", "summary", "verbose", "trace"] as const

export type RpcLogMode = (typeof RPC_LOG_MODES)[number]

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
  rpcLogMode: RpcLogMode
  clientInfo: {
    name: string
    title: string
    version: string
  }
}

function parseRpcLogMode(value: string | undefined): RpcLogMode {
  if (!value) {
    return "off"
  }

  return RPC_LOG_MODES.includes(value as RpcLogMode)
    ? (value as RpcLogMode)
    : "off"
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env
): ServerV2Config {
  const codexCommand = env.CODEX_COMMAND ?? "codex"
  const codexArgs = env.CODEX_APP_SERVER_ARGS
    ? env.CODEX_APP_SERVER_ARGS.split(" ").filter(Boolean)
    : ["app-server"]

  return {
    port: parseNumber(env.PORT, DEFAULT_PORT),
    initializeTimeoutMs: parseNumber(
      env.CODEX_INITIALIZE_TIMEOUT_MS,
      DEFAULT_INITIALIZE_TIMEOUT_MS
    ),
    codexCommand,
    codexArgs,
    rpcLogMode: parseRpcLogMode(env.FRAME_LOG_RPC),
    clientInfo: {
      name: "frame_server_v2",
      title: "Frame Server V2",
      version: "0.0.1",
    },
  }
}
