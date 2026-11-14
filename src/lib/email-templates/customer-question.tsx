import * as React from 'react'
import { Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { AtlasEmail, greeting, headingStyle, messageStyle, mutedStyle, textStyle } from './atlas-layout'

interface Props { protocol?: string; subject?: string; contactName?: string; message?: string }

function CustomerQuestionEmail({ protocol = '', subject = '', contactName, message = '' }: Props) {
  return (
    <AtlasEmail preview={`Precisamos de uma informação sobre ${protocol}`} protocol={protocol}>
      <Text style={headingStyle}>Precisamos de uma informação</Text>
      <Text style={textStyle}>{greeting(contactName)} Para continuar o tratamento de “{subject}”, precisamos da sua resposta:</Text>
      <Text style={messageStyle}>{message}</Text>
      <Text style={textStyle}>Responda a este e-mail com as informações. O prazo de solução fica pausado até recebermos o seu retorno.</Text>
      <Text style={mutedStyle}>Informe o protocolo {protocol} se responder por outro canal.</Text>
    </AtlasEmail>
  )
}

export const template = {
  component: CustomerQuestionEmail,
  subject: (data: Record<string, any>) => `Informação necessária · ocorrência ${data['protocol'] ?? ''}`,
  displayName: 'Pergunta ao cliente',
  previewData: { protocol: 'OC-2026-0001', subject: 'Divergência de inventário no CD Sul', contactName: 'Marina Souza', message: 'Poderia confirmar os números das notas fiscais recebidas em 12/11?' },
} satisfies TemplateEntry
