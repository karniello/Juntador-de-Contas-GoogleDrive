"""
Módulo de Autenticação OAuth 2.0 para múltiplas contas Google Drive.
Gerencia credenciais, tokens independentes e renovação automática (refresh token).
"""

import os
import json
import logging
from typing import Optional, Tuple, Dict, Any
from pathlib import Path

# Google Auth imports
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

# Escopo completo para gerenciamento de arquivos e consulta de cota
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
        """
        :param account_id: Identificador da conta (ex: 'drive_1', 'drive_2')
        :param token_path: Caminho do arquivo de token desta conta específica
        :param credentials_path: Caminho do arquivo credentials.json baixado do GCP Console
        """
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

        # 1. Carrega credenciais do arquivo de token se existir
        if os.path.exists(self.token_path):
            try:
                creds = Credentials.from_authorized_user_file(self.token_path, SCOPES)
            except Exception as e:
                logger.warning(f"[{self.account_id}] Erro ao ler {self.token_path}: {e}. Solicitando novo login.")
                creds = None

        # 2. Se não há credenciais válidas ou estão expiradas
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
                        f"Conta '{self.account_id}' não autenticada e modo não-interativo ativo. "
                        f"Execute 'python main.py auth {self.account_id}' primeiro."
                    )

                if not os.path.exists(self.credentials_path):
                    raise FileNotFoundError(
                        f"Arquivo '{self.credentials_path}' não encontrado!\n"
                        f"Para autorizar a conta {self.account_id}, baixe o arquivo de credenciais OAuth 2.0 (Desktop) "
                        f"do Google Cloud Console e salve-o como '{self.credentials_path}'."
                    )

                print(f"\n=======================================================")
                print(f"  AUTENTICAÇÃO: CONTA {self.account_id.upper()}")
                print(f"  Uma aba do navegador será aberta para login.")
                print(f"  Faça login com a conta Google designada para {self.account_id}.")
                print(f"=======================================================\n")

                flow = InstalledAppFlow.from_client_secrets_file(
                    self.credentials_path, SCOPES
                )
                creds = flow.run_local_server(port=0, prompt="select_account consent")
                self._save_token(creds)
                logger.info(f"[{self.account_id}] Nova autorização salva em {self.token_path}.")

        return creds

    def _save_token(self, creds: Any) -> None:
        """Salva as credenciais autorizadas no arquivo de token específico da conta."""
        with open(self.token_path, "w", encoding="utf-8") as token_file:
            token_file.write(creds.to_json())

    def get_service(self, interactive: bool = True) -> Any:
        """
        Retorna o cliente de serviço oficial do Google Drive v3 configurado.
        Reutiliza a instância se já criada.
        """
        if self._service is None:
            creds = self.get_credentials(interactive=interactive)
            self._service = build("drive", "v3", credentials=creds, cache_discovery=False)
        return self._service

    def get_user_info(self) -> Dict[str, Any]:
        """Obtém detalhes do usuário dono da conta (email, nome, foto)."""
        if self._user_info:
            return self._user_info
        try:
            service = self.get_service(interactive=False)
            about = service.about().get(fields="user").execute()
            self._user_info = about.get("user", {})
            return self._user_info
        except Exception as e:
            return {"displayName": f"Conta {self.account_id}", "emailAddress": "desconhecido"}

    def reset_token(self) -> bool:
        """Remove o arquivo de token para forçar nova autenticação."""
        self._service = None
        self._user_info = None
        if os.path.exists(self.token_path):
            os.remove(self.token_path)
            return True
        return False
