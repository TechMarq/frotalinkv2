# 🚀 Guia de Deploy — Edge Function `manage-user`

## O que é isso?

A Edge Function `manage-user` é um servidor seguro que roda no Supabase e permite que o admin:
- **Crie funcionários** sem precisar de confirmação de e-mail
- **Altere a senha** de qualquer funcionário (não apenas do usuário logado)
- **Remova usuários** do sistema de autenticação

Ela usa a `service_role` key do Supabase (chave secreta de admin), que **não pode ser exposta no frontend**. Por isso, roda no servidor como uma função segura.

---

## ⚡ Passo 1 — Instalar o Supabase CLI

Abra o **PowerShell como Administrador** e execute:

```powershell
# Opção 1: via npm (recomendado se tiver Node.js)
npm install -g supabase

# Opção 2: via Scoop
scoop install supabase

# Verificar instalação
supabase --version
```

---

## ⚡ Passo 2 — Fazer login e vincular ao projeto

```powershell
# Login no Supabase
supabase login

# Navegue até a pasta do projeto
cd "c:\Users\Leonidas\Documents\MEGA\MEGAsync Uploads\1 - PROJECTS\NEW CARGO\FROTALINK"

# Vincular ao projeto (você precisará do Project Reference ID)
supabase link --project-ref ffgwqsrfmmcqwjjkbrsq
```

> O **Project Reference ID** é `ffgwqsrfmmcqwjjkbrsq` (já identificado no código).

---

## ⚡ Passo 3 — Fazer deploy da Edge Function

```powershell
# Deploy da função manage-user
supabase functions deploy manage-user --no-verify-jwt
```

> **Nota**: `--no-verify-jwt` NÃO significa sem segurança — a função verifica o token do admin internamente e checa o `role=admin` no banco de dados.

---

## ⚡ Passo 4 — Configurar variáveis de ambiente (já configuradas automaticamente)

As seguintes variáveis são injetadas automaticamente pelo Supabase nas Edge Functions:
- `SUPABASE_URL` ✅
- `SUPABASE_ANON_KEY` ✅  
- `SUPABASE_SERVICE_ROLE_KEY` ✅ (a chave secreta que permite criar usuários)

**Não é necessário configurar nada.**

---

## ⚡ Passo 5 — Testar no Supabase Dashboard

1. Acesse: https://supabase.com/dashboard/project/ffgwqsrfmmcqwjjkbrsq/functions
2. Você deverá ver `manage-user` listada
3. Clique em "Logs" para monitorar chamadas

---

## 🔐 Segurança

A Edge Function é segura porque:
1. Verifica o **JWT token** do admin chamador
2. Consulta a tabela `user_access` para confirmar que é `role=admin`
3. Só então executa operações com a `service_role`
4. A `service_role` key **nunca é exposta** ao frontend

---

## 🐛 Solução de Problemas

### Erro: "Function not found"
→ Execute `supabase functions deploy manage-user` novamente.

### Erro: "Unauthorized"
→ Certifique-se de estar logado como admin no sistema antes de criar usuários.

### Usuário criado mas não consegue logar
→ A Edge Function usa `email_confirm: true` — o usuário está confirmado automaticamente.
→ Verifique se a senha tem pelo menos 6 caracteres.

### Edge Function retorna erro 500
→ Acesse os logs no Supabase Dashboard > Functions > manage-user > Logs

---

## 📋 Comandos Rápidos (copiar e colar)

```powershell
# Instalar CLI
npm install -g supabase

# Login
supabase login

# Ir para o projeto
cd "c:\Users\Leonidas\Documents\MEGA\MEGAsync Uploads\1 - PROJECTS\NEW CARGO\FROTALINK"

# Vincular projeto
supabase link --project-ref ffgwqsrfmmcqwjjkbrsq

# Deploy
supabase functions deploy manage-user --no-verify-jwt
```
