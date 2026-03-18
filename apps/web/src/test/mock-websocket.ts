type EventListener = (event: {
  code?: number
  data?: string
  reason?: string
  wasClean?: boolean
}) => void

export class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances: MockWebSocket[] = []

  readonly url: string
  readonly sent: string[] = []
  readyState = MockWebSocket.CONNECTING

  private listeners = new Map<string, Set<EventListener>>()

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  addEventListener(type: string, listener: EventListener) {
    const existing = this.listeners.get(type) ?? new Set<EventListener>()
    existing.add(listener)
    this.listeners.set(type, existing)
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close(code = 1000, reason = "") {
    if (this.readyState === MockWebSocket.CLOSED) {
      return
    }

    this.readyState = MockWebSocket.CLOSED
    this.emit("close", {
      code,
      reason,
      wasClean: code === 1000,
    })
  }

  serverOpen() {
    this.readyState = MockWebSocket.OPEN
    this.emit("open", {})
  }

  serverSend(message: unknown) {
    const data = typeof message === "string" ? message : JSON.stringify(message)
    this.emit("message", { data })
  }

  serverError() {
    this.emit("error", {})
  }

  serverClose(code = 1000, reason = "", wasClean = true) {
    this.readyState = MockWebSocket.CLOSED
    this.emit("close", {
      code,
      reason,
      wasClean,
    })
  }

  sentMessages() {
    return this.sent.map((message) => JSON.parse(message) as unknown)
  }

  static latest() {
    const latest = MockWebSocket.instances.at(-1)
    if (!latest) {
      throw new Error("Expected a mock WebSocket instance.")
    }

    return latest
  }

  static reset() {
    MockWebSocket.instances = []
  }

  private emit(type: string, event: Parameters<EventListener>[0]) {
    const listeners = this.listeners.get(type)
    if (!listeners) {
      return
    }

    for (const listener of listeners) {
      listener(event)
    }
  }
}
