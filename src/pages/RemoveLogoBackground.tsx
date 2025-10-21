import { useState } from 'react';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { removeBackground, loadImageFromUrl } from '@/utils/removeBackground';
import { Loader2 } from 'lucide-react';
import japaLogo from '@/assets/japa-logo.png';

export default function RemoveLogoBackground() {
  const [processing, setProcessing] = useState(false);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const { toast } = useToast();

  const handleRemoveBackground = async () => {
    setProcessing(true);
    try {
      toast({
        title: 'Processando...',
        description: 'Removendo fundo da logo. Isso pode levar alguns minutos...'
      });

      const img = await loadImageFromUrl(japaLogo);
      const blob = await removeBackground(img);
      const url = URL.createObjectURL(blob);
      setProcessedImage(url);

      toast({
        title: 'Sucesso!',
        description: 'Fundo removido com sucesso. Clique em Download para salvar.'
      });
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao processar imagem',
        variant: 'destructive'
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!processedImage) return;

    const link = document.createElement('a');
    link.href = processedImage;
    link.download = 'japa-logo-sem-fundo.png';
    link.click();
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="container mx-auto px-4 pt-24 pb-20">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="text-3xl">Remover Fundo da Logo</CardTitle>
            <CardDescription>
              Ferramenta para remover o fundo branco da logo JAPA
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center">
              <h3 className="font-semibold mb-4">Logo Original:</h3>
              <img src={japaLogo} alt="Logo JAPA" className="mx-auto max-w-xs" />
            </div>

            <Button
              onClick={handleRemoveBackground}
              disabled={processing}
              className="w-full"
              size="lg"
            >
              {processing ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Processando... (pode levar alguns minutos)
                </>
              ) : (
                'Remover Fundo'
              )}
            </Button>

            {processedImage && (
              <div className="space-y-4">
                <div className="text-center">
                  <h3 className="font-semibold mb-4">Logo Sem Fundo:</h3>
                  <div className="bg-gray-200 dark:bg-gray-800 p-8 rounded-lg">
                    <img 
                      src={processedImage} 
                      alt="Logo sem fundo" 
                      className="mx-auto max-w-xs"
                    />
                  </div>
                </div>
                
                <Button
                  onClick={handleDownload}
                  variant="outline"
                  className="w-full"
                  size="lg"
                >
                  Download PNG Sem Fundo
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
