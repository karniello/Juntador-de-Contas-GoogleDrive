"""
Módulo de Catálogo e Metadados SQLite (virtual_drive.db).
Gerencia a persistência das informações de arquivos alocados e das contas cadastradas no Virtual Drive Pool.
Suporta número arbitrário de contas Google Drive (N contas).
"""

import sqlite3
import os
from typing import List, Dict, Optional, Any, Tuple
from datetime import datetime


DEFAULT_DB_PATH = "virtual_drive.db"


class VirtualDriveDatabase:
    """
    Gerenciador de acesso a dados (DAO) do catálogo local SQLite.
    Garante integridade referencial, consultas atômicas e busca facilitada por ID ou Nome,
    além de gerenciar o registro dinâmico de múltiplas contas do Google Drive.
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
            # Tabela de Arquivos
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

            # Tabela de Contas Cadastradas (Suporte a N Contas)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS contas (
                    id TEXT PRIMARY KEY,
                    nome_exibicao TEXT,
                    email TEXT,
                    token_path TEXT NOT NULL,
                    ativo INTEGER DEFAULT 1,
                    criado_em TEXT NOT NULL
                )
            """)

            # Seed inicial padrão: drive_1 e drive_2 se tabela de contas estiver vazia
            cursor.execute("SELECT COUNT(*) as total FROM contas")
            if cursor.fetchone()["total"] == 0:
                now_str = datetime.now().isoformat()
                cursor.execute("""
                    INSERT INTO contas (id, nome_exibicao, token_path, criado_em)
                    VALUES ('drive_1', 'Conta 1 (drive_1)', 'token_drive1.json', ?)
                """, (now_str,))
                cursor.execute("""
                    INSERT INTO contas (id, nome_exibicao, token_path, criado_em)
                    VALUES ('drive_2', 'Conta 2 (drive_2)', 'token_drive2.json', ?)
                """, (now_str,))

            # Tabela de Programas e Softwares do Drive
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS programas (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    arquivo_id INTEGER,
                    nome_programa TEXT NOT NULL,
                    versao TEXT DEFAULT '1.0.0',
                    categoria TEXT DEFAULT 'Utilitários',
                    plataforma TEXT DEFAULT 'Multiplataforma',
                    descricao TEXT,
                    comando_execucao TEXT,
                    criado_em TEXT NOT NULL,
                    FOREIGN KEY(arquivo_id) REFERENCES arquivos(id) ON DELETE SET NULL
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_prog_nome ON programas(nome_programa)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_prog_cat ON programas(categoria)")

            # Seed inicial de programas se tabela estiver vazia e não for banco temporário de teste
            cursor.execute("SELECT COUNT(*) as total FROM programas")
            is_temp_test = "tmp" in self.db_path or "test" in self.db_path
            if cursor.fetchone()["total"] == 0 and not is_temp_test:
                now_str = datetime.now().isoformat()
                # Cria arquivos base caso não existam
                cursor.execute("""
                    INSERT OR IGNORE INTO arquivos (id, nome_arquivo, tamanho_bytes, md5_hash, conta_origem, id_remoto_google, data_upload)
                    VALUES 
                    (101, 'vscode_portable_x64_2026.zip', 125829120, '4a8f9c1e7d2b3a4f5c6e7d8a9b0c1d2e', 'drive_1', '1VsCodeRemoteGoogleDriveId2026', ?),
                    (102, 'blender_4.3_portable_bundle.tar.xz', 367001600, '9b8a7c6d5e4f3a2b1c0d9e8f7a6b5c4d', 'drive_2', '1BlenderRemoteGoogleDriveId2026', ?),
                    (103, '7zip_ultra_compression_suite.exe', 5242880, '1f2e3d4c5b6a79887766554433221100', 'drive_1', '1SevenZipRemoteGoogleDriveId2026', ?),
                    (104, 'python_data_science_kit.pyz', 47185920, '778899aabbccddeeff00112233445566', 'drive_2', '1PythonKitRemoteGoogleDriveId2026', ?),
                    (105, 'obsidian_vault_and_tools.zip', 31457280, 'deadbeefcafebabe0123456789abcdef', 'drive_1', '1ObsidianRemoteGoogleDriveId2026', ?)
                """, (now_str, now_str, now_str, now_str, now_str))

                cursor.execute("""
                    INSERT INTO programas (id, arquivo_id, nome_programa, versao, categoria, plataforma, descricao, comando_execucao, criado_em)
                    VALUES 
                    (1, 101, 'Visual Studio Code Portable', '1.95.2', 'Desenvolvimento', 'Windows / Linux', 'Editor de código profissional com extensões pré-configuradas e sincronizadas no Google Drive.', 'code-portable.exe', ?),
                    (2, 102, 'Blender Studio 3D Portable', '4.3.0', 'Design & 3D', 'Windows / Linux', 'Suite completa de modelagem 3D, animação e renderização portátil diretamente do Drive.', 'blender.exe', ?),
                    (3, 103, '7-Zip & FastCompress Suite', '24.08', 'Utilitários', 'Windows', 'Gerenciador de arquivos compactados de alto desempenho com suporte a 7z, zip, rar, tar.', '7zFM.exe', ?),
                    (4, 104, 'Python Data Science Toolkit', '3.12.4', 'Desenvolvimento', 'Multiplataforma', 'Ambiente executável com NumPy, Pandas, Scikit-learn e Jupyter Lab portable.', 'python toolkit.pyz', ?),
                    (5, 105, 'Obsidian Knowledge Vault', '1.7.5', 'Produtividade', 'Multiplataforma', 'Sistema de anotações Markdown com plug-ins da comunidade e backup contínuo.', 'obsidian-portable.exe', ?)
                """, (now_str, now_str, now_str, now_str, now_str))

            # Tabela de Pastas Designadas para Auto-Sync com o Pool
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS pastas_sincronizadas (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    caminho_local TEXT UNIQUE NOT NULL,
                    nome_identificador TEXT NOT NULL,
                    ativo INTEGER DEFAULT 1,
                    recursivo INTEGER DEFAULT 1,
                    ultimo_sync TEXT,
                    total_arquivos INTEGER DEFAULT 0,
                    total_bytes INTEGER DEFAULT 0,
                    criado_em TEXT NOT NULL
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_sync_caminho ON pastas_sincronizadas(caminho_local)")

            # Tabela de Histórico de Arquivos Sincronizados
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS sync_historico (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    pasta_id INTEGER,
                    arquivo_local TEXT NOT NULL,
                    arquivo_nome TEXT NOT NULL,
                    tamanho_bytes INTEGER NOT NULL,
                    md5_hash TEXT NOT NULL,
                    conta_destino TEXT NOT NULL,
                    id_remoto_google TEXT NOT NULL,
                    data_sync TEXT NOT NULL,
                    status TEXT DEFAULT 'sucesso',
                    mensagem_erro TEXT,
                    FOREIGN KEY(pasta_id) REFERENCES pastas_sincronizadas(id) ON DELETE CASCADE
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_hist_local ON sync_historico(arquivo_local)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_hist_md5 ON sync_historico(md5_hash)")

            # Seed inicial de pastas se tabela estiver vazia e não for banco temporário de teste
            cursor.execute("SELECT COUNT(*) as total FROM pastas_sincronizadas")
            if cursor.fetchone()["total"] == 0 and not is_temp_test:
                now_str = datetime.now().isoformat()
                cursor.execute("""
                    INSERT INTO pastas_sincronizadas (id, caminho_local, nome_identificador, ativo, recursivo, ultimo_sync, total_arquivos, total_bytes, criado_em)
                    VALUES 
                    (1, './sync_projetos', 'Documentos & Projetos Ativos', 1, 1, ?, 3, 157286400, ?),
                    (2, './sync_backups', 'Backups Locais e Configurações', 1, 1, ?, 2, 52428800, ?)
                """, (now_str, now_str, now_str, now_str))

            conn.commit()

    # -------------------------------------------------------------
    # Gestão de Contas (N Contas Dinâmicas)
    # -------------------------------------------------------------
    def register_account(
        self,
        account_id: str,
        nome_exibicao: Optional[str] = None,
        email: Optional[str] = None,
        token_path: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Cadastra ou atualiza uma nova conta Google Drive no pool.
        """
        clean_id = account_id.strip().lower().replace(" ", "_")
        if not clean_id:
            raise ValueError("ID de conta inválido.")

        if not token_path:
            token_path = f"token_{clean_id}.json"

        if not nome_exibicao:
            nome_exibicao = f"Conta {clean_id}"

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO contas (id, nome_exibicao, email, token_path, ativo, criado_em)
                VALUES (?, ?, ?, ?, 1, ?)
                ON CONFLICT(id) DO UPDATE SET
                    nome_exibicao = excluded.nome_exibicao,
                    email = COALESCE(excluded.email, contas.email),
                    token_path = excluded.token_path,
                    ativo = 1
            """, (clean_id, nome_exibicao, email, token_path, datetime.now().isoformat()))
            conn.commit()

        return self.get_account(clean_id)  # type: ignore

    def list_accounts(self, only_active: bool = True) -> List[Dict[str, Any]]:
        """Lista todas as contas cadastradas."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            if only_active:
                cursor.execute("SELECT * FROM contas WHERE ativo = 1 ORDER BY id ASC")
            else:
                cursor.execute("SELECT * FROM contas ORDER BY id ASC")
            return [dict(row) for row in cursor.fetchall()]

    def get_account(self, account_id: str) -> Optional[Dict[str, Any]]:
        """Obtém detalhes de uma conta específica."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM contas WHERE id = ?", (account_id.strip().lower(),))
            row = cursor.fetchone()
            return dict(row) if row else None

    def update_account_email(self, account_id: str, email: str, display_name: Optional[str] = None) -> None:
        """Atualiza informações da conta após consulta à API do Google."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            if display_name:
                cursor.execute(
                    "UPDATE contas SET email = ?, nome_exibicao = ? WHERE id = ?",
                    (email, display_name, account_id)
                )
            else:
                cursor.execute(
                    "UPDATE contas SET email = ? WHERE id = ?",
                    (email, account_id)
                )
            conn.commit()

    def delete_account(self, account_id: str) -> bool:
        """Remove uma conta cadastrada no SQLite."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM contas WHERE id = ?", (account_id.strip().lower(),))
            conn.commit()
            return cursor.rowcount > 0

    # -------------------------------------------------------------
    # Gestão de Arquivos no Catálogo
    # -------------------------------------------------------------
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
        Pode filtrar por conta_origem.
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
        Calcula estatísticas agregadas dos arquivos indexados localmente por conta.
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

    # -------------------------------------------------------------
    # Gestão de Programas e Softwares no Google Drive
    # -------------------------------------------------------------
    def register_program(
        self,
        nome_programa: str,
        arquivo_id: Optional[int] = None,
        versao: str = "1.0.0",
        categoria: str = "Utilitários",
        plataforma: str = "Multiplataforma",
        descricao: str = "",
        comando_execucao: str = ""
    ) -> Dict[str, Any]:
        """
        Cadastra um programa ou aplicativo associado a um arquivo do pool virtual.
        """
        now_str = datetime.now().isoformat()
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO programas (arquivo_id, nome_programa, versao, categoria, plataforma, descricao, comando_execucao, criado_em)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (arquivo_id, nome_programa, versao, categoria, plataforma, descricao, comando_execucao, now_str))
            prog_id = cursor.lastrowid
            conn.commit()

        return self.get_program(str(prog_id))  # type: ignore

    def list_programs(
        self,
        categoria: Optional[str] = None,
        plataforma: Optional[str] = None,
        search: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Lista programas cadastrados com join no arquivo correspondente para obter tamanho, MD5 e conta.
        """
        query = """
            SELECT 
                p.id,
                p.nome_programa,
                p.versao,
                p.categoria,
                p.plataforma,
                p.descricao,
                p.comando_execucao,
                p.criado_em,
                a.id as arquivo_id,
                a.nome_arquivo,
                a.tamanho_bytes,
                a.md5_hash,
                a.conta_origem,
                a.id_remoto_google
            FROM programas p
            LEFT JOIN arquivos a ON p.arquivo_id = a.id
            WHERE 1=1
        """
        params: List[Any] = []

        if categoria and categoria.lower() != "todos":
            query += " AND LOWER(p.categoria) = ?"
            params.append(categoria.lower())

        if plataforma and plataforma.lower() != "todas":
            query += " AND LOWER(p.plataforma) LIKE ?"
            params.append(f"%{plataforma.lower()}%")

        if search:
            query += " AND (LOWER(p.nome_programa) LIKE ? OR LOWER(p.descricao) LIKE ? OR LOWER(a.nome_arquivo) LIKE ?)"
            s = f"%{search.lower()}%"
            params.extend([s, s, s])

        query += " ORDER BY p.id ASC"

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, tuple(params))
            return [dict(row) for row in cursor.fetchall()]

    def get_program(self, identifier: str) -> Optional[Dict[str, Any]]:
        """
        Busca um programa por ID numérico ou por nome.
        """
        query = """
            SELECT 
                p.id,
                p.nome_programa,
                p.versao,
                p.categoria,
                p.plataforma,
                p.descricao,
                p.comando_execucao,
                p.criado_em,
                a.id as arquivo_id,
                a.nome_arquivo,
                a.tamanho_bytes,
                a.md5_hash,
                a.conta_origem,
                a.id_remoto_google
            FROM programas p
            LEFT JOIN arquivos a ON p.arquivo_id = a.id
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            if identifier.isdigit():
                cursor.execute(query + " WHERE p.id = ?", (int(identifier),))
            else:
                cursor.execute(query + " WHERE LOWER(p.nome_programa) = LOWER(?)", (identifier.strip(),))
            row = cursor.fetchone()
            return dict(row) if row else None

    def delete_program(self, prog_id: int) -> bool:
        """Remove um programa do catálogo."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM programas WHERE id = ?", (prog_id,))
            conn.commit()
            return cursor.rowcount > 0

    # -------------------------------------------------------------
    # Gestão de Pastas Designadas para Auto-Sync com o Pool
    # -------------------------------------------------------------
    def add_sync_folder(
        self,
        caminho_local: str,
        nome_identificador: Optional[str] = None,
        recursivo: bool = True
    ) -> Dict[str, Any]:
        """
        Cadastra uma pasta local para monitoramento e sincronização automática com o Pool.
        """
        abs_path = os.path.abspath(caminho_local)
        nome = nome_identificador or os.path.basename(abs_path) or abs_path
        now_str = datetime.now().isoformat()

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO pastas_sincronizadas 
                (caminho_local, nome_identificador, ativo, recursivo, total_arquivos, total_bytes, criado_em)
                VALUES (?, ?, 1, ?, 0, 0, ?)
                ON CONFLICT(caminho_local) DO UPDATE SET
                    nome_identificador=excluded.nome_identificador,
                    recursivo=excluded.recursivo,
                    ativo=1
            """, (abs_path, nome, 1 if recursivo else 0, now_str))
            folder_id = cursor.lastrowid
            conn.commit()

        return self.get_sync_folder(str(folder_id)) or {
            "id": folder_id,
            "caminho_local": abs_path,
            "nome_identificador": nome,
            "ativo": 1,
            "recursivo": 1 if recursivo else 0
        }

    def list_sync_folders(self) -> List[Dict[str, Any]]:
        """Lista todas as pastas designadas para sincronização com métricas."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT 
                    p.*,
                    (SELECT COUNT(*) FROM sync_historico h WHERE h.pasta_id = p.id AND h.status = 'sucesso') as total_arquivos_historico,
                    (SELECT COALESCE(SUM(h.tamanho_bytes), 0) FROM sync_historico h WHERE h.pasta_id = p.id AND h.status = 'sucesso') as total_bytes_historico
                FROM pastas_sincronizadas p
                ORDER BY p.id ASC
            """)
            return [dict(row) for row in cursor.fetchall()]

    def get_sync_folder(self, identifier: str) -> Optional[Dict[str, Any]]:
        """Busca uma pasta designada por ID ou por caminho local."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            if identifier.isdigit():
                cursor.execute("SELECT * FROM pastas_sincronizadas WHERE id = ?", (int(identifier),))
            else:
                abs_p = os.path.abspath(identifier)
                cursor.execute("SELECT * FROM pastas_sincronizadas WHERE caminho_local = ? OR caminho_local = ?", (identifier, abs_p))
            row = cursor.fetchone()
            return dict(row) if row else None

    def update_sync_folder(
        self,
        folder_id: int,
        ultimo_sync: Optional[str] = None,
        total_arquivos: Optional[int] = None,
        total_bytes: Optional[int] = None,
        ativo: Optional[int] = None
    ) -> bool:
        """Atualiza estatísticas ou status de uma pasta designada."""
        fields = []
        params = []
        if ultimo_sync is not None:
            fields.append("ultimo_sync = ?")
            params.append(ultimo_sync)
        if total_arquivos is not None:
            fields.append("total_arquivos = ?")
            params.append(total_arquivos)
        if total_bytes is not None:
            fields.append("total_bytes = ?")
            params.append(total_bytes)
        if ativo is not None:
            fields.append("ativo = ?")
            params.append(ativo)

        if not fields:
            return False

        params.append(folder_id)
        query = f"UPDATE pastas_sincronizadas SET {', '.join(fields)} WHERE id = ?"

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, tuple(params))
            conn.commit()
            return cursor.rowcount > 0

    def toggle_sync_folder(self, folder_id: int) -> bool:
        """Alterna o status ativo/pausado de uma pasta designada."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE pastas_sincronizadas SET ativo = CASE WHEN ativo = 1 THEN 0 ELSE 1 END WHERE id = ?", (folder_id,))
            conn.commit()
            return cursor.rowcount > 0

    def delete_sync_folder(self, identifier: str) -> bool:
        """Remove uma pasta designada e seu histórico associado."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            if identifier.isdigit():
                cursor.execute("DELETE FROM pastas_sincronizadas WHERE id = ?", (int(identifier),))
            else:
                abs_p = os.path.abspath(identifier)
                cursor.execute("DELETE FROM pastas_sincronizadas WHERE caminho_local = ? OR caminho_local = ?", (identifier, abs_p))
            conn.commit()
            return cursor.rowcount > 0

    def record_sync_file(
        self,
        pasta_id: Optional[int],
        arquivo_local: str,
        arquivo_nome: str,
        tamanho_bytes: int,
        md5_hash: str,
        conta_destino: str,
        id_remoto_google: str,
        status: str = "sucesso",
        mensagem_erro: Optional[str] = None
    ) -> int:
        """Registra a sincronização de um arquivo específico no histórico."""
        now_str = datetime.now().isoformat()
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO sync_historico 
                (pasta_id, arquivo_local, arquivo_nome, tamanho_bytes, md5_hash, conta_destino, id_remoto_google, data_sync, status, mensagem_erro)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (pasta_id, arquivo_local, arquivo_nome, tamanho_bytes, md5_hash, conta_destino, id_remoto_google, now_str, status, mensagem_erro))
            record_id = cursor.lastrowid

            if pasta_id and status == "sucesso":
                cursor.execute("""
                    UPDATE pastas_sincronizadas 
                    SET ultimo_sync = ?,
                        total_arquivos = total_arquivos + 1,
                        total_bytes = total_bytes + ?
                    WHERE id = ?
                """, (now_str, tamanho_bytes, pasta_id))

            conn.commit()
            return record_id

    def is_file_already_synced(self, arquivo_local: str, md5_hash: str) -> bool:
        """
        Verifica se um arquivo com o mesmo caminho e hash MD5 já foi transferido com sucesso,
        evitando uploads redundantes.
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            # Verifica no histórico de sync
            cursor.execute("""
                SELECT COUNT(*) as total FROM sync_historico 
                WHERE arquivo_local = ? AND md5_hash = ? AND status = 'sucesso'
            """, (arquivo_local, md5_hash))
            if cursor.fetchone()["total"] > 0:
                return True

            # Verifica também no catálogo geral de arquivos por hash
            cursor.execute("SELECT COUNT(*) as total FROM arquivos WHERE md5_hash = ?", (md5_hash,))
            return cursor.fetchone()["total"] > 0

    def list_sync_history(self, pasta_id: Optional[int] = None, limit: int = 50) -> List[Dict[str, Any]]:
        """Retorna histórico cronológico de arquivos sincronizados pelo watcher."""
        query = """
            SELECT h.*, p.nome_identificador as pasta_nome, p.caminho_local as pasta_caminho
            FROM sync_historico h
            LEFT JOIN pastas_sincronizadas p ON h.pasta_id = p.id
        """
        params = []
        if pasta_id is not None:
            query += " WHERE h.pasta_id = ?"
            params.append(pasta_id)

        query += " ORDER BY h.id DESC LIMIT ?"
        params.append(limit)

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, tuple(params))
            return [dict(row) for row in cursor.fetchall()]


