<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Financas HIW

Aplicacao React + IA Gemini (via Edge Function) + sincronizacao com Supabase.

## Requisitos

- Node.js 20+
- Projeto Supabase criado
- Android Studio (para build e assinatura de APK)
- Java 21 (JDK) ou Java 21 embutido no Android Studio (`jbr`)

## Setup local

1. Instale dependencias:
   `npm install`
2. Crie `.env.local` com base no `.env.example`.
3. Configure no `.env.local`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_SUPABASE_APP_STATE_ID`
   - `VITE_GEMINI_FUNCTION_NAME` (padrao: `gemini-proxy`)
4. No painel SQL do Supabase, rode o script:
   - `supabase/schema.sql`
5. Habilite login anonimo:
   - Supabase Dashboard -> Authentication -> Providers -> Anonymous -> Enable
6. Publique a Edge Function de IA:
   - `supabase/functions/gemini-proxy/index.ts`
   - `supabase secrets set GEMINI_API_KEY="SUA_CHAVE"`
   - `supabase functions deploy gemini-proxy`
7. Execute:
   `npm run dev`

## Banco no Supabase

O app salva o estado completo (transacoes, categorias e contas) na tabela `public.app_state`.
Agora com isolamento por usuario (`user_id`) e RLS.
Se o Supabase nao estiver configurado, o app continua funcionando apenas com `localStorage`.

## APK Android (nativo com Capacitor)

### Pre-requisitos Android no Windows

1. Instale o Android Studio (com Android SDK e Build-Tools)
2. Instale JDK 17
3. Configure variaveis de ambiente:
   - `JAVA_HOME=C:\Program Files\Android\Android Studio\jbr`
   - adicione `%JAVA_HOME%\bin` no `Path`
   - `ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk`
   - adicione `%ANDROID_HOME%\platform-tools` no `Path`
4. (Opcional) crie `android/local.properties` com:
   - `sdk.dir=C\:\\Users\\SEU_USUARIO\\AppData\\Local\\Android\\Sdk`

### 1. Gerar APK debug

Comando:
`npm run apk:debug`

APK gerado em:
`android/app/build/outputs/apk/debug/app-debug.apk`

### 2. Gerar APK release (nao assinado)

Comando:
`npm run apk:release:unsigned`

APK gerado em:
`android/app/build/outputs/apk/release/app-release-unsigned.apk`

### 3. Assinar APK release para distribuicao

No Android Studio:
1. `npm run android:open`
2. Build > Generate Signed Bundle / APK
3. Escolha APK
4. Selecione/crie seu keystore
5. Gere o APK assinado

### 4. Atualizar app Android quando mudar o React

Sempre que alterar o frontend, rode:
`npm run cap:sync`

### 5. Instalar direto no celular via USB (modo desenvolvedor)

Comando:
`npm run apk:install`
