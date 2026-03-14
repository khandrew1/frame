import {
  ChevronRight,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  MessageSquareIcon,
  PencilLineIcon,
} from "lucide-react"

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
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@workspace/ui/components/sidebar"

type Thread = {
  id: string
  title: string
  updatedAt: string
  isActive?: boolean
}

type ThreadFolder = {
  id: string
  name: string
  threads: Thread[]
}

const threadFolders: ThreadFolder[] = [
  {
    id: "frame",
    name: "frame",
    threads: [
      {
        id: "set-tsconfig",
        title: "Set tsconfig root aliases for desktop shell",
        updatedAt: "4m",
        isActive: true,
      },
      {
        id: "scaffold-sidebar",
        title: "Set up Frame sidebar scaffold",
        updatedAt: "12h",
      },
      {
        id: "fix-tailwind",
        title: "Fix Tailwind module resolution mismatch",
        updatedAt: "13h",
      },
    ],
  },
  {
    id: "portfolio-v2",
    name: "portfolio-v2",
    threads: [
      {
        id: "landing-page",
        title: "Refresh landing page hierarchy",
        updatedAt: "1d",
      },
    ],
  },
  {
    id: "mcp-app-testbench",
    name: "mcp-app-testbench",
    threads: [],
  },
  {
    id: "github-mcp-app",
    name: "github-mcp-app",
    threads: [],
  },
  {
    id: "inspector",
    name: "inspector",
    threads: [
      {
        id: "audit",
        title: "Review accessibility focus order",
        updatedAt: "1w",
      },
      {
        id: "rpc",
        title: "Fix invalid RPC params edge case",
        updatedAt: "3w",
      },
      {
        id: "window-open",
        title: "Add window.open guardrails",
        updatedAt: "1mo",
      },
    ],
  },
  {
    id: "mcp-app-builder",
    name: "mcp-app-builder",
    threads: [],
  },
]

export function AppSidebar() {
  return (
    <Sidebar collapsible="offcanvas" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
              <span className="truncate font-semibold text-base py-1">Frame</span>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="New Thread">
              <PencilLineIcon />
              <span>New Thread</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Threads</SidebarGroupLabel>
          <SidebarGroupAction aria-label="Add folder" title="Add folder">
            <FolderPlusIcon />
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu>
              {threadFolders.map((folder) => (
                <Collapsible
                  key={folder.id}
                  render={<SidebarMenuItem />}
                  defaultOpen={folder.threads.some((t) => t.isActive)}
                  className="group/collapsible"
                >
                    <CollapsibleTrigger render={<SidebarMenuButton tooltip={folder.name} />}>
                        <FolderIcon className="group-data-[panel-open]/menu-button:hidden group-hover/menu-button:!hidden" />
                        <FolderOpenIcon className="hidden group-data-[panel-open]/menu-button:block group-hover/menu-button:!hidden" />
                        <ChevronRight className="hidden group-hover/menu-button:!block transition-transform duration-200 group-data-[panel-open]/menu-button:rotate-90" />
                        <span>{folder.name}</span>
                    </CollapsibleTrigger>
                    <SidebarMenuBadge>{folder.threads.length}</SidebarMenuBadge>
                    <CollapsibleContent>
                      {folder.threads.length > 0 ? (
                        <SidebarMenuSub>
                          {folder.threads.map((thread) => (
                            <SidebarMenuSubItem key={thread.id}>
                              <SidebarMenuSubButton
                                href="#"
                                isActive={thread.isActive}
                              >
                                <MessageSquareIcon />
                                <span className="min-w-0 flex-1 truncate">
                                  {thread.title}
                                </span>
                                <span className="ml-auto shrink-0 text-[11px] text-sidebar-foreground/50">
                                  {thread.updatedAt}
                                </span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      ) : null}
                    </CollapsibleContent>
                </Collapsible>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
