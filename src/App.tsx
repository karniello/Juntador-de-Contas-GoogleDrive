import React, { useState, useEffect, useMemo } from "react";
import JSZip from "jszip";
import confetti from "canvas-confetti";
import {
  HardDrive,
  Database,
  Terminal,
  Code2,
  BookOpen,
  Upload,
  Download,
  Trash2,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Copy,
  Check,
  FolderDown,
  Layers,
  ShieldCheck,
  Server,
  ArrowRight,
  Info,
  Sliders,
  Play,
  Monitor,
  Key,
  Plus,
  Sparkles,
  Package,
  FolderSync
} from "lucide-react";
import { PYTHON_FILES, PythonFileItem } from "./data/pythonFiles";
import { StorageTrendChart } from "./components/StorageTrendChart";
import { ConnectAccountsModal, AccountItem } from "./components/ConnectAccountsModal";
import { ProgramsLauncher, ProgramItem } from "./components/ProgramsLauncher";
import { FolderSyncManager } from "./components/FolderSyncManager";

// Helpers para formatação de bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

interface SimulatedFile {
  id: number;
  nome_arquivo: string;
  tamanho_bytes: number;
  md5_hash: string;
  conta_origem: string;
  id_remoto_google: string;
  data_upload: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "programs" | "sync" | "code" | "terminal" | "gcp-guide" | "desktop-preview">("dashboard");

  // Lista de Programas e Softwares armazenados no Google Drive
  const [programs, setPrograms] = useState<ProgramItem[]>([
    {
      id: 1,
      nome_programa: "Visual Studio Code Portable",
      versao: "1.95.2",
      categoria: "Desenvolvimento",
      plataforma: "Windows",
      descricao: "Editor de código profissional com extensões pré-configuradas e sincronizadas nas contas do Google Drive.",
      comando_execucao: "code-portable.exe",
      nome_arquivo: "vscode_portable_x64_2026.zip",
      tamanho_bytes: 120 * 1024 * 1024,
      md5_hash: "4a8f9c1e7d2b3a4f5c6e7d8a9b0c1d2e",
      conta_origem: "drive_1",
      id_remoto_google: "1VsCodeRemoteGoogleDriveId2026",
      data_adicionado: "2026-10-18T10:00:00Z",
      icon_type: "code"
    },
    {
      id: 2,
      nome_programa: "Blender Studio 3D Portable",
      versao: "4.3.0",
      categoria: "Design & 3D",
      plataforma: "Windows",
      descricao: "Suite completa de modelagem 3D, animação e renderização portátil diretamente do Drive.",
      comando_execucao: "blender.exe",
      nome_arquivo: "blender_4.3_portable_bundle.tar.xz",
      tamanho_bytes: 350 * 1024 * 1024,
      md5_hash: "9b8a7c6d5e4f3a2b1c0d9e8f7a6b5c4d",
      conta_origem: "drive_2",
      id_remoto_google: "1BlenderRemoteGoogleDriveId2026",
      data_adicionado: "2026-10-18T14:30:00Z",
      icon_type: "cube"
    },
    {
      id: 3,
      nome_programa: "7-Zip Ultra Compression Suite",
      versao: "24.08",
      categoria: "Utilitários",
      plataforma: "Windows",
      descricao: "Gerenciador de compactação de alto desempenho com suporte a 7z, zip, rar, tar e iso.",
      comando_execucao: "7zFM.exe",
      nome_arquivo: "7zip_ultra_compression_suite.exe",
      tamanho_bytes: 5.2 * 1024 * 1024,
      md5_hash: "1f2e3d4c5b6a79887766554433221100",
      conta_origem: "drive_1",
      id_remoto_google: "1SevenZipRemoteGoogleDriveId2026",
      data_adicionado: "2026-10-19T08:15:00Z",
      icon_type: "archive"
    },
    {
      id: 4,
      nome_programa: "Python Data Science Toolkit",
      versao: "3.12.4",
      categoria: "Desenvolvimento",
      plataforma: "Multiplataforma",
      descricao: "Ambiente executável portable com Jupyter, Pandas, NumPy, Scikit-Learn e bibliotecas científicas.",
      comando_execucao: "python toolkit.pyz",
      nome_arquivo: "python_data_science_kit.pyz",
      tamanho_bytes: 45 * 1024 * 1024,
      md5_hash: "778899aabbccddeeff00112233445566",
      conta_origem: "drive_3",
      id_remoto_google: "1PythonKitRemoteGoogleDriveId2026",
      data_adicionado: "2026-10-19T11:20:00Z",
      icon_type: "terminal"
    },
    {
      id: 5,
      nome_programa: "Obsidian Knowledge Vault",
      versao: "1.7.5",
      categoria: "Produtividade",
      plataforma: "Multiplataforma",
      descricao: "Sistema de anotações Markdown com plug-ins de comunidade e sincronização contínua com backup.",
      comando_execucao: "obsidian-portable.exe",
      nome_arquivo: "obsidian_vault_and_tools.zip",
      tamanho_bytes: 30 * 1024 * 1024,
      md5_hash: "deadbeefcafebabe0123456789abcdef",
      conta_origem: "drive_1",
      id_remoto_google: "1ObsidianRemoteGoogleDriveId2026",
      data_adicionado: "2026-10-19T15:45:00Z",
      icon_type: "doc"
    }
  ]);

  // Lista dinâmica de Contas Google Drive cadastradas no Pool (N contas)
  const [accounts, setAccounts] = useState<AccountItem[]>([
    {
      id: "drive_1",
      name: "Drive 1 (Principal)",
      email: "karniello@gmail.com",
      limitBytes: 15 * 1024 * 1024 * 1024,
      connected: true,
      color: "#06b6d4", // cyan
    },
    {
      id: "drive_2",
      name: "Drive 2 (Backup)",
      email: "backup.drive2@gmail.com",
      limitBytes: 15 * 1024 * 1024 * 1024,
      connected: true,
      color: "#f59e0b", // amber
    },
    {
      id: "drive_3",
      name: "Drive 3 (Google One)",
      email: "karniello.pro@gmail.com",
      limitBytes: 15 * 1024 * 1024 * 1024,
      connected: true,
      color: "#10b981", // emerald
    },
  ]);

  // Estado do Modal de Conexão de Contas
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Arquivos armazenados no SQLite virtual simulado
  const [files, setFiles] = useState<SimulatedFile[]>([
    {
      id: 1,
      nome_arquivo: "backup_projetos_2026.tar.gz",
      tamanho_bytes: 3.8 * 1024 * 1024 * 1024,
      md5_hash: "a9f8e43cb127e492f5847dbb1842e12a",
      conta_origem: "drive_1",
      id_remoto_google: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptnyt74OiZWEZXPU",
      data_upload: "2026-10-18T14:32:00Z"
    },
    {
      id: 2,
      nome_arquivo: "dataset_machine_learning_full.parquet",
      tamanho_bytes: 5.2 * 1024 * 1024 * 1024,
      md5_hash: "7d4b2e81fc01289ae8329ef00b1478cd",
      conta_origem: "drive_2",
      id_remoto_google: "1Z6yXW_aOP5bE11nmKQ_84uN8e9X0V12Y3",
      data_upload: "2026-10-18T18:15:30Z"
    },
    {
      id: 3,
      nome_arquivo: "video_apresentacao_4k.mp4",
      tamanho_bytes: 2.1 * 1024 * 1024 * 1024,
      md5_hash: "3b087034c5685514f76cdb94cbfe484f",
      conta_origem: "drive_1",
      id_remoto_google: "1Mn5Op8QrSt44UvWxYz0123456789ABCD",
      data_upload: "2026-10-19T09:44:12Z"
    }
  ]);

  // Busca e Filtros
  const [searchQuery, setSearchQuery] = useState("");
  const [filterAccount, setFilterAccount] = useState<string>("all");

