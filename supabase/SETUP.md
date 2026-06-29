# Supabase Setup Guide - Anglish AI

## 1. Criar projeto

1. Vai a https://supabase.com/dashboard
2. Clica **New project**
3. Nome: `anglish-ai`
4. Database password: (guarda bem - precisas no .env)
5. Region: escolhe a mais próxima (Europe West para PT/AO)

## 2. Correr o schema SQL

No **SQL Editor** → **New Query**, corre por esta ordem:

```
1. supabase/schema.sql      ← tabelas + triggers
2. supabase/rls.sql         ← Row Level Security + funções
3. supabase/seed_lessons.sql ← lições da Semana 1, A1
```

## 3. Obter as chaves

**Settings → API** no dashboard Supabase:

```env
VITE_SUPABASE_URL=https://xxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...  (anon/public key)

# No backend:
SUPABASE_URL=https://xxxxxxxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...    (service_role key - NUNCA expões no frontend!)
```

## 4. Configurar Auth

**Authentication → Providers** no dashboard:

### Email/Password
- Enable Email provider ✓
- Confirm email: ON (recomendado para produção)
- Secure email change: ON

### Google OAuth
1. Vai a https://console.cloud.google.com
2. Cria um projeto ou usa um existente
3. **APIs & Services → Credentials → Create OAuth 2.0 Client ID**
4. Application type: **Web application**
5. Authorized redirect URIs: `https://xxxxxxxxxx.supabase.co/auth/v1/callback`
6. Copia o **Client ID** e **Client Secret**
7. Em Supabase → **Authentication → Providers → Google**:
   - Client ID: (colar)
   - Client Secret: (colar)
   - Enable ✓

### Site URL (importante!)
**Authentication → URL Configuration**:
- Site URL: `http://localhost:3000` (dev) / `https://teu-dominio.com` (prod)
- Redirect URLs: adiciona `http://localhost:3000/auth/callback`

## 5. Tornar-te Admin

Após criares a tua conta na app, corre no SQL Editor:

```sql
-- Substitui pelo teu user ID (Authentication → Users no dashboard)
SELECT public.set_admin_role('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx');
```

## 6. Verificar RLS

Testa no SQL Editor:

```sql
-- Deve devolver 0 rows (RLS a bloquear acesso anónimo)
SELECT * FROM public.profiles;

-- Deve listar as conquistas (public read)
SELECT * FROM public.achievements;
```

## Estrutura final das tabelas

| Tabela | Descrição |
|---|---|
| `profiles` | Perfis dos utilizadores (extensão de auth.users) |
| `lessons` | Conteúdo das lições por nível/semana/dia |
| `exercises` | Exercícios de cada lição |
| `user_lesson_progress` | Progresso de cada utilizador nas lições |
| `achievements` | Conquistas disponíveis |
| `user_achievements` | Conquistas desbloqueadas por utilizador |
| `scheduled_lessons` | Agendamentos de aulas ao vivo |
| `daily_xp_log` | Log diário de XP (para streaks) |
