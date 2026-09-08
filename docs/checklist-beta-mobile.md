# Checklist da beta mobile

Use somente contas e refeições fictícias em staging. Registre aparelho, versão do sistema,
navegador, orientação e resultado; não registre e-mail, glicemia ou conteúdo da refeição.

## Matriz mínima

| Plataforma | Navegador e contexto | Instalação esperada | Estado |
| --- | --- | --- | --- |
| iPhone | Safari, pela URL | orientação **Compartilhar → Adicionar à Tela de Início** | Pendente |
| iPhone | Chrome ou outro navegador | orientação para abrir no Safari | Pendente |
| iPhone | PWA instalada | abre pelo ícone em modo standalone e não oferece instalar novamente | Pendente |
| Android | Chrome, pela URL | botão abre o prompt nativo após o toque | Pendente |
| Android | PWA instalada | abre pelo ícone em modo standalone e não oferece instalar novamente | Pendente |
| Desktop | Chrome e Safari | uso pela URL continua funcional; orientação não bloqueia | Pendente |

## Fluxo essencial por aparelho

1. Abrir `https://staging.glicia.app` sem sessão anterior.
2. Solicitar acesso, aprovar administrativamente e entrar pelo código recebido.
3. Concluir o onboarding e revisar os parâmetros fictícios.
4. Instalar pelo onboarding ou pelo menu e abrir novamente pelo ícone.
5. Descrever uma refeição fictícia, conferir e corrigir os dados e confirmar.
6. Conferir o cálculo determinístico e registrar uma dose fictícia.
7. Pesquisar o histórico e reutilizar uma refeição sem copiar glicemia ou dose anterior.
8. Alternar de aplicativo com texto não enviado e confirmar que conversa e rascunho permanecem.
9. Forçar uma falha de rede, usar **Tentar novamente** e validar o modo manual sem IA.
10. Sair, entrar novamente e confirmar que ajustes e histórico continuam associados à conta.
11. Publicar uma segunda versão em staging com a primeira ainda aberta, voltar ao app, adiar o
    aviso e confirmar que a conversa continua utilizável; depois atualizar e conferir a nova versão.

## Acessibilidade e adaptação

- Usar zoom de texto do sistema e zoom do navegador sem perda de conteúdo ou ações.
- Percorrer entrada, onboarding, menu, conversa, confirmação, histórico e ajustes apenas por teclado.
- Conferir nomes e ordem de leitura com VoiceOver no iPhone e TalkBack no Android.
- Confirmar foco visível, fechamento e retorno de foco do menu e mensagens de erro anunciadas.
- Verificar alvos de toque com pelo menos 44 × 44 pontos e uso com uma mão.
- Testar retrato, paisagem, teclado virtual aberto, área segura e viewport de 320 px.
- Ativar redução de movimento e confirmar que nenhuma informação depende de animação.
- Conferir contraste e legibilidade sob brilho alto e baixo.

## Critério de saída

A `v0.14.0-beta` só pode ser considerada validada quando todas as linhas móveis estiverem aprovadas,
nenhum problema crítico de cálculo, perda de dados, autenticação ou acessibilidade estiver aberto e
o mesmo commit tiver passado pela CI, pelo deploy e pelos smoke tests de staging.
