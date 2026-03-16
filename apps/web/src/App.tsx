import { AppSidebar } from "@/components/app-sidebar"
import { ChatComposer } from "@/components/chat-composer"
import { ThreadMessages } from "@/components/thread-messages"
import { useThread } from "@/hooks/use-thread"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@workspace/ui/components/sidebar"

function getStatusLabel(status: ReturnType<typeof useThread>["status"]) {
  switch (status) {
    case "idle":
      return "Idle"
    case "connecting":
      return "Connecting"
    case "ready":
      return "Connected"
    case "starting-thread":
      return "Starting thread"
    case "thread-ready":
      return "Thread ready"
    case "sending":
      return "Sending"
    case "streaming":
      return "Streaming"
    case "failed":
      return "Failed"
  }
}

export function App() {
  const {
    status,
    thread,
    models,
    selectedModelId,
    selectedModelDisplayName,
    selectedEffort,
    selectedEffortLabel,
    availableEfforts,
    messages,
    lastError,
    isTurnPending,
    setSelectedModel,
    setSelectedEffort,
    startThread,
    sendMessage,
  } = useThread()

  return (
    <SidebarProvider defaultOpen>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 items-center gap-3 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <div className="min-w-0">
            <p className="text-sm font-medium">Thread workspace</p>
            <p className="text-xs text-muted-foreground">
              Live `server-v2` thread test harness for `/tmp/frame-web-test`.
            </p>
          </div>
        </header>
        <main className="relative flex flex-1 flex-col overflow-hidden p-4 md:p-6">
          <div className="mx-auto mb-4 flex w-full max-w-4xl flex-col gap-3 rounded-3xl border bg-card/60 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  {getStatusLabel(status)}
                </p>
                <p className="text-sm text-foreground">
                  {thread
                    ? `Thread ${thread.id} is active.`
                    : "No thread started yet."}
                </p>
                <p className="text-xs text-muted-foreground">
                  {thread ? `cwd: ${thread.cwd}` : "Connect, then start a thread manually."}
                </p>
              </div>
              <Button
                type="button"
                size="lg"
                onClick={() => {
                  void startThread()
                }}
                disabled={status !== "ready"}
              >
                {thread ? "Thread Started" : "Start Thread"}
              </Button>
            </div>
            {lastError ? (
              <p className="rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {lastError}
              </p>
            ) : null}
          </div>
          <div className="flex-1 overflow-y-auto pb-4">
            <ThreadMessages
              messages={messages}
              status={status}
              threadId={thread?.id ?? null}
            />
          </div>
          <ChatComposer
            disabled={status !== "thread-ready" || isTurnPending}
            models={models}
            selectedModelId={selectedModelId}
            selectedModelLabel={selectedModelDisplayName}
            onSelectModel={setSelectedModel}
            availableEfforts={availableEfforts}
            selectedEffort={selectedEffort}
            selectedEffortLabel={selectedEffortLabel}
            onSelectEffort={setSelectedEffort}
            onSubmit={sendMessage}
          />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
