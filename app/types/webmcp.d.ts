export interface ModelContextToolContent {
  type: 'text'
  text: string
}

export interface ModelContextToolResult {
  content: ModelContextToolContent[]
  isError?: boolean
}

export interface ModelContextToolAnnotations {
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
}

export interface ModelContextTool<TInput = Record<string, unknown>> {
  name: string
  description: string
  inputSchema?: Record<string, unknown>
  annotations?: ModelContextToolAnnotations
  execute: (
    input: TInput,
    client?: unknown
  ) => Promise<ModelContextToolResult> | ModelContextToolResult
}

export interface ModelContext {
  registerTool: <TInput = Record<string, unknown>>(tool: ModelContextTool<TInput>) => void
  unregisterTool?: (name: string) => void
  provideContext?: (options: { tools: ModelContextTool[] }) => void
  clearContext?: () => void
}

declare global {
  interface Navigator {
    modelContext?: ModelContext
  }

  interface Document {
    modelContext?: ModelContext
  }
}

export {}
