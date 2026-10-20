"""
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

# Padrão de chunk do Google Drive: múltiplos de 256 KB (262144 bytes).
# Usamos 2 MB por chunk para equilíbrio ótimo entre velocidade e controle de progresso.
DEFAULT_CHUNK_SIZE = 2 * 1024 * 1024  # 2MB


def calculate_md5(filepath: str, block_size: int = 65536) -> str:
    """
    Calcula o hash MD5 de um arquivo local de forma eficiente em memória através de streaming.
    """
    hasher = hashlib.md5()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(block_size), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def format_bytes(size_bytes: int) -> str:
    """Formata bytes em unidade legível para humanos (B, KB, MB, GB, TB)."""
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
    """
    Controlador de operações na API do Google Drive para uma conta.
    """

    def __init__(self, account_id: str, service: Any):
        self.account_id = account_id
        self.service = service

    def get_storage_quota(self) -> Dict[str, Any]:
        """
        Consulta a cota de armazenamento oficial da conta via drive.about().get(fields='storageQuota').
        Retorna dicionário com limit, usage, free_space_bytes e percent_used.
        """
        try:
            about_data = self.service.about().get(fields="storageQuota, user").execute()
            quota = about_data.get("storageQuota", {})
            user = about_data.get("user", {})

            # Nota: 'limit' pode ser None em contas Google Workspace com armazenamento ilimitado
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
                # Caso não haja limite rígido explícito (10 TB como referência de teto)
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
        """
        Executa o upload em chunks (MediaFileUpload com resumable=True) com suporte a progresso.
        Retorna o dicionário de metadados do arquivo criado no Google Drive.
        """
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

        media = MediaFileUpload(
            filepath,
            resumable=True,
            chunksize=chunk_size
        )

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
                retry_count = 0  # reset retries on success
            except HttpError as err:
                # Trata erros 5xx ou 429 com exponential backoff
                if err.resp.status in [429, 500, 502, 503, 504]:
                    retry_count += 1
                    if retry_count > max_retries:
                        raise RuntimeError(f"Limite de tentativas excedido durante upload: {err}")
                    sleep_time = min(2 ** retry_count, 30)
                    logger.warning(f"Erro transitório HTTP {err.resp.status}. Aguardando {sleep_time}s antes de retentar...")
                    time.sleep(sleep_time)
                else:
                    raise

        # Notifica 100% de conclusão
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
        """
        Executa o download em streaming com chunks para o destino especificado.
        """
        dest_dir = os.path.dirname(dest_path)
        if dest_dir and not os.path.exists(dest_dir):
            os.makedirs(dest_dir, exist_ok=True)

        # Consulta tamanho antes se possível
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
        """
        Remove o arquivo definitivamente no Google Drive.
        Retorna True em caso de sucesso. Se o arquivo já não existir (404), trata graciosamente.
        """
        try:
            self.service.files().delete(fileId=remote_id).execute()
            return True
        except HttpError as error:
            if error.resp.status == 404:
                logger.warning(f"Arquivo remoto {remote_id} já não existia no Google Drive.")
                return True
            logger.error(f"Erro ao deletar arquivo remoto {remote_id}: {error}")
            raise
