"""
Suíte de testes de unidade para validação do banco SQLite, cálculo de MD5,
formatação de bytes e política de alocação Most Free Space (MFS).
"""

import os
import tempfile
import unittest

from drive_pool.database import VirtualDriveDatabase
from drive_pool.storage import format_bytes, calculate_md5
from drive_pool.pool_manager import VirtualPoolManager, InsufficientPoolSpaceError


class TestDrivePool(unittest.TestCase):

    def setUp(self):
        # Cria banco SQLite temporário
        self.temp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.temp_db.close()
        self.db = VirtualDriveDatabase(db_path=self.temp_db.name)

    def tearDown(self):
        if os.path.exists(self.temp_db.name):
            os.remove(self.temp_db.name)

    def test_database_crud(self):
        """Testa inserção, busca, listagem e remoção no SQLite."""
        # 1. Inserir arquivo
        file_id = self.db.add_file(
            nome_arquivo="backup_2026.zip",
            tamanho_bytes=1048576,  # 1 MB
            md5_hash="098f6bcd4621d373cade4e832627b4f6",
            conta_origem="drive_1",
            id_remoto_google="1a2b3c4d5e"
        )
        self.assertGreater(file_id, 0)

        # 2. Buscar por ID numérico
        found = self.db.find_file(str(file_id))
        self.assertIsNotNone(found)
        self.assertEqual(found["nome_arquivo"], "backup_2026.zip")
        self.assertEqual(found["conta_origem"], "drive_1")

        # 3. Buscar por nome
        found_name = self.db.find_file("backup_2026.zip")
        self.assertIsNotNone(found_name)
        self.assertEqual(found_name["id"], file_id)

        # 4. Listar
        files = self.db.list_files()
        self.assertEqual(len(files), 1)

        # 5. Estatísticas agregadas
        stats = self.db.get_aggregated_stats()
        self.assertEqual(stats["total_arquivos"], 1)
        self.assertEqual(stats["total_bytes"], 1048576)
        self.assertIn("drive_1", stats["por_conta"])

        # 6. Deletar
        deleted = self.db.delete_file(str(file_id))
        self.assertIsNotNone(deleted)
        self.assertIsNone(self.db.find_file(str(file_id)))

    def test_format_bytes(self):
        """Valida a formatação amigável de tamanhos."""
        self.assertEqual(format_bytes(0), "0 B")
        self.assertEqual(format_bytes(1024), "1.0 KB")
        self.assertEqual(format_bytes(1048576), "1.0 MB")
        self.assertEqual(format_bytes(1073741824), "1.0 GB")
        self.assertEqual(format_bytes(15 * 1024 * 1024 * 1024), "15.0 GB")

    def test_md5_calculation(self):
        """Valida o cálculo do hash MD5 em arquivo temporário."""
        with tempfile.NamedTemporaryFile("w+", delete=False) as f:
            f.write("Google Drive Virtual Storage Pool")
            temp_path = f.name

        try:
            md5 = calculate_md5(temp_path)
            self.assertEqual(len(md5), 32)
        finally:
            os.remove(temp_path)

    def test_dynamic_accounts(self):
        """Valida o cadastro dinâmico de mais de 2 contas no pool."""
        accounts = self.db.list_accounts()
        # Inicialmente contém drive_1 e drive_2
        self.assertEqual(len(accounts), 2)

        # Adiciona drive_3 e drive_4
        self.db.register_account("drive_3", "Conta 3 (drive_3)", "user3@gmail.com")
        self.db.register_account("drive_4", "Conta 4 (drive_4)", "user4@gmail.com")

        updated = self.db.list_accounts()
        self.assertEqual(len(updated), 4)

        acc3 = self.db.get_account("drive_3")
        self.assertIsNotNone(acc3)
        self.assertEqual(acc3["email"], "user3@gmail.com")
        self.assertEqual(acc3["token_path"], "token_drive_3.json")

        # Excluir conta
        self.db.delete_account("drive_4")
        self.assertEqual(len(self.db.list_accounts()), 3)

    def test_programs_crud(self):
        """Valida cadastro, listagem e remoção de programas associados ao pool do Drive."""
        # 1. Cadastra arquivo do programa
        file_id = self.db.add_file(
            nome_arquivo="obsidian-appimage.zip",
            tamanho_bytes=83886080,
            md5_hash="cafebabe0123456789abcdef01234567",
            conta_origem="drive_1",
            id_remoto_google="1ObsidianGoogleDriveRemoteId"
        )

        # 2. Registra o programa
        prog = self.db.register_program(
            nome_programa="Obsidian Knowledge Base",
            arquivo_id=file_id,
            versao="1.7.0",
            categoria="Produtividade",
            plataforma="Linux",
            descricao="Notas Markdown com grafos",
            comando_execucao="./obsidian.AppImage"
        )
        self.assertIsNotNone(prog)
        self.assertEqual(prog["nome_programa"], "Obsidian Knowledge Base")
        self.assertEqual(prog["conta_origem"], "drive_1")
        self.assertEqual(prog["tamanho_bytes"], 83886080)

        # 3. Listar programas
        progs = self.db.list_programs(categoria="Produtividade")
        self.assertEqual(len(progs), 1)

        # 4. Buscar por ID e Nome
        found_id = self.db.get_program(str(prog["id"]))
        self.assertIsNotNone(found_id)
        found_name = self.db.get_program("Obsidian Knowledge Base")
        self.assertIsNotNone(found_name)

        # 5. Remover programa
        deleted = self.db.delete_program(prog["id"])
        self.assertTrue(deleted)
        self.assertIsNone(self.db.get_program(str(prog["id"])))

    def test_sync_folders_crud(self):
        """Valida cadastro, listagem, atualização de status e histórico de pastas sincronizadas."""
        # 1. Adiciona pasta designada
        test_dir = "/tmp/test_sync_project"
        folder = self.db.add_sync_folder(test_dir, nome_identificador="Projeto Teste", recursivo=True)
        self.assertIsNotNone(folder)
        self.assertEqual(folder["nome_identificador"], "Projeto Teste")
        self.assertEqual(folder["ativo"], 1)

        # 2. Listar pastas
        folders = self.db.list_sync_folders()
        self.assertEqual(len(folders), 1)

        # 3. Buscar pasta por ID e por Caminho
        found_id = self.db.get_sync_folder(str(folder["id"]))
        self.assertIsNotNone(found_id)
        found_path = self.db.get_sync_folder(test_dir)
        self.assertIsNotNone(found_path)

        # 4. Alternar ativo/pausado
        self.db.toggle_sync_folder(folder["id"])
        updated = self.db.get_sync_folder(str(folder["id"]))
        self.assertEqual(updated["ativo"], 0)

        # 5. Registrar arquivo no histórico
        hist_id = self.db.record_sync_file(
            pasta_id=folder["id"],
            arquivo_local="/tmp/test_sync_project/relatorio.pdf",
            arquivo_nome="relatorio.pdf",
            tamanho_bytes=2048,
            md5_hash="d41d8cd98f00b204e9800998ecf8427e",
            conta_destino="drive_1",
            id_remoto_google="1RemotePdfIdGoogle"
        )
        self.assertGreater(hist_id, 0)

        # 6. Verifica deduplicação de sync (is_file_already_synced)
        is_synced = self.db.is_file_already_synced(
            arquivo_local="/tmp/test_sync_project/relatorio.pdf",
            md5_hash="d41d8cd98f00b204e9800998ecf8427e"
        )
        self.assertTrue(is_synced)

        is_not_synced = self.db.is_file_already_synced(
            arquivo_local="/tmp/test_sync_project/outro.pdf",
            md5_hash="abcdef0123456789abcdef0123456789"
        )
        self.assertFalse(is_not_synced)

        # 7. Listar histórico
        history = self.db.list_sync_history(pasta_id=folder["id"])
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["arquivo_nome"], "relatorio.pdf")

        # 8. Remover pasta
        del_ok = self.db.delete_sync_folder(str(folder["id"]))
        self.assertTrue(del_ok)
        self.assertIsNone(self.db.get_sync_folder(str(folder["id"])))

    def test_watcher_sync_simulation(self):
        """Valida que o watcher identifica arquivos locais e invoca o upload MFS."""
        from drive_pool.watcher import FolderWatcher
        import tempfile
        import shutil

        # Cria pasta temporária com arquivos de teste
        temp_dir = tempfile.mkdtemp(prefix="pool_sync_test_")
        try:
            file1 = os.path.join(temp_dir, "doc1.txt")
            with open(file1, "w") as f:
                f.write("Conteúdo para sincronização no Pool")

            # Cria gerenciador associado ao banco temporário
            manager = VirtualPoolManager(db_path=self.temp_db.name)

            # Mock simples do upload_file para teste unitário sem depender da API Google real
            uploaded_calls = []
            def mock_upload(filepath, progress_callback=None):
                uploaded_calls.append(filepath)
                return {
                    "allocated_account": "drive_1",
                    "remote_meta": {"id": "mock_remote_id_123"},
                    "record": {"id": 999, "nome_arquivo": os.path.basename(filepath)}
                }
            manager.upload_file = mock_upload

            # Cadastra a pasta temporária
            folder = manager.add_sync_folder(temp_dir, "Pasta Temporária Teste")

            # 1. Executa primeira sincronização
            watcher = FolderWatcher(manager=manager, target_folder_path=temp_dir)
            res1 = watcher.scan_and_sync_all(verbose=False)

            self.assertEqual(res1["uploaded"], 1)
            self.assertEqual(len(uploaded_calls), 1)

            # 2. Executa segunda sincronização sem alterações: deve ignorar (0 uploads)
            res2 = watcher.scan_and_sync_all(verbose=False)
            self.assertEqual(res2["uploaded"], 0)
            self.assertEqual(res2["skipped"], 1)

            # 3. Adiciona novo arquivo na pasta
            file2 = os.path.join(temp_dir, "projeto_backup.zip")
            with open(file2, "w") as f:
                f.write("Novo arquivo simulado para o watcher detectar")

            res3 = watcher.scan_and_sync_all(verbose=False)
            self.assertEqual(res3["uploaded"], 1)
            self.assertEqual(len(uploaded_calls), 2)
            self.assertIn(file2, uploaded_calls)

        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
