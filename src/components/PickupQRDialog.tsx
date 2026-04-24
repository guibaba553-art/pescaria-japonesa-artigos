import { QRCodeSVG } from "qrcode.react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Printer, Store } from "lucide-react";

interface PickupQRDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  shortId?: string;
}

export function PickupQRDialog({ open, onOpenChange, orderId, shortId }: PickupQRDialogProps) {
  const url = `${window.location.origin}/retirada/${orderId}`;

  const downloadQR = () => {
    const svg = document.getElementById("pickup-qr-svg") as unknown as SVGSVGElement | null;
    if (!svg) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svg);
    const blob = new Blob([source], { type: "image/svg+xml" });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `retirada-${shortId || orderId.slice(0, 8)}.svg`;
    a.click();
    URL.revokeObjectURL(blobUrl);
  };

  const printQR = () => {
    const win = window.open("", "_blank", "width=400,height=600");
    if (!win) return;
    const svg = document.getElementById("pickup-qr-svg")?.outerHTML || "";
    win.document.write(`
      <html><head><title>QR Retirada ${shortId || ""}</title>
      <style>body{font-family:sans-serif;text-align:center;padding:20px;}
      h2{margin:8px 0;} .code{font-family:monospace;font-size:14px;color:#666;}</style>
      </head><body>
      <h2>🏪 Retirada na Loja</h2>
      <p class="code">Pedido #${shortId || orderId.slice(0, 8)}</p>
      ${svg}
      <p style="font-size:12px;color:#666;margin-top:16px;">
        Apresente este QR Code ao funcionário no momento da retirada
      </p>
      </body></html>
    `);
    win.document.close();
    setTimeout(() => win.print(), 200);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="w-5 h-5 text-primary" />
            QR Code de Retirada
          </DialogTitle>
          <DialogDescription>
            Apresente este código ao funcionário no momento da retirada
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          <div className="bg-white p-4 rounded-lg border-2 border-primary/20">
            <QRCodeSVG
              id="pickup-qr-svg"
              value={url}
              size={220}
              level="H"
              includeMargin={false}
            />
          </div>
          <p className="text-xs font-mono text-muted-foreground">
            Pedido #{shortId || orderId.slice(0, 8)}
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={downloadQR}>
            <Download className="w-4 h-4 mr-2" />
            Baixar
          </Button>
          <Button className="flex-1" onClick={printQR}>
            <Printer className="w-4 h-4 mr-2" />
            Imprimir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
