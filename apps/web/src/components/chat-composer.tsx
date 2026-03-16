import * as React from "react"
import { ArrowUp, ChevronDown, Plus } from "lucide-react"
import type { ReasoningEffort } from "@workspace/protocol/generated/codex/ReasoningEffort"
import type { Model } from "@workspace/protocol/generated/codex/v2/Model"
import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { cn } from "@workspace/ui/lib/utils"

type ChatComposerProps = {
  disabled?: boolean
  onSubmit: (text: string) => Promise<boolean> | boolean
  models: Model[]
  selectedModelId: string
  selectedModelLabel: string
  onSelectModel: (modelId: string) => void
  availableEfforts: ReasoningEffort[]
  selectedEffort: ReasoningEffort
  selectedEffortLabel: string
  onSelectEffort: (effort: ReasoningEffort) => void
}

export function ChatComposer({
  disabled = false,
  onSubmit,
  models,
  selectedModelId,
  selectedModelLabel,
  onSelectModel,
  availableEfforts,
  selectedEffort,
  selectedEffortLabel,
  onSelectEffort,
}: ChatComposerProps) {
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

  const handleSubmit = async () => {
    if (disabled || text.trim().length === 0) return

    const didSend = await onSubmit(text)
    if (!didSend) {
      return
    }

    setText("")
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void handleSubmit()
    }
  }

  const modelOptions =
    models.length > 0
      ? models
      : [
          {
            id: selectedModelId,
            displayName: selectedModelLabel,
          } as Pick<Model, "id" | "displayName">,
        ]

  return (
    <div className="mx-auto mt-auto w-full max-w-4xl px-4 pb-6">
      <div className="relative flex w-full flex-col rounded-3xl border bg-card p-3 shadow-sm ring-1 ring-border/50 transition-all ring-inset focus-within:ring-primary/50">
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={disabled}
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
              <DropdownMenuTrigger
                aria-label="Model selector"
                className="inline-flex h-8 w-auto items-center justify-center rounded-md px-2 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:bg-muted/80 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:bg-muted/80"
              >
                {selectedModelLabel}
                <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-70" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-[220px] rounded-xl"
              >
                {modelOptions.map((model) => (
                  <DropdownMenuItem
                    key={model.id}
                    className="cursor-pointer rounded-lg text-sm"
                    onClick={() => {
                      onSelectModel(model.id)
                    }}
                  >
                    <span className={cn(model.id === selectedModelId && "font-semibold")}>
                      {model.displayName}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Thinking level selector"
                className="inline-flex h-8 items-center justify-center rounded-md px-2 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:bg-muted/80 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:bg-muted/80"
              >
                {selectedEffortLabel}
                <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-70" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="min-w-[120px] rounded-xl"
              >
                {availableEfforts.map((effort) => (
                  <DropdownMenuItem
                    key={effort}
                    className="cursor-pointer rounded-lg text-sm"
                    onClick={() => {
                      onSelectEffort(effort)
                    }}
                  >
                    <span className={cn(effort === selectedEffort && "font-semibold")}>
                      {effort === "xhigh"
                        ? "X-High"
                        : effort.charAt(0).toUpperCase() + effort.slice(1)}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Right tool: Submit */}
          <div className="flex items-center">
            <Button
              size="icon"
              type="button"
              onClick={() => {
                void handleSubmit()
              }}
              className={cn(
                "h-8 w-8 rounded-full transition-all duration-200",
                text.trim().length > 0 && !disabled
                  ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                  : "cursor-not-allowed bg-muted text-muted-foreground opacity-50 hover:bg-muted hover:text-muted-foreground"
              )}
              disabled={text.trim().length === 0 || disabled}
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
