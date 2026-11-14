import * as React from 'react'
import { Body, Container, Head, Hr, Html, Preview, Section, Text } from '@react-email/components'

export const emailColors = {
  ink: '#141820',
  muted: '#4A5361',
  line: '#D9DEE5',
  accent: '#1D4ED8',
  accentSoft: '#E6EDFC',
  surface: '#F4F6F8',
}

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif', color: emailColors.ink, margin: 0, padding: 0 }
const container = { maxWidth: '600px', margin: '0 auto', padding: '0 0 24px' }
const brandBar = { backgroundColor: emailColors.ink, padding: '18px 28px' }
const brand = { color: '#ffffff', fontSize: '15px', fontWeight: 600, letterSpacing: '0.5px', margin: 0 }
const content = { padding: '28px 28px 8px' }
const protocolStyle = { fontFamily: '"Courier New", Courier, monospace', fontSize: '12px', color: emailColors.muted, margin: '0 0 6px' }
const footer = { fontSize: '11px', lineHeight: '18px', color: emailColors.muted, padding: '0 28px', margin: '0' }

export function AtlasEmail({ preview, protocol, children, footerNote }: { preview: string; protocol?: string; children: React.ReactNode; footerNote?: string }) {
  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={brandBar}><Text style={brand}>ATLAS · Key Account Manager</Text></Section>
          <Section style={content}>
            {protocol ? <Text style={protocolStyle}>{protocol}</Text> : null}
            {children}
          </Section>
          <Hr style={{ borderColor: emailColors.line, margin: '20px 28px' }} />
          <Text style={footer}>{footerNote ?? 'Mensagem automática do Atlas KAM sobre a sua ocorrência. Para falar com a equipe, responda a este e-mail.'}</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const headingStyle = { fontSize: '22px', lineHeight: '30px', fontWeight: 600, margin: '0 0 16px', color: emailColors.ink }
export const textStyle = { fontSize: '14px', lineHeight: '22px', margin: '0 0 14px', color: emailColors.ink }
export const mutedStyle = { fontSize: '13px', lineHeight: '20px', margin: '0 0 12px', color: emailColors.muted }
export const messageStyle = { fontSize: '14px', lineHeight: '22px', margin: '0 0 16px', whiteSpace: 'pre-wrap' as const, color: emailColors.ink, borderLeft: `3px solid ${emailColors.line}`, padding: '4px 0 4px 14px' }
export const panelStyle = { backgroundColor: emailColors.accentSoft, borderRadius: '4px', padding: '14px 16px', margin: '0 0 16px' }
export const panelLabel = { fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.6px', color: emailColors.muted, margin: '0 0 6px' }
export const panelText = { fontSize: '14px', lineHeight: '22px', margin: 0, whiteSpace: 'pre-wrap' as const, color: emailColors.ink }
export const buttonStyle = { backgroundColor: emailColors.accent, color: '#ffffff', fontSize: '14px', fontWeight: 600, padding: '12px 22px', borderRadius: '4px', textDecoration: 'none', display: 'inline-block' }

export function greeting(name?: string) {
  const first = typeof name === 'string' ? name.trim().split(/\s+/)[0] : ''
  return first ? `Olá, ${first}.` : 'Olá.'
}
