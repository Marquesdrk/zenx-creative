import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Politica de privacidade | Zenx Creative",
  description: "Politica de privacidade do Zenx Creative.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-16 text-foreground">
      <article className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-8 shadow-2xl">
        <p className="text-sm font-semibold text-accent">Zenx Creative</p>
        <h1 className="mt-3 text-3xl font-bold">Politica de privacidade</h1>
        <p className="mt-4 leading-7 text-muted">
          O Zenx Creative usa os dados autorizados pelas plataformas conectadas apenas para
          identificar contas, preparar conteudo e executar publicacoes solicitadas pelo operador.
          Tokens de acesso sao armazenados de forma criptografada no servidor e nunca sao exibidos
          no navegador ou compartilhados com terceiros.
        </p>
        <h2 className="mt-8 text-lg font-semibold">Controle e exclusao</h2>
        <p className="mt-3 leading-7 text-muted">
          Voce pode desconectar uma conta dentro do aplicativo ou solicitar a exclusao dos dados
          pela pagina de <a className="text-accent underline" href="/exclusao-de-dados">exclusao de dados</a>.
        </p>
        <p className="mt-8 border-t border-border pt-5 text-sm leading-6 text-muted">
          Esta politica pode ser atualizada quando houver mudancas relevantes no funcionamento do
          aplicativo.
        </p>
      </article>
    </main>
  );
}
