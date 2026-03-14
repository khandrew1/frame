import { AppSidebar } from "@/components/app-sidebar"
import { ChatComposer } from "@/components/chat-composer"
import { Separator } from "@workspace/ui/components/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@workspace/ui/components/sidebar"

export function App() {
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
              Sidebar scaffold preview with static folder and thread data.
            </p>
          </div>
        </header>
        <main className="flex flex-1 flex-col p-4 md:p-6 relative overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            {/* Chat conversation messages will go here */}
          </div>
          <ChatComposer />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
