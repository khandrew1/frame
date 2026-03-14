import {
  FolderIcon,
  FolderPlusIcon,
  MessageSquareIcon,
  PencilLineIcon,
} from "lucide-react"

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
  SidebarRail,
  SidebarSeparator,
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
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip="New Thread"
              className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
            >
              <PencilLineIcon />
              <span>New Thread</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Threads</SidebarGroupLabel>
          <SidebarGroupAction aria-label="Add folder" title="Add folder">
            <FolderPlusIcon />
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu>
              {threadFolders.map((folder) => (
                <SidebarMenuItem key={folder.id}>
                  <SidebarMenuButton tooltip={folder.name}>
                    <FolderIcon />
                    <span>{folder.name}</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge>{folder.threads.length}</SidebarMenuBadge>
                  {folder.threads.length > 0 ? (
                    <SidebarMenuSub>
                      {folder.threads.map((thread) => (
                        <SidebarMenuSubItem key={thread.id}>
                          <SidebarMenuSubButton href="#" isActive={thread.isActive}>
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
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
