
# Plano: Corrigir Bug de Upload de Fotos no iOS/Despia

## Resumo do Problema

O código atual usa uma API imaginaria (`window.despia.camera.takePicture()`) que nao existe no SDK oficial do Despia. O SDK real usa um sistema de protocolos via string (ex: `despia('lighthaptic://')`) e nao expoe metodos de camera ou galeria.

## Estrategia de Correcao

### Opcao A: Usar APIs Web Padrao no iOS (Recomendada)

Como o Despia roda um WebView nativo, podemos usar as APIs web padrao que o iOS Safari suporta:

1. **Remover a deteccao de "isNative" para camera/galeria**
   - O input `<input type="file" accept="image/*" capture="environment">` funciona em WebViews iOS
   - Esta e a abordagem mais confiavel e testada

2. **Modificar `UnifiedMediaUpload.tsx`**
   - Remover a logica que tenta usar `despia.camera.takePicture()`
   - Usar sempre o input file padrao para camera e galeria
   - Manter o dialog customizado para UX (Camera vs Galeria)

3. **Atualizar `useNativeCamera.ts`**
   - Retornar `isAvailable: false` para desabilitar o uso da API inexistente
   - Ou remover completamente o hook

### Opcao B: Investigar Contato com Despia

Se voce precisar de acesso nativo real a camera (melhor qualidade, metadata EXIF completo), seria necessario:
- Contatar suporte do Despia (support@despia.com)
- Perguntar se existe uma API de camera que nao esta documentada
- Aguardar resposta antes de implementar

## Implementacao Recomendada (Opcao A)

### Passo 1: Atualizar useDespiaNative.ts

Corrigir a deteccao de ambiente nativo usando o metodo oficial do Despia:

```typescript
// Verificar ambiente Despia corretamente
const isDespiaNative = navigator.userAgent.includes('despia');
```

E desabilitar as flags de camera/media que nao funcionam:

```typescript
setCapabilities({
  isNative: isDespiaNative,
  platform: isDespiaNative ? 'ios' : 'web',
  hasNotifications: true,  // Funciona via OneSignal
  hasCamera: false,        // NAO usar API inexistente
  hasBiometrics: true,     // Funciona via bioauth://
  hasLocation: true,       // Funciona via browser API
});
```

### Passo 2: Atualizar UnifiedMediaUpload.tsx

Modificar `handleCategoryTap` para usar sempre o input file web:

```typescript
const handleCategoryTap = (category: keyof typeof categoryConfig) => {
  // Sempre usar o dialog para escolher fonte
  setSourceCategory(category);
  setShowSourceDialog(true);
};
```

Modificar `handleFileSelect` para usar o input web padrao:

```typescript
const handleFileSelect = async (category: keyof typeof categoryConfig, useCamera = false) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = category === 'receipt' ? 'image/*' : 'image/*,video/*';
  input.multiple = category !== 'receipt';
  
  if (useCamera) {
    input.capture = 'environment'; // Abre camera no iOS
  }
  
  input.onchange = async (e) => {
    // ... processar arquivos normalmente
  };
  
  input.click();
};
```

### Passo 3: Manter o Dialog de Fonte

O dialog customizado (Camera vs Biblioteca) ainda e util para UX, mas agora usara o input padrao em ambos os casos:

```typescript
// Dialog com 2 opcoes
<Button onClick={() => handleFileSelect(category, true)}>
  Camera
</Button>
<Button onClick={() => handleFileSelect(category, false)}>
  Biblioteca de Fotos
</Button>
```

### Passo 4: Adicionar Logs de Diagnostico

Para verificar que o fix funciona no TestFlight:

```typescript
console.log('[MediaUpload] Environment:', {
  userAgent: navigator.userAgent,
  isDespia: navigator.userAgent.includes('despia'),
  platform: /iPad|iPhone|iPod/.test(navigator.userAgent) ? 'ios' : 'other'
});
```

## Funcionalidades Nativas que Funcionam no Despia

Baseado na documentacao oficial, estas APIs funcionam corretamente:

| Funcionalidade | Protocolo Despia | Status |
|----------------|------------------|--------|
| Haptic Feedback | `lighthaptic://`, `successhaptic://` | Funciona |
| Biometrics | `bioauth://` | Funciona |
| Push Notifications | `registerpush://`, OneSignal | Funciona |
| Screenshot | `takescreenshot://` | Funciona |
| Compartilhar | `shareapp://` | Funciona |
| Clipboard | `getclipboard://` | Funciona |
| App Info | `getappversion://` | Funciona |
| Identity Vault | `setvault://`, `readvault://` | Funciona |
| Pagamentos | RevenueCat integration | Funciona |

| Funcionalidade | Status | Solucao |
|----------------|--------|---------|
| Camera | NAO documentada | Usar input capture web |
| Galeria | NAO documentada | Usar input file web |
| File Picker | NAO documentada | Usar input file web |

## Arquivos a Modificar

1. `src/hooks/useDespiaNative.ts` - Corrigir deteccao e desabilitar camera flags
2. `src/hooks/useNativeCamera.ts` - Retornar isAvailable: false
3. `src/components/UnifiedMediaUpload.tsx` - Remover chamadas a API inexistente
4. `src/contexts/DespiaContext.tsx` - Manter apenas para outras features nativas

## Testes Necessarios

Apos implementacao, testar no TestFlight:

1. Abrir tela de adicionar restaurante
2. Clicar em categoria de foto (ex: "Lugar")
3. Selecionar "Camera" - deve abrir camera nativa do iOS
4. Tirar foto e confirmar - foto deve aparecer no grid
5. Verificar que foto foi enviada ao Supabase Storage
6. Selecionar "Biblioteca" - deve abrir galeria iOS
7. Escolher foto(s) - devem aparecer no grid
8. Salvar restaurante - verificar que fotos foram persistidas
