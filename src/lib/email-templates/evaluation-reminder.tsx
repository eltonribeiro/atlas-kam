import * as React from 'react'
import { Button, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { AtlasEmail, buttonStyle, greeting, headingStyle, mutedStyle, panelLabel, panelStyle, panelText, textStyle } from './atlas-layout'

interface Props { protocol?: string; subject?: string; contactName?: string; message?: string; url?: string; reminder?: number }

function EvaluationReminderEmail({ protocol = '', subject = '', contactName, message = '', url = '', reminder = 1 }: Props) {
  return (
    <AtlasEmail preview={`Lembrete: a solução de ${protocol} resolveu?`} protocol={protocol} footerNote="O link de avaliação é pessoal. Sem resposta em 5 dias úteis, a ocorrência é encerrada sem avaliação, e você ainda poderá reabri-la por 15 dias.">
      <Text style={headingStyle}>{reminder >= 2 ? 'Último lembrete: avalie a solução' : 'Lembrete: avalie a solução'}</Text>
      <Text style={textStyle}>{greeting(contactName)} Ainda não recebemos a sua avaliação sobre “{subject}”.</Text>
      <div style={panelStyle}><Text style={panelLabel}>Solução entregue</Text><Text style={panelText}>{message}</Text></div>
      <Section style={{ margin: '8px 0 20px' }}><Button href={url} style={buttonStyle}>Avaliar a solução</Button></Section>
      <Text style={mutedStyle}>Leva menos de 1 minuto.</Text>
    </AtlasEmail>
  )
}

export const template = {
  component: EvaluationReminderEmail,
  subject: (data: Record<string, any>) => `Lembrete · avalie a solução da ocorrência ${data['protocol'] ?? ''}`,
  displayName: 'Lembrete de avaliação',
  previewData: { protocol: 'OC-2026-0001', subject: 'Divergência de inventário no CD Sul', contactName: 'Marina Souza', message: 'Corrigimos o saldo dos lotes e incluímos dupla conferência na rua 14.', url: 'https://example.com/avaliacao/token', reminder: 1 },
} satisfies TemplateEntry
