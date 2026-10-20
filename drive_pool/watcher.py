#!/usr/bin/env python3
"""
Módulo Watcher de Sincronização Automática com o Virtual Storage Pool.
Monitora pastas locais designadas, detecta alterações ou novos arquivos,
e executa o upload automático distribuindo o armazenamento entre as contas do Google Drive
através da política de alocação MFS (Most Free Space).

Pode ser executado diretamente via:
    python -m drive_pool.watcher
    python main.py watch --folder /caminho/da/pasta --interval 5
"""

import os
import sys
import time
import signal
import logging
import argparse
import threading
from typing import Dict, Any, List, Optional, Set, Callable
from datetime import datetime

# Assegura que o módulo raiz esteja no sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from drive_pool.pool_manager import VirtualPoolManager
from drive_pool.storage import format_bytes, calculate_md5

# Configuração de cores ANSI para o terminal
BLUE = "\033[94m"
CYAN = "\033[96m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BOLD = "\033[1m"
DIM = "\033[2m"
RESET = "\033[0m"

logger = logging.getLogger("FolderWatcher")


class FolderWatcher:
    """
    Monitor contínuo de pastas locais para auto-sync com o Google Drive Pool via MFS.
    """

    def __init__(
        self,
        manager: Optional[VirtualPoolManager] = None,
        poll_interval: float = 5.0,
        debounce_delay: float = 1.5,
        target_folder_path: Optional[str] = None
    ):
        self.manager = manager or VirtualPoolManager()
        self.poll_interval = poll_interval
        self.debounce_delay = debounce_delay
        self.target_folder_path = os.path.abspath(target_folder_path) if target_folder_path else None
        
        self._stop_event = threading.Event()
        self._file_state_cache: Dict[str, Dict[str, Any]] = {}
        self.is_running = False

    def stop(self):
        """Sinaliza para encerrar o loop de monitoramento."""
        self._stop_event.set()
        self.is_running = False

    def scan_and_sync_all(self, verbose: bool = True) -> Dict[str, Any]:
        """
        Executa uma rodada de verificação e sincronização de todas as pastas designadas
        (ou da pasta específica configurada no inicializador).
        """
        if self.target_folder_path:
            # Sincroniza apenas a pasta alvo designada
            folder = self.manager.get_sync_folder(self.target_folder_path)
            if not folder:
                # Se não estava cadastrada no banco, cadastra automaticamente
                folder = self.manager.add_sync_folder(
                    caminho_local=self.target_folder_path,
                    nome_identificador=os.path.basename(self.target_folder_path) or "Pasta Monitorada",
                    recursivo=True
                )
            folders_to_sync = [folder]
        else:
            # Obtém todas as pastas ativas do catálogo
            folders = self.manager.list_sync_folders()
            folders_to_sync = [f for f in folders if f.get("ativo", 1)]

        total_uploaded = 0
        total_skipped = 0
        total_errors = 0
        total_bytes = 0
        details = []

        for folder in folders_to_sync:
            caminho = folder["caminho_local"]
            if not os.path.isdir(caminho):
                if verbose:
                    print(f"{YELLOW}⚠ Diretório ignorado (não encontrado): {caminho}{RESET}")
                continue

            try:
                res = self.manager.sync_folder(
                    identifier=str(folder["id"]),
                    force_upload=False
                )
                total_uploaded += res["arquivos_enviados"]
                total_skipped += res["arquivos_ignorados"]
                total_errors += res["erros"]
                total_bytes += res["bytes_sincronizados"]

                if res["arquivos_enviados"] > 0 and verbose:
                    for item in res["arquivos"]:
                        print(
                            f"  {GREEN}{BOLD}✔ [MFS Sync]{RESET} {item['nome']} "
                            f"({item['tamanho_formatado']}) ➔ {CYAN}{item['conta_destino'].upper()}{RESET}"
                        )

                details.append(res)
            except Exception as e:
                total_errors += 1
                logger.error(f"Erro ao processar pasta {caminho}: {e}")
                if verbose:
                    print(f"  {RED}✖ Erro ao sincronizar '{caminho}': {e}{RESET}")

        return {
            "uploaded": total_uploaded,
            "skipped": total_skipped,
            "errors": total_errors,
            "bytes_synced": total_bytes,
            "details": details
        }

    def run_loop(self, callback_on_sync: Optional[Callable[[Dict[str, Any]], None]] = None):
        """
        Executa o loop contínuo de observação em foreground ou em thread de segundo plano.
        """
        self.is_running = True
        self._stop_event.clear()

        # Feedback inicial no console
        print(f"\n{CYAN}{BOLD}📡 MFS Auto-Sync Watcher Iniciado{RESET}")
        print(f"{DIM}Intervalo de verificação: {self.poll_interval}s | Debounce: {self.debounce_delay}s{RESET}")
        
        if self.target_folder_path:
            print(f"Monitorando diretório específico: {BOLD}{self.target_folder_path}{RESET}")
        else:
            folders = self.manager.list_sync_folders()
            active_f = [f for f in folders if f.get("ativo", 1)]
            print(f"Monitorando {len(active_f)} pasta(s) designada(s) ativas no banco:")
            for f in active_f:
                print(f"  📁 {BOLD}{f['nome_identificador']}{RESET}: {DIM}{f['caminho_local']}{RESET}")

        print(f"{DIM}Pressione Ctrl+C para encerrar o monitoramento.{RESET}\n")

        # Primeira rodada imediata
        try:
            initial_res = self.scan_and_sync_all(verbose=True)
            if callback_on_sync:
                callback_on_sync(initial_res)
        except Exception as e:
            logger.error(f"Erro na varredura inicial: {e}")

        # Loop contínuo com verificação periódica
        cycle = 0
        while not self._stop_event.is_set():
            try:
                # Aguarda o intervalo ou sinal de encerramento
                if self._stop_event.wait(timeout=self.poll_interval):
                    break

                cycle += 1
                res = self.scan_and_sync_all(verbose=True)
                if callback_on_sync and res["uploaded"] > 0:
                    callback_on_sync(res)

            except KeyboardInterrupt:
                break
            except Exception as e:
                logger.error(f"Erro no ciclo do watcher: {e}")
                time.sleep(1)

        self.is_running = False
        print(f"\n{YELLOW}⏹ Watcher de sincronização encerrado.{RESET}")


def run_standalone():
    """Ponto de entrada para execução via linha de comando."""
    parser = argparse.ArgumentParser(
        description="Google Drive Pool - Watcher de Sincronização Automática com Alocação MFS"
    )
    parser.add_argument(
        "--folder",
        "-f",
        help="Caminho do diretório local para monitorar (ou usa todas as pastas cadastradas)",
        default=None
    )
    parser.add_argument(
        "--interval",
        "-i",
        help="Intervalo de polling em segundos (padrão: 5)",
        type=float,
        default=5.0
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Executa uma única verificação/sincronização e sai"
    )

    args = parser.parse_args()

    # Cria diretório caso o usuário tenha passado um caminho e ele não exista
    if args.folder and not os.path.exists(args.folder):
        os.makedirs(args.folder, exist_ok=True)
        print(f"{GREEN}Diretório criado: {args.folder}{RESET}")

    manager = VirtualPoolManager()
    watcher = FolderWatcher(
        manager=manager,
        poll_interval=args.interval,
        target_folder_path=args.folder
    )

    if args.once:
        print(f"\n{CYAN}{BOLD}Executando sincronização pontual (--once)...{RESET}")
        res = watcher.scan_and_sync_all(verbose=True)
        print(
            f"\n{GREEN}{BOLD}Concluído:{RESET} {res['uploaded']} arquivo(s) enviados, "
            f"{res['skipped']} mantidos sem alterações, {res['errors']} falhas. "
            f"Total transferido: {format_bytes(res['bytes_synced'])}"
        )
    else:
        # Configura captura graciosa de sinais
        def handle_signal(sig, frame):
            watcher.stop()

        signal.signal(signal.SIGINT, handle_signal)
        signal.signal(signal.SIGTERM, handle_signal)
        watcher.run_loop()


if __name__ == "__main__":
    run_standalone()
