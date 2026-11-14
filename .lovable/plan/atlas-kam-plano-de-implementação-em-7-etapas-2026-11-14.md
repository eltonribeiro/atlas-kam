# Atlas KAM — Plano de implementação em 7 etapas

## Objetivo e execução

Construir o módulo de ocorrências a partir da especificação enviada, em sete entregas incrementais. Cada etapa terá testes e critérios de aceite antes da próxima. **A aprovação deste plano inicia somente a etapa 1**, não a construção integral do MVP em uma única entrega.

Este pedido é de planejamento: nenhuma tela, conexão, configuração de acesso ou tabela será criada agora.

## Adaptações e pontos de decisão

- **Ambiente atual:** manter a estrutura existente do projeto. A especificação cita versões e serviços diferentes; as regras de negócio serão preservadas, com as adaptações técnicas descritas ao final.
- **Hospedagem corporativa:** a instância privada no Azure e a publicação em AKS não estão conectadas nem verificadas. Antes da etapa 1, confirmar se a primeira implementação pode usar Lovable Cloud ou se depende do ambiente corporativo. Não tratar Cloud como se fosse a instância privada descrita.
- **Acesso:** o documento já escolhe acesso por e-mail para os usuários internos. Planejar esse modelo, sem acrescentar Google ou reutilização da identidade Lovable. A avaliação do cliente permanece sem login. Não permitir que o cadastro público atribua cargos ou acesso a contas.
- **Protótipo:** o canvas mencionado não foi anexado. Usar os tokens, a tipografia e os layouts descritos; não alegar reprodução exata de um protótipo indisponível.
- **Escopo:** sem portal de abertura pelo cliente, WhatsApp integrado, WMS, NPS por ocorrência ou aplicativo nativo. Sem modo escuro nesta primeira implementação.

## Etapa 1 — Base visual, navegação e acesso

**Entrega**
- Design operacional e denso: IBM Plex Sans na interface, IBM Plex Mono em protocolos e números; cores da seção 4, barra superior escura, controles acessíveis e textos em português do Brasil.
- Navegação e estrutura de `/ocorrencias`, `/ocorrencias/nova`, `/ocorrencias/:id`, `/problemas`, `/problemas/:id`, `/avaliacao/:token` e `/config/sla`.
- A página inicial encaminha para Ocorrências. Contas e Relatórios aparecem apenas como espaços identificados para futura integração, sem inventar módulos fora do pedido.
- Acesso por e-mail, saída e recuperação de senha; páginas internas protegidas e avaliação separada do ambiente interno.
- Nenhuma tabela de negócio nesta etapa; páginas ainda sem indicadores ou registros fictícios apresentados como reais.

**Aceite:** entrar, sair e recuperar acesso; testar visita direta a páginas internas e pública; conferir navegação, contraste, alvos de 44px e ausência de sobreposição em 375px e desktop.

## Etapa 2 — Banco, permissões e dados de teste

**Entrega**
- Migrations versionadas com os enums e as 17 tabelas, chaves, índices, restrições e permissões explícitas. Reutilizar cadastros existentes se forem encontrados no ambiente escolhido.
- Acesso por conta e perfil: analista, KAM, gestor de operações e admin. Histórico apenas de inclusão; nenhum perfil interno pode preencher ou editar avaliações do cliente.
- Proteção contra alteração do próprio perfil, cargo ou alocação. Admin configura cadastros e SLA, mas não recebe permissão operacional só por ser admin.
- Protocolos anuais `OC-AAAA-NNNN`, códigos `PRB-NNNN` e severidade calculada no banco.
- Dados fictícios reproduzíveis: quatro contas, dois contatos por conta, sete categorias, calendário padrão e política Padrão. Preparar quatro usuários de teste pelo serviço de autenticação, um por perfil, sem senhas no repositório.
- Calendário 08:00–18:00, segunda a sexta, fuso São Paulo; feriados nacionais do ano de execução, com fonte verificada e sem presumir feriados locais.

**Aceite:** testar cada perfil com sessão real, acesso cruzado entre contas, tentativa de elevar permissões, imutabilidade do histórico, matriz de severidade e ações corretivas/preventivas sem causa.

## Etapa 3 — SLA e máquina de estados

