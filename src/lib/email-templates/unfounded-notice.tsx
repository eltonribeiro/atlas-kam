import * as React from 'react'
import { Button, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { AtlasEmail, buttonStyle, greeting, headingStyle, messageStyle, mutedStyle, textStyle } from './atlas-layout'

interface Props { protocol?: string; subject?: string; contactName?: string; message?: string; url?: string }

function UnfoundedNoticeEmail({ protocol = '', subject = '', contactName, message = '', url = '' }: Props) {
  return (
    <AtlasEmail preview={`Resultado da análise da ocorrência ${protocol}`} protocol={protocol} footerNote="O link de contestação é pessoal e vale por 15 dias após o encerramento.">
      <Text style={headingStyle}>Análise da sua ocorrência concluída</Text>
      <Text style={textStyle}>{greeting(contactName)} Analisamos “{subject}” e não identificamos falha no serviço prestado. Veja a justificativa:</Text>
      <Text style={messageStyle}>{message}</Text>
      <Text style={textStyle}>Se não concordar, você pode contestar. A contestação é analisada pelo gestor da sua conta.</Text>
      <Section style={{ margin: '8px 0 20px' }}><Button href={url} style={buttonStyle}>Contestar a análise</Button></Section>
      <Text style={mutedStyle}>Também é possível responder a este e-mail com novas informações.</Text>
    </AtlasEmail>
  )
}

export const template = {
  component: UnfoundedNoticeEmail,
  subject: (data: Record<string, any>) => `Resultado da análise · ocorrência ${data['protocol'] ?? ''}`,
  displayName: 'Improcedência com contestação',
  previewData: { protocol: 'OC-2026-0001', subject: 'Atraso de expedição', contactName: 'Marina Souza', message: 'A carga foi expedida no horário acordado; o atraso ocorreu na transportadora contratada pelo cliente.', url: 'https://example.com/contestacao/token' },
} satisfies TemplateEntry
