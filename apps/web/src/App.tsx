import { AppSidebar } from "@/components/app-sidebar"
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
        <main className="flex flex-1 flex-col gap-4 p-4 md:p-6">
          <section className="rounded-xl border bg-card p-6">
            <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
              Selected thread
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">
              Set tsconfig root aliases for desktop shell
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              This area is intentionally simple for now. It gives you enough
              context to review the sidebar spacing, collapse behavior, nested
              thread rows, and how the layout sits against your existing shadcn
              theme.
            </p>
          </section>
          <section className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
            <div className="rounded-xl border bg-card p-6">
              <p className="text-sm font-medium">Stub conversation canvas</p>
              <div className="mt-4 space-y-3">
                <div className="rounded-lg bg-muted/50 p-3 text-sm">
                  Add a sidebar that lets me organize threads into folders.
                </div>
                <div className="rounded-lg border p-3 text-sm">
                  UI scaffold only for now. We can wire up persistence and
                  actions later.
                </div>
              </div>
            </div>
            <div className="rounded-xl border bg-card p-6">
              <p className="text-sm font-medium">Scaffold notes</p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li>Uses the default shadcn sidebar component.</li>
                <li>Folders and threads are static test data.</li>
                <li>Collapse, trigger, and mobile sheet are enabled.</li>
              </ul>
            </div>
          </section>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