**Entrega**
- Funções de minutos úteis, prévia de SLA, estados dos relógios e transições disponíveis com checklist de condições.
- Transições atômicas, com validação de perfil e eventos de auditoria. Bloquear alteração direta de status e demais caminhos capazes de contornar as regras.
- Primeira resposta apenas em atualização ou pergunta enviada ao cliente; nota interna não conta. Pausa somente em Aguardando cliente; retorno ao estado anterior, cálculo dos minutos pausados e novo ciclo na reabertura.
- Violações permanentes, mesmo após reabertura. Mudança de severidade apenas por KAM/gestor, com justificativa e política explícita de recálculo para ciclos reabertos.
- Metas em minutos úteis: S1 `60/480/120`; S2 `240/1200/600`; S3 `480/3000/1200`; S4 `600/6000/3000`, respectivamente resposta, solução e atualização no calendário padrão de 600 minutos/dia. Metas em dias serão adequadas à duração do calendário contratado.
- Rotina a cada cinco minutos para violações, alertas por ciclo, lembretes e encerramento sem avaliação. Preparar a integração com o envio de e-mails da etapa 6, sem declarar entregas antes da confirmação do serviço.

**Aceite:** sexta às 17:30 + 60 minutos úteis = segunda às 08:30; feriado pulado; testes para todas as transições válidas e inválidas, pausa, condições de solução S1/S2, alertas idempotentes e manutenção de violações.

## Etapa 4 — Registro de ocorrência

**Entrega**
- Formulário em três blocos, contato dependente da conta, categorias e campos obrigatórios conforme a seção 10.
- Prévia de severidade e SLA calculada pelo banco; expectativa do cliente obrigatória, sem campos livres de e-mail ou telefone.
- Evidências privadas: até dez arquivos de 15 MB, validação de extensão e conteúdo no servidor, nomes sanitizados e acesso temporário de dez minutos.
- Registro consistente com evento de abertura, tratamento de falhas de anexos e encaminhamento ao detalhe. Confirmação por e-mail conectada na etapa 6; até lá, não informar que o cliente foi notificado.
- Cancelamento com confirmação quando houver alterações, validação junto aos campos e resumo de erros.

**Aceite:** registrar com dados reais de teste e ler o resultado no detalhe; conferir S1 na prévia, data futura, impacto negativo, limites de anexos e contato de outra conta recusado.

## Etapa 5 — Tratativa, causas, ações e histórico

**Entrega**
- Detalhe com etapas, indicadores de SLA e bloco Próximo passo baseado exclusivamente nas condições retornadas pelo banco.
- Assumir, iniciar tratativa, pedir informação, registrar resposta, propor solução e marcar improcedente, respeitando perfil e condições.
- Causas com 5 Porquês, classificação 6M e organização 8D; ações 5W2H, responsáveis, prazos e comprovação obrigatória de conclusão.
- Comunicação separada do trabalho: atualização ao cliente, pergunta que pausa, nota interna e resposta recebida; histórico filtrável e imutável.
- Reatribuição e escalonamento auditados; integração de recorrência e vínculo a Problema concluída na etapa 7.

**Aceite:** executar uma ocorrência da abertura à proposta de solução, incluindo tentativa bloqueada, primeira resposta, contenção, pausa/retomada e evidência de conclusão; confirmar o resultado após recarregar a página.

## Etapa 6 — Avaliação pública e notificações

**Entrega**
- Avaliação por token aleatório de 32 bytes, hash SHA-256 no banco, validade, limitação de tentativas por IP/token e resumo estritamente mínimo.
- Sim/Em parte/Não, CSAT 1–5, CES 1–7, comentário até mil caracteres e pendência obrigatória em respostas negativas.
- Resposta e transição na mesma transação, impedindo respostas simultâneas duplicadas. Reabertura com novo ciclo e manutenção das violações anteriores.
- E-mails versionados para abertura, atualizações, perguntas, solução, lembretes e alertas. Destinatários derivados do cadastro, nunca enviados livremente pelo navegador.
- Configurar domínio de envio, endereço de resposta e endereço absoluto do app; registrar resultado dos envios e conferir falhas sem duplicação.

