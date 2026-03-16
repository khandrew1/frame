import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"
import { spawnSync } from "node:child_process"

const packageRoot = process.cwd()
const outputDir = join(packageRoot, "src", "generated", "schemas")

rmSync(outputDir, { recursive: true, force: true })
mkdirSync(outputDir, { recursive: true })

const result = spawnSync(
  "codex",
  ["app-server", "generate-json-schema", "--out", outputDir],
  {
    cwd: packageRoot,
    stdio: "inherit",
  }
)

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

const generatedNote = [
  "// GENERATED FILES UNDER THIS DIRECTORY COME FROM `pnpm codex:generate`.",
  `// Generated against the local Codex CLI in ${relative(packageRoot, outputDir)}.`,
  "",
].join("\n")

writeFileSync(join(outputDir, ".generated-note"), generatedNote)
