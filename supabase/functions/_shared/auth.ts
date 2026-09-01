import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2.57.0";

import { HttpError } from "./http.ts";

export type AuthenticatedClients = {
  user: User;
  client: SupabaseClient;
  admin: SupabaseClient;
};

export async function authenticateApprovedUser(request: Request): Promise<AuthenticatedClients> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new HttpError(401, "Sessão autenticada obrigatória.", "authentication_required");
  }

  const url = requiredEnvironment("SUPABASE_URL");
  const client = createClient(url, requiredEnvironment("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authorization } }
  });
  const admin = createClient(url, requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"));
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError || !user) {
    throw new HttpError(401, "Sessão autenticada obrigatória.", "authentication_required");
  }

  const { data: grant, error: grantError } = await admin
    .from("app_access_grants")
    .select("user_id")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();
  if (grantError) {
    throw new HttpError(500, "Não foi possível verificar o acesso.", "access_check_failed");
  }
  if (!grant) {
    throw new HttpError(403, "Seu acesso à Glicia ainda não está liberado.", "access_not_approved");
  }

  return { user, client, admin };
}

export async function requireAdministrator(admin: SupabaseClient, userId: string): Promise<void> {
  const { data, error } = await admin
    .from("app_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new HttpError(500, "Não foi possível verificar a permissão administrativa.", "admin_check_failed");
  }
  if (!data) {
    throw new HttpError(403, "Acesso administrativo obrigatório.", "admin_required");
  }
}

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new HttpError(500, "Serviço indisponível.", "missing_server_configuration");
  return value;
}

