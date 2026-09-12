# Recuperar as fotos do Fausto e corrigir o salvamento automático

## O que aconteceu

Nada foi apagado. No dia 10/09 foi criado um registro em rascunho chamado "Au relais des menetriers" e todas as fotos seguintes ficaram presas nele — inclusive as 13 fotos de ontem (11/09). Como rascunhos não aparecem na lista de restaurantes, parecia que tudo tinha sumido.

O texto digitado (nome, avaliação, notas) realmente se perdeu: hoje o rascunho só guarda as fotos automaticamente; os campos escritos só são gravados quando se toca em salvar.

## Parte 1 — Recuperação (separar em dois registros)

- Registro A: "Au relais des menetriers", visita 10/09 — fica com as 2 fotos tiradas no dia 10/09.
- Registro B: novo registro "L'Auberge de l'Ill", visita 11/09 — recebe as 13 fotos de ontem (2 fotos do restaurante, 2 do menu e 9 de vinho/pratos).
- Os dois passam a ser registros normais (deixam de ser rascunho) e aparecem na lista do Fausto.
- Nenhuma foto é apagada; apenas o vínculo de cada foto é ajustado.

## Parte 2 — Correção do salvamento automático

- Enquanto o usuário preenche o formulário, os dados (nome, data, local, avaliação, acompanhantes, notas, descrição) passam a ser gravados sozinhos no rascunho, alguns segundos após parar de digitar.
- Ao reabrir o app, o rascunho volta completo — texto e fotos — como já acontece hoje com as fotos.
- Na aba Restaurantes, rascunhos passam a aparecer com um selo "Rascunho" e ao tocar levam de volta ao formulário para continuar. Assim nada fica invisível.
- Sem mudança visual no resto da tela; mensagens em PT e EN.

## Detalhes técnicos

- Dados: `UPDATE` em `restaurant_photos.entry_id` para as 13 fotos de 11/09 apontarem para um novo `restaurant_entries` (mesmo `user_id`), e `is_draft = false` nos dois registros. Sem `DELETE`.
- `src/pages/AddRestaurant.tsx`: efeito com debounce (~2s) que, havendo `draftEntryId`, faz `update` dos campos do formulário na linha de rascunho; reaproveita `ensureDraftEntry` para criar a linha quando o usuário começa a digitar (não apenas ao anexar foto).
- `src/hooks/useRestaurantEntries.ts`: remover o filtro `is_draft = false` e retornar o campo, ou adicionar consulta paralela de rascunhos.
- `src/pages/Dining.tsx`: `RestaurantCard` com selo "Rascunho" e navegação para `/dining/add` (retomar) em vez de `/dining/:id`.
- Traduções novas em `src/i18n/translations/{pt,en}.ts`.
