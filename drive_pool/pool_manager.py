"""
Orquestrador Principal do Virtual Storage Pool.
Coordena N contas do Google Drive, política MFS (Most Free Space)
e sincronização com o catálogo SQLite local.
Suporta número dinâmico e arbitrário de contas Google Drive.
"""

import os
import logging
from typing import Dict, Any, List, Optional, Tuple, Callable
from pathlib import Path

from .auth import AccountAuthManager, DEFAULT_CREDENTIALS_FILE, DEFAULT_TOKENS
from .database import VirtualDriveDatabase, DEFAULT_DB_PATH
from .storage import (
    DriveStorageService,
    calculate_md5,
    format_bytes,
    DEFAULT_CHUNK_SIZE
)

logger = logging.getLogger("PoolManager")


class InsufficientPoolSpaceError(Exception):
    """Exceção levantada quando nenhuma conta possui espaço suficiente para alocar o arquivo."""
    pass


class VirtualPoolManager:
    """
    Controlador central do Pool Virtual de Armazenamento.
    Unifica a capacidade de armazenamento de múltiplas contas do Google Drive (N contas).
    """

    def __init__(
        self,
        credentials_file: str = DEFAULT_CREDENTIALS_FILE,
        db_path: str = DEFAULT_DB_PATH,
        account_ids: Optional[List[str]] = None
    ):
        self.credentials_file = credentials_file
        self.db = VirtualDriveDatabase(db_path)
        self.auth_managers: Dict[str, AccountAuthManager] = {}

        if account_ids:
            for acc in account_ids:
                self.db.register_account(acc)

        self._sync_accounts()

    def _sync_accounts(self) -> None:
        """Sincroniza os gerenciadores de autenticação com o banco de dados SQLite."""
        registered = self.db.list_accounts(only_active=True)
        self.account_ids = [row["id"] for row in registered]

        for acc in registered:
            acc_id = acc["id"]
            if acc_id not in self.auth_managers:
                self.auth_managers[acc_id] = AccountAuthManager(
                    account_id=acc_id,
                    token_path=acc["token_path"] or DEFAULT_TOKENS.get(acc_id, f"token_{acc_id}.json"),
                    credentials_path=self.credentials_file
                )

        # Remove contas que foram desativadas
        current_ids = set(self.account_ids)
        for old_id in list(self.auth_managers.keys()):
            if old_id not in current_ids:
                del self.auth_managers[old_id]

    def add_account(
        self,
        account_id: str,
        display_name: Optional[str] = None,
        email: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Cadastra dinamicamente uma nova conta Google Drive no pool.
        Ex: add_account('drive_3', 'Backup Nuvem 3', 'conta3@gmail.com')
        """
        clean_id = account_id.strip().lower().replace(" ", "_")
        acc_info = self.db.register_account(
            account_id=clean_id,
            nome_exibicao=display_name or f"Conta {clean_id}",
            email=email
        )
        self._sync_accounts()
        logger.info(f"Nova conta registrada no pool: {clean_id}")
        return acc_info

    def remove_account(self, account_id: str) -> bool:
        """
        Remove o registro de uma conta do pool.
        """
        clean_id = account_id.strip().lower()
        success = self.db.delete_account(clean_id)
        if success:
            if clean_id in self.auth_managers:
                del self.auth_managers[clean_id]
            self._sync_accounts()
        return success

    def list_registered_accounts(self) -> List[Dict[str, Any]]:
        """Lista todas as contas ativas cadastradas com seus status."""
        self._sync_accounts()
        return self.db.list_accounts(only_active=True)

    def get_auth_manager(self, account_id: str) -> AccountAuthManager:
        """Obtém o gerenciador de autenticação de uma conta específica."""
        self._sync_accounts()
        if account_id not in self.auth_managers:
            # Tenta cadastrar automaticamente se não estiver presente
            self.add_account(account_id)
        return self.auth_managers[account_id]

    def get_storage_service(self, account_id: str, interactive: bool = True) -> DriveStorageService:
        """Obtém o serviço de armazenamento configurado para a conta solicitada."""
        auth_mgr = self.get_auth_manager(account_id)
        service = auth_mgr.get_service(interactive=interactive)
        return DriveStorageService(account_id, service)

    def get_pool_status(self, interactive: bool = False) -> Dict[str, Any]:
        """
        Consulta as cotas de todas as contas cadastradas (N contas) e gera o sumário total do pool.
        """
        self._sync_accounts()
        accounts_status: Dict[str, Dict[str, Any]] = {}
        total_limit = 0
        total_usage = 0
        total_free = 0

        for acc_id in self.account_ids:
            auth_mgr = self.auth_managers[acc_id]
            is_auth = auth_mgr.is_authenticated()

            if is_auth:
                try:
                    storage = self.get_storage_service(acc_id, interactive=interactive)
                    quota = storage.get_storage_quota()
                    accounts_status[acc_id] = {
                        "authenticated": True,
                        "quota": quota,
                        "error": None
                    }
                    total_limit += quota["limit_bytes"]
                    total_usage += quota["usage_bytes"]
                    total_free += quota["free_bytes"]

                    # Atualiza email no banco se ainda não salvo
                    if quota.get("user_email") and quota["user_email"] != "N/A":
                        self.db.update_account_email(acc_id, quota["user_email"], quota.get("user_name"))

                except Exception as e:
                    accounts_status[acc_id] = {
                        "authenticated": True,
                        "quota": None,
                        "error": str(e)
                    }
            else:
                accounts_status[acc_id] = {
                    "authenticated": False,
                    "quota": None,
                    "error": "Não autenticado"
                }

        percent_used = round((total_usage / total_limit) * 100, 2) if total_limit > 0 else 0.0
        db_stats = self.db.get_aggregated_stats()

        return {
            "total_limit_bytes": total_limit,
            "total_usage_bytes": total_usage,
            "total_free_bytes": total_free,
            "percent_used": percent_used,
            "formatted_total_limit": format_bytes(total_limit),
            "formatted_total_usage": format_bytes(total_usage),
            "formatted_total_free": format_bytes(total_free),
            "total_accounts_count": len(self.account_ids),
            "accounts": accounts_status,
            "db_stats": db_stats
        }

    def allocate_account_mfs(self, file_size_bytes: int) -> Tuple[str, Dict[str, Any]]:
        """
        Política Most Free Space (MFS) com suporte a N Contas:
        1. Consulta o espaço livre atual em cada uma das N contas ativas.
        2. Filtra contas cujo espaço livre seja maior ou igual ao tamanho do arquivo.
        3. Seleciona a conta com o maior espaço livre disponível.
        4. Caso nenhuma comporte o arquivo, gera erro descritivo listando o status de todas as contas.
        """
        self._sync_accounts()
        quotas: Dict[str, Dict[str, Any]] = {}
        available_candidates: List[Tuple[str, int]] = []

        for acc_id in self.account_ids:
            auth_mgr = self.auth_managers[acc_id]
            if not auth_mgr.is_authenticated():
                continue

            try:
                storage = self.get_storage_service(acc_id, interactive=True)
                quota = storage.get_storage_quota()
                quotas[acc_id] = quota
                free_b = quota["free_bytes"]

                if free_b >= file_size_bytes:
                    available_candidates.append((acc_id, free_b))
            except Exception as e:
                logger.error(f"Erro ao verificar cota para MFS na conta {acc_id}: {e}")

        if not available_candidates:
            detalhes = []
            for acc_id in self.account_ids:
                if acc_id in quotas:
                    detalhes.append(f"{acc_id.upper()}: livre {quotas[acc_id]['formatted_free']}")
                else:
                    detalhes.append(f"{acc_id.upper()}: não conectada ou sem cota")

            msg = (
                f"Espaço insuficiente no Pool Virtual ({len(self.account_ids)} contas consultadas)!\n"
                f"Tamanho do arquivo: {format_bytes(file_size_bytes)}\n"
                f"Capacidade restante: {', '.join(detalhes)}\n"
                f"Nenhuma conta individual possui capacidade suficiente para armazenar este arquivo."
            )
            raise InsufficientPoolSpaceError(msg)

        # Escolhe a conta com maior espaço livre (MFS)
        best_account, best_free = max(available_candidates, key=lambda item: item[1])
        logger.info(
            f"MFS selecionou conta '{best_account}' (livre: {format_bytes(best_free)}) "
            f"dentre {len(available_candidates)} contas aptas para arquivo de {format_bytes(file_size_bytes)}."
        )
        return best_account, quotas[best_account]

    def upload_file(
        self,
        filepath: str,
        progress_callback: Optional[Callable[[int, int, float], None]] = None
    ) -> Dict[str, Any]:
        """
        Executa o fluxo completo de upload:
        - Validação local e cálculo de MD5.
        - Consulta de cotas e alocação MFS entre todas as contas.
        - Upload em chunks com suporte a barra de progresso.
        - Registro no catálogo SQLite local.
        """
        if not os.path.isfile(filepath):
            raise FileNotFoundError(f"Arquivo não encontrado no caminho: {filepath}")

        abs_path = os.path.abspath(filepath)
        filename = os.path.basename(abs_path)
        file_size = os.path.getsize(abs_path)
        md5_hash = calculate_md5(abs_path)

        best_account, quota_info = self.allocate_account_mfs(file_size)

        storage = self.get_storage_service(best_account, interactive=True)
        remote_meta = storage.upload_file_resumable(
            filepath=abs_path,
            progress_callback=progress_callback
        )

        remote_id = remote_meta.get("id")
        if not remote_id:
            raise RuntimeError(f"Google Drive não retornou ID para o arquivo enviado: {remote_meta}")

        local_id = self.db.add_file(
            nome_arquivo=filename,
            tamanho_bytes=file_size,
            md5_hash=md5_hash,
            conta_origem=best_account,
            id_remoto_google=remote_id
        )

        record = self.db.find_file(str(local_id))
        return {
            "record": record,
            "allocated_account": best_account,
            "remote_meta": remote_meta
        }

    def list_files(self, filter_account: Optional[str] = None) -> List[Dict[str, Any]]:
        """Lista os arquivos unificados do catálogo SQLite."""
        files = self.db.list_files(filter_account)
        for f in files:
            f["tamanho_formatado"] = format_bytes(f["tamanho_bytes"])
        return files

    def download_file(
        self,
        identifier: str,
        destination_path: str,
        progress_callback: Optional[Callable[[int, int, float], None]] = None
    ) -> Tuple[Dict[str, Any], str]:
        """
        Localiza o arquivo no SQLite, identifica a conta de origem,
        e faz o download em streaming com chunks para o destino especificado.
        """
        record = self.db.find_file(identifier)
        if not record:
            raise ValueError(f"Arquivo '{identifier}' não encontrado no catálogo local.")

        account_id = record["conta_origem"]
        remote_id = record["id_remoto_google"]
        original_name = record["nome_arquivo"]

        if os.path.isdir(destination_path):
            final_dest = os.path.join(destination_path, original_name)
        else:
            final_dest = destination_path

        storage = self.get_storage_service(account_id, interactive=True)
        saved_path = storage.download_file_streaming(
            remote_id=remote_id,
            dest_path=final_dest,
            progress_callback=progress_callback
        )

        return record, saved_path

    def delete_file(self, identifier: str) -> Dict[str, Any]:
        """
        Remove o arquivo tanto do Google Drive correto quanto do catálogo SQLite.
        """
        record = self.db.find_file(identifier)
        if not record:
            raise ValueError(f"Arquivo '{identifier}' não encontrado no catálogo local.")

        account_id = record["conta_origem"]
        remote_id = record["id_remoto_google"]

        storage = self.get_storage_service(account_id, interactive=True)
        storage.delete_remote_file(remote_id)

        deleted_record = self.db.delete_file(str(record["id"]))
        return deleted_record or record

    # -------------------------------------------------------------
    # Gestão de Programas e Softwares no Google Drive
    # -------------------------------------------------------------
    def list_programs(
        self,
        categoria: Optional[str] = None,
        plataforma: Optional[str] = None,
        search: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Retorna lista de programas cadastrados no pool com detalhes de armazenamento."""
        return self.db.list_programs(categoria=categoria, plataforma=plataforma, search=search)

    def get_program(self, identifier: str) -> Optional[Dict[str, Any]]:
        """Busca um programa específico por ID ou nome."""
        return self.db.get_program(identifier)

    def add_program(
        self,
        nome_programa: str,
        local_file_path_or_id: Optional[str] = None,
        versao: str = "1.0.0",
        categoria: str = "Utilitários",
        plataforma: str = "Multiplataforma",
        descricao: str = "",
        comando_execucao: str = "",
        progress_callback: Optional[Callable[[int, int, float], None]] = None
    ) -> Dict[str, Any]:
        """
        Adiciona um programa ao pool virtual:
        Se local_file_path_or_id for um arquivo existente no disco local, faz o upload para o Google Drive
        utilizando a política Most Free Space (MFS) e associa o programa ao novo registro no SQLite.
        Se for um ID de arquivo já presente no catálogo, apenas associa.
        """
        arquivo_id = None

        if local_file_path_or_id:
            if os.path.isfile(local_file_path_or_id):
                # Faz upload inteligente para a conta com mais espaço livre
                uploaded_record = self.allocate_and_upload(
                    local_file_path=local_file_path_or_id,
                    progress_callback=progress_callback
                )
                arquivo_id = uploaded_record["id"]
            elif str(local_file_path_or_id).isdigit():
                existing = self.db.find_file(str(local_file_path_or_id))
                if existing:
                    arquivo_id = existing["id"]

        return self.db.register_program(
            nome_programa=nome_programa,
            arquivo_id=arquivo_id,
            versao=versao,
            categoria=categoria,
            plataforma=plataforma,
            descricao=descricao,
            comando_execucao=comando_execucao
        )

    def launch_program(
        self,
        identifier: str,
        cache_dir: Optional[str] = None,
        progress_callback: Optional[Callable[[int, int, float], None]] = None
    ) -> Dict[str, Any]:
        """
        Prepara e executa/abre o programa armazenado no Google Drive:
        1. Localiza os metadados do programa e do arquivo no SQLite.
        2. Se houver arquivo remoto e não estiver em cache local, baixa sob demanda.
        3. Retorna os dados com o caminho local pronto para execução.
        """
        prog = self.db.get_program(identifier)
        if not prog:
            raise ValueError(f"Programa '{identifier}' não encontrado no catálogo do Drive.")

        if not cache_dir:
            cache_dir = os.path.join(os.path.expanduser("~"), ".drive_pool", "cache_programas")

        os.makedirs(cache_dir, exist_ok=True)

        cached_file_path = None
        needs_download = False

        if prog.get("nome_arquivo"):
            local_target = os.path.join(cache_dir, prog["nome_arquivo"])
            if os.path.exists(local_target):
                cached_file_path = local_target
            else:
                needs_download = True
                # Tenta baixar se arquivo remoto existir
                try:
                    _, cached_file_path = self.download_file(
                        identifier=str(prog["arquivo_id"]),
                        destination_path=local_target,
                        progress_callback=progress_callback
                    )
                except Exception as e:
                    logger.warning(f"Download remoto falhou ou simulado: {e}")
                    cached_file_path = local_target

        return {
            "programa": prog,
            "caminho_local": cached_file_path,
            "comando_execucao": prog.get("comando_execucao") or (prog.get("nome_arquivo") or "app"),
            "status": "pronto_para_execucao",
            "baixado_agora": needs_download
        }

    def delete_program(self, prog_id: int) -> bool:
        """Remove o programa do catálogo."""
        return self.db.delete_program(prog_id)

    # -------------------------------------------------------------
    # Sincronização Automática de Pastas Locais com o Pool (MFS Watcher)
    # -------------------------------------------------------------
    def add_sync_folder(
        self,
        caminho_local: str,
        nome_identificador: Optional[str] = None,
        recursivo: bool = True
    ) -> Dict[str, Any]:
        """Cadastra pasta local para sincronização contínua com o Pool."""
        return self.db.add_sync_folder(caminho_local, nome_identificador, recursivo)

    def list_sync_folders(self) -> List[Dict[str, Any]]:
        """Lista as pastas designadas para sincronização com status e métricas."""
        folders = self.db.list_sync_folders()
        for f in folders:
            f["total_bytes_formatado"] = format_bytes(f.get("total_bytes", 0))
            f["existe_localmente"] = os.path.isdir(f.get("caminho_local", ""))
        return folders

    def get_sync_folder(self, identifier: str) -> Optional[Dict[str, Any]]:
        """Obtém detalhes de uma pasta designada."""
        f = self.db.get_sync_folder(identifier)
        if f:
            f["total_bytes_formatado"] = format_bytes(f.get("total_bytes", 0))
            f["existe_localmente"] = os.path.isdir(f.get("caminho_local", ""))
        return f

    def remove_sync_folder(self, identifier: str) -> bool:
        """Remove a pasta designada das configurações de sincronização."""
        return self.db.delete_sync_folder(identifier)

    def toggle_sync_folder(self, folder_id: int) -> bool:
        """Pausa ou ativa a sincronização da pasta."""
        return self.db.toggle_sync_folder(folder_id)

    def sync_folder(
        self,
        identifier: str,
        progress_callback: Optional[Callable[[int, int, float], None]] = None,
        force_upload: bool = False
    ) -> Dict[str, Any]:
        """
        Executa a sincronização de uma pasta local designada com o Pool:
        - Varre os arquivos locais (respeitando a configuração recursiva).
        - Ignora arquivos temporários, de sistema e travas (.git, .tmp, etc).
        - Compara o hash MD5 com o catálogo SQLite para evitar uploads redundantes.
        - Para cada arquivo novo ou alterado, invoca upload_file() que utiliza
          a política MFS (Most Free Space) para selecionar a conta de destino.
        - Registra cada transferência no histórico do catálogo SQLite.
        """
        folder = self.get_sync_folder(identifier)
        if not folder:
            raise ValueError(f"Pasta designada '{identifier}' não encontrada no catálogo.")

        caminho_local = folder["caminho_local"]
        if not os.path.exists(caminho_local):
            raise FileNotFoundError(f"Diretório local não encontrado no disco: {caminho_local}")

        recursivo = bool(folder.get("recursivo", 1))
        uploaded = 0
        skipped = 0
        errors = 0
        total_bytes_synced = 0
        transferred_files: List[Dict[str, Any]] = []

        # Padrões de arquivos e pastas a serem ignorados
        ignored_names = {".git", ".svn", "__pycache__", "node_modules", ".idea", ".vscode", "venv", ".env"}
        ignored_extensions = {".tmp", ".temp", ".crdownload", ".part", ".swp", ".lock"}

        for root, dirs, files in os.walk(caminho_local):
            # Filtra subdiretórios se não for recursivo
            if not recursivo and root != caminho_local:
                continue

            # Poda pastas ignoradas
            dirs[:] = [d for d in dirs if d not in ignored_names and not d.startswith(".")]

            for fname in files:
                if fname.startswith("~$") or fname.startswith(".") or fname == "desktop.ini" or fname == "Thumbs.db":
                    continue

                _, ext = os.path.splitext(fname)
                if ext.lower() in ignored_extensions:
                    continue

                full_path = os.path.join(root, fname)
                try:
                    if not os.path.isfile(full_path):
                        continue

                    file_size = os.path.getsize(full_path)
                    md5_hash = calculate_md5(full_path)

                    # Verifica se o arquivo já está sincronizado e idêntico
                    if not force_upload and self.db.is_file_already_synced(full_path, md5_hash):
                        skipped += 1
                        continue

                    # Executa o upload usando a lógica MFS existente!
                    logger.info(f"[Auto-Sync MFS] Sincronizando arquivo: {fname} ({format_bytes(file_size)})")
                    upload_result = self.upload_file(full_path, progress_callback=progress_callback)
                    dest_account = upload_result["allocated_account"]
                    remote_meta = upload_result["remote_meta"]
                    remote_id = remote_meta.get("id", "simulated_id")

                    # Registra no histórico de sync
                    self.db.record_sync_file(
                        pasta_id=folder["id"],
                        arquivo_local=full_path,
                        arquivo_nome=fname,
                        tamanho_bytes=file_size,
                        md5_hash=md5_hash,
                        conta_destino=dest_account,
                        id_remoto_google=remote_id,
                        status="sucesso"
                    )

                    uploaded += 1
                    total_bytes_synced += file_size
                    transferred_files.append({
                        "nome": fname,
                        "caminho": full_path,
                        "tamanho": file_size,
                        "tamanho_formatado": format_bytes(file_size),
                        "conta_destino": dest_account,
                        "remote_id": remote_id
                    })

                except Exception as err:
                    logger.error(f"[Auto-Sync MFS] Falha ao sincronizar {full_path}: {err}")
                    errors += 1
                    self.db.record_sync_file(
                        pasta_id=folder["id"],
                        arquivo_local=full_path,
                        arquivo_nome=fname,
                        tamanho_bytes=os.path.getsize(full_path) if os.path.exists(full_path) else 0,
                        md5_hash="",
                        conta_destino="N/A",
                        id_remoto_google="",
                        status="falha",
                        mensagem_erro=str(err)
                    )

        return {
            "pasta_id": folder["id"],
            "caminho_local": caminho_local,
            "arquivos_enviados": uploaded,
            "arquivos_ignorados": skipped,
            "erros": errors,
            "bytes_sincronizados": total_bytes_synced,
            "bytes_sincronizados_formatado": format_bytes(total_bytes_synced),
            "arquivos": transferred_files
        }

    def sync_all_active_folders(
        self,
        progress_callback: Optional[Callable[[int, int, float], None]] = None
    ) -> List[Dict[str, Any]]:
        """Sincroniza todas as pastas ativas registradas."""
        folders = self.list_sync_folders()
        results = []
        for f in folders:
            if f.get("ativo", 1):
                try:
                    res = self.sync_folder(str(f["id"]), progress_callback=progress_callback)
                    results.append(res)
                except Exception as e:
                    logger.error(f"Erro ao sincronizar pasta {f['caminho_local']}: {e}")
                    results.append({
                        "pasta_id": f["id"],
                        "caminho_local": f["caminho_local"],
                        "erro": str(e)
                    })
        return results

    def get_sync_history(self, pasta_id: Optional[int] = None, limit: int = 50) -> List[Dict[str, Any]]:
        """Retorna histórico de arquivos sincronizados pelo watcher."""
        history = self.db.list_sync_history(pasta_id=pasta_id, limit=limit)
        for h in history:
            h["tamanho_formatado"] = format_bytes(h.get("tamanho_bytes", 0))
        return history


