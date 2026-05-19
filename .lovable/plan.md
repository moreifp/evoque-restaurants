# Plano: Transcrição de voz no campo Notas

## Objetivo
Adicionar um ícone de microfone discreto dentro do campo "Notas" em `AddRestaurant`. Ao tocar, o usuário grava áudio; ao parar, o áudio é enviado ao Whisper via Lovable AI Gateway e o texto transcrito é anexado ao final do conteúdo existente.

## Padrão UX/UI (benchmark: Apple Notes + Gboard)

- **Estado idle**: ícone `Mic` (lucide-react) posicionado absoluto no canto superior direito do `<Textarea>`, semi-transparente, tamanho 18px.
- **Estado gravando**: ícone vira `Square` (parar) em `text-destructive` com animação `animate-pulse`. Aparece overlay discreto no rodapé do textarea com:
  - waveform animada (3-4 barras CSS oscilando — sem libs externas)
  - timer `mm:ss`
  - botão "Cancelar" em texto pequeno
- **Estado transcrevendo**: spinner `Loader2` substitui o ícone + toast "Transcrevendo…".
- **Erro/permissão negada**: toast destrutivo com instrução clara em PT/EN.
- **Limite**: auto-stop em 2 minutos para evitar áudios gigantes.

Acessibilidade: `aria-label` traduzido, `aria-pressed` no botão, foco visível.

## Arquitetura técnica

```text
[User tap mic]
   → MediaRecorder API (browser nativo, funciona em iOS WebView/Despia)
   → grava em audio/webm ou audio/mp4 (iOS) 
   → user tap stop
   → blob → base64 → supabase.functions.invoke('transcribe-audio')
   → edge function chama Lovable AI Gateway (Whisper)
   → retorna texto
   → append ao formData.notes com '\n\n' separador
```

### Por que MediaRecorder e não Despia SDK?
Despia não expõe API de gravação de áudio. MediaRecorder funciona no WebView do iOS 14.3+ (Despia roda iOS ≥14). Pede permissão de microfone via `getUserMedia({audio:true})`.

### Provider
Lovable AI Gateway com modelo `openai/whisper-1` (endpoint `/audio/transcriptions`). Envia idioma derivado de `useI18n().language` (`pt` ou `en`) como parâmetro `language` para máxima precisão.

## Arquivos a criar/modificar

### Novo: `supabase/functions/transcribe-audio/index.ts`
- Aceita POST com `{ audio: base64, mimeType, language: 'pt'|'en' }`
- Valida JWT do usuário (verify_jwt = true por padrão)
- Valida tamanho (máx ~5MB base64 ≈ 2min de áudio)
- Decodifica base64 → Blob → FormData
- POST para `https://ai.gateway.lovable.dev/v1/audio/transcriptions` com header `Lovable-API-Key`
- Retorna `{ text: string }`
- Tratamento 429/402 com mensagens claras
- CORS headers

### Novo: `src/hooks/useVoiceTranscription.ts`
Hook reutilizável encapsulando:
- `start()`, `stop()`, `cancel()`
- estados: `isRecording`, `isTranscribing`, `duration`, `error`
- gerencia `MediaRecorder`, `MediaStream`, timer, auto-stop 2min
- detecta mimeType suportado (webm/mp4) automaticamente
- limpa stream tracks no unmount (importante p/ liberar mic em iOS)

### Modificar: `src/pages/AddRestaurant.tsx`
- Localizar o `<Textarea>` do campo Notas
- Envolver num `<div className="relative">`
- Adicionar botão de mic absoluto (top-right) usando o hook
- Ao receber texto: `setFormData(p => ({...p, notes: p.notes ? `${p.notes}\n\n${text}` : text }))`
- Renderizar overlay de gravação (waveform + timer + cancelar) condicionalmente

### Modificar: `src/i18n/translations/{pt,en}.ts`
Adicionar chaves:
- `voiceNote.start` / `voiceNote.stop` / `voiceNote.cancel`
- `voiceNote.recording` / `voiceNote.transcribing`
- `voiceNote.permissionDenied` / `voiceNote.error` / `voiceNote.tooLong`
- `voiceNote.notSupported`

### Modificar: `supabase/config.toml`
Adicionar bloco para a nova função (verify_jwt = true).

## Considerações de segurança
- JWT obrigatório (verify_jwt = true) — só usuários logados.
- Limite de tamanho server-side (rejeita >6MB base64).
- LOVABLE_API_KEY já existe (verificar com `fetch_secrets`; se faltar, criar via `ai_gateway--create`).
- Sem armazenamento do áudio — transcreve e descarta. Áudio nunca toca o storage bucket nem o banco.

## Custo / Performance
- Whisper via Lovable AI: ~$0.006/min (cobrado por crédito da workspace).
- Latência típica: 1-3s para áudios <30s.
- Áudios até 2min ficam ~1-2MB em webm/opus → upload rápido.

## Fora do escopo (futuro)
- Streaming realtime (exigiria ElevenLabs Scribe + WebSocket).
- Edição inline da transcrição antes de inserir.
- Aplicar o mesmo botão em outros campos de texto (description do album, etc).
- Diarização / múltiplos falantes.

## Validação
1. Testar no preview web (Chrome/Safari desktop): grava, para, transcreve.
2. Testar em PWA iOS após deploy.
3. Testar no TestFlight (Despia WebView) — confirmar que `getUserMedia` pede permissão de mic nativa.
4. Verificar logs da edge function via `edge_function_logs`.
