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
    """Autentica uma ou ambas as contas Google Drive."""
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


def run_cli():
    """Ponto de entrada principal da CLI."""
    parser = argparse.ArgumentParser(
        description="Google Drive Virtual Storage Pool - Gerenciador Multi-Conta"
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

    # auth [conta]
    p_auth = subparsers.add_parser("auth", help="Realiza o login OAuth 2.0 das contas do Google Drive")
    p_auth.add_argument("conta", nargs="?", choices=["drive_1", "drive_2"], help="Conta específica a autorizar (opcional)")

    # status
    subparsers.add_parser("status", help="Exibe o status de cota e capacidade das contas e do pool")

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
    elif args.command == "auth":
        cmd_auth(manager, args.conta)
    elif args.command == "status":
        cmd_list(manager)
    else:
        parser.print_help()


if __name__ == "__main__":
    run_cli()
