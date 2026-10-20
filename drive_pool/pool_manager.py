"""
Orquestrador Principal do Virtual Storage Pool.
Coordena múltiplas contas do Google Drive, política MFS (Most Free Space)
e sincronização com o catálogo SQLite local.
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
    Unifica a capacidade de armazenamento de múltiplas contas do Google Drive.
    """

    def __init__(
        self,
        credentials_file: str = DEFAULT_CREDENTIALS_FILE,
        db_path: str = DEFAULT_DB_PATH,
        account_ids: Optional[List[str]] = None
    ):
        self.credentials_file = credentials_file
        self.db = VirtualDriveDatabase(db_path)
        self.account_ids = account_ids or ["drive_1", "drive_2"]

        # Gerenciadores de autenticação por conta
        self.auth_managers: Dict[str, AccountAuthManager] = {
            acc_id: AccountAuthManager(
                account_id=acc_id,
                token_path=DEFAULT_TOKENS.get(acc_id, f"token_{acc_id}.json"),
                credentials_path=credentials_file
            )
            for acc_id in self.account_ids
        }

    def get_auth_manager(self, account_id: str) -> AccountAuthManager:
        """Obtém o gerenciador de autenticação de uma conta específica."""
        if account_id not in self.auth_managers:
            raise KeyError(f"Conta desconhecida: {account_id}. Contas válidas: {self.account_ids}")
        return self.auth_managers[account_id]

    def get_storage_service(self, account_id: str, interactive: bool = True) -> DriveStorageService:
        """Obtém o serviço de armazenamento configurado para a conta solicitada."""
        auth_mgr = self.get_auth_manager(account_id)
        service = auth_mgr.get_service(interactive=interactive)
        return DriveStorageService(account_id, service)

    def get_pool_status(self, interactive: bool = False) -> Dict[str, Any]:
        """
        Consulta as cotas de todas as contas cadastradas e gera o sumário total do pool.
        """
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
            "accounts": accounts_status,
            "db_stats": db_stats
        }

    def allocate_account_mfs(self, file_size_bytes: int) -> Tuple[str, Dict[str, Any]]:
        """
        Política Most Free Space (MFS):
        1. Consulta o espaço livre atual em cada conta ativa.
        2. Filtra contas cujo espaço livre seja maior ou igual ao tamanho do arquivo.
        3. Seleciona a conta com o maior espaço livre disponível.
        4. Caso nenhuma comporte o arquivo, gera erro descritivo.
        """
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
            # Monta mensagem explicativa para o usuário
            detalhes = []
            for acc_id in self.account_ids:
                if acc_id in quotas:
                    detalhes.append(f"{acc_id.upper()}: livre {quotas[acc_id]['formatted_free']}")
                else:
                    detalhes.append(f"{acc_id.upper()}: não conectada ou cota indisponível")

            msg = (
                f"Espaço insuficiente no Pool Virtual!\n"
                f"Tamanho do arquivo: {format_bytes(file_size_bytes)}\n"
                f"Situação atual: {', '.join(detalhes)}\n"
                f"Nenhuma conta individual possui capacidade suficiente para armazenar este arquivo."
            )
            raise InsufficientPoolSpaceError(msg)

        # Escolhe a conta com maior espaço livre (MFS)
        best_account, best_free = max(available_candidates, key=lambda item: item[1])
        logger.info(
            f"MFS selecionou conta '{best_account}' (espaço livre: {format_bytes(best_free)}) "
            f"para arquivo de {format_bytes(file_size_bytes)}."
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
        - Consulta de cotas e alocação MFS.
        - Upload em chunks com suporte a barra de progresso.
        - Registro no catálogo SQLite local.
        """
        if not os.path.isfile(filepath):
            raise FileNotFoundError(f"Arquivo não encontrado no caminho: {filepath}")

        abs_path = os.path.abspath(filepath)
        filename = os.path.basename(abs_path)
        file_size = os.path.getsize(abs_path)

        # Calcula o hash MD5 local
        md5_hash = calculate_md5(abs_path)

        # Alocação MFS
        best_account, quota_info = self.allocate_account_mfs(file_size)

        # Executa upload na conta selecionada
        storage = self.get_storage_service(best_account, interactive=True)
        remote_meta = storage.upload_file_resumable(
            filepath=abs_path,
            progress_callback=progress_callback
        )

        remote_id = remote_meta.get("id")
        if not remote_id:
            raise RuntimeError(f"Google Drive não retornou ID para o arquivo enviado: {remote_meta}")

        # Salva metadados no SQLite
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
        # Adiciona campo formatado para conveniência
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

        # Se o destino for um diretório existente, anexa o nome original
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

        # 1. Remove do Google Drive correspondente
        storage = self.get_storage_service(account_id, interactive=True)
        storage.delete_remote_file(remote_id)

        # 2. Remove do SQLite
        deleted_record = self.db.delete_file(str(record["id"]))
        return deleted_record or record
