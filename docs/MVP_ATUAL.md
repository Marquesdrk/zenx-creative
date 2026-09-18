# Zenx Creative — visão completa do MVP atual

**Data do levantamento:** 14 de setembro de 2026  
**Objetivo deste documento:** descrever o produto que existe no repositório hoje, seus fluxos, componentes, integrações, dependências e limites conhecidos. Não é uma promessa de funcionalidades futuras.

## 1. Resumo executivo

O Zenx Creative é uma aplicação web interna para organizar perfis sociais, preparar vídeos em lote, renderizar variações com identidade visual e acompanhar conteúdo publicado ou programado. O fluxo principal começa com vídeos locais e um perfil editorial; termina com um pacote de vídeos renderizados, uma publicação agendada ou uma publicação enviada a uma plataforma conectada.

O produto combina três áreas:

1. **Produção:** perfis, templates, edição em lote, composição de vídeo, recorte e exportação.
2. **Distribuição:** contas sociais, fila/agendamento, publicação, tentativas e estados por conta.
3. **Operação:** relatório de cobertura da programação, métricas, biblioteca e criação assistida de avatares.

É um MVP de operação **single-tenant** (uma instalação usada por uma equipe/negócio), e não uma plataforma SaaS multiusuário pronta: ainda não há autenticação de usuários do próprio Zenx, controle de permissões por pessoa ou isolamento de dados por workspace.

## 2. Para quem e para qual problema

O público principal são equipes ou criadores que precisam produzir muitos vídeos curtos para diferentes perfis, reaproveitar conteúdos com variações de formato e visualizar quanto material já está preparado ou programado.

O problema central é reduzir trabalho manual repetitivo — escolher perfil, ajustar enquadramento, colocar tarja/marca, exportar, cadastrar destino e acompanhar a fila — sem perder o controle do que pertence a cada perfil e conta social.

## 3. O que o produto faz

| Área | O que entrega hoje |
| --- | --- |
| **Editor em massa** | Importa vários vídeos, associa-os a um perfil, analisa fontes, permite revisão individual e renderiza arquivos finais. |
| **Perfis e templates** | Define engines/editorias React, X Style e UGC, mídia de reação, arte, tarjas e marcas d'água. |
| **Exportação** | Baixa um ZIP local em etapas e com uso de disco; também possui envio/renderização por vídeo para Google Drive. |
| **Contas Meta** | Conecta contas profissionais do Instagram e páginas do Facebook por OAuth, valida tokens e mantém status por conta. |
| **Publicação e agenda** | Cria publicações imediatas ou agendadas, uma ou mais contas de destino por vídeo, com status, erros e tentativas por destino. |
| **Calendário** | Dá uma visão temporal do conteúdo programado. |
| **Relatório** | Resume vídeos publicados/agendados por perfil e estima até quando há conteúdo na fila. |
| **Performance** | Armazena e apresenta métricas disponíveis para publicações conectadas. |
| **Biblioteca** | Área de apoio para organizar/consultar conteúdo do sistema. |
| **Criador de Avatar** | Gera documentos estratégicos e imagens de referência de um influenciador virtual usando OpenAI e salva os artefatos no Drive. |
| **Configurações** | Centraliza integrações Meta, Google Drive e OpenAI, além de perfis e opções relacionadas. |

## 4. Engines de vídeo

### React

Compõe verticalmente uma mídia de reação e o conteúdo principal. A reação ocupa a faixa superior do quadro final e o conteúdo ocupa a parte inferior. Pode selecionar a reação associada ao item, usar repetição normal ou frente-e-trás, controlar recorte/zoom/rotação/volume e aplicar uma tarja com texto, cor/gradiente, estilo, fonte, cor e intensidade do contorno.

### X Style

Usa uma arte/template vertical como fundo e posiciona título, vídeo e texto/CTA em regiões próprias do template. O layout permite ajustar os retângulos e tamanhos definidos para cada perfil.

### UGC

Aplica os ajustes universais do vídeo e, quando configurada, uma imagem de marca d'água com posição e escala definidas pelo perfil/template.

### Processamento comum

O servidor usa FFmpeg para ler os arquivos, consultar dimensões, aplicar corte/rotação/encaixe/zoom, compor as camadas, tratar áudio e escrever o resultado final. A saída da composição é vertical (1080 × 1920), com 30 quadros por segundo e H.264/AAC. A codificação tenta usar NVIDIA NVENC quando o binário e o driver suportam; em caso de indisponibilidade/falha, volta para libx264 por CPU. No desktop, os renders são limitados em paralelo para equilibrar vazão e responsividade.

## 5. Fluxos principais

### A. Produzir e exportar um lote

```text
Selecionar perfil e arquivos
        ↓
Criar itens e analisar dimensões/enquadramento
        ↓
Revisar/editar cada vídeo (ou aplicar ajustes ao lote)
        ↓
Confirmar a revisão
        ↓
Renderizar os vídeos com FFmpeg
        ↓
Montar ZIP em disco e baixar no computador
```

Na exportação local, os vídeos renderizados são gravados em disco e o ZIP é montado por streaming, em vez de carregar todo o lote na memória. O envio ao Drive usa um fluxo separado e processa os vídeos individualmente.

