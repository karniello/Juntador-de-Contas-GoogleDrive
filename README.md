# 🚀 Google Drive Virtual Storage Pool (30 GB+)

Sistema em Python de alto desempenho que combina o armazenamento de duas contas distintas do **Google Drive** (ex: 15 GB + 15 GB = 30 GB) em um **Pool Virtual Unificado**, com alocação inteligente **Most Free Space (MFS)**, catálogo local em **SQLite**, **CLI** rica em recursos e **Interface Gráfica Desktop (CustomTkinter)**.

---

## 📋 Arquitetura e Características

1. **Autenticação Multi-Conta Independente**:
   - Utiliza as bibliotecas oficiais `google-api-python-client` e `google-auth-oauthlib`.
   - Gera e mantém tokens separados para cada conta (`token_drive1.json` e `token_drive2.json`).
   - Verificação e renovação transparente com *refresh tokens* automáticos.

2. **Política de Alocação Most Free Space (MFS)**:
   - Antes de cada upload, consulta a cota disponível em tempo real via `drive.about().get(fields="storageQuota")`.
   - Direciona o arquivo automaticamente para o Drive com maior espaço livre disponível que comporte o tamanho do arquivo.
   - Retorna erro amigável e detalhado caso nenhuma conta individual tenha espaço suficiente.

3. **Uploads e Downloads em Chunks Resumíveis**:
   - `MediaFileUpload` com `resumable=True` e `chunksize=2MB`.
   - Streaming de download via `MediaIoBaseDownload`.
   - Barra de progresso em tempo real e tratamento de erros de rede com *exponential backoff*.

4. **Catálogo Local Indexado (SQLite `virtual_drive.db`)**:
   - Schema: `id`, `nome_arquivo`, `tamanho_bytes`, `md5_hash`, `conta_origem` (`drive_1` ou `drive_2`), `id_remoto_google`, `data_upload`.

5. **Interfaces Duplas**:
   - **CLI (Linha de Comando)** completa com tabelas e barras de progresso.
   - **GUI Desktop Moderna** em `CustomTkinter` (com fallback para `Tkinter` padrão).

---

## 🛠️ Passo a Passo: Configuração no Google Cloud Console

Para que **duas contas Google** possam autorizar a mesma aplicação, configure um projeto no Google Cloud Console:

### 1. Criar o Projeto e Ativar a API
1. Acesse o [Google Cloud Console](https://console.cloud.google.com/).
2. No menu superior, crie um novo projeto (ex: `Drive-Virtual-Pool`).
3. Vá em **APIs e Serviços** > **Biblioteca**.
4. Pesquise por **Google Drive API** e clique em **Ativar** (*Enable*).

### 2. Configurar a Tela de Permissão OAuth (*OAuth Consent Screen*)
1. Vá em **APIs e Serviços** > **Tela de permissão OAuth**.
2. Selecione **Externo** (*External*) e clique em **Criar**.
3. Preencha o nome do app (ex: `Drive Virtual Pool`) e seus e-mails de suporte.
4. Na aba **Escopos** (*Scopes*), adicione o escopo:
   - `.../auth/drive` (Ver, editar, criar e excluir todos os seus arquivos do Google Drive).
5. Na aba **Usuários de Teste** (*Test users*) — **ETAPA CRÍTICA**:
   - Clique em **+ Adicionar Usuários** (+ *Add Users*).
   - Insira o e-mail da **Conta 1** (ex: `usuario1@gmail.com`).
   - Insira o e-mail da **Conta 2** (ex: `usuario2@gmail.com`).
   - Salve. *(Isso permite que ambas as contas façam login sem precisar publicar o app formalmente na Google)*.

### 3. Criar Credenciais OAuth 2.0
1. Vá em **APIs e Serviços** > **Credenciais**.
2. Clique em **+ Criar Credenciais** > **ID do cliente OAuth**.
3. Tipo de aplicativo: **App para computador** (*Desktop app*).
4. Nome: `Drive Pool Desktop Client`.
5. Clique em **Criar**.
6. Clique no botão de download do JSON gerado.
7. Renomeie o arquivo baixado para **`credentials.json`** e coloque-o na raiz deste projeto.

---

## 📦 Instalação

```bash
# 1. Clone ou extraia os arquivos do projeto
cd drive-virtual-pool

# 2. Crie um ambiente virtual (recomendado)
python3 -m venv venv
source venv/bin/activate  # No Windows: venv\Scripts\activate

# 3. Instale as dependências
pip install -r requirements.txt
```

---

## 🖥️ Como Usar a Interface Gráfica (Desktop GUI)

Inicie a interface desktop com:

```bash
python main.py
# ou
python main.py gui
```

A interface apresenta:
- **Barra de capacidade do Pool Total** somando Drive 1 + Drive 2 em tempo real.
- **Cards individuais** com a cota e porcentagem de cada conta.
- **Tabela de arquivos unificada** com busca dinâmica.
- Botões de **Enviar Arquivo**, **Baixar Selecionado**, **Excluir** e **Conectar Contas**.

---

## ⌨️ Como Usar a Linha de Comando (CLI)

### 1. Conectar as Contas (Primeiro Acesso)
```bash
# Autentica ambas as contas sequencialmente:
python main.py auth

# Ou autentique uma conta específica:
python main.py auth drive_1
python main.py auth drive_2
```
*O navegador será aberto para cada conta. Faça login com a conta correspondente e autorize o app.*

### 2. Listar Arquivos e Espaço do Pool
```bash
python main.py list
```
Exibe o sumário visual do pool (espaço total, ocupado, livre) e a tabela com os arquivos indexados no SQLite.

### 3. Enviar Arquivo com Alocação Automática (MFS)
```bash
python main.py upload /caminho/do/video.mp4
```
O sistema consulta as cotas em tempo real, direciona o arquivo para o Drive com maior espaço livre disponível, faz o upload em chunks de 2MB com barra de progresso e salva os metadados no SQLite.

### 4. Baixar Arquivo
```bash
# Por ID local (número) ou pelo nome do arquivo:
python main.py download 1 ./downloads/
python main.py download "documento.pdf" ./downloads/
```
Identifica automaticamente em qual conta Google o arquivo está armazenado e realiza o streaming para o destino.

### 5. Excluir Arquivo
```bash
python main.py delete 1
# ou
python main.py delete "documento.pdf"
```
Remove o arquivo definitivamente da conta correta do Google Drive e deleta o registro no SQLite.

---

## 🗄️ Estrutura do Banco de Dados SQLite (`virtual_drive.db`)

```sql
CREATE TABLE arquivos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome_arquivo TEXT NOT NULL,
    tamanho_bytes INTEGER NOT NULL,
    md5_hash TEXT NOT NULL,
    conta_origem TEXT NOT NULL,      -- 'drive_1' ou 'drive_2'
    id_remoto_google TEXT NOT NULL UNIQUE,
    data_upload TEXT NOT NULL         -- Formato ISO 8601
);
```

---

## 🛡️ Tratamento de Exceções e Resiliência
- **Erros transitórios de rede**: Repetições automáticas com *exponential backoff* para erros HTTP 429, 500, 502, 503 e 504.
- **Espaço insuficiente**: Validação prévia da cota com erro amigável informando a capacidade restante em cada conta.
- **Token expirado**: Renovação transparente usando `creds.refresh(Request())` e persistência imediata no arquivo JSON.
