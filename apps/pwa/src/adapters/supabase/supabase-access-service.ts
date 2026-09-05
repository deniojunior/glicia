import type { SupabaseClient } from "@supabase/supabase-js";

import { AccessServiceError, type AccessEntryState, type AccessRequestStatus, type AccessRequestSummary, type AccessService, type LoginDelivery } from "../../application";

type AccessRequestRow = {
  id: string;
  email_normalized: string;
  status: AccessRequestStatus;
  request_count: number;
  requested_at: string;
  last_requested_at: string;
  reviewed_at: string | null;
  user_id: string | null;
};

export class SupabaseAccessService implements AccessService {
  constructor(private readonly client: SupabaseClient) {}

  async checkAccess(email: string): Promise<AccessEntryState> {
    const { data, error } = await this.client.functions.invoke("request-access", {
      body: { email, action: "check" }
    });
    if (error || !isRecord(data) || !isAccessEntryState(data.state)) {
      throw new AccessServiceError("check_failed");
    }
    return data.state;
  }

  async requestAccess(email: string): Promise<void> {
    const { error } = await this.client.functions.invoke("request-access", {
      body: { email, action: "request" }
    });
    if (error) throw new AccessServiceError("request_failed");
  }

  async sendLoginCode(email: string, redirectTo?: string): Promise<LoginDelivery> {
    const { data, error } = await this.client.functions.invoke("request-access", {
      body: { email, action: "login_code", redirectTo }
    });
    if (!error && isRecord(data) && data.sent === true) return "code";

    const { error: fallbackError } = await this.client.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: redirectTo }
    });
    if (!fallbackError) return "magic_link";
    throw new AccessServiceError("login_failed");
  }

  async verifyLoginCode(email: string, token: string): Promise<void> {
    const { error } = await this.client.auth.verifyOtp({ email, token, type: "email" });
    if (error) throw new AccessServiceError("invalid_code");
  }

  async hasApprovedAccess(userId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from("app_access_grants")
      .select("user_id")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .maybeSingle();
    if (error) throw new AccessServiceError("login_failed");
    return data !== null;
  }

  async listAccessRequests(): Promise<readonly AccessRequestSummary[]> {
    const { data, error } = await this.client.functions.invoke("review-access-request", { method: "GET" });
    if (error || !isAccessRequestList(data)) throw new AccessServiceError("admin_failed");
    return data.requests.map(mapAccessRequest);
  }

  async reviewAccessRequest(requestId: string, decision: Exclude<AccessRequestStatus, "pending">): Promise<void> {
    const { error } = await this.client.functions.invoke("review-access-request", {
      body: { requestId, decision }
    });
    if (error) throw new AccessServiceError("admin_failed");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAccessEntryState(value: unknown): value is AccessEntryState {
  return typeof value === "string" && ["new", "pending", "approved", "rejected", "revoked"].includes(value);
}

function isAccessRequestList(value: unknown): value is { requests: AccessRequestRow[] } {
  if (typeof value !== "object" || value === null || !("requests" in value) || !Array.isArray(value.requests)) return false;
  return value.requests.every((request) => typeof request === "object" && request !== null
    && "id" in request && typeof request.id === "string"
    && "email_normalized" in request && typeof request.email_normalized === "string"
    && "status" in request && ["pending", "approved", "rejected"].includes(String(request.status)));
}

function mapAccessRequest(row: AccessRequestRow): AccessRequestSummary {
  return {
    id: row.id,
    email: row.email_normalized,
    status: row.status,
    requestCount: row.request_count,
    requestedAt: row.requested_at,
    lastRequestedAt: row.last_requested_at,
    reviewedAt: row.reviewed_at,
    userId: row.user_id
  };
}
