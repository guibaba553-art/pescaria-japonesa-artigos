import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, ExternalLink } from 'lucide-react';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import japaLogo from '@/assets/japa-logo.png';

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
  logoUrl?: string;
  company?: {
    legalName?: string;
    cnpj?: string;
    address?: string;
    email?: string;
    phone?: string;
    tradeName?: string;
    logoUrl?: string;
  };
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

function maskCpf(cpf: string): string {
  if (!cpf || cpf.length < 11) return cpf || '—';
  return `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`;
}

async function loadImageAsDataUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export async function generateRefundPdf(data: RefundReceiptData) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let y = 15;

  const logoUrl = data.company?.logoUrl || data.logoUrl || japaLogo;
  if (logoUrl) {
    try {
      const logoImg = await loadImageAsDataUrl(logoUrl);
      doc.addImage(logoImg, 'PNG', margin, y, 30, 15);
      y += 20;
    } catch (_) {
      y += 2;
    }
  }

  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  const displayName = data.company?.tradeName || data.company?.legalName || 'JapasPesca';
  doc.text(displayName, pageWidth / 2, y, { align: 'center' });

  y += 7;
  doc.setFontSize(11);
  doc.setTextColor(80, 80, 80);
  doc.setFont('helvetica', 'normal');
  doc.text('COMPROVANTE DE REEMBOLSO', pageWidth / 2, y, { align: 'center' });

  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  const receiptNumber = `Nº ${data.orderId.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
  doc.text(receiptNumber, pageWidth / 2, y, { align: 'center' });

  y += 4;
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(`Emitido em ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, pageWidth / 2, y, { align: 'center' });

  y += 8;
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);

  y += 8;
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text('DADOS DO EMITENTE', margin, y);

  y += 6;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text(`${data.company?.legalName || '—'}`, margin, y);
  y += 4;
  doc.text(`CNPJ: ${data.company?.cnpj || '—'}`, margin, y);
  y += 4;
  doc.text(`${data.company?.address || '—'}`, margin, y);
  y += 4;
  doc.text(`E-mail: ${data.company?.email || '—'}  |  Tel: ${data.company?.phone || '—'}`, margin, y);

  y += 8;
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text('DADOS DO CLIENTE', margin, y);

  y += 6;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Nome: ${data.customerName || '—'}`, margin, y);
  y += 4;
  doc.text(`CPF: ${maskCpf(data.customerCpf || '')}`, margin, y);

  y += 8;
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text('DADOS DO REEMBOLSO', margin, y);

  y += 6;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');

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
    doc.setTextColor(0, 0, 0);
    doc.text(`${label}:`, col1X, y);
    doc.setFont('helvetica', 'normal');
    doc.text(value, col2X, y);
    y += 5;
  }

  y += 6;
  doc.setDrawColor(100, 100, 100);
  doc.line(margin, y, pageWidth - margin, y);

  y += 6;
  const receiptId = `${data.orderId.slice(0, 8)}-${Date.now().toString(36).toUpperCase()}`;
  const verifyUrl = `https://japaspesca.com.br/verificar-reembolso/${receiptId}`;

  try {
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 120, margin: 1 });
    doc.addImage(qrDataUrl, 'PNG', margin, y, 25, 25);
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.setFont('helvetica', 'normal');
    doc.text('Escaneie para verificar a autenticidade', margin + 28, y + 8);
    doc.text('deste comprovante em nosso site.', margin + 28, y + 13);
  } catch (_) {
  }

  y += 30;
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);

  y += 6;
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'normal');
  doc.text('Este documento é um comprovante oficial de reembolso emitido por JapasPesca.', pageWidth / 2, y, { align: 'center' });
  y += 4;
  const contactLine = [data.company?.email, data.company?.phone].filter(Boolean).join(' | ');
  if (contactLine) doc.text(`Em caso de dúvidas: ${contactLine}`, pageWidth / 2, y, { align: 'center' });
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