**Rascunhos do editor:** os lotes e referências aos arquivos agora ficam no provider do layout compartilhado do painel. Portanto, permanecem disponíveis ao navegar do Editor para Configurações/Relatório e voltar, sem duplicar os arquivos. Essa persistência é de sessão: atualizar a página, fechar o navegador ou reiniciar o servidor ainda não é garantido para rascunhos não exportados.

### B. Programar conteúdo para redes

```text
Conectar conta Meta → escolher vídeo/URL/arquivo do Drive → escrever legenda
      → escolher horário e uma ou mais contas → salvar na fila
      → executor verifica vencimentos → publica por destino → registra resultado
```

Um vídeo pode ter várias contas de destino. Cada destino mantém estado e falha próprios, para permitir nova tentativa sem apagar o histórico dos demais. A publicação no Instagram pode demorar porque a Meta processa o container do Reel antes da etapa final de publicação.

### C. Consultar cobertura e desempenho

O Relatório combina perfis, fila do editor, publicações concluídas e agendamentos/destinos para mostrar quantidade de conteúdo e horizonte estimado da programação por perfil. A Performance mostra métricas de publicações quando a plataforma/API e permissões disponibilizam os dados.

### D. Criar um avatar virtual

O usuário descreve nome, nicho, público, promessa, fronteiras editoriais e estilo visual. A integração OpenAI gera sete documentos de estratégia/personagem e quatro imagens de referência. Os documentos e imagens são enviados para uma pasta do Google Drive, e o registro do avatar acompanha os estados de geração, pronto ou falha.

## 6. Como a arquitetura funciona

### Aplicação

- **Next.js 16 App Router**, React 19 e TypeScript.
- Componentes de interface em `app/(dashboard)` e `components/`.
- Endpoints HTTP em `app/api/**/route.ts`.
- Regras de domínio e adaptadores externos em `lib/server/` e `lib/editor/`.
- O painel compartilhado é um layout de servidor; providers client-side são colocados dentro dele para manter estado entre páginas sem transformar o layout inteiro em componente cliente.

### Renderização de vídeo

1. O navegador envia o original ao endpoint local (ou, no caminho hospedado, usa armazenamento temporário Blob).
2. O endpoint grava o upload em área temporária local.
3. `lib/server/render.ts` aplica as regras da engine e chama FFmpeg/ffprobe.
4. O resultado fica temporariamente em `public/renders`.
5. No fluxo local em etapas, o ZIP é escrito em disco e servido por streaming; o endpoint de download remove artefatos temporários ao concluir.

### Persistência de dados (fontes diferentes)

| Dado | Persistência atual |
| --- | --- |
| Rascunhos de lote abertos no editor e `File` objects | Memória do provider React durante a sessão do painel; navegação interna preserva, reload não. |
| Lotes/publicações no fluxo SQLite legado | `data/zenx.sqlite` no modo local. O endpoint `/api/batches` existe, mas a tela atual do editor mantém seus rascunhos no cliente. |
| Perfis e templates do Editor em massa | Tabelas `editor_profiles` e `editor_templates` em Supabase, com perfis/templates mock como fallback inicial. |
| Contas Meta, tokens, agendamentos, destinos e logs Meta | Supabase/Postgres; tokens da conta são criptografados antes de persistir. |
| Credencial OpenAI | Repositório local da aplicação (SQLite), criptografada em repouso; usada apenas no servidor. |
| Uploads e renders de sessão local | Pastas `public/uploads`, `public/renders` e `public/batch-space`; temporários, não sincronizados pelo Git. |
| Mídias agendadas e artefatos de avatar | Google Drive quando a integração está configurada. |
| Resumo de uso de armazenamento de lotes | Supabase Storage quando bucket e credenciais estão configurados. |

**Implicação:** o Supabase não transforma automaticamente todos os arquivos locais em dados compartilhados. Para usar outra máquina, perfis/contas compartilhados precisam apontar para o mesmo projeto Supabase, credenciais precisam ser configuradas nela e mídias locais/SQLite precisam ser migradas ou reimportadas separadamente.

## 7. Integrações e maturidade atual

| Integração/canal | Estado observado no código | Dependências e ressalvas |
| --- | --- | --- |
| **Instagram/Meta** | OAuth multi-conta, descoberta de ativos, validação e publicação de Reels/agendamentos implementados. | App Meta, permissões aprovadas, tokens válidos e URL HTTPS pública acessível pela Meta para baixar vídeo. Permissões limitadas podem restringir publicação/métricas. |
| **Facebook** | OAuth/conta e adapter de publicação por vídeo implementados. | Página e permissões do app Meta; necessita URL pública de mídia para o fluxo por URL. |
| **Google Drive** | OAuth, seleção/stream de mídia, armazenamento de vídeos agendados, organização por conta e destino de artefatos implementados. | Google Cloud OAuth, Drive API, redirect URIs e escopos adequados. Erros de rede/Google podem afetar upload direto. |
| **OpenAI** | Conexão validada por chamada à API; geração de documentos e imagens do Criador de Avatar implementada. | Chave de API própria e custos/limites da conta OpenAI. |
| **TikTok** | Adapter de publicação existe e aceita token configurado manualmente; publicação é enviada como `SELF_ONLY`. | OAuth/PKCE de criador ainda não está implementado; token exige app e escopo aprovados. Métricas não estão implementadas. |
| **YouTube** | Adapter de upload e métricas existe no código. | O OAuth compartilhado do Drive usa escopo `drive.file` e não inclui `youtube.upload`; o próprio projeto documenta o fluxo de publicação como desabilitado na prática até implementar OAuth específico. |
| **Kwai** | Registrado como canal para acompanhamento manual. | Não há API pública usada pelo produto para publicar; publicação é feita manualmente no app. |

