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

## Aguardando algo externo
- Integração SIGA (skill siga-integracao): aguarda confirmação do ambiente, pré-requisitos Entra/BFF/PAP/SIGA e valores públicos da configuração; não alterar papéis existentes nem ativar observe/enforce antes das confirmações exigidas.
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
