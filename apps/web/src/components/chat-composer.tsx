import * as React from "react"
import { ArrowUp, ChevronDown, Plus } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { cn } from "@workspace/ui/lib/utils"

export function ChatComposer() {
  const [text, setText] = React.useState("")
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }

  const handleSubmit = () => {
    if (text.trim().length === 0) return
    // TODO: implement actual submit logic
    setText("")
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="mx-auto mt-auto w-full max-w-4xl px-4 pb-6">
      <div className="relative flex w-full flex-col rounded-3xl border bg-card p-3 shadow-sm ring-1 ring-border/50 transition-all ring-inset focus-within:ring-primary/50">
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask Codex anything, @ to add files, / for commands"
          className="max-h-[200px] min-h-[48px] w-full resize-none border-0 bg-transparent px-3 py-3 text-base shadow-none focus-visible:ring-0 md:text-sm dark:bg-transparent"
          rows={1}
        />

        <div className="mt-2 flex items-center justify-between px-1">
          {/* Left tools */}
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
            >
              <Plus className="h-5 w-5" />
              <span className="sr-only">Attach file</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex h-8 w-auto items-center justify-center rounded-md px-2 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:bg-muted/80 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:bg-muted/80">
                GPT-5.4
                <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-70" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-[160px] rounded-xl"
              >
                <DropdownMenuItem className="cursor-pointer rounded-lg text-sm">
                  GPT-5.4
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer rounded-lg text-sm">
                  GPT-4.5
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex h-8 items-center justify-center rounded-md px-2 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:bg-muted/80 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:bg-muted/80">
                High
                <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-70" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="min-w-[120px] rounded-xl"
              >
                <DropdownMenuItem className="cursor-pointer rounded-lg text-sm">
                  Low
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer rounded-lg text-sm">
                  Medium
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer rounded-lg text-sm">
                  High
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Right tool: Submit */}
          <div className="flex items-center">
            <Button
              size="icon"
              onClick={handleSubmit}
              className={cn(
                "h-8 w-8 rounded-full transition-all duration-200",
                text.trim().length > 0
                  ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                  : "cursor-not-allowed bg-muted text-muted-foreground opacity-50 hover:bg-muted hover:text-muted-foreground"
              )}
              disabled={text.trim().length === 0}
            >
              <ArrowUp className="h-4 w-4" />
              <span className="sr-only">Send message</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
