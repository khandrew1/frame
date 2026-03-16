import { loadConfig } from "./config.js"
import { createHttpServer } from "./server.js"

const config = loadConfig()
const server = createHttpServer(config)

server.listen(config.port, () => {
  console.log(`Frame server-v2 listening on http://localhost:${config.port}`)
})
