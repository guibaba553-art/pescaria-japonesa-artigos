import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'JAPAS Pesca'

interface NfeErrorProps {
  modelo?: string         // '55' ou '65'
  numero?: string | number
  status?: string         // 'error' | 'cancelled'
  errorMessage?: string
  emittedAt?: string
  orderId?: string
}

const labelModelo = (m?: string) => m === '65' ? 'NFC-e' : m === '55' ? 'NF-e' : 'Nota Fiscal'

const NfeErrorEmail = ({
  modelo, numero, status, errorMessage, emittedAt, orderId,
}: NfeErrorProps) => {
  const isCancel = status === 'cancelled'
  const titulo = isCancel
    ? `${labelModelo(modelo)} cancelada`
    : `Erro ao emitir ${labelModelo(modelo)}`
  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>{titulo}{numero ? ` nº ${numero}` : ''}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={brand}>{SITE_NAME}</Heading>
          </Section>
          <Section style={content}>
            <Heading style={h1}>{titulo}</Heading>
            {numero && (
              <Text style={text}><strong>Número:</strong> {numero}</Text>
            )}
            <Text style={text}><strong>Modelo:</strong> {labelModelo(modelo)} ({modelo})</Text>
            {emittedAt && (
              <Text style={text}><strong>Data:</strong> {emittedAt}</Text>
            )}
            {orderId && (
              <Text style={text}><strong>Pedido:</strong> #{orderId.slice(0, 8)}</Text>
            )}
            <Hr style={hr} />
            <Text style={errBox}>
              {errorMessage || (isCancel ? 'Nota cancelada.' : 'Sem detalhes informados pelo SEFAZ.')}
            </Text>
            {!isCancel && (
              <Text style={text}>
                Acesse o painel fiscal para revisar e tentar reemitir.
              </Text>
            )}
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: NfeErrorEmail,
  subject: (d: Record<string, any>) => {
    const isCancel = d.status === 'cancelled'
    const m = labelModelo(d.modelo)
    return isCancel
      ? `[${SITE_NAME}] ${m} ${d.numero ?? ''} cancelada`
      : `[${SITE_NAME}] Erro na ${m}${d.numero ? ` ${d.numero}` : ''}`
  },
  displayName: 'Aviso de erro/cancelamento de NF-e',
  previewData: {
    modelo: '65',
    numero: 424,
    status: 'error',
    errorMessage: 'Rejeicao: Ausencia de troco quando o valor dos pagamentos informados for maior que o total da nota',
    emittedAt: '06/05/2026 20:48',
    orderId: 'e7b63d28-1234-5678-9abc-000000000000',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '20px 25px', maxWidth: '560px' }
const header = { borderBottom: '2px solid #0ea5e9', paddingBottom: '12px', marginBottom: '20px' }
const brand = { fontSize: '20px', fontWeight: 'bold', color: '#0ea5e9', margin: 0 }
const content = { padding: '0' }
const h1 = { fontSize: '20px', fontWeight: 'bold', color: '#dc2626', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#374151', lineHeight: '1.6', margin: '0 0 8px' }
const hr = { borderColor: '#e5e7eb', margin: '16px 0' }
const errBox = {
  fontSize: '13px',
  color: '#991b1b',
  background: '#fef2f2',
  border: '1px solid #fecaca',
  borderRadius: '6px',
  padding: '12px',
  margin: '0 0 16px',
}
