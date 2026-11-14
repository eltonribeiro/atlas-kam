# Atlas KAM — Entregas

## Concluído
- [x] Etapa 1 — Base visual, navegação e acesso por e-mail (login, saída e recuperação confirmados por Elton).
- [x] Etapa 2 — Estrutura de dados, permissões por perfil/conta e dados fictícios.
- [x] Etapa 3 — Motor de SLA: classificação, pausas, ciclos, violações permanentes, revisão de severidade e alertas 50/80/100.
- [x] Banco — Notificações internas, registro de envios com até 3 tentativas, links públicos com hash, lembretes, encerramento tácito, reatribuição/escalonamento, ciclo de Problemas, indicadores e auditoria de configuração.
- [x] Prévia — falha de carregamento corrigida (ajuste de compilação dos e-mails removido).

## Em andamento
- [ ] Envio de e-mails no app: modelos, envio imediato após ações e rotina agendada a cada 5 minutos.
- [ ] Sino de notificações internas.
- [ ] Página pública de contestação e ajustes da avaliação (novo prazo após reabertura).
- [ ] Registro: erros por campo, resumo, evidências no envio e confirmação ao cliente.
- [ ] Tratativa: compositor com pergunta/resposta, solução com evidências, improcedência em diálogo, causas 6M/8D, ações 5W2H com responsável, conclusão com evidência, reatribuir/escalar, recorrência e vínculo a Problema.
- [ ] Painel: 8 KPIs com variação, filtros na URL, paginação, exportação, Pareto e aging.
- [ ] Problemas: lista, detalhe, causas/ações, eficácia e reprovação automática.
- [ ] Contratos e SLA: calendários, feriados, políticas/metas, categorias e auditoria.
- [ ] Contas: contas, contatos, alocação de equipe, perfis e anonimização a pedido do titular.
- [ ] Relatório por conta com exportação.
- [ ] Testes automatizados das novas regras e verificação ponta a ponta no navegador.

## Bloqueios externos
- Envio real de e-mails aguarda a verificação DNS de notify.intralog.log.br.
- Links dos e-mails ao cliente precisam do endereço publicado do app (APP_BASE_URL) após a publicação.
- Retenção/anonimização automática de textos livres depende de política do Compliance (histórico é imutável).

## Decisões registradas
- Cópia ao KAM: enviada como e-mail separado, sem o link pessoal do cliente (o serviço envia um destinatário por mensagem).
- Contestação: link pessoal válido por 15 dias após o encerramento; uma contestação por análise.
- Nova ocorrência da mesma conta e categoria durante a verificação de eficácia vincula-se ao Problema e reprova a eficácia.
- Endereços fictícios (example.com, .test, .invalid) nunca recebem e-mail.

Elton autorizou seguir por todas as etapas sem aprovação intermediária; parar só para decisão crítica ou impedimento externo.
