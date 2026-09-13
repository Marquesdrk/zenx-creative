# Zenx Creative

Aplicação local para edição e publicação de vídeos em lote.

## Executar em outra máquina

Requisitos: Git, Node.js 22.5 ou superior e npm.

```powershell
git clone https://github.com/Marquesdrk/zenx-creative.git
cd zenx-creative
npm ci
Copy-Item .env.local.example .env.local
npm run dev
```

Abra [http://localhost:7070](http://localhost:7070). No macOS/Linux, use `cp .env.local.example .env.local` no lugar de `Copy-Item`.

O sistema inicia sem credenciais para uso local básico. Para usar contas Meta, Google Drive ou Supabase, preencha no `.env.local` as credenciais necessárias conforme os comentários em `.env.local.example`. Se os perfis e templates devem aparecer iguais nas duas máquinas, configure o mesmo projeto Supabase em ambas.

## Dados locais e segurança

O `.env.local` contém credenciais e não deve ser enviado ao GitHub. Configure-o separadamente em cada máquina.

O banco local `data/zenx.sqlite` e os arquivos em `public/uploads`, `public/renders` e `public/batch-space` também não são enviados ao GitHub. Eles não aparecem automaticamente na outra máquina; migre-os separadamente se precisar levar históricos, lotes ou mídias locais.

## Verificações

```powershell
npm test
npm run lint
npx tsc --noEmit
```
