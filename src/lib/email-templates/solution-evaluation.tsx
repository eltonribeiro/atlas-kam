import * as React from 'react'
import { Button, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { AtlasEmail, buttonStyle, greeting, headingStyle, mutedStyle, panelLabel, panelStyle, panelText, textStyle } from './atlas-layout'

interface Props { protocol?: string; subject?: string; contactName?: string; message?: string; expectation?: string; url?: string }

function SolutionEvaluationEmail({ protocol = '', subject = '', contactName, message = '', expectation = '', url = '' }: Props) {
  return (
    <AtlasEmail preview={`Solução da ocorrência ${protocol}: conte se resolveu`} protocol={protocol} footerNote="O link de avaliação é pessoal, vale por 15 dias e permite reabrir a ocorrência se o problema voltar. Não encaminhe este e-mail.">
      <Text style={headingStyle}>Solução da sua ocorrência</Text>
      <Text style={textStyle}>{greeting(contactName)} Concluímos o tratamento de “{subject}”.</Text>
      {expectation ? <div style={{ ...panelStyle, backgroundColor: '#F4F6F8' }}><Text style={panelLabel}>Você pediu</Text><Text style={panelText}>{expectation}</Text></div> : null}
      <div style={panelStyle}><Text style={panelLabel}>Solução entregue</Text><Text style={panelText}>{message}</Text></div>
      <Text style={textStyle}>O seu problema foi resolvido? A avaliação leva menos de 1 minuto e vai direto para o gestor da sua conta.</Text>
      <Section style={{ margin: '8px 0 20px' }}><Button href={url} style={buttonStyle}>Avaliar a solução</Button></Section>
      <Text style={mutedStyle}>Se algo ainda faltar, responda “Em parte” ou “Não” na avaliação e a ocorrência será reaberta.</Text>
    </AtlasEmail>
  )
}

export const template = {
  component: SolutionEvaluationEmail,
  subject: (data: Record<string, any>) => `Solução da ocorrência ${data['protocol'] ?? ''} · avalie o atendimento`,
  displayName: 'Solução e avaliação',
  previewData: { protocol: 'OC-2026-0001', subject: 'Divergência de inventário no CD Sul', contactName: 'Marina Souza', expectation: 'Corrigir o saldo e evitar nova divergência.', message: 'Corrigimos o saldo dos lotes e incluímos dupla conferência na rua 14.', url: 'https://example.com/avaliacao/token' },
} satisfies TemplateEntry
