"""
Módulo de Catálogo e Metadados SQLite (virtual_drive.db).
Gerencia a persistência das informações de arquivos alocados no Virtual Drive Pool.
"""

import sqlite3
import os
from typing import List, Dict, Optional, Any, Tuple
from datetime import datetime


DEFAULT_DB_PATH = "virtual_drive.db"


class VirtualDriveDatabase:
    """
    Gerenciador de acesso a dados (DAO) do catálogo local SQLite.
    Garante integridade referencial, consultas atômicas e busca facilitada por ID ou Nome.
    """

    def __init__(self, db_path: str = DEFAULT_DB_PATH):
        self.db_path = db_path
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        """Cria uma nova conexão com row_factory configurada para dicionário."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        """Cria as tabelas e índices necessários caso ainda não existam."""
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
        """
        Registra um novo arquivo indexado no banco local.
        Retorna o ID local gerado.
        """
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
        """
        Retorna a lista de todos os arquivos cadastrados.
        Pode filtrar por conta_origem ('drive_1' ou 'drive_2').
        """
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
        """
        Busca um arquivo por ID numérico ou por nome de arquivo exato.
        Retorna None se não encontrado.
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            # Se for número, tenta por ID primeiro
            if identifier.isdigit():
                cursor.execute("SELECT * FROM arquivos WHERE id = ?", (int(identifier),))
                row = cursor.fetchone()
                if row:
                    return dict(row)

            # Busca por nome do arquivo (o mais recente se houver múltiplos)
            cursor.execute(
                "SELECT * FROM arquivos WHERE nome_arquivo = ? ORDER BY id DESC LIMIT 1",
                (identifier,)
            )
            row = cursor.fetchone()
            if row:
                return dict(row)

            # Busca por id_remoto_google
            cursor.execute(
                "SELECT * FROM arquivos WHERE id_remoto_google = ?",
                (identifier,)
            )
            row = cursor.fetchone()
            if row:
                return dict(row)

            return None

    def delete_file(self, identifier: str) -> Optional[Dict[str, Any]]:
        """
        Remove um registro do banco de dados pelo ID ou nome.
        Retorna os dados do registro que foi removido, ou None se não existir.
        """
        target = self.find_file(identifier)
        if not target:
            return None

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM arquivos WHERE id = ?", (target["id"],))
            conn.commit()
            return target

    def get_aggregated_stats(self) -> Dict[str, Any]:
        """
        Calcula estatísticas agregadas dos arquivos indexados localmente.
        """
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
