export type InvitationDeliveryError =
  | "EMAIL_PROVIDER_NOT_CONFIGURED"
  | "EMAIL_PROVIDER_UNAUTHORIZED"
  | "EMAIL_PROVIDER_FORBIDDEN"
  | "EMAIL_PROVIDER_RATE_LIMITED"
  | "EMAIL_PROVIDER_UNAVAILABLE"
  | "EMAIL_PROVIDER_REJECTED"
  | "EMAIL_PROVIDER_REQUEST_FAILED"

export function classifyEmailProviderFailureStatus(status: number): InvitationDeliveryError {
  if (status === 401) return "EMAIL_PROVIDER_UNAUTHORIZED"
  if (status === 403) return "EMAIL_PROVIDER_FORBIDDEN"
  if (status === 429) return "EMAIL_PROVIDER_RATE_LIMITED"
  if (status >= 500) return "EMAIL_PROVIDER_UNAVAILABLE"
  return "EMAIL_PROVIDER_REJECTED"
}
