import { readFileSync } from "node:fs"

import { Ajv, type ErrorObject, type ValidateFunction } from "ajv"
import {
  type CodexClientNotification,
  type CodexClientRequest,
  getCodexSchemaBundlePath,
  type JsonRpcResponse,
} from "@workspace/protocol"

type JsonSchemaBundle = {
  definitions: Record<string, unknown>
}

type BrowserInboundMessage =
  | CodexClientRequest
  | CodexClientNotification
  | JsonRpcResponse

type ValidationResult =
  | { ok: true; value: BrowserInboundMessage }
  | { ok: false; error: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function hasOwn(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function formatErrors(errors: ErrorObject[] | null | undefined) {
  if (!errors || errors.length === 0) {
    return "Schema validation failed."
  }

  return errors
    .map(
      (error) => `${error.instancePath || "/"} ${error.message || "invalid"}`
    )
    .join("; ")
}

function createValidator(
  ajv: Ajv,
  schemaBundle: JsonSchemaBundle,
  definitionName: string
) {
  return ajv.compile({
    $schema: "http://json-schema.org/draft-07/schema#",
    $ref: `#/definitions/${definitionName}`,
    definitions: schemaBundle.definitions,
  })
}

export type BrowserMessageValidator = {
  validate(message: unknown): ValidationResult
}

export function createBrowserMessageValidator(): BrowserMessageValidator {
  const schemaBundle = JSON.parse(
    readFileSync(getCodexSchemaBundlePath(), "utf8")
  ) as JsonSchemaBundle
  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    validateFormats: false,
  })

  const validateClientRequest = createValidator(
    ajv,
    schemaBundle,
    "ClientRequest"
  ) as ValidateFunction<CodexClientRequest>
  const validateClientNotification = createValidator(
    ajv,
    schemaBundle,
    "ClientNotification"
  ) as ValidateFunction<CodexClientNotification>
  const validateJsonRpcResponse = createValidator(
    ajv,
    schemaBundle,
    "JSONRPCResponse"
  ) as ValidateFunction<JsonRpcResponse>
  const validateJsonRpcError = createValidator(
    ajv,
    schemaBundle,
    "JSONRPCError"
  ) as ValidateFunction<JsonRpcResponse>

  return {
    validate(message) {
      if (!isRecord(message)) {
        return {
          ok: false,
          error: "Browser message must be a JSON object.",
        }
      }

      if (hasOwn(message, "method")) {
        if (hasOwn(message, "id")) {
          if (validateClientRequest(message)) {
            return { ok: true, value: message as CodexClientRequest }
          }

          return {
            ok: false,
            error: formatErrors(validateClientRequest.errors),
          }
        }

        if (validateClientNotification(message)) {
          return { ok: true, value: message as CodexClientNotification }
        }

        return {
          ok: false,
          error: formatErrors(validateClientNotification.errors),
        }
      }

      if (
        hasOwn(message, "id") &&
        (hasOwn(message, "result") || hasOwn(message, "error"))
      ) {
        if (validateJsonRpcResponse(message) || validateJsonRpcError(message)) {
          return { ok: true, value: message as JsonRpcResponse }
        }

        return {
          ok: false,
          error:
            formatErrors(validateJsonRpcResponse.errors) ||
            formatErrors(validateJsonRpcError.errors),
        }
      }

      return {
        ok: false,
        error: "Unsupported JSON-RPC message shape from browser.",
      }
    },
  }
}
