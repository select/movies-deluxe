export interface GenerateDatabaseRequest {
  embeddingModel?: string
  skipJsonGeneration?: boolean
}

export interface GenerateDatabaseResponse {
  success: boolean
  message: string
}
