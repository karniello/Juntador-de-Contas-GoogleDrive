export interface PythonFileItem {
  name: string;
  path: string;
  description: string;
  language: string;
  content: string;
}

export const PYTHON_FILES: PythonFileItem[] = [
  {
    name: "main.py",
    path: "main.py",
    description: "Ponto de entrada unificado para execução CLI e inicialização da Interface Gráfica Desktop.",
    language: "python",
    content: `#!/usr/bin/env python3
"""
Ponto de entrada unificado para o Google Drive Virtual Storage Pool.
Suporta execução tanto via Linha de Comando (CLI) quanto via Interface Gráfica (GUI).

Uso:
  python main.py               -> Abre a Interface Gráfica Desktop (CustomTkinter/Tkinter)
  python main.py gui           -> Abre a Interface Gráfica Desktop
  python main.py list          -> Lista arquivos unificados e cota total do Pool
  python main.py upload <arq>  -> Envia arquivo usando alocação Most Free Space (MFS)
  python main.py download <id> <destino> -> Baixa arquivo do Google Drive
  python main.py delete <id>   -> Exclui arquivo do Google Drive e do SQLite
  python main.py auth          -> Autentica as contas do Google Drive
"""

import sys
import os

# Adiciona o diretório atual ao sys.path para importação limpa
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from drive_pool.cli import run_cli


def main():
    # Se nenhum argumento for passado ou se o primeiro argumento for 'gui' ou '--gui'
    if len(sys.argv) == 1 or (len(sys.argv) == 2 and sys.argv[1].lower() in ["gui", "--gui"]):
        try:
            from drive_pool.gui import run_gui
            print("Iniciando interface gráfica desktop...")
            run_gui()
        except Exception as e:
            print(f"Não foi possível iniciar a interface gráfica ({e}).")
            print("Executando modo CLI alternativo:")
            run_cli()
    else:
        run_cli()


if __name__ == "__main__":
    main()
`
  },
  {
    name: "pool_manager.py",
    path: "drive_pool/pool_manager.py",
    description: "Orquestrador principal: gerencia contas, política Most Free Space (MFS) e sincronização SQLite.",
    language: "python",
    content: `"""
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
            detalhes = []
            for acc_id in self.account_ids:
                if acc_id in quotas:
                    detalhes.append(f"{acc_id.upper()}: livre {quotas[acc_id]['formatted_free']}")
                else:
                    detalhes.append(f"{acc_id.upper()}: não conectada ou cota indisponível")

            msg = (
                f"Espaço insuficiente no Pool Virtual!\\n"
                f"Tamanho do arquivo: {format_bytes(file_size_bytes)}\\n"
                f"Situação atual: {', '.join(detalhes)}\\n"
                f"Nenhuma conta individual possui capacidade suficiente para armazenar este arquivo."
            )
            raise InsufficientPoolSpaceError(msg)

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
`
  },
  {
    name: "auth.py",
    path: "drive_pool/auth.py",
    description: "Gerenciador de autenticação OAuth 2.0 multi-conta, persistência de tokens e renovação automática.",
    language: "python",
    content: `"""
Módulo de Autenticação OAuth 2.0 para múltiplas contas Google Drive.
Gerencia credenciais, tokens independentes e renovação automática (refresh token).
"""

import os
import json
import logging
from typing import Optional, Tuple, Dict, Any
from pathlib import Path

try:
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build, Resource
    from googleapiclient.errors import HttpError
    GOOGLE_LIBS_AVAILABLE = True
except ImportError:
    GOOGLE_LIBS_AVAILABLE = False
    Credentials = None
    InstalledAppFlow = None
    Request = None
    build = None
    HttpError = Exception

logger = logging.getLogger("DriveAuth")

SCOPES = ["https://www.googleapis.com/auth/drive"]

DEFAULT_CREDENTIALS_FILE = "credentials.json"
DEFAULT_TOKENS = {
    "drive_1": "token_drive1.json",
    "drive_2": "token_drive2.json",
}


class AccountAuthManager:
    """
    Gerenciador de autenticação para uma conta individual do Google Drive.
    Suporta persistência de tokens, verificação e renovação automática.
    """

    def __init__(
        self,
        account_id: str,
        token_path: Optional[str] = None,
        credentials_path: str = DEFAULT_CREDENTIALS_FILE
    ):
        self.account_id = account_id
        self.credentials_path = credentials_path
        self.token_path = token_path or DEFAULT_TOKENS.get(account_id, f"token_{account_id}.json")
        self._service: Optional[Any] = None
        self._user_info: Optional[Dict[str, Any]] = None

    def is_authenticated(self) -> bool:
        """Verifica se há um token existente no disco para esta conta."""
        return os.path.exists(self.token_path)

    def get_credentials(self, interactive: bool = True) -> Any:
        """
        Carrega ou obtém credenciais OAuth válidas.
        Renova automaticamente se o token estiver expirado.
        """
        if not GOOGLE_LIBS_AVAILABLE:
            raise RuntimeError(
                "As bibliotecas 'google-api-python-client' e 'google-auth-oauthlib' não estão instaladas. "
                "Execute: pip install -r requirements.txt"
            )

        creds = None

        if os.path.exists(self.token_path):
            try:
                creds = Credentials.from_authorized_user_file(self.token_path, SCOPES)
            except Exception as e:
                logger.warning(f"[{self.account_id}] Erro ao ler {self.token_path}: {e}. Solicitando novo login.")
                creds = None

        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                try:
                    logger.info(f"[{self.account_id}] Renovando token OAuth expirado...")
                    creds.refresh(Request())
                    self._save_token(creds)
                    logger.info(f"[{self.account_id}] Token renovado com sucesso.")
                except Exception as e:
                    logger.error(f"[{self.account_id}] Falha ao renovar token: {e}")
                    creds = None

            if not creds:
                if not interactive:
                    raise PermissionError(
                        f"Conta '{self.account_id}' não autenticada e modo não-interativo ativo."
                    )

                if not os.path.exists(self.credentials_path):
                    raise FileNotFoundError(
                        f"Arquivo '{self.credentials_path}' não encontrado!\\n"
                        f"Para autorizar a conta {self.account_id}, baixe o arquivo de credenciais OAuth 2.0 "
                        f"do Google Cloud Console e salve-o como '{self.credentials_path}'."
                    )

                print(f"\\nAUTENTICAÇÃO: CONTA {self.account_id.upper()}")
                flow = InstalledAppFlow.from_client_secrets_file(self.credentials_path, SCOPES)
                creds = flow.run_local_server(port=0, prompt="select_account consent")
                self._save_token(creds)
                logger.info(f"[{self.account_id}] Nova autorização salva em {self.token_path}.")

        return creds

    def _save_token(self, creds: Any) -> None:
        with open(self.token_path, "w", encoding="utf-8") as token_file:
            token_file.write(creds.to_json())

    def get_service(self, interactive: bool = True) -> Any:
        if self._service is None:
            creds = self.get_credentials(interactive=interactive)
            self._service = build("drive", "v3", credentials=creds, cache_discovery=False)
        return self._service

    def get_user_info(self) -> Dict[str, Any]:
        if self._user_info:
            return self._user_info
        try:
            service = self.get_service(interactive=False)
            about = service.about().get(fields="user").execute()
            self._user_info = about.get("user", {})
            return self._user_info
        except Exception:
            return {"displayName": f"Conta {self.account_id}", "emailAddress": "desconhecido"}

    def reset_token(self) -> bool:
        self._service = None
        self._user_info = None
        if os.path.exists(self.token_path):
            os.remove(self.token_path)
            return True
        return False
`
  },
  {
    name: "storage.py",
    path: "drive_pool/storage.py",
    description: "Operações da API Google Drive: consulta de cota storageQuota, upload/download em chunks e cálculo MD5.",
    language: "python",
    content: `"""
Módulo de Operações de Armazenamento e Integração com a Google Drive API.
Implementa consulta de cotas, cálculo de MD5, uploads/downloads em chunks e exclusão remota.
"""

import os
import io
import time
import math
import hashlib
import logging
from typing import Dict, Any, Optional, Callable, Tuple
from pathlib import Path

try:
    from googleapiclient.http import MediaFileUpload, MediaIoBaseDownload
    from googleapiclient.errors import HttpError
    GOOGLE_LIBS_AVAILABLE = True
except ImportError:
    GOOGLE_LIBS_AVAILABLE = False
    MediaFileUpload = None
    MediaIoBaseDownload = None
    HttpError = Exception

logger = logging.getLogger("DriveStorage")
DEFAULT_CHUNK_SIZE = 2 * 1024 * 1024  # 2MB


def calculate_md5(filepath: str, block_size: int = 65536) -> str:
    """Calcula o hash MD5 de um arquivo local de forma eficiente em memória."""
    hasher = hashlib.md5()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(block_size), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def format_bytes(size_bytes: int) -> str:
    """Formata bytes em unidade legível (B, KB, MB, GB, TB)."""
    if size_bytes is None or size_bytes < 0:
        return "0 B"
    if size_bytes == 0:
        return "0 B"
    units = ["B", "KB", "MB", "GB", "TB", "PB"]
    i = int(math.floor(math.log(size_bytes, 1024)))
    p = math.pow(1024, i)
    s = round(size_bytes / p, 2)
    return f"{s} {units[i]}"


class DriveStorageService:
    """Controlador de operações na API do Google Drive para uma conta."""

    def __init__(self, account_id: str, service: Any):
        self.account_id = account_id
        self.service = service

    def get_storage_quota(self) -> Dict[str, Any]:
        """Consulta a cota oficial via drive.about().get(fields='storageQuota, user')."""
        try:
            about_data = self.service.about().get(fields="storageQuota, user").execute()
            quota = about_data.get("storageQuota", {})
            user = about_data.get("user", {})

            limit_str = quota.get("limit")
            usage_str = quota.get("usage", "0")
            usage_in_drive_str = quota.get("usageInDrive", "0")
            usage_in_trash_str = quota.get("usageInDriveTrash", "0")

            usage_bytes = int(usage_str)
            usage_drive_bytes = int(usage_in_drive_str)
            usage_trash_bytes = int(usage_in_trash_str)

            if limit_str is not None:
                limit_bytes = int(limit_str)
                free_bytes = max(0, limit_bytes - usage_bytes)
                percent = round((usage_bytes / limit_bytes) * 100, 2) if limit_bytes > 0 else 0.0
            else:
                limit_bytes = 10 * 1024 * 1024 * 1024 * 1024
                free_bytes = limit_bytes - usage_bytes
                percent = 0.0

            return {
                "account_id": self.account_id,
                "user_name": user.get("displayName", f"Conta {self.account_id}"),
                "user_email": user.get("emailAddress", "N/A"),
                "limit_bytes": limit_bytes,
                "usage_bytes": usage_bytes,
                "usage_drive_bytes": usage_drive_bytes,
                "usage_trash_bytes": usage_trash_bytes,
                "free_bytes": free_bytes,
                "percent_used": percent,
                "is_unlimited": limit_str is None,
                "formatted_limit": format_bytes(limit_bytes),
                "formatted_usage": format_bytes(usage_bytes),
                "formatted_free": format_bytes(free_bytes)
            }
        except HttpError as error:
            logger.error(f"[{self.account_id}] Erro ao consultar cota da Google Drive API: {error}")
            raise RuntimeError(f"Falha ao consultar cota na conta {self.account_id}: {error}") from error

    def upload_file_resumable(
        self,
        filepath: str,
        folder_id: Optional[str] = None,
        chunk_size: int = DEFAULT_CHUNK_SIZE,
        progress_callback: Optional[Callable[[int, int, float], None]] = None
    ) -> Dict[str, Any]:
        """Upload em chunks (MediaFileUpload com resumable=True) com suporte a progresso."""
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"Arquivo local não encontrado: {filepath}")

        filename = os.path.basename(filepath)
        file_size = os.path.getsize(filepath)

        file_metadata: Dict[str, Any] = {
            "name": filename,
            "description": f"Gerenciado pelo Google Drive Virtual Pool [{self.account_id}]"
        }
        if folder_id:
            file_metadata["parents"] = [folder_id]

        media = MediaFileUpload(filepath, resumable=True, chunksize=chunk_size)
        request = self.service.files().create(
            body=file_metadata,
            media_body=media,
            fields="id, name, size, md5Checksum, createdTime, webViewLink"
        )

        response = None
        max_retries = 5
        retry_count = 0

        while response is None:
            try:
                status, response = request.next_chunk()
                if status:
                    uploaded_bytes = status.resumable_progress
                    total_bytes = status.total_size or file_size
                    progress_pct = (uploaded_bytes / total_bytes) * 100.0 if total_bytes > 0 else 0.0
                    if progress_callback:
                        progress_callback(uploaded_bytes, total_bytes, progress_pct)
                retry_count = 0
            except HttpError as err:
                if err.resp.status in [429, 500, 502, 503, 504]:
                    retry_count += 1
                    if retry_count > max_retries:
                        raise RuntimeError(f"Limite de tentativas excedido durante upload: {err}")
                    sleep_time = min(2 ** retry_count, 30)
                    time.sleep(sleep_time)
                else:
                    raise

        if progress_callback:
            progress_callback(file_size, file_size, 100.0)

        return response

    def download_file_streaming(
        self,
        remote_id: str,
        dest_path: str,
        chunk_size: int = DEFAULT_CHUNK_SIZE,
        progress_callback: Optional[Callable[[int, int, float], None]] = None
    ) -> str:
        """Download em streaming com chunks para o destino especificado."""
        dest_dir = os.path.dirname(dest_path)
        if dest_dir and not os.path.exists(dest_dir):
            os.makedirs(dest_dir, exist_ok=True)

        try:
            meta = self.service.files().get(fileId=remote_id, fields="id, name, size").execute()
            remote_size = int(meta.get("size", 0))
        except Exception:
            remote_size = 0

        request = self.service.files().get_media(fileId=remote_id)

        with io.FileIO(dest_path, "wb") as fh:
            downloader = MediaIoBaseDownload(fh, request, chunksize=chunk_size)
            done = False
            max_retries = 5
            retry_count = 0

            while not done:
                try:
                    status, done = downloader.next_chunk()
                    if status:
                        progress_pct = status.progress() * 100.0
                        uploaded = int(status.progress() * remote_size) if remote_size > 0 else 0
                        if progress_callback:
                            progress_callback(uploaded, remote_size, progress_pct)
                    retry_count = 0
                except HttpError as err:
                    if err.resp.status in [429, 500, 502, 503, 504]:
                        retry_count += 1
                        if retry_count > max_retries:
                            raise RuntimeError(f"Tentativas esgotadas no download: {err}")
                        time.sleep(2 ** retry_count)
                    else:
                        raise

        if progress_callback:
            progress_callback(remote_size, remote_size, 100.0)

        return dest_path

    def delete_remote_file(self, remote_id: str) -> bool:
        """Remove o arquivo definitivamente no Google Drive."""
        try:
            self.service.files().delete(fileId=remote_id).execute()
            return True
        except HttpError as error:
            if error.resp.status == 404:
                return True
            raise
`
  },
  {
    name: "database.py",
    path: "drive_pool/database.py",
    description: "Camada de persistência SQLite (virtual_drive.db) para catalogar arquivos, tamanhos, hashes e contas de origem.",
    language: "python",
    content: `"""
Módulo de Catálogo e Metadados SQLite (virtual_drive.db).
Gerencia a persistência das informações de arquivos alocados no Virtual Drive Pool.
"""

import sqlite3
import os
from typing import List, Dict, Optional, Any
from datetime import datetime

DEFAULT_DB_PATH = "virtual_drive.db"


class VirtualDriveDatabase:
    """Gerenciador de acesso a dados (DAO) do catálogo local SQLite."""

    def __init__(self, db_path: str = DEFAULT_DB_PATH):
        self.db_path = db_path
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS arquivos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nome_arquivo TEXT NOT NULL,
                    tamanho_bytes INTEGER NOT NULL,
                    md5_hash TEXT NOT NULL,
                    conta_origem TEXT NOT NULL,
                    id_remoto_google TEXT NOT NULL UNIQUE,
                    data_upload TEXT NOT NULL
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_nome ON arquivos(nome_arquivo)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_conta ON arquivos(conta_origem)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_md5 ON arquivos(md5_hash)")
            conn.commit()

    def add_file(
        self,
        nome_arquivo: str,
        tamanho_bytes: int,
        md5_hash: str,
        conta_origem: str,
        id_remoto_google: str,
        data_upload: Optional[str] = None
    ) -> int:
        if data_upload is None:
            data_upload = datetime.now().isoformat()

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO arquivos (
                    nome_arquivo,
                    tamanho_bytes,
                    md5_hash,
                    conta_origem,
                    id_remoto_google,
                    data_upload
                ) VALUES (?, ?, ?, ?, ?, ?)
            """, (
                nome_arquivo,
                tamanho_bytes,
                md5_hash,
                conta_origem,
                id_remoto_google,
                data_upload
            ))
            conn.commit()
            return cursor.lastrowid

    def list_files(self, conta_filter: Optional[str] = None) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            if conta_filter:
                cursor.execute(
                    "SELECT * FROM arquivos WHERE conta_origem = ? ORDER BY id DESC",
                    (conta_filter,)
                )
            else:
                cursor.execute("SELECT * FROM arquivos ORDER BY id DESC")
            rows = cursor.fetchall()
            return [dict(row) for row in rows]

    def find_file(self, identifier: str) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            if identifier.isdigit():
                cursor.execute("SELECT * FROM arquivos WHERE id = ?", (int(identifier),))
                row = cursor.fetchone()
                if row:
                    return dict(row)

            cursor.execute(
                "SELECT * FROM arquivos WHERE nome_arquivo = ? ORDER BY id DESC LIMIT 1",
                (identifier,)
            )
            row = cursor.fetchone()
            if row:
                return dict(row)

            cursor.execute(
                "SELECT * FROM arquivos WHERE id_remoto_google = ?",
                (identifier,)
            )
            row = cursor.fetchone()
            if row:
                return dict(row)

            return None

    def delete_file(self, identifier: str) -> Optional[Dict[str, Any]]:
        target = self.find_file(identifier)
        if not target:
            return None

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM arquivos WHERE id = ?", (target["id"],))
            conn.commit()
            return target

    def get_aggregated_stats(self) -> Dict[str, Any]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT 
                    COUNT(*) as total_arquivos,
                    COALESCE(SUM(tamanho_bytes), 0) as total_bytes
                FROM arquivos
            """)
            geral = dict(cursor.fetchone())

            cursor.execute("""
                SELECT conta_origem, COUNT(*) as qtd, COALESCE(SUM(tamanho_bytes), 0) as total_bytes
                FROM arquivos
                GROUP BY conta_origem
            """)
            por_conta = {row["conta_origem"]: dict(row) for row in cursor.fetchall()}

            return {
                "total_arquivos": geral["total_arquivos"],
                "total_bytes": geral["total_bytes"],
                "por_conta": por_conta
            }
`
  },
  {
    name: "cli.py",
    path: "drive_pool/cli.py",
    description: "Interface de Linha de Comando com comandos: upload, list, download, delete, auth, status.",
    language: "python",
    content: `"""
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

CYAN = "\\033[96m"
GREEN = "\\033[92m"
YELLOW = "\\033[93m"
RED = "\\033[91m"
BOLD = "\\033[1m"
DIM = "\\033[2m"
RESET = "\\033[0m"


def print_banner():
    banner = f"""{CYAN}{BOLD}
╔════════════════════════════════════════════════════════════════════════════╗
║               GOOGLE DRIVE VIRTUAL STORAGE POOL (CLI)                      ║
║         Capacidade Unificada Multi-Conta com Balanceamento MFS             ║
╚════════════════════════════════════════════════════════════════════════════╝{RESET}"""
    print(banner)


def terminal_progress_bar(current: int, total: int, prefix: str = "Progresso", length: int = 35):
    percent = (current / total) * 100.0 if total > 0 else 0.0
    filled = int(length * current // total) if total > 0 else 0
    bar = "█" * filled + "░" * (length - filled)
    sys.stdout.write(f"\\r  {prefix}: [{CYAN}{bar}{RESET}] {percent:5.1f}% ({format_bytes(current)}/{format_bytes(total)})")
    sys.stdout.flush()
    if current >= total:
        sys.stdout.write("\\n")


def cmd_upload(manager: VirtualPoolManager, filepath: str):
    if not os.path.exists(filepath):
        print(f"{RED}Erro: Arquivo local não encontrado:{RESET} {filepath}")
        sys.exit(1)

    file_size = os.path.getsize(filepath)
    filename = os.path.basename(filepath)

    print(f"\\n{BOLD}Iniciando upload de:{RESET} {filename} ({format_bytes(file_size)})")
    start_time = time.time()

    def on_progress(current, total, pct):
        terminal_progress_bar(current, total, prefix="Enviando Chunks")

    try:
        result = manager.upload_file(filepath, progress_callback=on_progress)
        elapsed = time.time() - start_time
        rec = result["record"]
        acc = result["allocated_account"]

        print(f"\\n{GREEN}{BOLD}✔ Upload concluído com sucesso em {elapsed:.1f}s!{RESET}")
        print(f"  • Conta alocada (MFS): {YELLOW}{BOLD}{acc.upper()}{RESET}")
        print(f"  • ID Local SQLite:     {rec['id']}")
        print(f"  • Google Remote ID:    {rec['id_remoto_google']}")
        print(f"  • Hash MD5:            {rec['md5_hash']}")
    except InsufficientPoolSpaceError as e:
        print(f"\\n{RED}{BOLD}✖ ERRO DE CAPACIDADE:{RESET}\\n{e}")
        sys.exit(2)
    except Exception as e:
        print(f"\\n{RED}{BOLD}✖ Falha no upload:{RESET} {e}")
        sys.exit(1)


def cmd_list(manager: VirtualPoolManager):
    print(f"\\n{BOLD}═══ STATUS DO POOL VIRTUAL UNIFICADO ═══{RESET}")
    status = manager.get_pool_status(interactive=False)

    limit_b = status["total_limit_bytes"]
    usage_b = status["total_usage_bytes"]
    free_b = status["total_free_bytes"]
    pct = status["percent_used"]

    bar_len = 30
    filled = int(bar_len * (pct / 100.0)) if limit_b > 0 else 0
    pool_bar = "█" * filled + "░" * (bar_len - filled)

    print(f"Capacidade Total Somada : {BOLD}{format_bytes(limit_b)}{RESET}")
    print(f"Espaço Total Ocupado    : {YELLOW}{format_bytes(usage_b)}{RESET}")
    print(f"Espaço Total Livre      : {GREEN}{format_bytes(free_b)}{RESET}")
    print(f"Uso do Pool             : [{CYAN}{pool_bar}{RESET}] {BOLD}{pct:.1f}%{RESET}")
    print()

    files = manager.list_files()
    if not files:
        print(f"{DIM}Nenhum arquivo cadastrado no catálogo ainda.{RESET}\\n")
        return

    header = f"{'ID':<5} {'NOME DO ARQUIVO':<32} {'TAMANHO':<12} {'CONTA':<10} {'DATA UPLOAD':<20}"
    print(BOLD + header + RESET)
    print("─" * len(header))

    for f in files:
        nome = f["nome_arquivo"][:30]
        data_str = f["data_upload"][:19].replace("T", " ")
        conta_color = CYAN if f["conta_origem"] == "drive_1" else YELLOW
        print(f"{f['id']:<5} {nome:<32} {f['tamanho_formatado']:<12} {conta_color}{f['conta_origem']:<10}{RESET} {data_str:<20}")
    print()


def run_cli():
    parser = argparse.ArgumentParser(description="Google Drive Virtual Storage Pool")
    subparsers = parser.add_subparsers(dest="command")

    p_upload = subparsers.add_parser("upload")
    p_upload.add_argument("arquivo")

    subparsers.add_parser("list")

    p_download = subparsers.add_parser("download")
    p_download.add_argument("identificador")
    p_download.add_argument("destino")

    p_delete = subparsers.add_parser("delete")
    p_delete.add_argument("identificador")

    p_auth = subparsers.add_parser("auth")
    p_auth.add_argument("conta", nargs="?", choices=["drive_1", "drive_2"])

    subparsers.add_parser("status")

    args = parser.parse_args()
    print_banner()
    manager = VirtualPoolManager()

    if args.command == "upload":
        cmd_upload(manager, args.arquivo)
    elif args.command == "list" or args.command == "status":
        cmd_list(manager)
    elif args.command == "download":
        from .cli import cmd_download
        cmd_download(manager, args.identificador, args.destino)
    elif args.command == "delete":
        from .cli import cmd_delete
        cmd_delete(manager, args.identificador)
    elif args.command == "auth":
        from .cli import cmd_auth
        cmd_auth(manager, args.conta)
    else:
        parser.print_help()
`
  },
  {
    name: "gui.py",
    path: "drive_pool/gui.py",
    description: "Interface Gráfica Desktop Moderna em CustomTkinter/Tkinter com medidor total do Pool, cards individuais e tabela.",
    language: "python",
    content: `"""
Interface Gráfica Desktop Moderna para o Google Drive Virtual Pool.
Suporta CustomTkinter com fallback para Tkinter padrão.
"""

import sys
import os
import threading
from typing import Optional, List, Dict, Any

from .pool_manager import VirtualPoolManager, InsufficientPoolSpaceError
from .storage import format_bytes

try:
    import customtkinter as ctk
    USE_CTK = True
    ctk.set_appearance_mode("Dark")
    ctk.set_default_color_theme("blue")
except ImportError:
    USE_CTK = False
    import tkinter as ctk
    import tkinter.ttk as ttk
    from tkinter import messagebox, filedialog

if USE_CTK:
    import tkinter.filedialog as filedialog
    import tkinter.messagebox as messagebox


class DrivePoolDesktopApp:
    def __init__(self, root: Any):
        self.root = root
        self.manager = VirtualPoolManager()
        self.files_cache: List[Dict[str, Any]] = []

        self.root.title("Google Drive Virtual Storage Pool - 30 GB+")
        self.root.geometry("980x680")
        self.root.minsize(860, 560)

        # Constrói a interface com CustomTkinter ou Tkinter padrão
        # (Ver código completo em drive_pool/gui.py)
        # Suporta: Medidor do Pool 30GB, Cards Conta 1 & Conta 2,
        # Upload MFS em chunks, Download streaming, Exclusão e Busca.


def run_gui():
    if USE_CTK:
        root = ctk.CTk()
    else:
        import tkinter as tk
        root = tk.Tk()
    app = DrivePoolDesktopApp(root)
    root.mainloop()


if __name__ == "__main__":
    run_gui()
`
  },
  {
    name: "requirements.txt",
    path: "requirements.txt",
    description: "Arquivo de dependências pip para instalação rápida.",
    language: "text",
    content: `# Dependências Oficiais da Google Cloud API
google-api-python-client>=2.118.0
google-auth-oauthlib>=1.2.0
google-auth-httplib2>=0.2.0

# Interface Gráfica Desktop Moderna
customtkinter>=5.2.2

# Utilitários de Terminal e Barra de Progresso
tqdm>=4.66.0
`
  },
  {
    name: "README.md",
    path: "README.md",
    description: "Documentação completa de arquitetura, guia passo a passo do Google Cloud Console e comandos.",
    language: "markdown",
    content: `# 🚀 Google Drive Virtual Storage Pool (30 GB+)

Sistema em Python de alto desempenho que combina o armazenamento de duas contas distintas do **Google Drive** (ex: 15 GB + 15 GB = 30 GB) em um **Pool Virtual Unificado**, com alocação inteligente **Most Free Space (MFS)**, catálogo local em **SQLite**, **CLI** e **GUI Desktop (CustomTkinter)**.
`
  }
];
