import * as React from "react"

import type { Thread } from "@workspace/protocol/generated/codex/v2/Thread"

export type ProjectCatalogProject = {
  id: string
  name: string
  cwd: string
  createdAt: number
}

export type ProjectCatalogThread = {
  threadId: string
  projectId: string
  title: string
  preview: string
  createdAt: number
  updatedAt: number
}

type ProjectCatalogState = {
  projects: ProjectCatalogProject[]
  threads: ProjectCatalogThread[]
  selectedProjectId: string | null
  loadedThreadId: string | null
}

type AddProjectResult =
  | { ok: true; project: ProjectCatalogProject }
  | { ok: false; error: string }

const STORAGE_KEY = "frame.project-catalog.v1"

const emptyCatalogState: ProjectCatalogState = {
  projects: [],
  threads: [],
  selectedProjectId: null,
  loadedThreadId: null,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isAbsoluteProjectPath(path: string) {
  return /^([A-Za-z]:[\\/]|\/)/.test(path)
}

function normalizeProjectPath(path: string) {
  const trimmed = path.trim()

  if (trimmed === "/") {
    return trimmed
  }

  return trimmed.replace(/[\\/]+$/, "")
}

function deriveProjectId(cwd: string) {
  return `project:${cwd}`
}

function deriveProjectName(cwd: string) {
  const segments = cwd.split(/[\\/]/).filter(Boolean)
  return segments.at(-1) ?? cwd
}

function deriveThreadTitle(preview: string) {
  const trimmedPreview = preview.trim()
  return trimmedPreview.length > 0 ? trimmedPreview : "New thread"
}

function readCatalogState(): ProjectCatalogState {
  if (typeof window === "undefined") {
    return emptyCatalogState
  }

  const rawValue = window.localStorage.getItem(STORAGE_KEY)
  if (!rawValue) {
    return emptyCatalogState
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown
    if (!isRecord(parsed)) {
      return emptyCatalogState
    }

    const projects = Array.isArray(parsed.projects)
      ? parsed.projects.filter(
          (project): project is ProjectCatalogProject =>
            isRecord(project) &&
            typeof project.id === "string" &&
            typeof project.name === "string" &&
            typeof project.cwd === "string" &&
            typeof project.createdAt === "number"
        )
      : []
    const threads = Array.isArray(parsed.threads)
      ? parsed.threads.filter(
          (thread): thread is ProjectCatalogThread =>
            isRecord(thread) &&
            typeof thread.threadId === "string" &&
            typeof thread.projectId === "string" &&
            typeof thread.title === "string" &&
            typeof thread.preview === "string" &&
            typeof thread.createdAt === "number" &&
            typeof thread.updatedAt === "number"
        )
      : []

    return {
      projects,
      threads,
      selectedProjectId:
        typeof parsed.selectedProjectId === "string"
          ? parsed.selectedProjectId
          : null,
      loadedThreadId:
        typeof parsed.loadedThreadId === "string"
          ? parsed.loadedThreadId
          : null,
    }
  } catch {
    return emptyCatalogState
  }
}

function writeCatalogState(state: ProjectCatalogState) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function upsertThread(
  threads: ProjectCatalogThread[],
  nextThread: ProjectCatalogThread
) {
  const existingIndex = threads.findIndex(
    (thread) => thread.threadId === nextThread.threadId
  )

  if (existingIndex === -1) {
    return [...threads, nextThread]
  }

  return threads.map((thread, index) =>
    index === existingIndex ? nextThread : thread
  )
}

export function useProjectCatalog() {
  const [catalog, setCatalog] = React.useState<ProjectCatalogState>(() =>
    readCatalogState()
  )

  const updateCatalog = React.useCallback(
    (updater: (current: ProjectCatalogState) => ProjectCatalogState) => {
      setCatalog((current) => {
        const next = updater(current)
        writeCatalogState(next)
        return next
      })
    },
    []
  )

  const addProject = React.useCallback(
    (cwd: string): AddProjectResult => {
      const normalizedCwd = normalizeProjectPath(cwd)

      if (!normalizedCwd) {
        return {
          ok: false,
          error: "Enter a project path.",
        }
      }

      if (!isAbsoluteProjectPath(normalizedCwd)) {
        return {
          ok: false,
          error: "Enter an absolute project path.",
        }
      }

      const projectId = deriveProjectId(normalizedCwd)
      let resultProject: ProjectCatalogProject | null = null

      updateCatalog((current) => {
        const existingProject = current.projects.find(
          (project) => project.id === projectId
        )

        if (existingProject) {
          resultProject = existingProject
          return {
            ...current,
            selectedProjectId: existingProject.id,
            loadedThreadId: null,
          }
        }

        const nextProject: ProjectCatalogProject = {
          id: projectId,
          name: deriveProjectName(normalizedCwd),
          cwd: normalizedCwd,
          createdAt: Date.now(),
        }
        resultProject = nextProject

        return {
          ...current,
          projects: [...current.projects, nextProject],
          selectedProjectId: nextProject.id,
          loadedThreadId: null,
        }
      })

      return {
        ok: true,
        project: resultProject!,
      }
    },
    [updateCatalog]
  )

  const selectProject = React.useCallback(
    (projectId: string) => {
      updateCatalog((current) => ({
        ...current,
        selectedProjectId: projectId,
        loadedThreadId: null,
      }))
    },
    [updateCatalog]
  )

  const clearLoadedThread = React.useCallback(() => {
    updateCatalog((current) => ({
      ...current,
      loadedThreadId: null,
    }))
  }, [updateCatalog])

  const recordStartedThread = React.useCallback(
    (projectId: string, thread: Thread) => {
      updateCatalog((current) => {
        const existingThread = current.threads.find(
          (entry) => entry.threadId === thread.id
        )
        const nextThread: ProjectCatalogThread = {
          threadId: thread.id,
          projectId,
          title:
            existingThread?.title && existingThread.title !== "New thread"
              ? existingThread.title
              : deriveThreadTitle(thread.preview),
          preview: thread.preview,
          createdAt: thread.createdAt,
          updatedAt: thread.updatedAt,
        }

        return {
          ...current,
          selectedProjectId: projectId,
          loadedThreadId: thread.id,
          threads: upsertThread(current.threads, nextThread),
        }
      })
    },
    [updateCatalog]
  )

  const recordResumedThread = React.useCallback(
    (projectId: string, thread: Thread) => {
      updateCatalog((current) => {
        const existingThread = current.threads.find(
          (entry) => entry.threadId === thread.id
        )
        const nextThread: ProjectCatalogThread = {
          threadId: thread.id,
          projectId,
          title:
            existingThread?.title && existingThread.title !== "New thread"
              ? existingThread.title
              : deriveThreadTitle(thread.preview),
          preview: thread.preview,
          createdAt: thread.createdAt,
          updatedAt: thread.updatedAt,
        }

        return {
          ...current,
          selectedProjectId: projectId,
          loadedThreadId: thread.id,
          threads: upsertThread(current.threads, nextThread),
        }
      })
    },
    [updateCatalog]
  )

  const updateThreadTitle = React.useCallback(
    (threadId: string, title: string) => {
      const trimmedTitle = title.trim()
      if (!trimmedTitle) {
        return
      }

      updateCatalog((current) => ({
        ...current,
        threads: current.threads.map((thread) =>
          thread.threadId === threadId
            ? {
                ...thread,
                title: trimmedTitle,
              }
            : thread
        ),
      }))
    },
    [updateCatalog]
  )

  const selectedProject = React.useMemo(
    () =>
      catalog.projects.find(
        (project) => project.id === catalog.selectedProjectId
      ) ?? null,
    [catalog.projects, catalog.selectedProjectId]
  )

  return {
    projects: catalog.projects,
    threads: catalog.threads,
    selectedProjectId: catalog.selectedProjectId,
    selectedProject,
    loadedThreadId: catalog.loadedThreadId,
    addProject,
    selectProject,
    clearLoadedThread,
    recordStartedThread,
    recordResumedThread,
    updateThreadTitle,
  }
}
