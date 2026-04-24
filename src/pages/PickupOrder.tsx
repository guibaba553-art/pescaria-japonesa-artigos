import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Store, Loader2, CheckCircle2, ArrowLeft, User, Phone, Calendar, Package, ShieldAlert } from "lucide-react";

interface OrderItem {
  id: string;
  quantity: number;
  price_at_purchase: number;
  products: { name: string; image_url: string | null } | null;
}
interface Profile {
  full_name: string | null;
  phone: string | null;
  cpf: string | null;
}
interface OrderData {
  id: string;
  total_amount: number;
  shipping_cost: number;
  shipping_address: string;
  status: string;
  delivery_type: string;
  source: string;
  created_at: string;
  user_id: string;
  order_items: OrderItem[];
  profiles?: Profile | null;
}

export default function PickupOrder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, isEmployee, loading: authLoading, user } = useAuth();
  const { toast } = useToast();

  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const hasAccess = isAdmin || isEmployee;

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate(`/auth?redirect=/retirada/${id}`);
      return;
    }
    if (!hasAccess) {
      setLoading(false);
      return;
    }
    loadOrder();
  }, [id, authLoading, user, hasAccess]);

  const loadOrder = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id, total_amount, shipping_cost, shipping_address, status, delivery_type, source, created_at, user_id,
          order_items(id, quantity, price_at_purchase, products(name, image_url))
        `)
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        setNotFound(true);
        return;
      }

      // Carregar perfil do cliente separadamente
      let profile: Profile | null = null;
      if (data.user_id) {
        const { data: p } = await supabase
          .from("profiles")
          .select("full_name, phone, cpf")
          .eq("id", data.user_id)
          .maybeSingle();
        profile = p;
      }

      setOrder({ ...(data as any), profiles: profile });
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const confirmPickup = async () => {
    if (!order) return;
    setConfirming(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: "retirado" as any })
        .eq("id", order.id);
      if (error) throw error;
      toast({
        title: "✅ Retirada confirmada",
        description: `Pedido #${order.id.slice(0, 8)} marcado como retirado.`,
      });
      await loadOrder();
    } catch (err: any) {
      toast({ title: "Erro ao confirmar", description: err.message, variant: "destructive" });
    } finally {
      setConfirming(false);
    }
  };

  const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <ShieldAlert className="w-12 h-12 text-destructive mx-auto" />
            <h2 className="text-xl font-bold">Acesso restrito</h2>
            <p className="text-sm text-muted-foreground">
              Esta página é exclusiva para funcionários e administradores.
            </p>
            <Button onClick={() => navigate("/")} variant="outline" className="w-full">
              Voltar ao início
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <Package className="w-12 h-12 text-muted-foreground mx-auto" />
            <h2 className="text-xl font-bold">Pedido não encontrado</h2>
            <p className="text-sm text-muted-foreground">
              O QR code é inválido ou o pedido foi removido.
            </p>
            <Button onClick={() => navigate("/admin/pedidos")} variant="outline" className="w-full">
              Ver pedidos
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isPickup = order.delivery_type === "pickup";
  const isAlreadyPicked = order.status === "retirado";
  const isCanceled = order.status === "cancelado";
  const canConfirm = isPickup && order.status === "em_preparo";

  return (
    <div className="min-h-screen bg-muted/30 p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/pedidos")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
        </div>

        {/* Status banner */}
        <Card
          className={
            isAlreadyPicked
              ? "border-green-500 bg-green-50 dark:bg-green-950/20"
              : isCanceled
              ? "border-destructive bg-destructive/5"
              : canConfirm
              ? "border-primary bg-primary/5"
              : "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20"
          }
        >
          <CardContent className="p-6 flex items-center gap-4">
            {isAlreadyPicked ? (
              <>
                <CheckCircle2 className="w-12 h-12 text-green-600" />
                <div>
                  <h2 className="text-xl font-bold text-green-700 dark:text-green-400">
                    Pedido já retirado
                  </h2>
                  <p className="text-sm text-muted-foreground">Esta retirada já foi confirmada.</p>
                </div>
              </>
            ) : isCanceled ? (
              <>
                <ShieldAlert className="w-12 h-12 text-destructive" />
                <div>
                  <h2 className="text-xl font-bold text-destructive">Pedido cancelado</h2>
                  <p className="text-sm text-muted-foreground">Não pode ser entregue.</p>
                </div>
              </>
            ) : !isPickup ? (
              <>
                <ShieldAlert className="w-12 h-12 text-yellow-600" />
                <div>
                  <h2 className="text-xl font-bold">Pedido não é de retirada</h2>
                  <p className="text-sm text-muted-foreground">
                    Este pedido é para delivery (envio).
                  </p>
                </div>
              </>
            ) : (
              <>
                <Store className="w-12 h-12 text-primary" />
                <div>
                  <h2 className="text-xl font-bold text-primary">Pronto para retirada</h2>
                  <p className="text-sm text-muted-foreground">
                    Confira os dados e confirme a entrega ao cliente.
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Pedido */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-lg">Pedido #{order.id.slice(0, 8)}</CardTitle>
              <div className="flex gap-1">
                <Badge variant="outline">{order.source.toUpperCase()}</Badge>
                <Badge>{order.status}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Cliente */}
            <div className="space-y-2 bg-muted/40 rounded-lg p-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Cliente
              </h3>
              <div className="flex items-center gap-2 text-sm">
                <User className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{order.profiles?.full_name || "Sem nome"}</span>
              </div>
              {order.profiles?.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <a href={`tel:${order.profiles.phone}`} className="text-primary hover:underline">
                    {order.profiles.phone}
                  </a>
                </div>
              )}
              {order.profiles?.cpf && (
                <p className="text-xs text-muted-foreground">CPF: {order.profiles.cpf}</p>
              )}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Calendar className="w-3 h-3" />
                {new Date(order.created_at).toLocaleString("pt-BR")}
              </div>
            </div>

            {/* Itens */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Itens ({order.order_items.length})
              </h3>
              <div className="space-y-2">
                {order.order_items.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 p-2 border rounded-lg">
                    {item.products?.image_url ? (
                      <img
                        src={item.products.image_url}
                        alt={item.products.name}
                        className="w-12 h-12 rounded object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
                        <Package className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {item.products?.name || "Produto"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.quantity}x {fmt(item.price_at_purchase)}
                      </p>
                    </div>
                    <p className="text-sm font-bold">
                      {fmt(item.quantity * item.price_at_purchase)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Total */}
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{fmt(order.total_amount - order.shipping_cost)}</span>
              </div>
              {order.shipping_cost > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Frete</span>
                  <span>{fmt(order.shipping_cost)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg pt-2 border-t">
                <span>Total</span>
                <span className="text-primary">{fmt(order.total_amount)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ação */}
        {canConfirm && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="lg" className="w-full h-14 text-base" disabled={confirming}>
                {confirming ? (
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 mr-2" />
                )}
                Confirmar retirada do pedido
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar entrega ao cliente?</AlertDialogTitle>
                <AlertDialogDescription>
                  O pedido #{order.id.slice(0, 8)} será marcado como{" "}
                  <strong>retirado</strong> e sairá da lista de pendentes. Esta ação não pode ser
                  desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={confirmPickup}>
                  Sim, confirmar retirada
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
