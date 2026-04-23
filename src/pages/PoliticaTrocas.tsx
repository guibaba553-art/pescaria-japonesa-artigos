import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function PoliticaTrocas() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-4xl font-bold mb-8">Política de Trocas e Devoluções</h1>

        <div className="space-y-6 text-foreground">
          <section>
            <h2 className="text-2xl font-bold mb-3">Direito de Arrependimento (7 dias)</h2>
            <p>Conforme o <strong>Art. 49 do Código de Defesa do Consumidor</strong>, você pode
            desistir da compra realizada online em até 7 (sete) dias corridos após o recebimento,
            sem necessidade de justificativa, com reembolso integral do valor pago, incluindo frete.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">Produto com defeito</h2>
            <p>Em caso de defeito de fabricação, você tem até <strong>90 dias</strong> (CDC Art. 26)
            para solicitar a troca ou o reparo do produto.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">Como solicitar</h2>
            <ol className="list-decimal pl-6 space-y-2">
              <li>Entre em contato pelo WhatsApp <a href="https://wa.me/5566996579671" className="text-primary underline">(66) 99657-9671</a> ou e-mail.</li>
              <li>Informe o número do pedido e o motivo.</li>
              <li>Envie fotos do produto e da embalagem.</li>
              <li>Aguarde a autorização de retorno.</li>
              <li>Envie o produto pelos Correios ou transportadora indicada.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">Condições</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Produto sem sinais de uso;</li>
              <li>Embalagem original preservada;</li>
              <li>Acompanhar manuais e acessórios;</li>
              <li>Nota fiscal.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">Reembolso</h2>
            <p>O reembolso será efetuado em até 10 dias úteis após recebimento e análise do produto,
            pela mesma forma de pagamento utilizada na compra.</p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
