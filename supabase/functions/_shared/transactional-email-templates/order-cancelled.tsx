import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'JAPAS Pesca'

interface OrderCancelledProps {
  customerName?: string
  orderNumber?: string
  totalAmount?: string
  paymentMethod?: string
}

const OrderCancelledEmail = ({
  customerName,
  orderNumber,
  totalAmount,
  paymentMethod,
}: OrderCancelledProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>
      Seu pedido {orderNumber ? `#${orderNumber}` : ''} foi cancelado por falta de pagamento
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={brand}>{SITE_NAME}</Heading>
        </Section>

        <Section style={content}>
          <Heading style={h1}>
            {customerName ? `Olá, ${customerName}` : 'Olá'}
          </Heading>

          <Text style={text}>
            Infelizmente, seu pedido foi <strong>cancelado automaticamente</strong>{' '}
            porque o pagamento não foi confirmado dentro do prazo de 24 horas.
          </Text>

          <Section style={card}>
            {orderNumber && (
              <Text style={cardLine}>
                <strong>Pedido:</strong> #{orderNumber}
              </Text>
            )}
            {totalAmount && (
              <Text style={cardLine}>
                <strong>Valor:</strong> {totalAmount}
              </Text>
            )}
            {paymentMethod && (
              <Text style={cardLine}>
                <strong>Forma de pagamento:</strong> {paymentMethod}
              </Text>
            )}
            <Text style={cardLine}>
              <strong>Status:</strong>{' '}
              <span style={statusBadge}>Cancelado</span>
            </Text>
          </Section>

          <Text style={text}>
            Os itens foram devolvidos ao estoque e ficaram disponíveis para outros
            clientes. Se você ainda tem interesse nos produtos, basta acessar nosso
            site e fazer um novo pedido.
          </Text>

          <Text style={text}>
            <strong>Por que isso aconteceu?</strong>
          </Text>
          <Text style={text}>
            • O PIX não foi pago dentro do prazo
            <br />• O pagamento por cartão foi recusado pelo banco ou pelo sistema
            antifraude
            <br />• Não houve confirmação do pagamento pelo Mercado Pago
          </Text>

          <Hr style={divider} />

          <Text style={footerText}>
            Se você tem certeza de que efetuou o pagamento, entre em contato conosco
            pelo WhatsApp para verificarmos.
          </Text>

          <Text style={signature}>
            Atenciosamente,
            <br />
            Equipe {SITE_NAME}
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: OrderCancelledEmail,
  subject: (data: Record<string, any>) =>
    data?.orderNumber
      ? `Pedido #${data.orderNumber} cancelado por falta de pagamento`
      : 'Seu pedido foi cancelado por falta de pagamento',
  displayName: 'Pedido cancelado',
  previewData: {
    customerName: 'João',
    orderNumber: 'ABC123',
    totalAmount: 'R$ 250,00',
    paymentMethod: 'Cartão de crédito',
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
}

const container = {
  maxWidth: '560px',
  margin: '0 auto',
  padding: '0',
}

const header = {
  padding: '32px 32px 0',
  textAlign: 'center' as const,
}

const brand = {
  fontSize: '24px',
  fontWeight: '700',
  color: '#ff5a1f',
  letterSpacing: '-0.02em',
  margin: '0',
}

const content = {
  padding: '24px 32px 32px',
}

const h1 = {
  fontSize: '22px',
  fontWeight: '600',
  color: '#1d2229',
  margin: '0 0 20px',
  letterSpacing: '-0.01em',
}

const text = {
  fontSize: '15px',
  lineHeight: '1.6',
  color: '#4a5260',
  margin: '0 0 16px',
}

const card = {
  backgroundColor: '#fafbfc',
  border: '1px solid #eef0f3',
  borderRadius: '12px',
  padding: '20px',
  margin: '24px 0',
}

const cardLine = {
  fontSize: '14px',
  color: '#1d2229',
  margin: '6px 0',
  lineHeight: '1.5',
}

const statusBadge = {
  display: 'inline-block',
  backgroundColor: '#fee2e2',
  color: '#b91c1c',
  padding: '2px 10px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: '600',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.04em',
}

const divider = {
  borderColor: '#eef0f3',
  margin: '28px 0 20px',
}

const footerText = {
  fontSize: '13px',
  color: '#6b7280',
  lineHeight: '1.5',
  margin: '0 0 20px',
}

const signature = {
  fontSize: '14px',
  color: '#1d2229',
  margin: '0',
  lineHeight: '1.5',
}
