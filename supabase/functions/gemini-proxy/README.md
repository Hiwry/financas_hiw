# gemini-proxy (Supabase Edge Function)

Esta funcao protege a chave da IA fora do app cliente.

## Deploy

1. Login no Supabase CLI:
   - `supabase login`
2. Link no projeto:
   - `supabase link --project-ref <SEU_PROJECT_REF>`
3. Configure o segredo da IA:
   - `supabase secrets set GEMINI_API_KEY="<SUA_CHAVE_GEMINI>"`
4. (Opcional) trocar modelo:
   - `supabase secrets set GEMINI_MODEL="gemini-2.5-flash"`
5. Deploy da funcao:
   - `supabase functions deploy gemini-proxy`

## Requisito de auth

Para isolamento por usuario no app, habilite **Anonymous Sign-Ins** no Supabase Auth:

- Dashboard -> Authentication -> Providers -> Anonymous -> Enable

Sem isso, o cliente nao consegue criar sessao anonima e o sync remoto fica desativado.
