# Decisão 001 — Passkeys na PWA

Data: 2026-09-05

## Contexto

Magic links abertos pelo cliente de e-mail podem sair da PWA instalada e abrir o navegador. Uma
passkey permitiria que Face ID, Touch ID, PIN ou biometria Android desbloqueassem uma credencial
WebAuthn no próprio dispositivo. A Glicia não receberia nem armazenaria o dado biométrico.

O Supabase anunciou **Passkeys for Supabase Auth (Beta)** em 28 de maio de 2026. A PWA ainda usa
`@supabase/supabase-js` 2.57.0; essa versão contém códigos de erro relacionados a WebAuthn, mas não
expõe no cliente utilizado pela aplicação um fluxo público completo de cadastro e autenticação por
passkey. A funcionalidade do provedor também continua marcada como beta.

Referência primária: [Passkeys for Supabase Auth (Beta)](https://supabase.com/changelog/46458-passkeys-for-supabase-auth-beta).

## Decisão

Não ativar passkeys na `v0.10.0-alpha`. O acesso principal será feito por código de uso único
digitado na PWA, com magic link no mesmo e-mail apenas como contingência. A sessão continuará
persistida e renovada pelo cliente Supabase no dispositivo.

Uma passkey não substitui a aprovação inicial: primeiro é necessário associar com segurança a
credencial a uma conta aprovada. Quando a integração sair de beta, a candidata será cadastrada
depois do primeiro OTP e usada nos acessos seguintes.

## Condições para reavaliar

- API pública de passkeys disponível na versão fixada do `supabase-js` e documentada pelo
  Supabase.
- Cadastro, autenticação, remoção e recuperação validados em Safari/iOS e Chrome/Android,
  incluindo a PWA instalada.
- Conta recuperável quando o dispositivo ou a passkey forem perdidos.
- Passkeys condicionadas à mesma concessão de acesso e invalidadas quando ela for revogada.
- Testes reais confirmando que nenhum material biométrico ou chave privada chega ao backend.

## Consequências

O OTP resolve agora o problema de permanecer dentro da PWA com uma tecnologia estável. A pessoa
ainda depende de e-mail para o primeiro acesso e para recuperação. Adotar passkeys depois exigirá
uma migration de experiência e segurança, mas não muda o domínio clínico nem o histórico.
