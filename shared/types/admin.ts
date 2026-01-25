export interface GenerateDatabaseRequest {
  skipJsonGeneration?: boolean
}

export interface GenerateDatabaseResponse {
  success: boolean
  message: string
}
