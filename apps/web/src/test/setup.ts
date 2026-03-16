import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach, beforeAll, beforeEach, vi } from "vitest"

import { MockWebSocket } from "@/test/mock-websocket"

beforeAll(() => {
  vi.stubGlobal("WebSocket", MockWebSocket)

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      media: "",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })

  class ResizeObserverMock {
    observe() {}

    unobserve() {}

    disconnect() {}
  }

  vi.stubGlobal("ResizeObserver", ResizeObserverMock)
})

beforeEach(() => {
  MockWebSocket.reset()
})

afterEach(() => {
  cleanup()
})
