import * as React from "react"
import {
  ChevronRight,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  MessageSquareIcon,
  PencilLineIcon,
} from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@workspace/ui/components/sidebar"

export type AppSidebarProjectThread = {
  threadId: string
  title: string
  updatedAt: number
  isLoaded: boolean
}

export type AppSidebarProject = {
  id: string
  name: string
  isSelected: boolean
  threads: AppSidebarProjectThread[]
}

type AppSidebarProps = {
  projects: AppSidebarProject[]
  canStartThread: boolean
  isStartingThread: boolean
  onNewThread: () => void
  onAddProject: (cwd: string) => string | null
  onSelectProject: (projectId: string) => void
  onSelectThread: (projectId: string, threadId: string) => void
}

function formatUpdatedAt(updatedAt: number) {
  if (updatedAt <= 0) {
    return "now"
  }

  const deltaSeconds = Math.max(0, Math.floor(Date.now() / 1000) - updatedAt)

  if (deltaSeconds < 60) {
    return "now"
  }

  if (deltaSeconds < 60 * 60) {
    return `${Math.floor(deltaSeconds / 60)}m`
  }

  if (deltaSeconds < 60 * 60 * 24) {
    return `${Math.floor(deltaSeconds / (60 * 60))}h`
  }

  if (deltaSeconds < 60 * 60 * 24 * 7) {
    return `${Math.floor(deltaSeconds / (60 * 60 * 24))}d`
  }

  return `${Math.floor(deltaSeconds / (60 * 60 * 24 * 7))}w`
}

export function AppSidebar({
  projects,
  canStartThread,
  isStartingThread,
  onNewThread,
  onAddProject,
  onSelectProject,
  onSelectThread,
}: AppSidebarProps) {
  const [isAddingProject, setIsAddingProject] = React.useState(false)
  const [projectPath, setProjectPath] = React.useState("")
  const [projectError, setProjectError] = React.useState<string | null>(null)
  const [openProjects, setOpenProjects] = React.useState<
    Record<string, boolean>
  >(() =>
    Object.fromEntries(
      projects
        .filter((project) => project.isSelected || project.threads.length > 0)
        .map((project) => [project.id, true])
    )
  )

  React.useEffect(() => {
    const selectedProject = projects.find((project) => project.isSelected)
    if (!selectedProject) {
      return
    }

    setOpenProjects((current) =>
      current[selectedProject.id]
        ? current
        : {
            ...current,
            [selectedProject.id]: true,
          }
    )
  }, [projects])

  const handleProjectSubmit = () => {
    const error = onAddProject(projectPath)
    if (error) {
      setProjectError(error)
      return
    }

    setProjectPath("")
    setProjectError(null)
    setIsAddingProject(false)
  }

  return (
    <Sidebar collapsible="offcanvas" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
              <span className="truncate py-1 text-base font-semibold">
                Frame
              </span>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={onNewThread}
              disabled={!canStartThread || isStartingThread}
            >
              <PencilLineIcon />
              <span>{isStartingThread ? "Starting..." : "New Thread"}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          <SidebarGroupAction
            aria-label="Add project"
            title="Add project"
            onClick={() => {
              setIsAddingProject((current) => !current)
              setProjectError(null)
            }}
          >
            <FolderPlusIcon />
          </SidebarGroupAction>
          <SidebarGroupContent>
            {isAddingProject ? (
              <div className="mb-2 space-y-2 px-1">
                <SidebarInput
                  value={projectPath}
                  onChange={(event) => {
                    setProjectPath(event.target.value)
                    setProjectError(null)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      handleProjectSubmit()
                    }
                  }}
                  placeholder="/absolute/path/to/project"
                  aria-label="Project path"
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" type="button" onClick={handleProjectSubmit}>
                    Add
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setIsAddingProject(false)
                      setProjectPath("")
                      setProjectError(null)
                    }}
                  >
                    Cancel
                  </Button>
                </div>
                {projectError ? (
                  <p className="px-1 text-[11px] text-destructive">
                    {projectError}
                  </p>
                ) : null}
              </div>
            ) : null}
            <SidebarMenu>
              {projects.map((project) => {
                const isOpen = openProjects[project.id] ?? false

                return (
                  <Collapsible
                    key={project.id}
                    render={<SidebarMenuItem />}
                    open={isOpen}
                    onOpenChange={(open) => {
                      setOpenProjects((current) => ({
                        ...current,
                        [project.id]: open,
                      }))
                    }}
                    className="group/collapsible"
                  >
                    <CollapsibleTrigger
                      render={
                        <SidebarMenuButton
                          tooltip={project.name}
                          isActive={project.isSelected}
                        />
                      }
                      onClick={() => {
                        onSelectProject(project.id)
                      }}
                    >
                      <FolderIcon className="group-data-[panel-open]/menu-button:hidden" />
                      <FolderOpenIcon className="hidden group-data-[panel-open]/menu-button:block" />
                      <ChevronRight className="transition-transform duration-200 group-data-[panel-open]/menu-button:rotate-90" />
                      <span>{project.name}</span>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      {project.threads.length > 0 ? (
                        <SidebarMenuSub>
                          {project.threads.map((thread) => (
                            <SidebarMenuSubItem key={thread.threadId}>
                              <SidebarMenuSubButton
                                render={<button type="button" />}
                                isActive={thread.isLoaded}
                                onClick={() => {
                                  onSelectThread(project.id, thread.threadId)
                                }}
                              >
                                <MessageSquareIcon />
                                <span className="min-w-0 flex-1 truncate">
                                  {thread.title}
                                </span>
                                <span className="ml-auto shrink-0 text-[11px] text-sidebar-foreground/50">
                                  {formatUpdatedAt(thread.updatedAt)}
                                </span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      ) : null}
                    </CollapsibleContent>
                  </Collapsible>
                )
              })}
            </SidebarMenu>
            {projects.length === 0 && !isAddingProject ? (
              <p className="px-3 py-2 text-xs text-sidebar-foreground/60">
                Add a project to start tracking threads.
              </p>
            ) : null}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
