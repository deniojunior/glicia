import { createClient } from "@supabase/supabase-js";
import { expect, test, vi } from "vitest";
import { SupabaseMealRepository } from "./supabase-meal-repository";

test("carrega páginas até o fim e preserva o filtro do usuário", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{ id: "first", meal_items: [], applied_dose: null }]), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify([{ id: "second", meal_items: [], applied_dose: null }]), { status: 200 }))
    .mockResolvedValueOnce(new Response("[]", { status: 200 }));
  const client = createClient("https://example.supabase.co", "test-key", { global: { fetch: fetcher }, auth: { persistSession: false, autoRefreshToken: false } });
  const records = await new SupabaseMealRepository(client, "user-1").list();
  expect(records.map((record) => record.id)).toEqual(["first", "second"]);
  expect(fetcher).toHaveBeenCalledTimes(3);
  for (const [index, call] of fetcher.mock.calls.entries()) {
    const url = new URL(String(call[0]));
    expect(url.searchParams.get("user_id")).toBe("eq.user-1");
    expect(url.searchParams.get("offset")).toBe(String(index));
    expect(url.searchParams.get("order")).toBe("created_at.desc,id.desc");
  }
});

test("não retorna histórico parcial quando uma página falha", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response('[{"id":"first"}]', { status: 200 }))
    .mockResolvedValueOnce(new Response('{"message":"denied"}', { status: 403 }));
  const client = createClient("https://example.supabase.co", "test-key", { global: { fetch: fetcher }, auth: { persistSession: false, autoRefreshToken: false } });
  await expect(new SupabaseMealRepository(client, "user-1").list()).rejects.toThrow("Não foi possível carregar");
});
