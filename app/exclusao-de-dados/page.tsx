import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Exclusao de dados | Zenx Creative",
  description: "Instrucoes para solicitar a exclusao de dados do Zenx Creative.",
};

export default function DataDeletionPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-16 text-foreground">
      <article className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-8 shadow-2xl">
        <p className="text-sm font-semibold text-accent">Zenx Creative</p>
        <h1 className="mt-3 text-3xl font-bold">Exclusao de dados</h1>
        <p className="mt-4 leading-7 text-muted">
          Para solicitar a exclusao dos dados associados a uma conta Meta, envie uma solicitacao
          para o responsavel pelo aplicativo informando o nome da conta e o e-mail usado na
          autorizacao.
        </p>
        <h2 className="mt-8 text-lg font-semibold">Como solicitar</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 leading-7 text-muted">
          <li>Envie a solicitacao pelo e-mail de contato cadastrado no aplicativo.</li>
          <li>Informe que deseja excluir os dados do Zenx Creative e identifique sua conta Meta.</li>
          <li>O pedido sera processado e os tokens e registros associados serao removidos.</li>
        </ol>
        <p className="mt-8 border-t border-border pt-5 text-sm leading-6 text-muted">
          Tambem e possivel remover o acesso em Facebook e Instagram, em Configuracoes e
          privacidade, Aplicativos e sites, removendo o Zenx Creative da lista de aplicativos.
        </p>
      </article>
    </main>
  );
}
