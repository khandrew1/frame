import { describe, expect, it } from "vitest"

import { encodeJsonLine, JsonLineParser } from "../src/jsonl.js"

describe("JsonLineParser", () => {
  it("parses newline-delimited JSON payloads", () => {
    const parser = new JsonLineParser()
    const messages = parser.push(
      '{"id":1,"result":{}}\n{"method":"turn/started"}\n'
    )

    expect(messages).toEqual([
      { id: 1, result: {} },
      { method: "turn/started" },
    ])
  })

  it("buffers partial lines until complete", () => {
    const parser = new JsonLineParser()
    expect(parser.push('{"id":1')).toEqual([])
    expect(parser.push(',"result":{}}\n')).toEqual([{ id: 1, result: {} }])
  })

  it("encodes JSONL payloads", () => {
    expect(encodeJsonLine({ method: "initialized" })).toBe(
      '{"method":"initialized"}\n'
    )
  })
})
