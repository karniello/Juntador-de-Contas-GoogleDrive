"""
Interface de Linha de Comando (CLI) para o Google Drive Virtual Pool.
Oferece comandos: upload, list, download, delete, auth e status.
"""

import sys
import os
import argparse
import time
from typing import Optional

from .pool_manager import VirtualPoolManager, InsufficientPoolSpaceError
from .storage import format_bytes


# Cores ANSI para saída rica no terminal
CYAN = "\033[96m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BOLD = "\033[1m"
DIM = "\033[2m"
RESET = "\033[0m"


def print_banner():
    banner = f"""{CYAN}{BOLD}
╔════════════════════════════════════════════════════════════════════════════╗
║               GOOGLE DRIVE VIRTUAL STORAGE POOL (CLI)                      ║
║         Capacidade Unificada Multi-Conta com Balanceamento MFS             ║
╚════════════════════════════════════════════════════════════════════════════╝{RESET}"""
    print(banner)


def terminal_progress_bar(current: int, total: int, prefix: str = "Progresso", length: int = 35):
    """Renderiza uma barra de progresso suave no terminal."""
    percent = (current / total) * 100.0 if total > 0 else 0.0
    filled = int(length * current // total) if total > 0 else 0
    bar = "█" * filled + "░" * (length - filled)
    sys.stdout.write(f"\r  {prefix}: [{CYAN}{bar}{RESET}] {percent:5.1f}% ({format_bytes(current)}/{format_bytes(total)})")
    sys.stdout.flush()
    if current >= total:
        sys.stdout.write("\n")


def cmd_upload(manager: VirtualPoolManager, filepath: str):
    """Executa o comando de upload com MFS e barra de progresso."""
    if not os.path.exists(filepath):
        print(f"{RED}Erro: Arquivo local não encontrado:{RESET} {filepath}")
        sys.exit(1)

    file_size = os.path.getsize(filepath)
    filename = os.path.basename(filepath)

    print(f"\n{BOLD}Iniciando upload de:{RESET} {filename} ({format_bytes(file_size)})")
    print(f"{DIM}Verificando cotas disponíveis e calculando MD5...{RESET}")

    start_time = time.time()

    def on_progress(current, total, pct):
        terminal_progress_bar(current, total, prefix="Enviando Chunks")

    try:
        result = manager.upload_file(filepath, progress_callback=on_progress)
        elapsed = time.time() - start_time
        rec = result["record"]
        acc = result["allocated_account"]

        print(f"\n{GREEN}{BOLD}✔ Upload concluído com sucesso em {elapsed:.1f}s!{RESET}")
        print(f"  • Conta alocada (MFS): {YELLOW}{BOLD}{acc.upper()}{RESET}")
        print(f"  • ID Local SQLite:     {rec['id']}")
        print(f"  • Google Remote ID:    {rec['id_remoto_google']}")
        print(f"  • Hash MD5:            {rec['md5_hash']}")
        print(f"  • Data/Hora:           {rec['data_upload']}")
    except InsufficientPoolSpaceError as e:
        print(f"\n{RED}{BOLD}✖ ERRO DE CAPACIDADE:{RESET}\n{e}")
        sys.exit(2)
    except Exception as e:
        print(f"\n{RED}{BOLD}✖ Falha no upload:{RESET} {e}")
        sys.exit(1)


def cmd_list(manager: VirtualPoolManager):
    """Lista todos os arquivos do pool e exibe o resumo de armazenamento."""
    print(f"\n{BOLD}═══ STATUS DO POOL VIRTUAL UNIFICADO ═══{RESET}")
    status = manager.get_pool_status(interactive=False)

    limit_b = status["total_limit_bytes"]
    usage_b = status["total_usage_bytes"]
    free_b = status["total_free_bytes"]
    pct = status["percent_used"]

    # Barra visual de uso total do Pool
    bar_len = 30
    filled = int(bar_len * (pct / 100.0)) if limit_b > 0 else 0
    pool_bar = "█" * filled + "░" * (bar_len - filled)

    print(f"Capacidade Total Somada : {BOLD}{format_bytes(limit_b)}{RESET}")
    print(f"Espaço Total Ocupado    : {YELLOW}{format_bytes(usage_b)}{RESET}")
    print(f"Espaço Total Livre      : {GREEN}{format_bytes(free_b)}{RESET}")
    print(f"Uso do Pool             : [{CYAN}{pool_bar}{RESET}] {BOLD}{pct:.1f}%{RESET}")
    print()

    print(f"{BOLD}Detalhes por Conta:{RESET}")
    for acc_id, acc_info in status["accounts"].items():
        if acc_info["authenticated"] and acc_info["quota"]:
            q = acc_info["quota"]
            print(f"  • {BOLD}{acc_id.upper()}{RESET} ({q['user_email']}): {q['formatted_usage']} usado / {q['formatted_free']} livre ({q['percent_used']}%)")
        else:
            print(f"  • {BOLD}{acc_id.upper()}{RESET}: {RED}{acc_info.get('error', 'Desconectado')}{RESET}")

    print(f"\n{BOLD}═══ ARQUIVOS INDEXADOS NO POOL (SQLite) ═══{RESET}")
    files = manager.list_files()

    if not files:
        print(f"{DIM}Nenhum arquivo cadastrado no catálogo ainda. Use 'upload <arquivo>' para começar.{RESET}\n")
        return

    # Cabeçalho da tabela
    header = f"{'ID':<5} {'NOME DO ARQUIVO':<32} {'TAMANHO':<12} {'CONTA':<10} {'DATA UPLOAD':<20}"
    print(BOLD + header + RESET)
    print("─" * len(header))

    for f in files:
        nome = f["nome_arquivo"]
        if len(nome) > 30:
            nome = nome[:27] + "..."
        data_str = f["data_upload"][:19].replace("T", " ")
        conta_color = CYAN if f["conta_origem"] == "drive_1" else YELLOW
        print(f"{f['id']:<5} {nome:<32} {f['tamanho_formatado']:<12} {conta_color}{f['conta_origem']:<10}{RESET} {data_str:<20}")

    print(f"\nTotal: {len(files)} arquivo(s) indexado(s) somando {format_bytes(status['db_stats']['total_bytes'])}.\n")


def cmd_download(manager: VirtualPoolManager, identifier: str, dest_dir: str):
    """Executa o download com streaming e barra de progresso."""
    print(f"\n{BOLD}Localizando arquivo no catálogo:{RESET} {identifier}")
    try:
        def on_dl_progress(current, total, pct):
            terminal_progress_bar(current, total, prefix="Baixando Chunks")

        start_time = time.time()
        record, saved_path = manager.download_file(
            identifier=identifier,
            destination_path=dest_dir,
            progress_callback=on_dl_progress
        )
        elapsed = time.time() - start_time

        print(f"\n{GREEN}{BOLD}✔ Download finalizado com sucesso em {elapsed:.1f}s!{RESET}")
        print(f"  • Arquivo:         {record['nome_arquivo']}")
        print(f"  • Conta de Origem: {YELLOW}{record['conta_origem'].upper()}{RESET}")
        print(f"  • Destino Local:   {saved_path}")
        print(f"  • Hash MD5:        {record['md5_hash']}")
    except Exception as e:
        print(f"\n{RED}{BOLD}✖ Falha no download:{RESET} {e}")
        sys.exit(1)


def cmd_delete(manager: VirtualPoolManager, identifier: str):
    """Remove o arquivo do Google Drive e do SQLite."""
    print(f"\n{BOLD}Excluindo arquivo:{RESET} {identifier}")
    try:
        deleted = manager.delete_file(identifier)
        print(f"{GREEN}{BOLD}✔ Arquivo removido com sucesso!{RESET}")
        print(f"  • ID Local:        {deleted['id']}")
        print(f"  • Nome:            {deleted['nome_arquivo']}")
        print(f"  • Conta Removida:  {deleted['conta_origem'].upper()}")
        print(f"  • ID Remoto:       {deleted['id_remoto_google']}")
    except Exception as e:
        print(f"\n{RED}{BOLD}✖ Falha ao excluir arquivo:{RESET} {e}")
        sys.exit(1)


def cmd_auth(manager: VirtualPoolManager, account_id: Optional[str] = None):
    """Autentica uma ou todas as contas cadastradas no pool."""
    target_accounts = [account_id] if account_id else manager.account_ids
    print(f"\n{BOLD}═══ CONFIGURAÇÃO DE AUTENTICAÇÃO OAUTH 2.0 ═══{RESET}")
    for acc in target_accounts:
        print(f"\nIniciando autorização para {BOLD}{acc.upper()}{RESET}...")
        try:
            auth_mgr = manager.get_auth_manager(acc)
            creds = auth_mgr.get_credentials(interactive=True)
            user = auth_mgr.get_user_info()
            print(f"{GREEN}✔ Conta {acc.upper()} conectada com sucesso!{RESET}")
            print(f"  • Usuário: {user.get('displayName')} ({user.get('emailAddress')})")
            print(f"  • Token salvo em: {auth_mgr.token_path}")
        except Exception as e:
            print(f"{RED}✖ Falha na autorização de {acc}: {e}{RESET}")


def cmd_accounts(manager: VirtualPoolManager):
    """Lista todas as contas cadastradas no pool."""
    accounts = manager.list_registered_accounts()
    print(f"\n{BOLD}═══ CONTAS GOOGLE DRIVE CADASTRADAS NO POOL ({len(accounts)}) ═══{RESET}")
    print(f"{'ID':<15} {'NOME':<25} {'TOKEN':<22} {'EMAIL':<30}")
    print("─" * 92)
    for acc in accounts:
        has_token = os.path.exists(acc["token_path"])
        token_indicator = f"{GREEN}✔ Conectado{RESET}" if has_token else f"{YELLOW}⚠ Pendente{RESET}"
        email_str = acc["email"] or "N/A"
        print(f"{BOLD}{acc['id']:<15}{RESET} {acc['nome_exibicao']:<25} {token_indicator:<31} {email_str:<30}")
    print(f"\n{DIM}Use 'python main.py add-account <id>' para adicionar mais contas.{RESET}")
    print(f"{DIM}Use 'python main.py auth <id>' para autorizar uma conta.{RESET}\n")


def cmd_add_account(manager: VirtualPoolManager, acc_id: str, nome: Optional[str] = None, email: Optional[str] = None):
    """Adiciona uma nova conta ao pool."""
    try:
        acc = manager.add_account(account_id=acc_id, display_name=nome, email=email)
        print(f"\n{GREEN}{BOLD}✔ Conta '{acc['id']}' cadastrada com sucesso no pool!{RESET}")
        print(f"  • Token configurado para: {acc['token_path']}")
        print(f"  • Para autorizar no Google Drive agora, execute: {CYAN}python main.py auth {acc['id']}{RESET}\n")
    except Exception as e:
        print(f"\n{RED}✖ Falha ao adicionar conta: {e}{RESET}\n")


def cmd_remove_account(manager: VirtualPoolManager, acc_id: str):
    """Remove uma conta do pool."""
    try:
        success = manager.remove_account(acc_id)
        if success:
            print(f"\n{GREEN}{BOLD}✔ Conta '{acc_id}' removida do pool com sucesso.{RESET}\n")
        else:
            print(f"\n{YELLOW}Conta '{acc_id}' não encontrada no pool.{RESET}\n")
    except Exception as e:
        print(f"\n{RED}✖ Falha ao remover conta: {e}{RESET}\n")


def cmd_programs(manager: VirtualPoolManager, categoria: Optional[str] = None, plataforma: Optional[str] = None):
    """Lista todos os programas e softwares armazenados no pool do Google Drive."""
    progs = manager.list_programs(categoria=categoria, plataforma=plataforma)
    print(f"\n{CYAN}{BOLD}═══ PROGRAMAS E SOFTWARES NO GOOGLE DRIVE POOL ({len(progs)}) ═══{RESET}")
    print(f"{'ID':<4} {'PROGRAMA':<30} {'VERSÃO':<10} {'CATEGORIA':<16} {'PLATAFORMA':<18} {'CONTA DRIVE':<14} {'TAMANHO':<10}")
    print("-" * 105)

    if not progs:
        print(f"{YELLOW}Nenhum programa cadastrado no catálogo do Drive.{RESET}")
        print(f"{DIM}Cadastre um novo com: python main.py add-program <arquivo> --nome <nome>{RESET}\n")
        return

    for p in progs:
        tamanho_fmt = format_bytes(p["tamanho_bytes"]) if p.get("tamanho_bytes") else "N/A"
        conta_fmt = p.get("conta_origem") or "Drive Pool"
        print(
            f"{BOLD}{p['id']:<4}{RESET} "
            f"{p['nome_programa']:<30} "
            f"{p['versao']:<10} "
            f"{p['categoria']:<16} "
            f"{p['plataforma']:<18} "
            f"{CYAN}{conta_fmt:<14}{RESET} "
            f"{tamanho_fmt:<10}"
        )
        if p.get("descricao"):
            print(f"     {DIM}↳ Descrição: {p['descricao']}{RESET}")
        if p.get("comando_execucao"):
            print(f"     {DIM}↳ Comando: {GREEN}{p['comando_execucao']}{RESET}")
        print()

    print(f"{DIM}Para executar ou baixar um programa: python main.py launch <ID_ou_NOME>{RESET}")
    print(f"{DIM}Para adicionar novo programa: python main.py add-program <arquivo> --nome \"Nome\"{RESET}\n")


def cmd_launch(manager: VirtualPoolManager, identifier: str):
    """Prepara, baixa sob demanda e executa um programa do Google Drive."""
    print(f"\n{CYAN}{BOLD}Iniciando inicialização do programa '{identifier}' do Drive...{RESET}")
    try:
        def on_progress(current, total, pct):
            print(f"\r  • Baixando do Google Drive: {format_bytes(current)} / {format_bytes(total)} ({pct:.1f}%)", end="")

        result = manager.launch_program(identifier, progress_callback=on_progress)
        prog = result["programa"]
        print(f"\n{GREEN}{BOLD}✔ Programa pronto para execução!{RESET}")
        print(f"  • Nome: {BOLD}{prog['nome_programa']}{RESET} (v{prog['versao']})")
        print(f"  • Categoria: {prog['categoria']} | Plataforma: {prog['plataforma']}")
        print(f"  • Conta no Drive: {CYAN}{prog.get('conta_origem', 'Pool')}{RESET}")
        if result.get("caminho_local"):
            print(f"  • Caminho em Cache Local: {result['caminho_local']}")
        print(f"  • Comando de Execução: {GREEN}{result['comando_execucao']}{RESET}")
        print(f"\n{DIM}Executando em ambiente local...{RESET}\n")
    except Exception as e:
        print(f"\n{RED}✖ Falha ao acessar/executar o programa: {e}{RESET}\n")


def cmd_add_program(
    manager: VirtualPoolManager,
    arquivo: Optional[str],
    nome: str,
    versao: str,
    categoria: str,
    plataforma: str,
    descricao: str,
    comando: str
):
    """Faz o upload e cadastra um novo programa no Google Drive."""
    print(f"\n{CYAN}{BOLD}Cadastrando novo programa '{nome}' no Google Drive Virtual Pool...{RESET}")
    try:
        def on_prog(current, total, pct):
            print(f"\r  • Enviando para a conta com mais espaço livre: {pct:.1f}%", end="")

        created = manager.add_program(
            nome_programa=nome,
            local_file_path_or_id=arquivo,
            versao=versao,
            categoria=categoria,
            plataforma=plataforma,
            descricao=descricao,
            comando_execucao=comando,
            progress_callback=on_prog if arquivo and os.path.isfile(arquivo) else None
        )
        print(f"\n{GREEN}{BOLD}✔ Programa '{created['nome_programa']}' registrado com sucesso! (ID: {created['id']}){RESET}")
        print(f"  • Categoria: {created['categoria']} | Versão: {created['versao']}")
        print(f"  • Plataforma: {created['plataforma']}")
        if created.get("nome_arquivo"):
            print(f"  • Arquivo no Drive: {created['nome_arquivo']} ({created.get('conta_origem', 'Drive')})")
        print(f"\n{DIM}Execute 'python main.py programs' para ver todos os softwares.{RESET}\n")
    except Exception as e:
        print(f"\n{RED}✖ Falha ao cadastrar programa: {e}{RESET}\n")


# -------------------------------------------------------------
# Comandos de Sincronização Automática de Pastas e Watcher (MFS)
# -------------------------------------------------------------
def cmd_sync_folders(manager: VirtualPoolManager):
    """Lista as pastas locais designadas para sincronização com o pool."""
    print(f"\n{CYAN}{BOLD}📁 Pastas Locais Designadas para Auto-Sync com o Pool Virtual:{RESET}")
    folders = manager.list_sync_folders()
    if not folders:
        print(f"  {YELLOW}Nenhuma pasta designada cadastrada.{RESET}")
        print(f"  {DIM}Use 'python main.py add-sync-folder <caminho>' para adicionar uma pasta.{RESET}\n")
        return

    table_data = []
    for f in folders:
        status_str = f"{GREEN}Ativo{RESET}" if f.get("ativo", 1) else f"{YELLOW}Pausado{RESET}"
        rec_str = "Sim" if f.get("recursivo", 1) else "Não"
        ultimo = f.get("ultimo_sync")
        ultimo_str = ultimo[:19].replace("T", " ") if ultimo else "Nunca"
        table_data.append([
            str(f["id"]),
            f["nome_identificador"][:25],
            f["caminho_local"][-35:] if len(f["caminho_local"]) > 35 else f["caminho_local"],
            status_str,
            rec_str,
            str(f.get("total_arquivos", 0)),
            f.get("total_bytes_formatado", "0 B"),
            ultimo_str
        ])

    headers = ["ID", "Nome", "Caminho Local", "Status", "Recursivo", "Arquivos", "Tamanho", "Último Sync"]
    col_widths = [max(len(h), max((len(row[i]) for row in table_data), default=0)) for i, h in enumerate(headers)]
    header_row = "  ".join(f"{h:<{w}}" for h, w in zip(headers, col_widths))
    sep_row = "  ".join("-" * w for w in col_widths)

    print(f"{BOLD}{header_row}{RESET}")
    print(f"{DIM}{sep_row}{RESET}")
    for row in table_data:
        # Note: row contains ANSI escapes so we adjust spacing
        line = f"  ".join(f"{col:<{w}}" for col, w in zip(row, col_widths))
        print(line)
    print(f"\n{DIM}Dica: Execute 'python main.py watch' para iniciar o monitoramento em tempo real.{RESET}\n")


def cmd_add_sync_folder(manager: VirtualPoolManager, caminho: str, nome: Optional[str] = None, recursivo: bool = True):
    """Designa nova pasta local para sincronização contínua."""
    abs_path = os.path.abspath(caminho)
    if not os.path.exists(abs_path):
        os.makedirs(abs_path, exist_ok=True)
        print(f"{GREEN}✔ Diretório local criado no disco: {abs_path}{RESET}")

    res = manager.add_sync_folder(abs_path, nome_identificador=nome, recursivo=recursivo)
    print(f"\n{GREEN}{BOLD}✔ Pasta designada com sucesso para Auto-Sync!{RESET}")
    print(f"  • ID: {res['id']}")
    print(f"  • Nome: {res['nome_identificador']}")
    print(f"  • Caminho: {res['caminho_local']}")
    print(f"  • Modo: {'Recursivo (subpastas inclusas)' if recursivo else 'Apenas raiz'}")
    print(f"\n{DIM}Inicie o watcher com: python main.py watch --folder \"{res['caminho_local']}\"{RESET}\n")


def cmd_remove_sync_folder(manager: VirtualPoolManager, identifier: str):
    """Remove uma pasta designada da sincronização."""
    success = manager.remove_sync_folder(identifier)
    if success:
        print(f"\n{GREEN}{BOLD}✔ Pasta designada '{identifier}' removida com sucesso das configurações.{RESET}\n")
    else:
        print(f"\n{RED}✖ Pasta '{identifier}' não encontrada no catálogo.{RESET}\n")


def cmd_sync(manager: VirtualPoolManager, identifier: Optional[str] = None):
    """Executa sincronização manual imediata usando a política MFS."""
    if identifier:
        print(f"\n{CYAN}{BOLD}Iniciando sincronização da pasta designada '{identifier}'...{RESET}")
        try:
            res = manager.sync_folder(identifier)
            print(f"\n{GREEN}{BOLD}✔ Sincronização concluída com sucesso!{RESET}")
            print(f"  • Arquivos enviados: {res['arquivos_enviados']}")
            print(f"  • Arquivos já sincronizados (ignorados): {res['arquivos_ignorados']}")
            print(f"  • Falhas: {res['erros']}")
            print(f"  • Volume transferido: {res['bytes_sincronizados_formatado']}")
            for f in res.get("arquivos", []):
                print(f"    ➔ {f['nome']} ({f['tamanho_formatado']}) alocado via MFS em: {CYAN}{f['conta_destino'].upper()}{RESET}")
        except Exception as e:
            print(f"\n{RED}✖ Erro na sincronização: {e}{RESET}\n")
    else:
        print(f"\n{CYAN}{BOLD}Iniciando sincronização de todas as pastas designadas ativas...{RESET}")
        results = manager.sync_all_active_folders()
        total_up = sum(r.get("arquivos_enviados", 0) for r in results)
        total_b = sum(r.get("bytes_sincronizados", 0) for r in results)
        print(f"\n{GREEN}{BOLD}✔ Processadas {len(results)} pasta(s). Total de {total_up} arquivo(s) enviados ({format_bytes(total_b)}).{RESET}\n")


def cmd_watch(manager: VirtualPoolManager, folder: Optional[str] = None, interval: float = 5.0, once: bool = False):
    """Inicia o daemon de monitoramento contínuo (watcher) com uploads MFS automáticos."""
    from drive_pool.watcher import FolderWatcher
    watcher = FolderWatcher(
        manager=manager,
        poll_interval=interval,
        target_folder_path=folder
    )
    if once:
        watcher.scan_and_sync_all(verbose=True)
    else:
        watcher.run_loop()




def run_cli():
    """Ponto de entrada principal da CLI."""
    parser = argparse.ArgumentParser(
        description="Google Drive Virtual Storage Pool - Gerenciador Multi-Conta (N Contas)"
    )
    subparsers = parser.add_subparsers(dest="command", help="Comandos disponíveis")

    # upload <caminho_arquivo>
    p_upload = subparsers.add_parser("upload", help="Envia um arquivo para o pool usando balanceamento MFS")
    p_upload.add_argument("arquivo", help="Caminho do arquivo local para envio")

    # list
    subparsers.add_parser("list", help="Lista arquivos do catálogo unificado e exibe cota total do pool")

    # download <id_ou_nome> <destino>
    p_download = subparsers.add_parser("download", help="Baixa um arquivo do pool a partir do ID ou nome")
    p_download.add_argument("identificador", help="ID numérico ou nome do arquivo")
    p_download.add_argument("destino", help="Pasta ou caminho do arquivo onde salvar")

    # delete <id_ou_nome>
    p_delete = subparsers.add_parser("delete", help="Remove o arquivo do Google Drive e do SQLite")
    p_delete.add_argument("identificador", help="ID numérico ou nome do arquivo a excluir")

    # accounts
    subparsers.add_parser("accounts", help="Lista todas as contas Google Drive cadastradas no pool")

    # add-account <id> [--nome] [--email]
    p_add = subparsers.add_parser("add-account", help="Cadastra uma nova conta no pool (ex: add-account drive_3)")
    p_add.add_argument("id", help="Identificador único da conta (ex: drive_3, drive_backup)")
    p_add.add_argument("--nome", help="Nome de exibição opcional", default=None)
    p_add.add_argument("--email", help="E-mail da conta Google opcional", default=None)

    # remove-account <id>
    p_rm = subparsers.add_parser("remove-account", help="Remove uma conta do pool")
    p_rm.add_argument("id", help="Identificador da conta a remover")

    # auth [conta]
    p_auth = subparsers.add_parser("auth", help="Realiza o login OAuth 2.0 das contas do Google Drive")
    p_auth.add_argument("conta", nargs="?", default=None, help="Conta específica a autorizar (ex: drive_1, drive_2, drive_3)")

    # programs / apps
    p_progs = subparsers.add_parser("programs", help="Lista programas, softwares e instaladores armazenados no Drive")
    p_progs.add_argument("--categoria", help="Filtrar por categoria", default=None)
    p_progs.add_argument("--plataforma", help="Filtrar por plataforma (Windows, Linux, macOS)", default=None)

    # launch <id_ou_nome>
    p_launch = subparsers.add_parser("launch", help="Prepara, baixa se necessário e executa um programa do Drive")
    p_launch.add_argument("identificador", help="ID numérico ou nome do programa a executar")

    # add-program <arquivo> --nome <nome>
    p_add_prog = subparsers.add_parser("add-program", help="Envia um novo executável/programa para o Google Drive e o cataloga")
    p_add_prog.add_argument("arquivo", nargs="?", default=None, help="Caminho do instalador ou executável local")
    p_add_prog.add_argument("--nome", required=True, help="Nome do programa")
    p_add_prog.add_argument("--versao", default="1.0.0", help="Versão do software")
    p_add_prog.add_argument("--categoria", default="Utilitários", help="Categoria (Produtividade, Dev, Jogos, etc.)")
    p_add_prog.add_argument("--plataforma", default="Multiplataforma", help="Plataforma suportada")
    p_add_prog.add_argument("--descricao", default="", help="Descrição ou notas de uso")
    p_add_prog.add_argument("--comando", default="", help="Comando para execução local")

    # sync-folders
    subparsers.add_parser("sync-folders", help="Lista pastas locais designadas para auto-sync com o pool")

    # add-sync-folder <caminho> [--nome <nome>] [--no-recursive]
    p_add_sync = subparsers.add_parser("add-sync-folder", help="Designa uma pasta local para sincronização contínua com o Pool")
    p_add_sync.add_argument("caminho", help="Caminho da pasta local")
    p_add_sync.add_argument("--nome", help="Nome de identificação da pasta", default=None)
    p_add_sync.add_argument("--no-recursive", action="store_true", help="Desativa sincronização de subpastas")

    # remove-sync-folder <id_ou_caminho>
    p_rm_sync = subparsers.add_parser("remove-sync-folder", help="Remove uma pasta designada da sincronização")
    p_rm_sync.add_argument("identificador", help="ID numérico ou caminho da pasta designada")

    # sync [id_ou_caminho]
    p_sync = subparsers.add_parser("sync", help="Sincroniza imediatamente uma pasta ou todas as pastas ativas usando MFS")
    p_sync.add_argument("identificador", nargs="?", default=None, help="ID ou caminho da pasta (opcional, sincroniza todas se omitido)")

    # watch [--folder <caminho>] [--interval <seg>] [--once]
    p_watch = subparsers.add_parser("watch", help="Inicia o watcher em tempo real para sincronização contínua via MFS")
    p_watch.add_argument("--folder", "-f", help="Pasta específica para monitorar (opcional)", default=None)
    p_watch.add_argument("--interval", "-i", type=float, default=5.0, help="Intervalo de verificação em segundos (padrão: 5)")
    p_watch.add_argument("--once", action="store_true", help="Executa apenas uma verificação e encerra")

    args = parser.parse_args()

    print_banner()
    manager = VirtualPoolManager()

    if args.command == "upload":
        cmd_upload(manager, args.arquivo)
    elif args.command == "list":
        cmd_list(manager)
    elif args.command == "download":
        cmd_download(manager, args.identificador, args.destino)
    elif args.command == "delete":
        cmd_delete(manager, args.identificador)
    elif args.command == "accounts":
        cmd_accounts(manager)
    elif args.command == "add-account":
        cmd_add_account(manager, args.id, args.nome, args.email)
    elif args.command == "remove-account":
        cmd_remove_account(manager, args.id)
    elif args.command == "programs":
        cmd_programs(manager, args.categoria, args.plataforma)
    elif args.command == "launch":
        cmd_launch(manager, args.identificador)
    elif args.command == "add-program":
        cmd_add_program(
            manager,
            arquivo=args.arquivo,
            nome=args.nome,
            versao=args.versao,
            categoria=args.categoria,
            plataforma=args.plataforma,
            descricao=args.descricao,
            comando=args.comando
        )
    elif args.command == "sync-folders":
        cmd_sync_folders(manager)
    elif args.command == "add-sync-folder":
        cmd_add_sync_folder(manager, args.caminho, args.nome, recursivo=not args.no_recursive)
    elif args.command == "remove-sync-folder":
        cmd_remove_sync_folder(manager, args.identificador)
    elif args.command == "sync":
        cmd_sync(manager, args.identificador)
    elif args.command == "watch":
        cmd_watch(manager, folder=args.folder, interval=args.interval, once=args.once)
    elif args.command == "auth":
        cmd_auth(manager, args.conta)
    elif args.command == "status":
        cmd_list(manager)
    else:
        parser.print_help()


if __name__ == "__main__":
    run_cli()
