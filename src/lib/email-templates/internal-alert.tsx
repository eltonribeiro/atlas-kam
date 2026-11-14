import * as React from 'react'
import { Button, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { AtlasEmail, buttonStyle, headingStyle, messageStyle } from './atlas-layout'

interface Props { title?: string; body?: string; appUrl?: string }

function InternalAlertEmail({ title = '', body = '', appUrl = '' }: Props) {
  return (
    <AtlasEmail preview={title} footerNote="Alerta interno do Atlas KAM enviado conforme a régua de escalonamento da sua conta.">
      <Text style={headingStyle}>{title}</Text>
      {body ? <Text style={messageStyle}>{body}</Text> : null}
      {appUrl ? <Section style={{ margin: '8px 0 12px' }}><Button href={appUrl} style={buttonStyle}>Abrir no Atlas KAM</Button></Section> : null}
    </AtlasEmail>
  )
}

export const template = {
  component: InternalAlertEmail,
  subject: (data: Record<string, any>) => `Atlas KAM · ${data['title'] ?? 'Alerta'}`,
  displayName: 'Alerta interno',
  previewData: { title: 'SLA em risco · OC-2026-0001', body: 'Aurora Varejo · Divergência de inventário. Prazo de solução vence em 18/11/2026 às 15:22.', appUrl: 'https://example.com/ocorrencias/1' },
} satisfies TemplateEntry
