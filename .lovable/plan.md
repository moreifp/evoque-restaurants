
# Plano: Traduzir Página "Mapa de Restaurantes"

## Problema Identificado
A página `src/pages/AlbumsMap.tsx` contém textos hardcoded em inglês que não passam pelo sistema de internacionalização (i18n).

### Textos Não Traduzidos
| Localização | Texto em Inglês |
|-------------|-----------------|
| Título (linha 212) | "Restaurant Map" |
| Subtítulo (linha 214) | "{n} location(s) from your albums" |
| Erro toast (linha 93) | "Error" / "Failed to load restaurant locations" |
| Loading (linha 225) | "Loading map..." |
| Estado vazio (linha 232) | "No Locations Found" |
| Estado vazio (linha 234) | "Add restaurants with location data..." |
| Botão (linha 237) | "Add Restaurant" |
| InfoWindow (linha 149) | "Visited:" |
| InfoWindow (linha 155) | "View Details" |

## Solução

### Parte 1: Adicionar Traduções

**Arquivo: `src/i18n/translations/en.ts`**
Adicionar nova seção `restaurantMap`:
```text
restaurantMap: {
  title: "Restaurant Map",
  locationCount: "{count} location from your albums",
  locationsCount: "{count} locations from your albums",
  loadError: "Failed to load restaurant locations",
  loading: "Loading map...",
  noLocations: "No Locations Found",
  noLocationsDesc: "Add restaurants with location data to your albums to see them on the map",
  addRestaurant: "Add Restaurant",
  visited: "Visited",
  viewDetails: "View Details",
}
```

**Arquivo: `src/i18n/translations/pt.ts`**
Adicionar mesma seção em português:
```text
restaurantMap: {
  title: "Mapa de Restaurantes",
  locationCount: "{count} localização dos seus álbuns",
  locationsCount: "{count} localizações dos seus álbuns",
  loadError: "Falha ao carregar localizações dos restaurantes",
  loading: "Carregando mapa...",
  noLocations: "Nenhuma Localização Encontrada",
  noLocationsDesc: "Adicione restaurantes com dados de localização aos seus álbuns para vê-los no mapa",
  addRestaurant: "Adicionar Restaurante",
  visited: "Visitado em",
  viewDetails: "Ver Detalhes",
}
```

### Parte 2: Atualizar AlbumsMap.tsx

1. Importar o hook `useI18n`
2. Substituir todos os textos hardcoded por chamadas `t("restaurantMap.xxx")`
3. Usar lógica condicional para singular/plural no contador de localizações

### Arquivos a Modificar
1. `src/i18n/translations/en.ts` - adicionar seção restaurantMap
2. `src/i18n/translations/pt.ts` - adicionar seção restaurantMap
3. `src/pages/AlbumsMap.tsx` - usar hook useI18n e substituir textos

## Resultado Esperado
- A página mostrará "Mapa de Restaurantes" quando o idioma for português
- Todos os textos da página (loading, erros, estados vazios) serão traduzidos
- O InfoWindow do mapa também exibirá textos no idioma correto
