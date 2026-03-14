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
    <div className="w-full max-w-4xl mx-auto px-4 pb-6 mt-auto">
      <div className="relative flex w-full flex-col p-3 rounded-3xl bg-card border shadow-sm ring-1 ring-inset ring-border/50 transition-all focus-within:ring-primary/50">
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask Codex anything, @ to add files, / for commands"
          className="min-h-[48px] max-h-[200px] w-full resize-none bg-transparent dark:bg-transparent border-0 px-3 py-3 text-base shadow-none focus-visible:ring-0 md:text-sm"
          rows={1}
        />

        <div className="flex items-center justify-between mt-2 px-1">
          {/* Left tools */}
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus className="h-5 w-5" />
              <span className="sr-only">Attach file</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center justify-center whitespace-nowrap h-8 px-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-md transition-colors data-[state=open]:bg-muted/80 w-auto outline-none focus-visible:ring-1 focus-visible:ring-ring">
                GPT-5.4
                <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-70" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[160px] rounded-xl">
                <DropdownMenuItem className="text-sm rounded-lg cursor-pointer">GPT-5.4</DropdownMenuItem>
                <DropdownMenuItem className="text-sm rounded-lg cursor-pointer">GPT-4.5</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center justify-center whitespace-nowrap h-8 px-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-md transition-colors data-[state=open]:bg-muted/80 outline-none focus-visible:ring-1 focus-visible:ring-ring">
                High
                <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-70" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[120px] rounded-xl">
                <DropdownMenuItem className="text-sm rounded-lg cursor-pointer">Low</DropdownMenuItem>
                <DropdownMenuItem className="text-sm rounded-lg cursor-pointer">Medium</DropdownMenuItem>
                <DropdownMenuItem className="text-sm rounded-lg cursor-pointer">High</DropdownMenuItem>
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
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm" 
                  : "bg-muted text-muted-foreground hover:bg-muted hover:text-muted-foreground opacity-50 cursor-not-allowed"
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