## 8. Requisitos para execução

- Git, Node.js 22.5+ e npm; dependências instaladas com `npm ci`.
- FFmpeg/ffprobe fornecidos pelas dependências do projeto para renderização local.
- Sem credenciais, é possível executar a interface e o fluxo local básico com dados mock. Recursos integrados dependem de credenciais externas.
- Para Meta receber mídia, o endereço precisa ser público e HTTPS; `localhost` não serve como URL de download para os servidores da Meta.
- Supabase requer projeto, tabelas/migrations aplicadas e `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` no servidor.
- Google Drive requer app OAuth e Drive API ativos.
- OpenAI requer chave de API validada na tela de Configurações.

### Comandos locais

```powershell
npm ci
Copy-Item .env.local.example .env.local
npm run dev
```

O servidor de desenvolvimento usa a porta **7070** neste repositório. Verificações disponíveis:

```powershell
npm test
npm run lint
npx tsc --noEmit
npm run build
```

## 9. Segurança, dados e operação

- `.env.local` guarda segredos e nunca deve ir para o GitHub.
- A service-role key do Supabase e tokens de plataformas ficam apenas no servidor.
- Os tokens Meta persistidos são criptografados; respostas destinadas à interface não incluem o token bruto.
- O projeto não oferece hoje login/controle de acesso próprio. Não exponha uma instância contendo dados ou integrações a usuários não confiáveis sem colocar autenticação e autorização na frente.
- SQLite e arquivos locais não são sincronizados entre computadores nem enviados pelo Git. Faça backup/migração explícita antes de trocar de máquina.
- Durante um lote grande, confirme espaço livre local suficiente para originais, intermediários renderizados e ZIP final.
- A codificação acelerada depende do encoder/driver disponíveis na máquina; há fallback por CPU, mas a duração varia com duração, resolução, codec de origem, filtros, armazenamento e hardware.

## 10. Limites e trabalho recomendado para sair do MVP

### Prioridade alta

1. **Persistência durável dos rascunhos:** salvar lote e blobs no IndexedDB ou armazenamento local do servidor, com recuperação após refresh/fechamento e limpeza controlada. Hoje a correção cobre navegação entre rotas na mesma sessão.
2. **Publicação multi-plataforma de produção:** OAuth próprio do TikTok, OAuth/escopo próprio do YouTube, revisão de permissões Meta e testes reais por conta/região.
3. **Autenticação e autorização:** login, usuários, papéis e isolamento por workspace antes de disponibilizar externamente.
4. **Fila de renderização resiliente:** jobs persistentes, cancelamento/retomada, checkpoints, retomada após falha e métricas reais de tempo por estágio.
5. **Teste de desempenho representativo:** registrar tempos de importação, render, empacotamento e upload em uma amostra real (por exemplo, 5–10 vídeos) antes de projetar capacidade para 100–500.

### Prioridade média

- Backups e restauração guiada de banco, uploads e credenciais.
- Migração de ativos do perfil entre instalações, com identificação de mídia ausente.
- Alertas para token próximo de expirar, falha repetida de agenda, pouco espaço em disco e falta de conteúdo.
- Testes end-to-end com contas sandbox e vídeos de diferentes resoluções/codecs.
- Definir limites de lote, tamanho, retenção de render e estratégia de limpeza visíveis ao usuário.

## 11. Critérios para considerar o MVP pronto para operação ampliada

- Um operador consegue importar, revisar, editar e exportar um lote sem perder o estado ao navegar nem ao atualizar a página.
- A renderização mostra progresso por estágio, registra falhas por vídeo, permite retomar sem repetir o lote inteiro e não deixa temporários órfãos.
- Há teste medido de uma amostra que representa 100–500 itens no hardware alvo, sem tornar o computador inutilizável.
- Publicação/agendamento foi validado em cada plataforma que a interface apresenta como automatizada.
- Tokens, arquivos e dados têm política de backup, retenção e exclusão definida.
- A aplicação tem autenticação e autorização antes de qualquer exposição pública.

## 12. Mapa rápido do repositório

```text
app/(dashboard)/       Páginas principais do produto
app/api/               Route handlers HTTP
components/             Componentes de interface e fluxos
lib/editor/             Tipos, engines, stores e regras do editor
lib/server/             Render, banco, integrações e publicação
supabase/migrations/    Esquema SQL para Supabase
public/                 Assets e diretórios de mídia local
docs/                   Documentação técnica e de operação
```
