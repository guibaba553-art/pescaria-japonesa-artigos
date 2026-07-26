import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, ExternalLink } from 'lucide-react';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';

interface RefundReceiptData {
  orderId: string;
  amount: number;
  date: string;
  paymentMethod: string;
  gatewayRefundId: string;
  reason: string;
  status: string;
  transactionReceiptUrl?: string;
  customerName?: string;
  customerCpf?: string;
}

interface RefundReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: RefundReceiptData;
}

const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const paymentMethodLabels: Record<string, string> = {
  credit_card: 'Cartão de Crédito',
  debit_card: 'Cartão de Débito',
  pix: 'PIX',
  boleto: 'Boleto',
};

const COMPANY = {
  name: 'JapasPesca',
  legalName: 'JapasPesca Comércio de Alimentos Ltda',
  cnpj: '00.000.000/0001-00',
  address: 'Rua Exemplo, 123 — Bairro — Cidade/SP — CEP 00000-000',
  email: 'sac@japaspesca.com.br',
  phone: '(11) 0000-0000',
};

function maskCpf(cpf: string): string {
  if (!cpf || cpf.length < 11) return cpf || '—';
  return `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`;
}

export async function generateRefundPdf(data: RefundReceiptData) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = 18;

  doc.setFontSize(20);
  doc.setTextColor(0, 128, 0);
  doc.setFont('helvetica', 'bold');
  doc.text('COMPROVANTE DE REEMBOLSO', pageWidth / 2, y, { align: 'center' });

  y += 8;
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'normal');
  doc.text(`Nº ${data.orderId.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`, pageWidth / 2, y, { align: 'center' });

  y += 4;
  doc.text(`Emitido em ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, pageWidth / 2, y, { align: 'center' });

  y += 10;
  doc.setDrawColor(0, 128, 0);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);

  y += 10;
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text('DADOS DO EMITENTE', margin, y);

  y += 7;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  doc.text(`${COMPANY.legalName}`, margin, y);
  y += 4;
  doc.text(`CNPJ: ${COMPANY.cnpj}`, margin, y);
  y += 4;
  doc.text(`${COMPANY.address}`, margin, y);
  y += 4;
  doc.text(`E-mail: ${COMPANY.email}  |  Tel: ${COMPANY.phone}`, margin, y);

  y += 9;
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text('DADOS DO CLIENTE', margin, y);

  y += 7;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  doc.text(`Nome: ${data.customerName || '—'}`, margin, y);
  y += 4;
  doc.text(`CPF: ${maskCpf(data.customerCpf || '')}`, margin, y);

  y += 9;
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text('DADOS DO REEMBOLSO', margin, y);

  y += 7;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);

  const rows: [string, string][] = [
    ['Pedido', `#${data.orderId.slice(0, 8).toUpperCase()}`],
    ['Valor reembolsado', formatBRL(data.amount)],
    ['Data do reembolso', formatDate(data.date)],
    ['Método de pagamento', paymentMethodLabels[data.paymentMethod] || data.paymentMethod],
    ['ID da transação', data.gatewayRefundId],
    ['Motivo', data.reason || '—'],
    ['Status', data.status === 'approved' ? 'Aprovado' : data.status === 'pending' ? 'Pendente' : data.status],
  ];

  const col1X = margin;
  const col2X = margin + 55;

  for (const [label, value] of rows) {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, col1X, y);
    doc.setFont('helvetica', 'normal');
    doc.text(value, col2X, y);
    y += 5;
  }

  y += 6;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageWidth - margin, y);

  y += 6;
  const receiptId = `${data.orderId.slice(0, 8)}-${Date.now().toString(36).toUpperCase()}`;
  const verifyUrl = `https://japaspesca.com.br/verificar-reembolso/${receiptId}`;

  try {
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 120, margin: 1 });
    doc.addImage(qrDataUrl, 'PNG', margin, y, 25, 25);
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'normal');
    doc.text('Escaneie para verificar a autenticidade', margin + 28, y + 8);
    doc.text('deste comprovante em nosso site.', margin + 28, y + 13);
  } catch (_) {
  }

  y += 30;
  doc.setDrawColor(0, 128, 0);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);

  y += 6;
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.setFont('helvetica', 'normal');
  doc.text('Este documento é um comprovante oficial de reembolso emitido por JapasPesca.', pageWidth / 2, y, { align: 'center' });
  y += 4;
  doc.text('Em caso de dúvidas, entre em contato: sac@japaspesca.com.br | (11) 0000-0000', pageWidth / 2, y, { align: 'center' });
  y += 4;
  doc.text(`Verifique a autenticidade em: ${verifyUrl}`, pageWidth / 2, y, { align: 'center' });

  doc.save(`comprovante-reembolso-${data.orderId.slice(0, 8)}.pdf`);
}

export function RefundReceiptDialog({ open, onOpenChange, data }: RefundReceiptDialogProps) {
  const handleDownload = () => generateRefundPdf(data);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Comprovante de Reembolso</DialogTitle>
          <DialogDescription>
            Detalhes do estorno realizado para o seu pedido.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            {[
              ['Pedido', `#${data.orderId.slice(0, 8).toUpperCase()}`],
              ...(data.customerName ? [['Cliente', data.customerName] as [string, string]] : []),
              ['Valor reembolsado', formatBRL(data.amount)],
              ['Data', formatDate(data.date)],
              ['Método de pagamento', paymentMethodLabels[data.paymentMethod] || data.paymentMethod],
              ['ID da transação', data.gatewayRefundId],
              ['Motivo', data.reason || '\u2014'],
              ['Status', data.status === 'approved' ? 'Aprovado' : data.status === 'pending' ? 'Pendente' : data.status],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between items-start">
                <span className="text-sm text-muted-foreground">{label}</span>
                <span className="text-sm font-medium text-right max-w-[60%] break-all">{value}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Button onClick={handleDownload} className="w-full">
              <Download className="w-4 h-4 mr-2" />
              Baixar PDF
            </Button>
            {data.transactionReceiptUrl && (
              <a
                href={data.transactionReceiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground text-center flex items-center justify-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                Visualizar no site da operadora de pagamento
              </a>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
