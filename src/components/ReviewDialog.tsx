import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { sanitizeHtml } from '@/utils/validation';

interface ReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  productId: string;
  productName: string;
  onReviewSubmitted: () => void;
}

export function ReviewDialog({
  open,
  onOpenChange,
  orderId,
  productId,
  productName,
  onReviewSubmitted
}: ReviewDialogProps) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [hoveredRating, setHoveredRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    // Validações
    if (!comment.trim()) {
      toast({
        title: 'Comentário obrigatório',
        description: 'Por favor, escreva um comentário sobre o produto.',
        variant: 'destructive'
      });
      return;
    }

    if (comment.trim().length < 10) {
      toast({
        title: 'Comentário muito curto',
        description: 'O comentário deve ter pelo menos 10 caracteres.',
        variant: 'destructive'
      });
      return;
    }

    if (rating < 1 || rating > 5) {
      toast({
        title: 'Avaliação inválida',
        description: 'Selecione uma avaliação de 1 a 5 estrelas.',
        variant: 'destructive'
      });
      return;
    }

    setSubmitting(true);
    
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      toast({
        title: 'Erro',
        description: 'Você precisa estar logado para avaliar.',
        variant: 'destructive'
      });
      setSubmitting(false);
      return;
    }

    // Sanitize comment to prevent XSS
    const sanitizedComment = sanitizeHtml(comment.trim());
    
    const { error } = await supabase
      .from('reviews')
      .insert({
        order_id: orderId,
        product_id: productId,
        user_id: user.id,
        rating,
        comment: sanitizedComment
      });

    if (error) {
      toast({
        title: 'Erro ao enviar avaliação',
        description: error.message,
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Avaliação enviada!',
        description: 'Obrigado por avaliar o produto.'
      });
      setComment('');
      setRating(5);
      onOpenChange(false);
      onReviewSubmitted();
    }
    
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Avaliar Produto</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div>
            <p className="font-medium mb-2">{productName}</p>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">
              Sua avaliação
            </label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  className="transition-transform hover:scale-110"
                >
                  <Star
                    className={`w-8 h-8 ${
                      star <= (hoveredRating || rating)
                        ? 'fill-primary text-primary'
                        : 'text-muted'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">
              Comentário *
            </label>
            <Textarea
              placeholder="Conte sua experiência com o produto... (mínimo 10 caracteres)"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              maxLength={500}
              className={comment.trim().length > 0 && comment.trim().length < 10 ? 'border-destructive' : ''}
            />
            <div className="flex justify-between items-center">
              <p className={`text-xs ${comment.trim().length < 10 ? 'text-destructive' : 'text-muted-foreground'}`}>
                {comment.trim().length < 10 ? `Faltam ${10 - comment.trim().length} caracteres` : `${comment.length}/500 caracteres`}
              </p>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={submitting || comment.trim().length < 10}>
              {submitting ? 'Enviando...' : 'Enviar Avaliação'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
