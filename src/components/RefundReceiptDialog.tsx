import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, ExternalLink } from 'lucide-react';
import jsPDF from 'jspdf';

interface RefundReceiptData {
  orderId: string;
  amount: number;
  date: string;
  paymentMethod: string;
  gatewayRefundId: string;
  reason: string;
  status: string;
  transactionReceiptUrl?: string;
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

export function generateRefundPdf(data: RefundReceiptData) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  doc.setFontSize(18);
  doc.setTextColor(0, 128, 0);
  doc.text('Comprovante de Reembolso', pageWidth / 2, y, { align: 'center' });

  y += 10;
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text('JapasPesca', pageWidth / 2, y, { align: 'center' });

  y += 12;
  doc.setDrawColor(220, 220, 220);
  doc.line(15, y, pageWidth - 15, y);

  y += 10;
  doc.setFontSize(11);
  doc.setTextColor(60, 60, 60);

  const rows: [string, string][] = [
    ['Pedido', `#${data.orderId.slice(0, 8).toUpperCase()}`],
    ['Valor reembolsado', formatBRL(data.amount)],
    ['Data do reembolso', formatDate(data.date)],
    ['Método de pagamento', paymentMethodLabels[data.paymentMethod] || data.paymentMethod],
    ['ID da transação', data.gatewayRefundId],
    ['Motivo', data.reason || '\u2014'],
    ['Status', data.status === 'approved' ? 'Aprovado' : data.status === 'pending' ? 'Pendente' : data.status],
  ];

  doc.setFontSize(11);
  for (const [label, value] of rows) {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, 20, y);
    doc.setFont('helvetica', 'normal');
    doc.text(value, 80, y);
    y += 8;
  }

  y += 10;
  doc.setDrawColor(220, 220, 220);
  doc.line(15, y, pageWidth - 15, y);

  y += 8;
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(`Emitido em ${new Date().toLocaleDateString('pt-BR')}`, pageWidth / 2, y, { align: 'center' });

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
