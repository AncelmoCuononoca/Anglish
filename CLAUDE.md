# Anglish Me, project rules

## Regra absoluta: nada de travessões (no dashes)

Não usar NUNCA travessão em nada que o utilizador possa ver, nem em texto que o
Claude escreve nesta conversa, nem em código, comentários, commits, PRs, prompts
ou conteúdo das lições.

Caracteres proibidos:

- `—` em dash (U+2014)
- `–` en dash (U+2013)
- `―` horizontal bar (U+2015)

Em vez disso usar: vírgula, dois pontos, ponto final, parênteses ou reescrever a
frase. Exemplos:

- `Anglish Me — Master English with AI` → `Anglish Me: Master English with AI`
- `Get the app — install it now` → `Get the app. Install it now.`
- `1–10` → `1-10` (hífen normal)

Exceções, apenas estas:

1. Hífen normal `-` continua permitido (palavras compostas, intervalos, slugs).
2. Diálogo em português que exija travessão de fala dentro do conteúdo das
   lições, e só quando a regra gramatical realmente o obrigar.

## Texto gerado por IA

Os system prompts em `supabase/functions/_shared/openai.ts` já proíbem o em dash
ao modelo, e `stripEmDash()` (mais o filtro no streaming) remove qualquer um que
escape. Se um novo caminho de IA for criado, tem de passar pelo mesmo filtro.

## Onde já foi limpo (verificado)

Varrimento feito em todo o repositório, não só no frontend: `frontend/`,
`backend/` (incluindo os scripts do Stripe, cujos nomes de produto aparecem no
checkout do cliente), `supabase/` (functions, .sql, runbooks) e `.claude/skills/`
(para as próprias skills não ensinarem o Claude a escrever travessões).

Atenção ao Stripe: os nomes de produto no código passaram a `Anglish Me: Basic`,
etc., mas os produtos JÁ criados no dashboard do Stripe mantêm o nome antigo até
serem renomeados lá à mão (ou até os scripts serem corridos outra vez).

## Verificação rápida

```bash
grep -rIn -e '—' -e '–' -e '―' --exclude-dir=node_modules --exclude-dir=.git .
```

Só deve devolver linhas do próprio CLAUDE.md (onde os caracteres proibidos
aparecem como exemplo da regra). Mais nada.
