
## Fix: Foto da câmera no iOS some após "Use Photo"

### Causa raiz

Em `src/components/UnifiedMediaUpload.tsx`, dentro de `handleFileSelect`, o handler `handleFocusCancel`:

```ts
const handleFocusCancel = () => {
  setTimeout(() => {
    if (!changeHandled) {
      cleanup();              // remove o <input> do DOM
    }
    window.removeEventListener('focus', handleFocusCancel);
  }, 500);
};
window.addEventListener('focus', handleFocusCancel);
```

faz uma **race** com o evento `onchange` no iOS WebView (Despia):

```text
Usuário tira foto → toca "Use Photo"
   ↓
WebView recupera foco  →  handleFocusCancel agendado para +500ms
   ↓ (iOS processa a imagem, pode levar > 500ms em HEIC/foto grande)
Timer dispara primeiro → cleanup() remove <input> do DOM
   ↓
onchange tenta disparar → input já não existe → evento nunca chega
   ↓
Foto perdida silenciosamente. Usuário vê "ok" mas nada salva.
```

O fix anterior (anexar ao DOM antes de `.click()`) resolveu o GC do iOS, mas o `handleFocusCancel` reintroduziu o mesmo problema por outro caminho.

### Correção

Em `src/components/UnifiedMediaUpload.tsx` → `handleFileSelect`:

1. **Remover** o listener `focus` + `setTimeout(500ms)` agressivo. Ele cancela uploads válidos.
2. **Confiar no `onchange`** como fonte de verdade — ele dispara em ambos os casos (arquivo selecionado OU cancelado com `files.length === 0`) na grande maioria dos navegadores/WebViews modernos, incluindo iOS.
3. **Adicionar um safety-cleanup com timeout longo** (ex.: 5 min) só para evitar acumular `<input>` órfãos caso o usuário realmente abandone o fluxo sem voltar.
4. **Manter** `document.body.appendChild(input)` antes de `.click()` (fix anti-GC do iOS).
5. **Adicionar log** quando o `onchange` dispara com `files.length === 0` para distinguir "cancelado" de "foto perdida" em diagnósticos futuros.

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/components/UnifiedMediaUpload.tsx` | Remover `handleFocusCancel`/listener de foco; substituir por safety-timeout longo (5 min) que só limpa se o input ainda estiver na DOM |

### Detalhe técnico (pseudo-código do novo fluxo)

```ts
document.body.appendChild(input);

input.onchange = async (e) => {
  cleanup();                 // sempre limpa após receber o evento
  const selected = Array.from(input.files || []);
  console.log('[UnifiedMediaUpload] onchange fired, files:', selected.length);
  if (selected.length === 0) return;   // cancelamento real
  // ... validação + upload ...
};

// Safety net: só remove se ficou esquecido por muito tempo
const safetyTimer = setTimeout(() => {
  if (document.body.contains(input)) {
    console.warn('[UnifiedMediaUpload] safety cleanup of stale input');
    cleanup();
  }
}, 5 * 60 * 1000);

input.click();
```

### Validação

- TestFlight: editar restaurante do Fausto → câmera → tirar foto → "Use Photo" → deve salvar e aparecer toast "✅ Foto salva".
- Verificar console: deve aparecer `Files received: [...]` com nome/tipo/tamanho da foto.
- Verificar que cancelar a câmera (botão Cancel do iOS) também não trava nem deixa input pendurado.
