import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"

const packageRoot = process.cwd()
const sourceDir = join(packageRoot, "src", "generated", "schemas")
const outputDir = join(packageRoot, "dist", "generated", "schemas")

rmSync(outputDir, {
  recursive: true,
  force: true,
  maxRetries: 5,
  retryDelay: 50,
})

if (existsSync(sourceDir)) {
  mkdirSync(join(packageRoot, "dist", "generated"), { recursive: true })
  cpSync(sourceDir, outputDir, { recursive: true })
}
