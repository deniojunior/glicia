export type AccessRequestStatus = "pending" | "approved" | "rejected";

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
  requestAccess(email: string): Promise<void>;
  sendLoginLink(email: string, redirectTo: string): Promise<void>;
  hasApprovedAccess(userId: string): Promise<boolean>;
  listAccessRequests(): Promise<readonly AccessRequestSummary[]>;
  reviewAccessRequest(requestId: string, decision: Exclude<AccessRequestStatus, "pending">): Promise<void>;
}

export class AccessServiceError extends Error {
  constructor(readonly code: "not_approved" | "request_failed" | "login_failed" | "admin_failed") {
    super(code);
  }
}