**Aceite:** abrir link válido sem login, responder e verificar a mudança na tela interna; testar token inválido/expirado, resposta duplicada, reabertura e ausência de dados internos; conferir envio e logs reais de e-mail.

**Inconsistências a resolver antes desta etapa**
- O documento pede erro para token usado, mas também permite reutilizar o link para reabrir. Proposta: bloquear nova avaliação, mostrar resumo e permitir apenas reabertura elegível; token desconhecido/expirado retorna erro genérico.
- A contestação de improcedência é citada, mas não possui transição ou contrato de token definido. Definir esse fluxo antes de disponibilizar o link.
- Uma reabertura não reinicia o relógio da primeira resposta na especificação. Mostrar o novo prazo de solução, sem inventar uma nova meta de primeira resposta.
- O serviço padrão de e-mails inclui descadastro e não garante o modelo de KAM em cópia ou exatamente três tentativas controladas pelo app. Verificar compatibilidade e aprovar a adaptação antes do envio; não contornar supressões.

## Etapa 7 — Painel, Problemas e configuração

**Entrega**
- Indicadores calculados no banco por data do evento, excluindo solicitações. Períodos de 7/30/90 dias e 12 meses, comparação com período anterior e sentido correto das variações.
- Oito KPIs principais: índice de solução, SLA de resposta, SLA de solução, tempo de resposta, tempo de solução, CSAT, taxa de resposta e reabertura. CES como medida complementar; CSAT sempre acompanhado da taxa de resposta e aviso abaixo de 30%.
- Lista com filtros na URL, prioridade de violadas/em risco, paginação de 25 e exportação da lista filtrada; Pareto de 90 dias e aging em dias úteis.
- Problemas: lista, detalhe, vínculo de ocorrências, causas e ações continuadas, ciclo de eficácia, critério mensurável e reprovação automática por recorrência da mesma causa.
- Detecção por conta/categoria: três ocorrências em 90 dias; por categoria entre contas: cinco no mesmo horizonte, sujeito à confirmação da regra que não explicita o período no segundo caso.
- Completar `/config/sla` para admin: calendários, feriados, políticas, metas e categorias com auditoria. Não criar um módulo completo de contratos fora do escopo.

**Aceite:** comparar os oito KPIs com SQL sobre os dados de teste; testar filtros/exportação, período sem dados, taxa de resposta abaixo de 30%, recorrência e eficácia efetiva/não efetiva.

## Detalhes técnicos

- Manter TanStack Start, React 19 e Tailwind v4 do projeto; tokens em `src/styles.css`, fontes no cabeçalho e componentes shadcn. Não migrar para React 18, criar outro roteador ou `tailwind.config` legado.
- Lógica de SLA e estados em funções PostgreSQL; lógica interna de servidor em `createServerFn`; avaliação e chamadas agendadas em rotas de servidor sob `/api/public/`, verificando token ou credencial em cada chamada. Não criar novas Edge Functions.
- Consultas com TanStack Query, carregamento pelas páginas protegidas, invalidação após mutações e validação Zod no cliente e servidor. Autorizações nunca dependem de botões escondidos.
- Grants, RLS, funções com `search_path` fixo e restrições de execução são parte das migrations. Dados fictícios de negócio entram como INSERTs versionados, não no carregamento da página.
- Indicadores de tempo por ciclo precisam de dados históricos suficientes para preservar a primeira solução e suas pausas; não usar apenas campos sobrescritos a cada reabertura. Registrar os marcos antes de construir os KPIs.
- Cada página de conteúdo terá título, descrição e metadados próprios. Rotas administrativas e públicas não compartilham dados privados de sessão.
- Durante a implementação, registrar decisões estruturais em `AGENTS.md` e acompanhar as sete entregas em `roadmap.md`.

## Condições para uso em produção

- Ambiente corporativo e esteira Azure DevOps/AKS validados separadamente; este plano não promete essa implantação como recurso já disponível.
- Domínio e remetente de e-mail aprovados, calendário contratual conferido e contas/perfis reais alocados.
- Compliance aprova finalidade, base legal e retenção; cinco anos é apenas sugestão do documento, não política adotada. Validar anonimização e atendimento aos direitos do titular.
- Testes por perfil, fluxos completos com sessão real, dependências, segurança de anexos e avaliação pública verificados antes da publicação.