import * as React from 'react'
import { Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { AtlasEmail, greeting, headingStyle, mutedStyle, panelLabel, panelStyle, panelText, textStyle } from './atlas-layout'

interface Props { protocol?: string; subject?: string; contactName?: string; severityLabel?: string; firstResponseDue?: string }

function OccurrenceRegisteredEmail({ protocol = '', subject = '', contactName, severityLabel = '', firstResponseDue = '' }: Props) {
  return (
    <AtlasEmail preview={`Ocorrência ${protocol} registrada`} protocol={protocol}>
      <Text style={headingStyle}>Recebemos a sua ocorrência</Text>
      <Text style={textStyle}>{greeting(contactName)} Registramos o seu relato e a equipe responsável já foi acionada.</Text>
      <div style={panelStyle}>
        <Text style={panelLabel}>Assunto</Text>
        <Text style={{ ...panelText, marginBottom: '12px' }}>{subject}</Text>
        <Text style={panelLabel}>Severidade</Text>
        <Text style={{ ...panelText, marginBottom: '12px' }}>{severityLabel}</Text>
        <Text style={panelLabel}>Primeira resposta até</Text>
        <Text style={panelText}>{firstResponseDue}</Text>
      </div>
      <Text style={mutedStyle}>Guarde o protocolo {protocol} para acompanhar o atendimento. Os prazos consideram o horário útil do seu contrato.</Text>
    </AtlasEmail>
  )
}

export const template = {
  component: OccurrenceRegisteredEmail,
  subject: (data: Record<string, any>) => `Ocorrência ${data['protocol'] ?? ''} registrada`,
  displayName: 'Ocorrência registrada',
  previewData: { protocol: 'OC-2026-0001', subject: 'Divergência de inventário no CD Sul', contactName: 'Marina Souza', severityLabel: 'S2 · Alta', firstResponseDue: '16/11/2026 às 12:00' },
} satisfies TemplateEntry
