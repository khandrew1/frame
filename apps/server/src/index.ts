import { createApp } from "./app.js"
import { loadConfig } from "./config.js"
import { SessionRegistry } from "./codex/session-registry.js"
import { createHttpServer } from "./ws.js"

const config = loadConfig()

const sessionRegistry = new SessionRegistry({
  reconnectTtlMs: config.reconnectTtlMs,
  initializeTimeoutMs: config.initializeTimeoutMs,
  experimentalApi: config.experimentalApi,
  codexCommand: config.codexCommand,
  codexArgs: config.codexArgs,
  clientInfo: config.clientInfo,
})

const app = createApp(config, sessionRegistry)
const server = createHttpServer(app, sessionRegistry)

server.listen(config.port, () => {
  console.log(`Frame server listening on http://localhost:${config.port}`)
})