  // Estado do Processo de Upload no Simulador
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStepLog, setUploadStepLog] = useState<string>("");
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Arquivo selecionado no explorador de código
  const [selectedCodeFile, setSelectedCodeFile] = useState<PythonFileItem>(PYTHON_FILES[0]);
  const [copiedCode, setCopiedCode] = useState(false);
  const [isZipping, setIsZipping] = useState(false);

  // Terminal Interativo
  const [terminalHistory, setTerminalHistory] = useState<Array<{ cmd: string; output: string }>>([
    {
      cmd: "python main.py status",
      output: `╔════════════════════════════════════════════════════════════════════════════╗
║               GOOGLE DRIVE VIRTUAL STORAGE POOL (CLI)                      ║
║         Capacidade Unificada Multi-Conta com Balanceamento MFS             ║
╚════════════════════════════════════════════════════════════════════════════╝
Capacidade Total Somada : 30.0 GB
Espaço Total Ocupado    : 11.1 GB
Espaço Total Livre      : 18.9 GB
Uso do Pool             : [███████████░░░░░░░░░░░░░░░░░░░]  37.0%

Detalhes por Conta:
  • DRIVE_1 (alfa.cloud@gmail.com): 5.9 GB usado / 9.1 GB livre (39.3%)
  • DRIVE_2 (beta.storage@gmail.com): 5.2 GB usado / 9.8 GB livre (34.7%)`
    }
  ]);
  const [terminalInput, setTerminalInput] = useState("");

  // Cálculo Dinâmico de Espaço por Conta (N Contas)
  const accountUsageMap = useMemo(() => {
    const map: Record<string, number> = {};
    accounts.forEach(a => { map[a.id] = 0; });
    files.forEach(f => {
      if (map[f.conta_origem] !== undefined) {
        map[f.conta_origem] += f.tamanho_bytes;
      } else {
        map[f.conta_origem] = f.tamanho_bytes;
      }
    });
    return map;
  }, [accounts, files]);

  const totalPoolLimit = useMemo(() => {
    return accounts.filter(a => a.connected).reduce((acc, curr) => acc + curr.limitBytes, 0);
  }, [accounts]);

  const totalPoolUsage = useMemo(() => {
    return files.reduce((acc, curr) => acc + curr.tamanho_bytes, 0);
  }, [files]);

  const totalPoolFree = Math.max(0, totalPoolLimit - totalPoolUsage);
  const poolUsagePct = totalPoolLimit > 0 ? (totalPoolUsage / totalPoolLimit) * 100 : 0;

  // Filtragem de arquivos
  const filteredFiles = useMemo(() => {
    return files.filter(f => {
      const matchSearch = f.nome_arquivo.toLowerCase().includes(searchQuery.toLowerCase());
      const matchAccount = filterAccount === "all" || f.conta_origem === filterAccount;
      return matchSearch && matchAccount;
    });
  }, [files, searchQuery, filterAccount]);

  // Simulação do algoritmo Most Free Space (MFS) para N Contas
  const simulateUpload = (name: string, sizeBytes: number) => {
    setUploadError(null);
    setIsUploading(true);
    setUploadProgress(0);
    setUploadStepLog(`1. Analisando arquivo "${name}" (${formatBytes(sizeBytes)})...`);

    setTimeout(() => {
      // 2. Consulta de cota MFS entre todas as contas conectadas
      const connectedAccounts = accounts.filter(a => a.connected);
      const candidates = connectedAccounts.map(a => {
        const usage = accountUsageMap[a.id] || 0;
        const free = Math.max(0, a.limitBytes - usage);
        return { ...a, usage, free };
      });

      const summaryList = candidates.map(c => `${c.name}: ${formatBytes(c.free)} livre`).join(" | ");
      setUploadStepLog(`2. Consultando cota em ${connectedAccounts.length} contas: ${summaryList}...`);

      setTimeout(() => {
        // Filtra contas que comportam o arquivo
        const eligible = candidates.filter(c => c.free >= sizeBytes);

        if (eligible.length === 0) {
          setIsUploading(false);
          const detalhes = candidates.map(c => `${c.id.toUpperCase()}: livre ${formatBytes(c.free)}`).join(", ");
          setUploadError(
            `Espaço insuficiente no Pool (${connectedAccounts.length} contas consultadas)! O arquivo tem ${formatBytes(sizeBytes)}, mas nenhuma conta possui capacidade individual suficiente. (${detalhes}).`
          );
          return;
        }

        // Escolhe a conta com maior espaço livre (MFS)
        const chosen = eligible.reduce((prev, curr) => (curr.free > prev.free ? curr : prev));
        const chosenAccount = chosen.id;

        setUploadStepLog(
          `3. MFS selecionou: ${chosen.name} (Maior espaço livre: ${formatBytes(chosen.free)}). Calculando MD5 e iniciando streaming de chunks (2MB)...`
        );

        // Progresso em Chunks
        let currentPct = 10;
        const interval = setInterval(() => {
          currentPct += 20;
          if (currentPct >= 100) {
            clearInterval(interval);
            setUploadProgress(100);
            setUploadStepLog(`4. Finalizando upload e gravando metadados no SQLite (virtual_drive.db)...`);

            setTimeout(() => {
              const newFile: SimulatedFile = {
                id: files.length > 0 ? Math.max(...files.map(f => f.id)) + 1 : 1,
                nome_arquivo: name,
                tamanho_bytes: sizeBytes,
                md5_hash: Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join(""),
                conta_origem: chosenAccount,
                id_remoto_google: "gdrive_" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
                data_upload: new Date().toISOString()
              };

              setFiles(prev => [newFile, ...prev]);
              setIsUploading(false);
              setUploadStepLog("");

              // Lança confetes de celebração
              try {
                confetti({ particleCount: 70, spread: 60, origin: { y: 0.7 } });
              } catch (_) {}
            }, 600);
          } else {
            setUploadProgress(currentPct);
          }
        }, 220);
      }, 700);
    }, 600);
  };

  // Exclusão de Arquivo
  const handleDeleteFile = (id: number) => {
    const target = files.find(f => f.id === id);
    if (!target) return;
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  // Gestão de Programas e Softwares no Drive
  const handleAddProgram = (newProg: ProgramItem) => {
    setPrograms(prev => [newProg, ...prev]);
    // Sincroniza também no catálogo simulado de arquivos SQLite
    const newSimFile: SimulatedFile = {
      id: Date.now(),
      nome_arquivo: newProg.nome_arquivo,
      tamanho_bytes: newProg.tamanho_bytes,
      md5_hash: newProg.md5_hash,
      conta_origem: newProg.conta_origem,
      id_remoto_google: newProg.id_remoto_google,
      data_upload: new Date().toISOString()
    };
    setFiles(prev => [newSimFile, ...prev]);
  };

  const handleDeleteProgram = (id: number) => {
    const target = programs.find(p => p.id === id);
    if (target) {
      setPrograms(prev => prev.filter(p => p.id !== id));
      setFiles(prev => prev.filter(f => f.nome_arquivo !== target.nome_arquivo));
    }
  };

  // Download do Projeto Completo em ZIP
  const handleDownloadZip = async () => {
    setIsZipping(true);
    try {
      const zip = new JSZip();

      // Arquivos raiz
      zip.file("main.py", PYTHON_FILES.find(f => f.name === "main.py")?.content || "");
      zip.file("requirements.txt", PYTHON_FILES.find(f => f.name === "requirements.txt")?.content || "");
      zip.file("README.md", PYTHON_FILES.find(f => f.name === "README.md")?.content || "");

      // Pacote drive_pool
      const poolFolder = zip.folder("drive_pool");
      if (poolFolder) {
        poolFolder.file("__init__.py", `"""Google Drive Virtual Pool Package"""\n__version__ = "1.0.0"\n`);
        poolFolder.file("auth.py", PYTHON_FILES.find(f => f.name === "auth.py")?.content || "");
        poolFolder.file("database.py", PYTHON_FILES.find(f => f.name === "database.py")?.content || "");
        poolFolder.file("storage.py", PYTHON_FILES.find(f => f.name === "storage.py")?.content || "");
        poolFolder.file("pool_manager.py", PYTHON_FILES.find(f => f.name === "pool_manager.py")?.content || "");
        poolFolder.file("cli.py", PYTHON_FILES.find(f => f.name === "cli.py")?.content || "");
        poolFolder.file("gui.py", PYTHON_FILES.find(f => f.name === "gui.py")?.content || "");
      }

      // Pasta de testes
      const testsFolder = zip.folder("tests");
      if (testsFolder) {
        testsFolder.file(
          "test_drive_pool.py",
          `import unittest\nfrom drive_pool.database import VirtualDriveDatabase\n\nclass TestDrivePool(unittest.TestCase):\n    def test_sample(self):\n        self.assertTrue(True)\n`
        );
      }

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.createElement("a");
      link.href = url;
      link.download = "google-drive-virtual-pool.zip";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Erro ao gerar ZIP:", err);
    } finally {
      setIsZipping(false);
    }
  };

  // Copiar código para clipboard
  const handleCopyCode = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Executar comando no Terminal Interativo
  const handleRunCommand = (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    let output = "";
    if (trimmed === "clear") {
      setTerminalHistory([]);
      setTerminalInput("");
      return;
    } else if (trimmed === "python main.py" || trimmed === "python main.py gui") {
      output = "Iniciando interface gráfica desktop CustomTkinter em nova janela [980x680]...";
    } else if (trimmed === "python main.py list" || trimmed === "list") {
      const accountsSummary = accounts
        .map(a => {
          const usage = accountUsageMap[a.id] || 0;
          const free = Math.max(0, a.limitBytes - usage);
          const pct = a.limitBytes > 0 ? ((usage / a.limitBytes) * 100).toFixed(1) : "0";
          return `  • ${a.id.toUpperCase()} (${a.email}): ${formatBytes(usage)} usado / ${formatBytes(free)} livre (${pct}%)`;
        })
        .join("\n");

      output = `═══ STATUS DO POOL VIRTUAL UNIFICADO (${accounts.length} CONTAS) ═══
Capacidade Total Somada : ${formatBytes(totalPoolLimit)}
Espaço Total Ocupado    : ${formatBytes(totalPoolUsage)}
Espaço Total Livre      : ${formatBytes(totalPoolFree)}
Uso do Pool             : [${"█".repeat(Math.round(poolUsagePct / 5))}${"░".repeat(20 - Math.round(poolUsagePct / 5))}] ${poolUsagePct.toFixed(1)}%

Detalhes por Conta:
${accountsSummary}

═══ ARQUIVOS INDEXADOS NO POOL (SQLite) ═══
${files
  .map(
    f =>
      `ID ${f.id.toString().padEnd(3)} | ${f.nome_arquivo.padEnd(34)} | ${formatBytes(f.tamanho_bytes).padEnd(9)} | ${f.conta_origem.toUpperCase()}`
  )
  .join("\n")}
Total: ${files.length} arquivo(s) indexado(s) somando ${formatBytes(totalPoolUsage)}.`;
    } else if (trimmed.startsWith("upload") || trimmed.startsWith("python main.py upload")) {
      const parts = trimmed.split(" ");
      const fileName = parts[parts.length - 1] || "sample_file.zip";
      const simSize = 1.2 * 1024 * 1024 * 1024; // 1.2GB
      simulateUpload(fileName, simSize);
      output = `Iniciando upload de: ${fileName} (${formatBytes(simSize)})\nConsultando cota em tempo real via storageQuota...\nAlocação Most Free Space (MFS) acionada.\nEnviando chunks [████████████████████] 100.0%\n✔ Upload concluído com sucesso e gravado no SQLite!`;
    } else if (trimmed === "python main.py accounts" || trimmed === "accounts") {
      output = `═══ CONTAS GOOGLE DRIVE CADASTRADAS NO POOL (${accounts.length}) ═══
ID              NOME                      TOKEN                  EMAIL
────────────────────────────────────────────────────────────────────────────────────────────
${accounts.map(a => `${a.id.padEnd(15)} ${a.name.padEnd(25)} ${a.connected ? '✔ Conectado           ' : '⚠ Pendente            '} ${a.email}`).join('\n')}

Use 'python main.py add-account <id>' para adicionar mais contas.
Use 'python main.py auth <id>' para autorizar uma conta.`;
    } else if (trimmed.startsWith("python main.py add-account") || trimmed.startsWith("add-account")) {
      const parts = trimmed.split(" ");
      const newId = parts[parts.length - 1] || `drive_${accounts.length + 1}`;
      const cleanId = newId.toLowerCase().replace(/[^a-z0-9_]/g, "_");
      if (accounts.some(a => a.id === cleanId)) {
        output = `✖ Conta '${cleanId}' já está cadastrada no pool.`;
      } else {
        const palette = ["#8b5cf6", "#ec4899", "#3b82f6", "#14b8a6", "#f97316", "#06b6d4"];
        const newAcc = {
          id: cleanId,
          name: `Conta ${accounts.length + 1} (${cleanId})`,
          email: `${cleanId}@gmail.com`,
          limitBytes: 15 * 1024 * 1024 * 1024,
          connected: true,
          color: palette[accounts.length % palette.length],
        };
        setAccounts(prev => [...prev, newAcc]);
        output = `✔ Conta '${cleanId}' cadastrada com sucesso no pool!
  • Token configurado para: token_${cleanId}.json
  • Para autorizar no Google Drive agora, execute: python main.py auth ${cleanId}`;
      }
    } else if (trimmed.startsWith("python main.py auth") || trimmed.startsWith("auth")) {
      const parts = trimmed.split(" ");
      const specific = parts.length >= 4 ? parts[3] : (parts.length === 2 && parts[0] === "auth" ? parts[1] : null);
      if (specific) {
        output = `Iniciando autorização OAuth 2.0 para ${specific.toUpperCase()}...\n✔ Conta ${specific.toUpperCase()} conectada com sucesso! Token: token_${specific}.json`;
      } else {
        output = `═══ CONFIGURAÇÃO DE AUTENTICAÇÃO OAUTH 2.0 (${accounts.length} CONTAS) ═══\n` +
          accounts.map(a => `Iniciando autorização para ${a.id.toUpperCase()}...\n✔ Conta ${a.id.toUpperCase()} conectada com sucesso! Token: token_${a.id}.json`).join("\n");
      }
    } else if (trimmed.startsWith("delete") || trimmed.startsWith("python main.py delete")) {
      const parts = trimmed.split(" ");
      const idOrName = parts[parts.length - 1];
      const target = files.find(f => f.id.toString() === idOrName || f.nome_arquivo === idOrName);
      if (target) {
        handleDeleteFile(target.id);
        output = `✔ Arquivo '${target.nome_arquivo}' removido com sucesso do Google Drive (${target.conta_origem.toUpperCase()}) e do SQLite!`;
      } else {
        output = `✖ Arquivo '${idOrName}' não encontrado no catálogo local SQLite.`;
      }
    } else if (trimmed === "python main.py programs" || trimmed === "programs") {
      output = `═══ PROGRAMAS E SOFTWARES NO GOOGLE DRIVE POOL (${programs.length}) ═══
ID   PROGRAMA                       VERSÃO     CATEGORIA        PLATAFORMA         CONTA DRIVE    TAMANHO
─────────────────────────────────────────────────────────────────────────────────────────────────────────
${programs.map(p => `${p.id.toString().padEnd(4)} ${p.nome_programa.padEnd(30)} ${p.versao.padEnd(10)} ${p.categoria.padEnd(16)} ${p.plataforma.padEnd(18)} ${p.conta_origem.padEnd(14)} ${formatBytes(p.tamanho_bytes)}`).join('\n')}

Para executar ou baixar um programa: python main.py launch <ID_ou_NOME>
Para adicionar novo software: python main.py add-program <arquivo> --nome "Nome"`;
    } else if (trimmed.startsWith("python main.py launch") || trimmed.startsWith("launch")) {
      const parts = trimmed.split(" ");
      const idOrName = parts[parts.length - 1];
      const prog = programs.find(p => p.id.toString() === idOrName || p.nome_programa.toLowerCase().includes(idOrName.toLowerCase()));
      if (prog) {
        output = `Iniciando inicialização do programa '${prog.nome_programa}' do Drive...
✔ Programa pronto para execução!
  • Nome: ${prog.nome_programa} (v${prog.versao})
  • Categoria: ${prog.categoria} | Plataforma: ${prog.plataforma}
  • Conta no Drive: ${prog.conta_origem.toUpperCase()}
  • Caminho em Cache Local: ~/.drive_pool/cache_programas/${prog.nome_arquivo}
  • Comando de Execução: ${prog.comando_execucao}
Executando em ambiente local...`;
      } else {
        output = `✖ Programa '${idOrName}' não encontrado no catálogo do Drive. Execute 'python main.py programs' para ver os softwares.`;
      }
    } else if (trimmed === "python main.py sync-folders" || trimmed === "sync-folders") {
      output = `═══ PASTAS LOCAIS DESIGNADAS PARA AUTO-SYNC COM O POOL (MFS WATCHER) ═══
ID   NOME                      CAMINHO LOCAL                  STATUS     RECURSIVO  ARQUIVOS   TAMANHO
──────────────────────────────────────────────────────────────────────────────────────────────────────────
1    Documentos & Projetos     ~/Documentos/Projetos_Ativos   Ativo      Sim        6          176.0 MB
2    Backups e Configs         ~/Backups/Configs_e_Bancos     Ativo      Não        3          90.0 MB
3    Imagens e Ativos          ~/Imagens/Trabalho_Raw         Pausado    Sim        0          0 B

Dica: Para iniciar o watcher em tempo real: python main.py watch
Para forçar sincronização imediata: python main.py sync`;
    } else if (trimmed.startsWith("python main.py watch") || trimmed.startsWith("watch")) {
      output = `📡 MFS Auto-Sync Watcher Iniciado
Intervalo de verificação: 5.0s | Debounce: 1.5s
Monitorando 2 pastas designadas ativas:
  📁 Documentos & Projetos: ~/Documentos/Projetos_Ativos
  📁 Backups e Configs: ~/Backups/Configs_e_Bancos

[Varredura 1] Verificando alterações locais...
✔ [MFS Sync] relatorio_financeiro_q3.xlsx (14.0 MB) ➔ DRIVE_1 (10.2 GB livres)
✔ [MFS Sync] arquitetura_storage_pool.pdf (40.0 MB) ➔ DRIVE_2 (12.9 GB livres)
Sincronização contínua ativa. Pressione Ctrl+C para encerrar.`;
    } else if (trimmed.startsWith("python main.py add-sync-folder") || trimmed.startsWith("add-sync-folder")) {
      const parts = trimmed.split(" ");
      const folderPath = parts[parts.length - 1] || "./nova_pasta";
      output = `✔ Diretório local verificado: ${folderPath}
✔ Pasta designada com sucesso para Auto-Sync!
  • Nome: ${folderPath.split("/").pop() || folderPath}
  • Caminho: ${folderPath}
  • Modo: Recursivo (subpastas inclusas)
Inicie o watcher com: python main.py watch`;
    } else if (trimmed.startsWith("python main.py sync") || trimmed === "sync") {
      output = `Iniciando sincronização de todas as pastas designadas ativas...
• Consultando cotas de todas as contas no Pool Virtual...
• Alocando novos arquivos pela política Most Free Space (MFS)...
✔ Processadas 2 pasta(s). Total de 2 arquivo(s) enviados (54.0 MB). Todos os hashes gravados no SQLite!`;
    } else {
      output = `Comando executado: "${trimmed}". Comandos disponíveis: list, upload <arquivo>, delete <id>, accounts, add-account <id>, programs, launch <id>, sync-folders, add-sync-folder <dir>, sync, watch, auth [id], status, clear`;
    }

    setTerminalHistory(prev => [...prev, { cmd: trimmed, output }]);
    setTerminalInput("");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-900/70 backdrop-blur-md sticky top-0 z-40 px-4 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white font-bold">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base lg:text-lg font-bold text-white tracking-tight">
                Google Drive Virtual Pool
              </h1>
              <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                30 GB+ Unificado
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Arquitetura Multi-Conta com Política Most Free Space (MFS) e Catálogo SQLite
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 bg-slate-800/60 p-1 rounded-xl border border-slate-700/50 text-xs">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
              activeTab === "dashboard"
                ? "bg-cyan-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/40"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Pool Simulator</span>
          </button>

          <button
            onClick={() => setActiveTab("programs")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
              activeTab === "programs"
                ? "bg-cyan-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/40"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
            <span>Programas no Drive</span>
            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-cyan-400/20 text-cyan-300 ml-0.5">
              {programs.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("sync")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
              activeTab === "sync"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/40"
            }`}
          >
            <FolderSync className="w-3.5 h-3.5 text-emerald-400" />
            <span>Pastas Auto-Sync</span>
            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-400/20 text-emerald-300 ml-0.5">
              MFS
            </span>
          </button>

          <button
            onClick={() => setActiveTab("desktop-preview")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
              activeTab === "desktop-preview"
                ? "bg-cyan-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/40"
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>Desktop GUI</span>
          </button>

          <button
            onClick={() => setActiveTab("code")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
              activeTab === "code"
                ? "bg-cyan-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/40"
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Código Python</span>
          </button>

          <button
            onClick={() => setActiveTab("terminal")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
              activeTab === "terminal"
                ? "bg-cyan-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/40"
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>CLI Console</span>
          </button>

          <button
            onClick={() => setActiveTab("gcp-guide")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition ${
              activeTab === "gcp-guide"
                ? "bg-cyan-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/40"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Setup GCP Guide</span>
          </button>
        </div>

        {/* Actions: Conectar Contas & Download Full Project ZIP */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAuthModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-semibold shadow-sm transition active:scale-95"
          >
            <Key className="w-3.5 h-3.5 text-cyan-400" />
            <span>Conectar Contas</span>
          </button>

          <button
            onClick={handleDownloadZip}
            disabled={isZipping}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold shadow-md shadow-emerald-700/20 transition active:scale-95 disabled:opacity-50"
          >
            <FolderDown className="w-4 h-4" />
            <span>{isZipping ? "Gerando ZIP..." : "Download Projeto Python (.zip)"}</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-4 lg:p-8 max-w-7xl w-full mx-auto">
        {/* ======================================================== */}
        {/* TAB 1: DASHBOARD / SIMULADOR DO POOL                     */}
        {/* ======================================================== */}
        {activeTab === "dashboard" && (
          <div className="space-y-6">
            {/* Top Pool Aggregated Card */}
            <div className="rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900/90 to-slate-900/40 p-6 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <h2 className="text-sm font-semibold tracking-wider uppercase text-cyan-400">
                      Capacidade Unificada do Pool Virtual
                    </h2>
                  </div>
                  <div className="flex items-baseline gap-3 mt-1">
                    <span className="text-3xl font-extrabold text-white">
                      {formatBytes(totalPoolFree)}
                    </span>
                    <span className="text-sm text-slate-400">
                      livres de <strong className="text-slate-200">{formatBytes(totalPoolLimit)}</strong> somados
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="text-right">
                    <div className="text-xs text-slate-400">Espaço Ocupado</div>
                    <div className="text-sm font-bold text-amber-400">
                      {formatBytes(totalPoolUsage)} ({poolUsagePct.toFixed(1)}%)
                    </div>
                  </div>
                  <div className="h-8 w-px bg-slate-800 hidden sm:block" />
                  <div className="text-right">
                    <div className="text-xs text-slate-400">Arquivos Indexados</div>
                    <div className="text-sm font-bold text-slate-200">
                      {files.length} arquivos no SQLite
                    </div>
                  </div>
                  <div className="h-8 w-px bg-slate-800 hidden sm:block" />
                  <button
                    onClick={() => setIsAuthModalOpen(true)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700/80 text-xs font-semibold text-cyan-300 hover:text-white flex items-center gap-1.5 transition active:scale-95 shadow-sm"
                  >
                    <Key className="w-3.5 h-3.5" />
                    <span>Conectar Contas</span>
                  </button>
                </div>
              </div>

              {/* Pool Big Progress Bar Dinâmica (N Contas) */}
              <div className="space-y-2">
                <div className="h-4 w-full bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800/80 flex">
                  {accounts.map((acc, index) => {
                    const usage = accountUsageMap[acc.id] || 0;
                    const pct = totalPoolLimit > 0 ? (usage / totalPoolLimit) * 100 : 0;
                    return (
                      <div
                        key={acc.id}
                        style={{ width: `${pct}%`, backgroundColor: acc.color }}
                        className={`h-full transition-all duration-500 relative group cursor-pointer ${
                          index === 0 ? "rounded-l-full" : ""
                        }`}
                        title={`${acc.name}: ${formatBytes(usage)}`}
                      />
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 gap-2 px-1">
                  <div className="flex flex-wrap items-center gap-3">
                    {accounts.map((acc) => (
                      <span key={acc.id} className="flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-sm inline-block"
                          style={{ backgroundColor: acc.color }}
                        />
                        <span className="text-slate-300 font-medium">{acc.name}</span>
                        <span className="text-slate-400">({formatBytes(accountUsageMap[acc.id] || 0)})</span>
                      </span>
                    ))}
                  </div>
                  <span className="text-slate-500">MFS: Most Free Space ({accounts.length} contas ativas)</span>
                </div>
              </div>

              {/* Grid Dinâmico de Cards para Todas as N Contas */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
                {accounts.map((acc) => {
                  const usage = accountUsageMap[acc.id] || 0;
                  const free = Math.max(0, acc.limitBytes - usage);
                  const pct = acc.limitBytes > 0 ? (usage / acc.limitBytes) * 100 : 0;
                  const fileCount = files.filter((f) => f.conta_origem === acc.id).length;

                  return (
                    <div
                      key={acc.id}
                      className="p-4 rounded-xl border bg-slate-950/60 relative overflow-hidden transition hover:border-slate-700"
                      style={{ borderColor: `${acc.color}30` }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs"
                            style={{
                              backgroundColor: `${acc.color}15`,
                              color: acc.color,
                              border: `1px solid ${acc.color}30`,
                            }}
                          >
                            {acc.id.toUpperCase().slice(0, 3)}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-white flex items-center gap-1.5">
                              <span>{acc.name}</span>
                              {acc.connected ? (
                                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20 font-medium">
                                  Conectado
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded border border-slate-700 font-medium">
                                  Desconectado
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate max-w-[170px]">
                              {acc.email}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-bold" style={{ color: acc.color }}>
                            {formatBytes(free)} livre
                          </div>
                          <div className="text-[10px] text-slate-400">Total: {formatBytes(acc.limitBytes)}</div>
                        </div>
                      </div>

                      <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden mt-3">
                        <div
                          style={{ width: `${pct}%`, backgroundColor: acc.color }}
                          className="h-full rounded-full transition-all duration-300"
                        />
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-slate-400 mt-1.5">
                        <span>
                          Usado: {formatBytes(usage)} ({pct.toFixed(1)}%)
                        </span>
                        <span style={{ color: acc.color }} className="font-medium">
                          {fileCount} arquivos
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* Quick Add Account Card */}
                <div
                  onClick={() => setIsAuthModalOpen(true)}
                  className="p-4 rounded-xl border border-dashed border-slate-800 hover:border-cyan-500/50 bg-slate-950/30 hover:bg-slate-900/40 cursor-pointer flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-cyan-300 transition group min-h-[110px]"
                >
                  <div className="w-8 h-8 rounded-xl bg-slate-800 group-hover:bg-cyan-500/20 group-hover:text-cyan-400 flex items-center justify-center transition">
                    <Plus className="w-4 h-4" />
                  </div>
                  <div className="text-center">
                    <span className="text-xs font-semibold block">+ Adicionar Nova Conta</span>
                    <span className="text-[10px] text-slate-500">
                      Integre mais contas Google Drive ao Pool
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Access Card: Programas & Softwares Armazenados no Drive */}
            <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-cyan-950/40 via-slate-900/90 to-blue-950/40 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg shadow-cyan-950/10">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 text-cyan-400 flex items-center justify-center shrink-0 border border-cyan-500/30">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">
                      Programas & Softwares no Google Drive
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      {programs.length} Softwares Disponíveis
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                    Acesse seu catálogo portátil de instaladores e programas (.exe, .AppImage, .zip, .py).
                    Execute com 1 clique, baixe para o computador ou envie novos softwares com balanceamento inteligente no Drive.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                <button
                  onClick={() => setActiveTab("programs")}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold shadow-md shadow-cyan-600/20 transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Acessar Programas no Drive</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Quick Access Card: Sincronização Automática de Pastas Locais (MFS Watcher) */}
            <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/40 via-slate-900/90 to-teal-950/40 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg shadow-emerald-950/10">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-600/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
                  <FolderSync className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">
                      Auto-Sync de Pastas Locais com o Pool
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      MFS Watcher Ativo
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                    Designe pastas no seu disco para sincronização automática. O watcher monitora alterações e
                    executa o upload para a conta Google Drive com maior espaço livre (MFS).
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                <button
                  onClick={() => setActiveTab("sync")}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Gerenciar Pastas & Watcher</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Storage Usage Growth Trend Chart (Recharts) Dinâmico para N Contas */}
            <StorageTrendChart
              files={files}
              accounts={accounts}
              totalPoolLimitBytes={totalPoolLimit}
            />

            {/* Interactive Upload Tester & MFS Simulator */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Upload className="w-4 h-4 text-cyan-400" />
                    Simulador Interativo de Upload & Balanceamento MFS
                  </h3>
                  <p className="text-xs text-slate-400">
                    Teste o algoritmo de alocação automática em chunks com cálculo de hash MD5 e registro SQLite.
                  </p>
                </div>
              </div>

              {/* Quick simulation buttons */}
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  disabled={isUploading}
                  onClick={() => simulateUpload("relatorio_financeiro_anual.pdf", 45 * 1024 * 1024)}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700/60 text-xs font-medium text-slate-200 flex items-center gap-2 transition disabled:opacity-40"
                >
                  <Play className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Enviar PDF Leve (45 MB)</span>
                </button>

                <button
                  disabled={isUploading}
                  onClick={() => simulateUpload("iso_linux_ubuntu_server.iso", 2.6 * 1024 * 1024 * 1024)}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700/60 text-xs font-medium text-slate-200 flex items-center gap-2 transition disabled:opacity-40"
                >
                  <Play className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Enviar Imagem ISO (2.6 GB)</span>
                </button>

                <button
                  disabled={isUploading}
                  onClick={() => simulateUpload("raw_4k_footage_reel.mov", 7.4 * 1024 * 1024 * 1024)}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700/60 text-xs font-medium text-slate-200 flex items-center gap-2 transition disabled:opacity-40"
                >
                  <Play className="w-3.5 h-3.5 text-amber-400" />
                  <span>Enviar Vídeo Pesado (7.4 GB)</span>
                </button>

                <button
                  disabled={isUploading}
                  onClick={() => simulateUpload("arquivo_gigante_impossivel.bin", 20 * 1024 * 1024 * 1024)}
                  className="px-3 py-2 rounded-xl bg-red-950/40 hover:bg-red-900/40 border border-red-800/40 text-xs font-medium text-red-300 flex items-center gap-2 transition disabled:opacity-40"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  <span>Testar Erro Espaço Insuficiente (20 GB)</span>
                </button>
              </div>

              {/* Upload in progress banner */}
              {isUploading && (
                <div className="mt-4 p-4 rounded-xl bg-slate-950/80 border border-cyan-500/30 space-y-2 animate-fadeIn">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-cyan-300 flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                      {uploadStepLog}
                    </span>
                    <span className="font-mono font-bold text-white">{uploadProgress}%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${uploadProgress}%` }}
                      className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-200"
                    />
                  </div>
                </div>
              )}

              {/* Upload error banner */}
              {uploadError && (
                <div className="mt-4 p-4 rounded-xl bg-red-950/60 border border-red-500/40 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-red-200 uppercase tracking-wide">
                      Erro de Alocação MFS
                    </h4>
                    <p className="text-xs text-red-300/90 mt-1 leading-relaxed">{uploadError}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Unified Catalog Table (SQLite virtual_drive.db representation) */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 shadow-lg overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-sm font-bold text-white">
                    Catálogo Local de Arquivos (virtual_drive.db)
                  </h3>
                  <span className="text-[11px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700">
                    {filteredFiles.length} registros
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Search box */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Filtrar por nome..."
                      className="pl-8 pr-3 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 w-44"
                    />
                  </div>

                  {/* Account filter */}
                  <select
                    value={filterAccount}
                    onChange={e => setFilterAccount(e.target.value)}
                    className="px-2.5 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-cyan-500/60"
                  >
                    <option value="all">Todas as Contas ({accounts.length})</option>
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/50 text-slate-400 font-semibold">
                      <th className="py-3 px-4 w-12 text-center">ID</th>
                      <th className="py-3 px-4">Nome do Arquivo</th>
                      <th className="py-3 px-4">Tamanho</th>
                      <th className="py-3 px-4 text-center">Conta de Origem</th>
                      <th className="py-3 px-4 font-mono">Hash MD5</th>
                      <th className="py-3 px-4">Data Upload</th>
                      <th className="py-3 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredFiles.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500">
                          Nenhum arquivo encontrado com os filtros atuais.
                        </td>
                      </tr>
                    ) : (
                      filteredFiles.map(file => {
                        const accMeta = accounts.find(a => a.id === file.conta_origem);
                        const badgeColor = accMeta ? accMeta.color : "#06b6d4";
                        return (
                          <tr key={file.id} className="hover:bg-slate-800/30 transition">
                            <td className="py-3 px-4 text-center font-mono text-slate-400">
                              #{file.id}
                            </td>
                            <td className="py-3 px-4 font-medium text-slate-200 flex items-center gap-2">
                              <span className="p-1 rounded bg-slate-800 text-slate-400">
                                <HardDrive className="w-3.5 h-3.5" />
                              </span>
                              <span>{file.nome_arquivo}</span>
                            </td>
                            <td className="py-3 px-4 text-slate-300 font-mono">
                              {formatBytes(file.tamanho_bytes)}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase border"
                                style={{
                                  backgroundColor: `${badgeColor}15`,
                                  color: badgeColor,
                                  borderColor: `${badgeColor}35`,
                                }}
                              >
                                {file.conta_origem.toUpperCase()}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                              {file.md5_hash.slice(0, 16)}...
                            </td>
                            <td className="py-3 px-4 text-slate-400 text-[11px]">
                              {file.data_upload.slice(0, 19).replace("T", " ")}
                            </td>
                            <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  alert(`Iniciando streaming de download de '${file.nome_arquivo}' a partir de ${file.conta_origem.toUpperCase()} via MediaIoBaseDownload em chunks de 2MB!`);
                                }}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                                title="Download"
                              >
                                <Download className="w-3.5 h-3.5 text-emerald-400" />
                              </button>
                              <button
                                onClick={() => handleDeleteFile(file.id)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-900/30 text-slate-300 hover:text-red-400 transition"
                                title="Excluir"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 1.5: PROGRAMAS & SOFTWARES LAUNCHER NO DRIVE        */}
        {/* ======================================================== */}
        {activeTab === "programs" && (
          <ProgramsLauncher
            accounts={accounts}
            programs={programs}
            onAddProgram={handleAddProgram}
            onDeleteProgram={handleDeleteProgram}
            onOpenAccountsModal={() => setIsAuthModalOpen(true)}
          />
        )}

        {/* ======================================================== */}
        {/* TAB 1.6: PASTAS LOCAIS AUTO-SYNC (MFS WATCHER)           */}
        {/* ======================================================== */}
        {activeTab === "sync" && (
          <FolderSyncManager
            accounts={accounts.map(a => ({
              id: a.id,
              name: a.name,
              used: accountUsageMap[a.id] || 0,
              total: a.limitBytes
            }))}
            onFileUploadedToPool={(file) => {
              setFiles(prev => [
                {
                  id: Date.now(),
                  nome_arquivo: file.nome_arquivo,
                  tamanho_bytes: file.tamanho_bytes,
                  md5_hash: file.md5_hash,
                  conta_origem: file.conta_origem,
                  id_remoto_google: file.id_remoto_google,
                  data_upload: new Date().toISOString()
                },
                ...prev
              ]);
            }}
            onOpenTerminalWithCommand={(cmd) => {
              setActiveTab("terminal");
              setTerminalInput(cmd);
            }}
          />
        )}

        {/* ======================================================== */}
        {/* TAB 2: DESKTOP GUI MOCKUP PREVIEW                        */}
        {/* ======================================================== */}
        {activeTab === "desktop-preview" && (
          <div className="space-y-6">
            <div className="p-4 rounded-xl border border-cyan-500/20 bg-cyan-950/20 flex items-start gap-3">
              <Info className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-cyan-200 uppercase">
                  Interface Desktop com CustomTkinter / Tkinter (main.py gui)
                </h4>
                <p className="text-xs text-slate-300 mt-1">
                  Abaixo está a réplica visual interativa da janela que abre nativamente no seu computador ao rodar{" "}
                  <code className="text-cyan-300 bg-slate-900 px-1 py-0.5 rounded">python main.py</code> ou{" "}
                  <code className="text-cyan-300 bg-slate-900 px-1 py-0.5 rounded">python main.py gui</code>.
                  Ela se conecta com os arquivos <code className="text-slate-300">virtual_drive.db</code>, <code className="text-slate-300">token_drive1.json</code> e <code className="text-slate-300">token_drive2.json</code>.
                </p>
              </div>
            </div>

            {/* Window Frame Mockup */}
            <div className="rounded-2xl border border-slate-700 bg-[#0f172a] shadow-2xl overflow-hidden max-w-4xl mx-auto">
              {/* Desktop Window Titlebar */}
              <div className="bg-[#1e293b] px-4 py-2.5 flex items-center justify-between border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
                  <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />
                  <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
                  <span className="ml-2 text-xs font-medium text-slate-300">
                    Google Drive Virtual Storage Pool - 30 GB+ (Desktop GUI)
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 font-mono">CustomTkinter Dark Mode</span>
              </div>

              {/* GUI Content */}
              <div className="p-6 space-y-5">
                {/* Header in GUI */}
                <div className="p-4 rounded-xl bg-[#1e293b] flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-[#38bdf8]">Google Drive Virtual Storage Pool</h2>
                    <p className="text-xs text-slate-400">
                      Capacidade Unificada Multi-Conta • Alocação Inteligente MFS (Most Free Space)
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => setActiveTab("programs")}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white transition active:scale-95 flex items-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>🚀 Programas no Drive ({programs.length})</span>
                    </button>
                    <button
                      onClick={() => setActiveTab("sync")}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition active:scale-95 flex items-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      <FolderSync className="w-3.5 h-3.5" />
                      <span>📁 Pastas Auto-Sync</span>
                    </button>
                    <button
                      onClick={() => setIsAuthModalOpen(true)}
                      className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-white transition active:scale-95 flex items-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Adicionar Conta</span>
                    </button>
                    <button
                      onClick={() => setIsAuthModalOpen(true)}
                      className="px-3 py-1.5 rounded-lg bg-[#334155] hover:bg-[#475569] text-xs font-medium text-slate-200 transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Key className="w-3.5 h-3.5" />
                      <span>⚙ Conectar Contas ({accounts.length})</span>
                    </button>
                  </div>
                </div>

                {/* Pool Status Card in GUI */}
                <div className="p-5 rounded-xl bg-[#1e293b] space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-300">CAPACIDADE TOTAL DO POOL ({accounts.length} CONTAS UNIFICADAS)</span>
                    <span className="font-bold text-[#38bdf8]">
                      Ocupado: {formatBytes(totalPoolUsage)} ({poolUsagePct.toFixed(1)}%) • Livre: {formatBytes(totalPoolFree)} • Total: {formatBytes(totalPoolLimit)}
                    </span>
                  </div>

                  <div className="h-3.5 w-full bg-[#0f172a] rounded-full overflow-hidden p-0.5">
                    <div
                      style={{ width: `${poolUsagePct}%` }}
                      className="h-full bg-[#0284c7] rounded-full transition-all duration-300"
                    />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                    {accounts.map(acc => {
                      const usage = accountUsageMap[acc.id] || 0;
                      const free = Math.max(0, acc.limitBytes - usage);
                      const pct = acc.limitBytes > 0 ? (usage / acc.limitBytes) * 100 : 0;
                      return (
                        <div key={acc.id} className="p-3 rounded-lg bg-[#0f172a]">
                          <div className="text-xs font-bold text-slate-200 truncate">{acc.name}</div>
                          <div className="text-[11px] text-slate-400">
                            {formatBytes(usage)} / {formatBytes(acc.limitBytes)} (Livre: {formatBytes(free)})
                          </div>
                          <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden mt-2">
                            <div
                              style={{ width: `${pct}%`, backgroundColor: acc.color }}
                              className="h-full rounded-full"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* GUI Buttons Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => simulateUpload("novo_arquivo_gui.zip", 1.8 * 1024 * 1024 * 1024)}
                      className="px-3.5 py-2 rounded-lg bg-[#0284c7] hover:bg-[#0369a1] text-xs font-bold text-white flex items-center gap-1.5"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Enviar Arquivo (MFS)</span>
                    </button>

                    <button
                      onClick={() => alert("Selecione um arquivo na tabela da interface para baixar.")}
                      className="px-3.5 py-2 rounded-lg bg-[#10b981] hover:bg-[#059669] text-xs font-bold text-white flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Baixar Selecionado</span>
                    </button>

                    <button
                      onClick={() => alert("Selecione um arquivo para excluir.")}
                      className="px-3.5 py-2 rounded-lg bg-[#ef4444] hover:bg-[#dc2626] text-xs font-bold text-white flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Excluir</span>
                    </button>

                    <button
                      onClick={() => alert("Atualizando dados do Google Drive e SQLite...")}
                      className="px-3.5 py-2 rounded-lg bg-[#334155] hover:bg-[#475569] text-xs font-medium text-slate-200 flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Atualizar</span>
                    </button>
                  </div>

                  <input
                    type="text"
                    placeholder="🔍 Filtrar arquivos..."
                    className="px-3 py-1.5 text-xs rounded-lg bg-[#1e293b] border border-slate-700 text-slate-200 placeholder-slate-500 w-48"
                  />
                </div>

                {/* GUI Treeview Table */}
                <div className="rounded-xl border border-slate-800 bg-[#1e293b] overflow-hidden">
                  <div className="grid grid-cols-6 gap-2 px-4 py-2 bg-[#334155] text-xs font-bold text-[#38bdf8]">
                    <span>ID</span>
                    <span className="col-span-2">Nome do Arquivo</span>
                    <span>Tamanho</span>
                    <span>Conta Origem</span>
                    <span>Data Upload</span>
                  </div>
                  <div className="divide-y divide-slate-800 text-xs">
                    {files.slice(0, 4).map(f => (
                      <div key={f.id} className="grid grid-cols-6 gap-2 px-4 py-2.5 text-slate-200 hover:bg-slate-800/40">
                        <span className="font-mono">#{f.id}</span>
                        <span className="col-span-2 truncate">{f.nome_arquivo}</span>
                        <span className="font-mono">{formatBytes(f.tamanho_bytes)}</span>
                        <span className={f.conta_origem === "drive_1" ? "text-cyan-400 font-bold" : "text-amber-400 font-bold"}>
                          {f.conta_origem.toUpperCase()}
                        </span>
                        <span className="text-slate-400 text-[11px]">{f.data_upload.slice(0, 10)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* GUI Status Bar */}
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <span>Pronto • {files.length} arquivos indexados no SQLite.</span>
                  <span className="font-mono text-emerald-400">OAuth 2.0 Ativo</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 3: CÓDIGO PYTHON (EXPLORADOR MODULAR)                 */}
        {/* ======================================================== */}
        {activeTab === "code" && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* File List Sidebar */}
            <div className="lg:col-span-1 space-y-2">
              <div className="text-xs font-semibold uppercase text-slate-400 px-2 tracking-wider">
                Arquivos do Projeto Python
              </div>
              <div className="space-y-1">
                {PYTHON_FILES.map(file => (
                  <button
                    key={file.path}
                    onClick={() => setSelectedCodeFile(file)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-medium transition flex items-center justify-between ${
                      selectedCodeFile.path === file.path
                        ? "bg-cyan-600 text-white shadow-sm"
                        : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Code2 className="w-3.5 h-3.5 shrink-0 opacity-75" />
                      <span className="truncate">{file.path}</span>
                    </div>
                  </button>
                ))}
              </div>

              <div className="pt-4 px-2">
                <button
                  onClick={handleDownloadZip}
                  className="w-full py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700/80 text-xs font-semibold text-slate-200 flex items-center justify-center gap-2 transition"
                >
                  <FolderDown className="w-4 h-4 text-emerald-400" />
                  <span>Baixar Pacote .ZIP</span>
                </button>
              </div>
            </div>

            {/* Code Viewer */}
            <div className="lg:col-span-3 rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl overflow-hidden flex flex-col">
              <div className="p-3.5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-cyan-300">
                      {selectedCodeFile.path}
                    </span>
                    <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                      {selectedCodeFile.language}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">{selectedCodeFile.description}</p>
                </div>

                <button
                  onClick={() => handleCopyCode(selectedCodeFile.content)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 transition"
                >
                  {copiedCode ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                      <span>Copiar Código</span>
                    </>
                  )}
                </button>
              </div>

              <div className="p-4 overflow-x-auto max-h-[620px] bg-slate-950/90">
                <pre className="font-mono text-xs text-slate-200 leading-relaxed">
                  <code>{selectedCodeFile.content}</code>
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 4: CLI CONSOLE INTERATIVO                            */}
        {/* ======================================================== */}
        {activeTab === "terminal" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-cyan-400" />
                  Terminal Interativo da CLI (Python)
                </h3>
                <p className="text-xs text-slate-400">
                  Execute comandos reais da CLI ou clique nos atalhos rápidos abaixo para ver a resposta.
                </p>
              </div>

              {/* Quick CLI command chips */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleRunCommand("python main.py list")}
                  className="px-2.5 py-1 text-[11px] font-mono rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700"
                >
                  python main.py list
                </button>
                <button
                  onClick={() => handleRunCommand("python main.py upload backup_2026.zip")}
                  className="px-2.5 py-1 text-[11px] font-mono rounded bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700"
                >
                  python main.py upload
                </button>
                <button
                  onClick={() => handleRunCommand("python main.py auth")}
                  className="px-2.5 py-1 text-[11px] font-mono rounded bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700"
                >
                  python main.py auth
                </button>
              </div>
            </div>

            {/* Terminal Window */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl overflow-hidden font-mono text-xs">
              <div className="bg-slate-900 px-4 py-2.5 flex items-center justify-between border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
                  <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />
                  <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
                  <span className="ml-2 text-slate-400 text-[11px]">bash - virtual_drive_pool</span>
                </div>
                <button
                  onClick={() => setTerminalHistory([])}
                  className="text-slate-400 hover:text-white text-[11px]"
                >
                  Limpar (clear)
                </button>
              </div>

              <div className="p-4 space-y-4 max-h-[500px] overflow-y-auto">
                {terminalHistory.map((entry, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center gap-2 text-cyan-400 font-bold">
                      <span className="text-emerald-400">user@dev-machine:~$</span>
                      <span>{entry.cmd}</span>
                    </div>
                    <pre className="text-slate-300 whitespace-pre-wrap leading-relaxed pl-2 border-l border-slate-800">
                      {entry.output}
                    </pre>
                  </div>
                ))}

                {/* Input Prompt */}
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    handleRunCommand(terminalInput);
                  }}
                  className="flex items-center gap-2 pt-2"
                >
                  <span className="text-emerald-400 font-bold">user@dev-machine:~$</span>
                  <input
                    type="text"
                    value={terminalInput}
                    onChange={e => setTerminalInput(e.target.value)}
                    placeholder="Digite um comando (ex: python main.py list, upload teste.mp4, clear)..."
                    className="flex-1 bg-transparent border-none text-white focus:outline-none placeholder-slate-600 font-mono"
                  />
                </form>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 5: GUIA DO GOOGLE CLOUD CONSOLE                      */}
        {/* ======================================================== */}
        {activeTab === "gcp-guide" && (
          <div className="space-y-6 max-w-4xl mx-auto">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold text-white tracking-tight">
                Como Configurar o Google Cloud Console para Duas Contas
              </h2>
              <p className="text-xs text-slate-400 max-w-xl mx-auto">
                Siga este roteiro detalhado para obter o arquivo <code className="text-cyan-300">credentials.json</code> e permitir que 2 contas distintas autorizem a mesma aplicação.
              </p>
            </div>

            <div className="space-y-4">
              {/* Step 1 */}
              <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/60 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-sm border border-cyan-500/30">
                    1
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Criar Projeto e Habilitar a Google Drive API</h3>
                    <p className="text-xs text-slate-400">Ativação dos serviços na nuvem do Google</p>
                  </div>
                </div>
                <div className="pl-11 space-y-2 text-xs text-slate-300">
                  <p>1. Acesse o <strong className="text-cyan-300">Google Cloud Console</strong> (<a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" className="text-cyan-400 underline">console.cloud.google.com</a>).</p>
                  <p>2. No topo, clique em selecionar projeto e crie um novo projeto com o nome <strong>Drive Virtual Pool</strong>.</p>
                  <p>3. No menu lateral, vá para <strong>APIs e Serviços &gt; Biblioteca</strong>.</p>
                  <p>4. Busque por <strong>Google Drive API</strong> e clique no botão azul <strong>Ativar (Enable)</strong>.</p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="p-5 rounded-2xl border border-amber-500/30 bg-slate-900/60 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-sm border border-amber-500/30">
                    2
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Configurar Tela de Permissão OAuth & Usuários de Teste</h3>
                    <p className="text-xs text-amber-400/90 font-medium">★ ETAPA FUNDAMENTAL PARA MULTI-CONTA</p>
                  </div>
                </div>
                <div className="pl-11 space-y-2 text-xs text-slate-300">
                  <p>1. Acesse <strong>APIs e Serviços &gt; Tela de permissão OAuth</strong>.</p>
                  <p>2. Escolha o tipo de usuário: <strong>Externo (External)</strong> e clique em Criar.</p>
                  <p>3. Preencha o nome do app (ex: <em>Drive Virtual Pool</em>) e seu e-mail de suporte.</p>
                  <p>4. Em <strong>Escopos</strong>, adicione o escopo completo: <code className="text-cyan-300">https://www.googleapis.com/auth/drive</code>.</p>
                  <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-200">
                    <strong>Atenção Crucial:</strong> Na aba <strong>Usuários de Teste (Test Users)</strong>, adicione o e-mail da <strong>Conta 1</strong> e o e-mail da <strong>Conta 2</strong>. Isso permite que ambas as contas autorizem a aplicação em modo de desenvolvimento sem necessitar de verificação oficial da Google!
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/60 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm border border-emerald-500/30">
                    3
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Criar Credenciais OAuth 2.0 (Desktop App)</h3>
                    <p className="text-xs text-slate-400">Download do arquivo credentials.json</p>
                  </div>
                </div>
                <div className="pl-11 space-y-2 text-xs text-slate-300">
                  <p>1. Vá em <strong>APIs e Serviços &gt; Credenciais</strong>.</p>
                  <p>2. Clique em <strong>+ Criar Credenciais &gt; ID do cliente OAuth</strong>.</p>
                  <p>3. No campo <strong>Tipo de aplicativo</strong>, selecione <strong>App para computador (Desktop app)</strong>.</p>
                  <p>4. Dê o nome de <code>Drive Pool Client</code> e clique em <strong>Criar</strong>.</p>
                  <p>5. Baixe o arquivo JSON gerado, renomeie-o para <strong className="text-cyan-300">credentials.json</strong> e coloque-o na raiz da pasta do projeto Python.</p>
                </div>
              </div>

              {/* Step 4 */}
              <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/60 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-sm border border-purple-500/30">
                    4
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Executar Autorização e Iniciar o Sistema</h3>
                    <p className="text-xs text-slate-400">Criação dos tokens independentes</p>
                  </div>
                </div>
                <div className="pl-11 space-y-2 text-xs text-slate-300">
                  <div className="p-3 rounded-xl bg-slate-950 font-mono text-slate-300 border border-slate-800">
                    <p className="text-slate-500"># 1. Instalar bibliotecas oficiais</p>
                    <p className="text-cyan-300">pip install -r requirements.txt</p>
                    <p className="text-slate-500 mt-2"># 2. Conectar as duas contas</p>
                    <p className="text-cyan-300">python main.py auth</p>
                    <p className="text-slate-500 mt-2"># 3. Iniciar interface gráfica desktop</p>
                    <p className="text-cyan-300">python main.py gui</p>
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    O script salvará automaticamente <code className="text-slate-300">token_drive1.json</code> e <code className="text-slate-300">token_drive2.json</code>, gerenciando a renovação e cotas de forma 100% autônoma.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-900/40 px-6 py-4 text-center text-xs text-slate-500">
        <p>Google Drive Virtual Storage Pool • Engenharia de Software Sênior em Python & Cloud APIs • 2026</p>
      </footer>

      {/* Modal de Conexão de Contas (N Contas) */}
      <ConnectAccountsModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        accounts={accounts}
        setAccounts={setAccounts}
        onGoToGcpGuide={() => {
          setIsAuthModalOpen(false);
          setActiveTab("gcp-guide");
        }}
        onRunCliAuth={(accountId) => {
          setIsAuthModalOpen(false);
          setActiveTab("terminal");
          handleRunCommand(accountId ? `python main.py auth ${accountId}` : "python main.py auth");
        }}
      />
    </div>
  );
}
