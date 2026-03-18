import * as React from "react"

import { AppSidebar, type AppSidebarProject } from "@/components/app-sidebar"
import { ChatComposer } from "@/components/chat-composer"
import { ThreadMessages } from "@/components/thread-messages"
import { useProjectCatalog } from "@/hooks/use-project-catalog"
import { useThread } from "@/hooks/use-thread"
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
    case "ready":
      return "Ready"
    case "starting-thread":
      return "Starting thread"
    case "resuming-thread":
      return "Opening thread"
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

function EmptyPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-3xl border border-dashed bg-muted/20 p-8 text-center">
      <div className="max-w-md space-y-2">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{body}</p>
      </div>
    </div>
  )
}

export function App() {
  const {
    projects,
    threads,
    selectedProjectId,
    selectedProject,
    loadedThreadId,
    addProject,
    selectProject,
    clearLoadedThread: clearCatalogLoadedThread,
    recordStartedThread,
    recordResumedThread,
    updateThreadTitle,
  } = useProjectCatalog()
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
    resumeThread,
    clearLoadedThread,
    sendMessage,
  } = useThread({
    onThreadNameUpdated: updateThreadTitle,
  })

  const sidebarProjects = React.useMemo<AppSidebarProject[]>(() => {
    const threadsByProject = new Map<string, typeof threads>()

    for (const catalogThread of threads) {
      const existingThreads =
        threadsByProject.get(catalogThread.projectId) ?? []
      existingThreads.push(catalogThread)
      threadsByProject.set(catalogThread.projectId, existingThreads)
    }

    return projects.map((project) => ({
      id: project.id,
      name: project.name,
      isSelected: project.id === selectedProjectId,
      threads: [...(threadsByProject.get(project.id) ?? [])]
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .map((catalogThread) => ({
          threadId: catalogThread.threadId,
          title: catalogThread.title,
          updatedAt: catalogThread.updatedAt,
          isLoaded: catalogThread.threadId === loadedThreadId,
        })),
    }))
  }, [loadedThreadId, projects, selectedProjectId, threads])

  const handleAddProject = React.useCallback(
    (cwd: string) => {
      const result = addProject(cwd)
      if (!result.ok) {
        return result.error
      }

      clearLoadedThread()
      return null
    },
    [addProject, clearLoadedThread]
  )

  const handleSelectProject = React.useCallback(
    (projectId: string) => {
      selectProject(projectId)
      clearCatalogLoadedThread()
      clearLoadedThread()
    },
    [clearCatalogLoadedThread, clearLoadedThread, selectProject]
  )

  const handleSelectThread = React.useCallback(
    async (projectId: string, threadId: string) => {
      selectProject(projectId)
      clearCatalogLoadedThread()

      const resumedThread = await resumeThread({ threadId })
      if (!resumedThread) {
        return
      }

      recordResumedThread(projectId, resumedThread)
    },
    [clearCatalogLoadedThread, recordResumedThread, resumeThread, selectProject]
  )

  const handleNewThread = React.useCallback(async () => {
    if (!selectedProject) {
      return
    }

    const nextThread = await startThread({ cwd: selectedProject.cwd })
    if (!nextThread) {
      return
    }

    recordStartedThread(selectedProject.id, nextThread)
  }, [recordStartedThread, selectedProject, startThread])

  const canStartThread =
    selectedProject !== null &&
    status !== "starting-thread" &&
    status !== "resuming-thread" &&
    !isTurnPending

  const shouldShowThreadMessages =
    thread !== null ||
    status === "starting-thread" ||
    status === "resuming-thread"

  return (
    <SidebarProvider defaultOpen>
      <AppSidebar
        projects={sidebarProjects}
        canStartThread={canStartThread}
        isStartingThread={status === "starting-thread"}
        onNewThread={() => {
          void handleNewThread()
        }}
        onAddProject={handleAddProject}
        onSelectProject={handleSelectProject}
        onSelectThread={(projectId, threadId) => {
          void handleSelectThread(projectId, threadId)
        }}
      />
      <SidebarInset>
        <header className="flex h-14 items-center gap-3 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {selectedProject ? selectedProject.name : "Project workspace"}
            </p>
            <p className="text-xs text-muted-foreground">
              {selectedProject
                ? selectedProject.cwd
                : "Select a project to open or create threads."}
            </p>
          </div>
        </header>
        <main className="relative flex flex-1 flex-col overflow-hidden p-4 md:p-6">
          <div className="mx-auto mb-4 flex w-full max-w-4xl flex-col gap-3 rounded-3xl border bg-card/60 p-4">
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
                {getStatusLabel(status)}
              </p>
              <p className="text-sm text-foreground">
                {thread
                  ? `Thread ${thread.id} is active.`
                  : selectedProject
                    ? `Start coding in ${selectedProject.name}.`
                    : "No project selected yet."}
              </p>
              <p className="text-xs text-muted-foreground">
                {thread
                  ? `cwd: ${thread.cwd}`
                  : selectedProject
                    ? "Choose New Thread in the sidebar or open an existing thread."
                    : "Add a project from the sidebar to begin."}
              </p>
            </div>
            {lastError ? (
              <p className="rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {lastError}
              </p>
            ) : null}
          </div>
          <div className="flex-1 overflow-y-auto pb-4">
            {!selectedProject ? (
              <EmptyPanel
                title="Select a project"
                body="Add a project from the folder-plus button, then start a new thread or open one from the sidebar."
              />
            ) : shouldShowThreadMessages ? (
              <ThreadMessages
                messages={messages}
                status={status}
                threadId={thread?.id ?? null}
              />
            ) : (
              <EmptyPanel
                title={`Start coding in ${selectedProject.name}`}
                body="Use New Thread in the sidebar to create a fresh thread for this project, or open a saved thread from the project list."
              />
            )}
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
