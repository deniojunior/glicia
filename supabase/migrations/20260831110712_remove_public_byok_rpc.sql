-- A chave BYOK é persistida exclusivamente pela Edge Function autenticada.
-- Remover o RPC impede que a validação do provedor seja contornada pela Data API.
drop function if exists public.store_ai_connection(text, text, text);
