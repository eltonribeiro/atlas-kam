import * as React from 'react'
import { Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { AtlasEmail, greeting, headingStyle, messageStyle, mutedStyle, textStyle } from './atlas-layout'

interface Props { protocol?: string; subject?: string; contactName?: string; message?: string }

function CustomerUpdateEmail({ protocol = '', subject = '', contactName, message = '' }: Props) {
  return (
    <AtlasEmail preview={`Atualização da ocorrência ${protocol}`} protocol={protocol}>
      <Text style={headingStyle}>Atualização da sua ocorrência</Text>
      <Text style={textStyle}>{greeting(contactName)} Temos uma atualização sobre “{subject}”.</Text>
      <Text style={messageStyle}>{message}</Text>
      <Text style={mutedStyle}>Seguimos acompanhando e avisaremos sobre os próximos passos.</Text>
    </AtlasEmail>
  )
}

export const template = {
  component: CustomerUpdateEmail,
  subject: (data: Record<string, any>) => `Atualização da ocorrência ${data['protocol'] ?? ''}`,
  displayName: 'Atualização ao cliente',
  previewData: { protocol: 'OC-2026-0001', subject: 'Divergência de inventário no CD Sul', contactName: 'Marina Souza', message: 'Concluímos a recontagem da rua 14 e isolamos os lotes afetados.' },
} satisfies TemplateEntry
