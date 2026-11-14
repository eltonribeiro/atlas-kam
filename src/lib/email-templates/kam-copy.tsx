import * as React from 'react'
import { Button, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { AtlasEmail, buttonStyle, headingStyle, messageStyle, mutedStyle, textStyle } from './atlas-layout'

interface Props { protocol?: string; subject?: string; accountName?: string; contactName?: string; headline?: string; message?: string; hasLink?: boolean; appUrl?: string }

function KamCopyEmail({ protocol = '', subject = '', accountName = '', contactName = '', headline = '', message = '', hasLink = false, appUrl = '' }: Props) {
  return (
    <AtlasEmail preview={`Cópia: ${headline} · ${protocol}`} protocol={protocol} footerNote="Cópia interna para o KAM da conta. Não encaminhe ao cliente.">
      <Text style={headingStyle}>Cópia do e-mail enviado ao cliente</Text>
      <Text style={textStyle}>{accountName} · {contactName} recebeu “{headline}” sobre “{subject}”.</Text>
      {message ? <Text style={messageStyle}>{message}</Text> : null}
      {hasLink ? <Text style={mutedStyle}>O e-mail do cliente contém um link pessoal de resposta, que não é incluído nesta cópia.</Text> : null}
      {appUrl ? <Section style={{ margin: '8px 0 12px' }}><Button href={appUrl} style={buttonStyle}>Abrir a ocorrência</Button></Section> : null}
    </AtlasEmail>
  )
}

export const template = {
  component: KamCopyEmail,
  subject: (data: Record<string, any>) => `Cópia ao KAM · ${data['headline'] ?? 'mensagem ao cliente'} · ${data['protocol'] ?? ''}`,
  displayName: 'Cópia ao KAM',
  previewData: { protocol: 'OC-2026-0001', subject: 'Divergência de inventário no CD Sul', accountName: 'Aurora Varejo', contactName: 'Marina Souza', headline: 'Atualização da sua ocorrência', message: 'Concluímos a recontagem da rua 14.', hasLink: false, appUrl: 'https://example.com/ocorrencias/1' },
} satisfies TemplateEntry
