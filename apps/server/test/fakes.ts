import { EventEmitter } from "node:events"
import { PassThrough, Writable } from "node:stream"

import { JsonLineParser } from "../src/codex/jsonl.js"
import type { ChildProcessLike } from "../src/codex/session.js"

export class FakeChildProcess
  extends EventEmitter
  implements ChildProcessLike
{
  stdout = new PassThrough()
  stderr = new PassThrough()
  stdinParser = new JsonLineParser()
  writtenMessages: unknown[] = []

  stdin = new Writable({
    write: (chunk, _encoding, callback) => {
      const messages = this.stdinParser.push(chunk)
      this.writtenMessages.push(...messages)
      callback()
    },
  })

  kill() {
    this.emit("exit", 0, null)
    return true
  }

  send(message: unknown) {
    this.stdout.write(`${JSON.stringify(message)}\n`)
  }

  fail(message: string) {
    this.stderr.write(`${message}\n`)
  }

  emitError(error: Error) {
    this.emit("error", error)
  }

  crash(code = 1) {
    this.emit("exit", code, null)
  }
}
