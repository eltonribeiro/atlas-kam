# Atlas KAM — Entregas

## Concluído
- [x] Etapa 1 — Base visual, navegação e acesso por e-mail (login, saída e recuperação confirmados por Elton).
- [x] Etapa 2 — Estrutura de dados, permissões por perfil/conta e dados fictícios.
- [x] Etapa 3 — Motor de SLA: classificação, pausas, ciclos, violações permanentes, revisão de severidade e alertas 50/80/100.
- [x] Etapa 4 — Registro com erros por campo, resumo, prévia de SLA, evidências privadas (10 × 15 MB) e confirmação ao cliente na fila de envio.
- [x] Etapa 5 — Tratativa: pergunta/resposta com pausa, solução com evidências, improcedência com justificativa e evidência, 5 Porquês/Ishikawa 6M/8D, plano 5W2H, reatribuição, escalonamento, recorrência e vínculo a Problema.
- [x] Etapa 6 — Avaliação pública (Sim/Em parte/Não, CSAT, CES, reabertura em 15 dias), contestação pública, notificações internas, modelos de e-mail, lembretes em 2 e 4 dias úteis e encerramento sem avaliação só após convite entregue.
- [x] Etapa 7 — Painel com 8 KPIs conferidos contra cálculo manual, filtros na URL, Pareto, aging e exportação; Problemas com eficácia mensurável e reprovação automática; Contratos e SLA; Contas/equipe/anonimização; relatório por conta.
- [x] Rotina a cada 5 minutos agendada (prazos, alertas, lembretes e envios); e-mails aguardam sem gastar tentativas enquanto o domínio não estiver liberado.
- [x] Testes: 73 automatizados aprovados; fluxos completos verificados no navegador em desktop e 375px; dados e identidades de teste desativados após uso.
- [x] SIGA fase 2b: API por oid servidor, perfis do manifesto, comparação sem gravação, diagnóstico e gancho isolado na rotina existente.
- [x] SIGA fase 3a: mapa completo de telas, prioridade da nova ocorrência, AccessGate fechado em dúvida, exceção Administração, filtro do menu e renovação a cada minuto.
- [x] Validação SIGA: 108 testes sem banco aprovados; compilação automática aprovada; 117 arquivos do navegador sem credenciais/API/access-mode; Administração conferida com sessão real em desktop e 375px, diagnóstico off e sem erros. tsc separado não executado. Fase 1 e migration oid preservadas; nenhuma alteração de Secrets, interruptores, papéis ou dados.

## Aguardando algo externo
- SIGA em QA: usuário valida manifesto/perfis, ativa observe e confere diagnóstico/log sem divergências inesperadas; confirma oid/perfil de todos os ativos antes de ativar SIGA_ACCESS_MODE=enforce e publicar. Validar retirada de permissão em até dois minutos e falha fechada pelo navegador na VPN. A fase 3a controla a interface, não muda a autorização dos dados; fase 3b não implementada.
- Envio real de e-mails: aguarda a verificação DNS de notify.intralog.log.br.
- Publicação do app: a rotina agendada e os links dos e-mails usam o endereço publicado; só passam a funcionar depois de publicar.
- Convite de novos usuários por e-mail: implementado, não testado com endereço real (envia e-mail de verdade).
- Retenção/anonimização automática de textos livres: depende de política do Compliance (histórico é imutável).
- Ambiente corporativo Azure/AKS: não conectado; fora do alcance desta implementação.
- Antes de entrar em produção: Elton decide se as contas fictícias (Aurora Varejo etc.) serão desativadas — o mesmo banco atende prévia e app publicado.

## Decisões registradas
- Cópia ao KAM: enviada como e-mail separado, sem o link pessoal do cliente (o serviço envia um destinatário por mensagem).
- Contestação: link pessoal válido por 15 dias após o encerramento; uma contestação por análise.
- Nova ocorrência da mesma conta e categoria durante a verificação de eficácia vincula-se ao Problema e reprova a eficácia.
- Endereços fictícios (example.com, .test, .invalid) nunca recebem e-mail.
- Lembretes, encerramento tácito e taxa de resposta contam a partir da entrega do convite, não da geração do link.

Elton autorizou seguir por todas as etapas sem aprovação intermediária; parar só para decisão crítica ou impedimento externo.
