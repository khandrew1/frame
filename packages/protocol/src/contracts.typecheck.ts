import type { CodexBrowserRequest, CodexServerRequest } from "./index.js"

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false

type NotNever<T> = [T] extends [never] ? false : true
type Expect<T extends true> = T

export type ProtocolContractChecks = [
  Expect<NotNever<Extract<CodexBrowserRequest, { method: "thread/start" }>>>,
  Expect<NotNever<Extract<CodexBrowserRequest, { method: "turn/start" }>>>,
  Expect<Equal<Extract<CodexBrowserRequest, { method: "initialize" }>, never>>,
  Expect<
    Equal<Extract<CodexBrowserRequest, { method: "newConversation" }>, never>
  >,
  Expect<
    Equal<
      Extract<CodexBrowserRequest, { method: "collaborationMode/list" }>,
      never
    >
  >,
  Expect<
    NotNever<
      Extract<CodexServerRequest, { method: "item/tool/requestUserInput" }>
    >
  >,
  Expect<
    Equal<Extract<CodexServerRequest, { method: "applyPatchApproval" }>, never>
  >,
]
