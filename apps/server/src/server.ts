import { spawn, spawnSync } from "node:child_process"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"

import { WebSocketServer } from "ws"

import { CodexBridge, type ChildProcessLike, type SpawnProcess } from "./codex-bridge.js"
import type { ServerV2Config } from "./config.js"

type HealthPayload = {
  ok: boolean
  codexAvailable: boolean
  version: string | null
  error: string | null
}

export type ServerV2Options = {
  spawnProcess?: SpawnProcess
  healthCheck?: () => HealthPayload
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown
) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  })
  response.end(JSON.stringify(payload))
}

function getDefaultHealthCheck(config: ServerV2Config) {
  return () => {
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

    return {
      ok: result.status === 0,
      codexAvailable: result.status === 0,
      version: stdout,
      error:
        result.status === 0
          ? null
          : (result.error?.message ?? stderr ?? "codex not available"),
    }
  }
}

function getSpawnProcess(config: ServerV2Config): SpawnProcess {
  return () =>
    spawn(config.codexCommand, config.codexArgs, {
      stdio: ["pipe", "pipe", "pipe"],
    }) as ChildProcessLike
}

function handleHttpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  config: ServerV2Config,
  healthCheck: () => HealthPayload
) {
  const method = request.method ?? "GET"
  const url = new URL(request.url ?? "/", "http://localhost")

  if (method === "GET" && url.pathname === "/healthz") {
    writeJson(response, 200, healthCheck())
    return
  }

  if (method === "GET" && url.pathname === "/version") {
    writeJson(response, 200, {
      name: config.clientInfo.name,
      title: config.clientInfo.title,
      version: config.clientInfo.version,
    })
    return
  }

  writeJson(response, 404, {
    error: "Not found.",
  })
}

export function createHttpServer(
  config: ServerV2Config,
  options: ServerV2Options = {}
) {
  const spawnProcess = options.spawnProcess ?? getSpawnProcess(config)
  const healthCheck = options.healthCheck ?? getDefaultHealthCheck(config)
  const server = createServer((request, response) => {
    handleHttpRequest(request, response, config, healthCheck)
  })
  const wss = new WebSocketServer({ noServer: true })

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost")
    if (url.pathname !== "/ws") {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n")
      socket.destroy()
      return
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      const bridge = new CodexBridge(config, ws, spawnProcess)
      bridge.start()
    })
  })

  return server
}
