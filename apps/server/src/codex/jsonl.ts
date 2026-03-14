import { Buffer } from "node:buffer"

export function encodeJsonLine(message: unknown) {
  return `${JSON.stringify(message)}\n`
}

export class JsonLineParser {
  #buffer = ""

  push(chunk: Buffer | string) {
    this.#buffer += chunk.toString()
    const lines = this.#buffer.split("\n")
    this.#buffer = lines.pop() ?? ""

    return lines
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as unknown)
  }

  flush() {
    const line = this.#buffer.trim()
    this.#buffer = ""

    if (!line) {
      return []
    }

    return [JSON.parse(line) as unknown]
  }
}
