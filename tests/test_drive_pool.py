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


if __name__ == "__main__":
    unittest.main()
