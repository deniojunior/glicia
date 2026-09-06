# Revisão de usabilidade — setembro de 2026

## Diagnóstico

Revisão heurística do código e da jornada, não uma pesquisa com usuários.

- Entrada: pedir e-mail antes de explicar o benefício dificulta a decisão de experimentar. A apresentação explica quem é a Glicia, o que faz e a fonte dos dados, com o botão “Entrar”. Ao acioná-lo, o texto de apresentação é substituído pelo formulário de e-mail, botão “Continuar” e aviso de acesso experimental sujeito a aprovação. É possível voltar à apresentação; o acesso administrativo permanece direto.
- Chat: avatar e saudação lado a lado disputavam largura no celular. A acolhida agora tem avatar acima do texto; respostas ganham mais largura de leitura.
- Composição: instruções de atalhos competiam com o envio. Retirado o texto, preservado o comportamento de Enter. A dica Prefere gravar áudio?” explica o ditado do teclado, sem simular gravação pelo app, e pede conferência dos números.
- Transições: a mesma tela com identidade da Glicia acompanha as verificações de acesso e preparação, com indicador indeterminado e respeito à preferência de movimento reduzido.
- Histórico: números sem o contexto dos alimentos dificultavam reconhecer refeições. Agora alimentos e data antecedem os valores; o resumo fica expansível, com busca e oito registros por página.

## Limites e decisões

Preservados aprovação explícita, autenticação, fonte alimentar e cálculos. A comunicação é acolhedora, sem prometer precisão absoluta ou segurança clínica. As sugestões não substituem orientação profissional.

A busca ignora acentos e consulta alimentos, resumo, tipo de refeição e data local. A paginação visual ocorre no cliente, após leitura em lotes do histórico da conta, mantendo filtro de usuário e RLS existente. Para volumes maiores, evoluir para busca e paginação no servidor. Consultas em lotes seguem a [documentação de range do Supabase](https://supabase.com/docs/reference/javascript/using-modifiers-range).

## Validação

Testes automatizados cobrem busca, paginação, ordenação, consultas em lotes e falha sem histórico parcial. Build e lint devem passar antes de publicar.

Pendente validação visual em navegador e aparelho real: larguras 320/390/768 px, teclado aberto, dica expandida, fontes ampliadas, rede lenta, estados de aprovação e navegação entre páginas. Confirmar com pessoas novas se conseguem explicar o propósito e encontrar o pedido de acesso sem ajuda. Medir compreensão antes de atribuir melhora de conversão ao redesign.
