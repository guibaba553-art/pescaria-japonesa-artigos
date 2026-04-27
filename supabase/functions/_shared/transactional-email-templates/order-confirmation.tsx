import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'JAPAS Pesca'

interface OrderConfirmationProps {
  customerName?: string
  orderNumber?: string
  totalAmount?: string
  paymentMethod?: string
  shippingAddress?: string
  deliveryType?: string
  trackingUrl?: string
  nfeUrl?: string
  nfeNumber?: string
}

const OrderConfirmationEmail = ({
  customerName,
  orderNumber,
  totalAmount,
  paymentMethod,
  shippingAddress,
  deliveryType,
  trackingUrl,
  nfeUrl,
  nfeNumber,
}: OrderConfirmationProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>
      Pagamento confirmado{orderNumber ? ` — pedido #${orderNumber}` : ''}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={brand}>{SITE_NAME}</Heading>
        </Section>

        <Section style={content}>
          <Heading style={h1}>
            {customerName ? `Obrigado, ${customerName}!` : 'Obrigado pela compra!'}
          </Heading>

          <Text style={text}>
            Seu pagamento foi <strong>confirmado</strong> e seu pedido já entrou em
            preparação. Em breve você receberá novidades sobre o envio.
          </Text>

          <Section style={card}>
            {orderNumber && (
              <Text style={cardLine}>
                <strong>Pedido:</strong> #{orderNumber}
              </Text>
            )}
            {totalAmount && (
              <Text style={cardLine}>
                <strong>Valor total:</strong> {totalAmount}
              </Text>
            )}
            {paymentMethod && (
              <Text style={cardLine}>
                <strong>Pagamento:</strong> {paymentMethod}
              </Text>
            )}
            {deliveryType && (
              <Text style={cardLine}>
                <strong>Entrega:</strong> {deliveryType}
              </Text>
            )}
            {shippingAddress && deliveryType !== 'Retirada na loja' && (
              <Text style={cardLine}>
                <strong>Endereço:</strong> {shippingAddress}
              </Text>
            )}
            <Text style={cardLine}>
              <strong>Status:</strong>{' '}
              <span style={statusBadge}>Pagamento aprovado</span>
            </Text>
          </Section>

          {nfeUrl && (
            <Section style={nfeBox}>
              <Text style={nfeTitle}>📄 Sua Nota Fiscal está pronta</Text>
              <Text style={nfeSubtitle}>
                {nfeNumber
                  ? `NF-e nº ${nfeNumber}`
                  : 'Clique no botão abaixo para baixar.'}
              </Text>
              <Button style={buttonPrimary} href={nfeUrl}>
                Baixar Nota Fiscal
              </Button>
            </Section>
          )}

          {!nfeUrl && (
            <Text style={textMuted}>
              📄 A nota fiscal será enviada assim que estiver disponível.
            </Text>
          )}

          {trackingUrl && (
            <Section style={trackingBox}>
              <Text style={text}>Acompanhe seu pedido em tempo real:</Text>
              <Button style={buttonSecondary} href={trackingUrl}>
                Acompanhar pedido
              </Button>
            </Section>
          )}

          <Hr style={divider} />

          <Text style={footerText}>
            Qualquer dúvida, fale com a gente pelo WhatsApp{' '}
            <strong>(66) 99211-1712</strong>.
          </Text>

          <Text style={signature}>
            Boas pescarias!
            <br />
            Equipe {SITE_NAME}
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: OrderConfirmationEmail,
  subject: (data: Record<string, any>) =>
    data?.orderNumber
      ? `Pagamento confirmado — pedido #${data.orderNumber}`
      : 'Seu pagamento foi confirmado',
  displayName: 'Confirmação de pedido',
  previewData: {
    customerName: 'João',
    orderNumber: 'ABC123',
    totalAmount: 'R$ 250,00',
    paymentMethod: 'PIX',
    deliveryType: 'Entrega',
    shippingAddress: 'Av. das Itaúbas, 2281 — Sinop/MT',
    trackingUrl: 'https://japaspesca.com.br/conta',
    nfeUrl: 'https://example.com/nfe.pdf',
    nfeNumber: '12345',
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
}
const container = { maxWidth: '560px', margin: '0 auto', padding: '0' }
const header = { padding: '32px 32px 0', textAlign: 'center' as const }
const brand = {
  fontSize: '24px',
  fontWeight: '700',
  color: '#ff5a1f',
  letterSpacing: '-0.02em',
  margin: '0',
}
const content = { padding: '24px 32px 32px' }
const h1 = {
  fontSize: '22px',
  fontWeight: '600',
  color: '#1d2229',
  margin: '0 0 20px',
  letterSpacing: '-0.01em',
}
const text = { fontSize: '15px', lineHeight: '1.6', color: '#4a5260', margin: '0 0 16px' }
const textMuted = { fontSize: '14px', color: '#6b7280', margin: '20px 0', fontStyle: 'italic' as const }
const card = {
  backgroundColor: '#fafbfc',
  border: '1px solid #eef0f3',
  borderRadius: '12px',
  padding: '20px',
  margin: '24px 0',
}
const cardLine = { fontSize: '14px', color: '#1d2229', margin: '6px 0', lineHeight: '1.5' }
const statusBadge = {
  display: 'inline-block',
  backgroundColor: '#dcfce7',
  color: '#15803d',
  padding: '2px 10px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: '600',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.04em',
}
const nfeBox = {
  backgroundColor: '#fff7ed',
  border: '1px solid #fed7aa',
  borderRadius: '12px',
  padding: '20px',
  margin: '24px 0',
  textAlign: 'center' as const,
}
const nfeTitle = { fontSize: '16px', fontWeight: '600', color: '#9a3412', margin: '0 0 4px' }
const nfeSubtitle = { fontSize: '13px', color: '#9a3412', margin: '0 0 14px' }
const trackingBox = { textAlign: 'center' as const, margin: '24px 0' }
const buttonPrimary = {
  backgroundColor: '#ff5a1f',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: '600',
  textDecoration: 'none',
  padding: '12px 24px',
  borderRadius: '8px',
  display: 'inline-block',
}
const buttonSecondary = {
  backgroundColor: '#1d2229',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: '600',
  textDecoration: 'none',
  padding: '12px 24px',
  borderRadius: '8px',
  display: 'inline-block',
}
const divider = { borderColor: '#eef0f3', margin: '28px 0 20px' }
const footerText = { fontSize: '13px', color: '#6b7280', lineHeight: '1.5', margin: '0 0 20px' }
const signature = { fontSize: '14px', color: '#1d2229', margin: '0', lineHeight: '1.5' }
