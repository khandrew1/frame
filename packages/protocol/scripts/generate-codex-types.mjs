import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"
import { spawnSync } from "node:child_process"

const packageRoot = process.cwd()
const outputDir = join(packageRoot, "src", "generated", "codex")

rmSync(outputDir, { recursive: true, force: true })

const result = spawnSync("codex", ["app-server", "generate-ts", "--out", outputDir], {
  cwd: packageRoot,
  stdio: "inherit",
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

const relativeImportPattern = /from "(\.[^"]*)"/g

function rewriteImports(path) {
  const stats = statSync(path)
  if (stats.isDirectory()) {
    for (const entry of readdirSync(path)) {
      rewriteImports(join(path, entry))
    }
    return
  }

  if (!path.endsWith(".ts")) {
    return
  }

  const source = readFileSync(path, "utf8")
  const rewritten = source.replace(relativeImportPattern, (_match, specifier) => {
    if (specifier.endsWith(".js")) {
      return `from "${specifier}"`
    }

    if (specifier === "./v2") {
      return 'from "./v2/index.js"'
    }

    return `from "${specifier}.js"`
  })

  if (rewritten !== source) {
    writeFileSync(path, rewritten)
  }
}

rewriteImports(outputDir)

const generatedNote = [
  "// GENERATED FILE PATHS UNDER THIS DIRECTORY COME FROM `pnpm codex:generate`.",
  `// Generated against the local Codex CLI in ${relative(packageRoot, outputDir)}.`,
  "",
].join("\n")

writeFileSync(join(outputDir, ".generated-note"), generatedNote)
