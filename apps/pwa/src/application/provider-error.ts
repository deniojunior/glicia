export type ProviderErrorCode =
  | "authentication"
  | "rate_limit"
  | "model_unavailable"
  | "network"
  | "invalid_response"
  | "unknown";

export class ProviderError extends Error {
  public constructor(
    public readonly code: ProviderErrorCode,
    message: string,
    public readonly retryable: boolean
  ) {
    super(message);
  }
}
