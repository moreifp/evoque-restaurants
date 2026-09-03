# Resolver o aviso "device seems to be jailbroken" no app iOS

## Diagnóstico

O aviso não vem do código do Evoque — não existe nenhuma referência a jailbreak/root no projeto. Ele é gerado pela **proteção anti-jailbreak nativa do Despia**, aplicada no build do app iOS.

No iPhone do seu pai há um **iOS beta / perfil de desenvolvedor instalado**, e é exatamente esse tipo de configuração que dispara o falso positivo: a checagem do Despia interpreta perfis de configuração e caminhos de sistema não padrão como sinal de aparelho comprometido. Como só acontece nesse aparelho, é falso positivo, não um problema do app.

## O que fazer

Isso não é corrigível por código — é uma configuração do build Despia.

1. No painel do Despia, abrir o app Evoque → **Security / App Protection**.
2. Desativar a opção de **Jailbreak / Root detection** (também aparece como "Block jailbroken devices").
3. Gerar um novo build.
4. Como é uma mudança nativa (não OTA de UI), é preciso **enviar o novo build para a App Store / TestFlight** — atualizações OTA de interface não removem a checagem.
5. Após aprovação, seu pai atualiza o app e o aviso deixa de aparecer.

## Alternativa imediata (sem republicar)

Se ele precisar entrar hoje, remover o perfil de desenvolvedor/beta do iPhone costuma resolver:
Ajustes → Geral → VPN e Gerenciamento de Dispositivos → remover o perfil, e reiniciar o aparelho.

## Nota técnica

- Nenhuma alteração no repositório é necessária.
- A proteção anti-jailbreak protege pouco em um app de diário gastronômico (sem pagamentos nem DRM), então desativá-la tem impacto de segurança baixo e melhora a taxa de acesso de usuários com iOS beta.
- Se preferir manter a proteção, a alternativa é orientar usuários afetados a remover perfis de beta — o que gera atrito e relatos recorrentes.
