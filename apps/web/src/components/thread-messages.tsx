import type { ThreadMessage } from "@/hooks/use-thread"

type ThreadMessagesProps = {
  messages: ThreadMessage[]
  status: string
  threadId: string | null
}

function getEmptyStateCopy(status: string, threadId: string | null) {
  if (status === "connecting") {
    return "Connecting to server..."
  }

  if (status === "ready" && !threadId) {
    return "Start a thread to begin sending messages."
  }

  if (status === "starting-thread") {
    return "Starting thread..."
  }

  if (status === "failed") {
    return "The connection failed. Refresh the page after fixing server."
  }

  return "Messages will appear here once the thread is active."
}

export function ThreadMessages({
  messages,
  status,
  threadId,
}: ThreadMessagesProps) {
  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-3xl border border-dashed bg-muted/20 p-8 text-center">
        <div className="max-w-md space-y-2">
          <p className="text-sm font-medium text-foreground">
            {getEmptyStateCopy(status, threadId)}
          </p>
          <p className="text-xs text-muted-foreground">
            Thread messages stream directly over the `server` WebSocket bridge.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      {messages.map((message) => (
        <div
          key={message.id}
          className={
            message.role === "user"
              ? "ml-auto max-w-[85%] rounded-3xl bg-primary px-4 py-3 text-sm text-primary-foreground"
              : "mr-auto max-w-[85%] rounded-3xl border bg-card px-4 py-3 text-sm"
          }
        >
          <div className="mb-1 flex items-center gap-2 text-[11px] tracking-[0.16em] uppercase opacity-70">
            <span>{message.role === "user" ? "You" : "Assistant"}</span>
            <span>{message.status}</span>
          </div>
          <p className="whitespace-pre-wrap">{message.text || " "}</p>
        </div>
      ))}
    </div>
  )
}
