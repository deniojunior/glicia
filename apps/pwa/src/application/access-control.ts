export type AccessRequestStatus = "pending" | "approved" | "rejected";
export type AccessEntryState = "new" | "pending" | "approved" | "rejected" | "revoked";
export type LoginDelivery = "code" | "magic_link";

export type AccessRequestSummary = {
  id: string;
  email: string;
  status: AccessRequestStatus;
  requestCount: number;
  requestedAt: string;
  lastRequestedAt: string;
  reviewedAt: string | null;
  userId: string | null;
};

export interface AccessService {
  checkAccess(email: string): Promise<AccessEntryState>;
  requestAccess(email: string): Promise<void>;
  sendLoginCode(email: string, redirectTo?: string): Promise<LoginDelivery>;
  verifyLoginCode(email: string, token: string): Promise<void>;
  hasApprovedAccess(userId: string): Promise<boolean>;
  listAccessRequests(): Promise<readonly AccessRequestSummary[]>;
  reviewAccessRequest(requestId: string, decision: Exclude<AccessRequestStatus, "pending">): Promise<void>;
}

export class AccessServiceError extends Error {
  constructor(readonly code: "check_failed" | "not_approved" | "request_failed" | "login_failed" | "invalid_code" | "admin_failed") {
    super(code);
  }
}
