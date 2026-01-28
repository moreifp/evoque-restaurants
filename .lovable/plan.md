
# Plano: Adicionar Tradução de Menu ao Criar Restaurante

## Problema
Atualmente, quando você adiciona uma foto de cardápio ao criar um novo restaurante, não há opção para traduzir o menu. A tradução só está disponível ao editar um restaurante existente na página de detalhes.

## Solução
Adicionar a funcionalidade de tradução de menu diretamente no componente `UnifiedMediaUpload`, permitindo traduzir o cardápio imediatamente após o upload.

---

## Arquitetura da Mudança

### Fluxo Atual (Vinho - funciona como referência)
```text
Upload → analyzeWineLabel() → Salva wineInfo no estado → Mostra informações + Rating
```

### Novo Fluxo (Menu)
```text
Upload → [Botão Traduzir AI] → handleTranslateMenu() → Salva menuTranslation no estado → Mostra tradução
```

---

## Mudanças Técnicas

### 1. Atualizar Interface `UploadedFile` (UnifiedMediaUpload.tsx)
Adicionar campo para armazenar tradução do menu:
```typescript
interface UploadedFile {
  // ... campos existentes
  menuTranslation?: string;  // NOVO: Tradução do cardápio
}
```

### 2. Adicionar Estado e Funções de Tradução (UnifiedMediaUpload.tsx)

**Novos estados:**
- `translatingMenuPreview`: string | null - Para indicar qual menu está sendo traduzido
- `languageOptions`: Array de idiomas disponíveis

**Nova função `handleTranslateMenuLocal`:**
- Recebe o preview da foto e idioma alvo
- Chama a edge function `translate-menu` (já existe)
- Atualiza o estado local com a tradução
- Se `entryId` existir (modo edição), salva no banco também

### 3. Criar Seção de Menu Similar à de Vinho
Atualmente menus aparecem na grade genérica "Other Photos". Criar uma seção dedicada:

```text
┌─────────────────────────────────────────┐
│ 📋 Cardápios (1)                        │
├─────────────────────────────────────────┤
│ ┌────────┐                              │
│ │ 📷     │  [🌐 Traduzir AI ▼]          │
│ │ Menu   │  (Dropdown com idiomas)      │
│ └────────┘                              │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 📋 Tradução do Cardápio             │ │
│ │                                     │ │
│ │ 🐟 PEIXES / FRUTOS DO MAR           │ │
│ │ • Bacalhau à Brás | R$ 89,00        │ │
│ │   (Bacalhau desfiado com batata...) │ │
│ │                                     │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### 4. Atualizar `onUploadsChange` 
Incluir traduções de menu nos dados passados ao componente pai:

```typescript
// Estrutura atual
menu: string[]  // Apenas URLs

// Nova estrutura
menu: Array<{ url: string; translation?: string }>
```

### 5. Atualizar `AddRestaurant.tsx`
Modificar o tipo de `uploadData.menu` para suportar traduções e salvar no banco ao criar:

```typescript
// Ao salvar fotos de menu
...uploadData.menu.map(menu => ({
  entry_id: entry.id,
  photo_url: typeof menu === 'string' ? menu : menu.url,
  type: 'menu',
  menu_translation: typeof menu === 'string' ? null : menu.translation,
}))
```

### 6. Adicionar Traduções i18n

**Arquivo: `src/i18n/translations/en.ts`**
```text
unifiedMediaUpload: {
  // ... existentes
  menu: {
    collectionTitle: "Menus",
    translateMenu: "AI Translate",
    translating: "Translating...",
    menuTranslation: "Menu Translation",
    selectLanguage: "Select language",
  }
}
```

**Arquivo: `src/i18n/translations/pt.ts`**
```text
unifiedMediaUpload: {
  // ... existentes
  menu: {
    collectionTitle: "Cardápios",
    translateMenu: "Traduzir AI",
    translating: "Traduzindo...",
    menuTranslation: "Tradução do Cardápio",
    selectLanguage: "Selecionar idioma",
  }
}
```

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/components/UnifiedMediaUpload.tsx` | Adicionar seção de menu com tradução, estados, funções |
| `src/pages/AddRestaurant.tsx` | Atualizar tipo de menu, salvar traduções |
| `src/i18n/translations/en.ts` | Adicionar chaves de tradução para menu |
| `src/i18n/translations/pt.ts` | Adicionar chaves de tradução para menu |

---

## Resultado Esperado
1. Ao adicionar um restaurante e fazer upload de uma foto de cardápio
2. A foto aparece em uma seção dedicada "Cardápios"
3. Botão "Traduzir AI" com dropdown de idiomas aparece ao lado
4. Ao traduzir, a tradução aparece abaixo da imagem
5. Ao salvar o restaurante, a tradução é persistida no banco de dados
