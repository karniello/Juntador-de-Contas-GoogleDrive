import React, { useState, useEffect } from "react";
import {
  FolderSync,
  FolderPlus,
  Play,
  Pause,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  Copy,
  Check,
  FileCode,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Clock,
  Layers,
  Terminal,
  ExternalLink,
  ChevronRight,
  FolderOpen
} from "lucide-react";

export interface SyncFolderItem {
  id: number;
  caminho_local: string;
  nome_identificador: string;
  ativo: boolean;
  recursivo: boolean;
  ultimo_sync: string | null;
  total_arquivos: number;
  total_bytes: number;
  criado_em: string;
}

export interface SyncHistoryItem {
  id: number;
  pasta_id: number;
  pasta_nome: string;
  arquivo_local: string;
  arquivo_nome: string;
  tamanho_bytes: number;
  md5_hash: string;
  conta_destino: string;
  id_remoto_google: string;
  data_sync: string;
  status: "sucesso" | "falha";
  mensagem_erro?: string;
}

interface AccountQuotaInfo {
  id: string;
  name: string;
  freeBytes: number;
  totalBytes: number;
}

interface FolderSyncManagerProps {
  accounts?: Array<{ id: string; name: string; used: number; total: number }>;
  onFileUploadedToPool?: (file: {
    nome_arquivo: string;
    tamanho_bytes: number;
    md5_hash: string;
    conta_origem: string;
    id_remoto_google: string;
  }) => void;
  onOpenTerminalWithCommand?: (command: string) => void;
}

export const INITIAL_SYNC_FOLDERS: SyncFolderItem[] = [
  {
    id: 1,
    caminho_local: "~/Documentos/Projetos_Ativos",
    nome_identificador: "Documentos & Projetos Ativos",
    ativo: true,
    recursivo: true,
    ultimo_sync: "2026-10-20T03:55:00",
    total_arquivos: 6,
    total_bytes: 184549376, // ~176 MB
    criado_em: "2026-10-18T10:00:00"
  },
  {
    id: 2,
    caminho_local: "~/Backups/Configs_e_Bancos",
    nome_identificador: "Backups Locais e Configurações",
    ativo: true,
    recursivo: false,
    ultimo_sync: "2026-10-20T02:30:12",
    total_arquivos: 3,
    total_bytes: 94371840, // ~90 MB
    criado_em: "2026-10-18T14:20:00"
  },
  {
    id: 3,
    caminho_local: "~/Imagens/Trabalho_Raw",
    nome_identificador: "Imagens e Ativos Gráficos",
    ativo: false,
    recursivo: true,
    ultimo_sync: null,
    total_arquivos: 0,
    total_bytes: 0,
    criado_em: "2026-10-19T09:15:00"
  }
];

export const INITIAL_SYNC_HISTORY: SyncHistoryItem[] = [
  {
    id: 1,
    pasta_id: 1,
    pasta_nome: "Documentos & Projetos Ativos",
    arquivo_local: "~/Documentos/Projetos_Ativos/relatorio_financeiro_q3_2026.xlsx",
    arquivo_nome: "relatorio_financeiro_q3_2026.xlsx",
    tamanho_bytes: 14680064, // 14 MB
    md5_hash: "a1b2c3d4e5f60718293a4b5c6d7e8f90",
    conta_destino: "drive_1",
    id_remoto_google: "1GoogleDriveMfsSyncDoc01",
    data_sync: "2026-10-20T03:55:00",
    status: "sucesso"
  },
  {
    id: 2,
    pasta_id: 1,
    pasta_nome: "Documentos & Projetos Ativos",
    arquivo_local: "~/Documentos/Projetos_Ativos/arquitetura_storage_pool.pdf",
    arquivo_nome: "arquitetura_storage_pool.pdf",
    tamanho_bytes: 41943040, // 40 MB
    md5_hash: "7f8e9d0c1b2a34567890abcdef123456",
    conta_destino: "drive_2",
    id_remoto_google: "1GoogleDriveMfsSyncDoc02",
    data_sync: "2026-10-20T03:52:10",
    status: "sucesso"
  },
  {
    id: 3,
    pasta_id: 2,
    pasta_nome: "Backups Locais e Configurações",
    arquivo_local: "~/Backups/Configs_e_Bancos/dump_banco_dados_daily.tar.gz",
    arquivo_nome: "dump_banco_dados_daily.tar.gz",
    tamanho_bytes: 94371840, // 90 MB
    md5_hash: "deadbeef0123456789abcdef98765432",
    conta_destino: "drive_1",
    id_remoto_google: "1GoogleDriveMfsSyncDoc03",
    data_sync: "2026-10-20T02:30:12",
    status: "sucesso"
  }
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export const FolderSyncManager: React.FC<FolderSyncManagerProps> = ({
  accounts = [
    { id: "drive_1", name: "Conta Principal (drive_1)", used: 4.8 * 1024 * 1024 * 1024, total: 15 * 1024 * 1024 * 1024 },
    { id: "drive_2", name: "Conta Secundária (drive_2)", used: 2.1 * 1024 * 1024 * 1024, total: 15 * 1024 * 1024 * 1024 }
  ],
  onFileUploadedToPool,
  onOpenTerminalWithCommand
}) => {
  const [folders, setFolders] = useState<SyncFolderItem[]>(INITIAL_SYNC_FOLDERS);
  const [history, setHistory] = useState<SyncHistoryItem[]>(INITIAL_SYNC_HISTORY);
  const [isWatcherRunning, setIsWatcherRunning] = useState<boolean>(true);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  // Modal para designar pasta
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newFolderPath, setNewFolderPath] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderRecursive, setNewFolderRecursive] = useState(true);

  // Estado para simulação de sincronização em tempo real (MFS Watcher)
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{
    stage: string;
    stepIndex: number;
    totalSteps: number;
    fileName: string;
    folderName: string;
    allocatedAccount: string;
    percent: number;
  } | null>(null);

  const totalFiles = folders.reduce((acc, f) => acc + f.total_arquivos, 0);
  const totalBytes = folders.reduce((acc, f) => acc + f.total_bytes, 0);
  const activeFoldersCount = folders.filter(f => f.ativo).length;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const handleToggleFolder = (id: number) => {
    setFolders(prev =>
      prev.map(f => (f.id === id ? { ...f, ativo: !f.ativo } : f))
    );
  };

  const handleDeleteFolder = (id: number) => {
    setFolders(prev => prev.filter(f => f.id !== id));
  };

  const handleAddFolderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderPath.trim()) return;

    const folderName = newFolderName.trim() || newFolderPath.split("/").pop() || newFolderPath;
    const newFolder: SyncFolderItem = {
      id: Date.now(),
      caminho_local: newFolderPath.trim(),
      nome_identificador: folderName,
      ativo: true,
      recursivo: newFolderRecursive,
      ultimo_sync: null,
      total_arquivos: 0,
      total_bytes: 0,
      criado_em: new Date().toISOString()
    };

    setFolders(prev => [newFolder, ...prev]);
    setNewFolderPath("");
    setNewFolderName("");
    setIsAddModalOpen(false);
  };

  // Simulação de sincronização executando o algoritmo MFS (Most Free Space)
  const triggerSyncForFolder = async (folder: SyncFolderItem) => {
    if (isSyncing) return;
    setIsSyncing(true);

    const sampleFiles = [
      { name: "documento_sprint_2026.docx", size: 5242880 }, // 5 MB
      { name: "bundle_codigo_backup.tar.gz", size: 36700160 }, // 35 MB
      { name: "planilha_orcamento_anual.xlsx", size: 8388608 }, // 8 MB
      { name: "apresentacao_diretoria.pdf", size: 23068672 } // 22 MB
    ];
    const pickedFile = sampleFiles[Math.floor(Math.random() * sampleFiles.length)];

    // MFS Logic: calcula qual conta tem maior espaço livre disponível
    let bestAccount = accounts[0]?.id || "drive_1";
    let maxFree = -1;
    for (const acc of accounts) {
      const free = acc.total - acc.used;
      if (free > maxFree) {
        maxFree = free;
        bestAccount = acc.id;
      }
    }

    // Step 1: Detectar
    setSyncProgress({
      stage: "Varrendo diretório local e detectando arquivos modificados...",
      stepIndex: 1,
      totalSteps: 5,
      fileName: pickedFile.name,
      folderName: folder.nome_identificador,
      allocatedAccount: bestAccount,
      percent: 15
    });
    await new Promise(r => setTimeout(r, 600));

    // Step 2: Calcular MD5
    setSyncProgress({
      stage: "Calculando hash MD5 para verificação de integridade e deduplicação...",
      stepIndex: 2,
      totalSteps: 5,
      fileName: pickedFile.name,
      folderName: folder.nome_identificador,
      allocatedAccount: bestAccount,
      percent: 40
    });
    await new Promise(r => setTimeout(r, 700));

    // Step 3: Alocação MFS
    setSyncProgress({
      stage: `Consultando cotas do Pool Virtual e aplicando política MFS (Conta selecionada: ${bestAccount.toUpperCase()})...`,
      stepIndex: 3,
      totalSteps: 5,
      fileName: pickedFile.name,
      folderName: folder.nome_identificador,
      allocatedAccount: bestAccount,
      percent: 65
    });
    await new Promise(r => setTimeout(r, 800));

    // Step 4: Upload em Chunks
    setSyncProgress({
      stage: `Enviando stream em chunks (2 MB) para o Google Drive [${bestAccount}]...`,
      stepIndex: 4,
      totalSteps: 5,
      fileName: pickedFile.name,
      folderName: folder.nome_identificador,
      allocatedAccount: bestAccount,
      percent: 90
    });
    await new Promise(r => setTimeout(r, 900));

    // Step 5: Registro no SQLite
    const md5Hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    const remoteId = `1MfsRemoteSync${Math.floor(Math.random() * 900000 + 100000)}`;
    const nowIso = new Date().toISOString();

    const newHistoryItem: SyncHistoryItem = {
      id: Date.now(),
      pasta_id: folder.id,
      pasta_nome: folder.nome_identificador,
      arquivo_local: `${folder.caminho_local}/${pickedFile.name}`,
      arquivo_nome: pickedFile.name,
      tamanho_bytes: pickedFile.size,
      md5_hash: md5Hex,
      conta_destino: bestAccount,
      id_remoto_google: remoteId,
      data_sync: nowIso,
      status: "sucesso"
    };

    setHistory(prev => [newHistoryItem, ...prev]);

    // Atualiza estatísticas da pasta
    setFolders(prev =>
      prev.map(f =>
        f.id === folder.id
          ? {
              ...f,
              ultimo_sync: nowIso,
              total_arquivos: f.total_arquivos + 1,
              total_bytes: f.total_bytes + pickedFile.size
            }
          : f
      )
    );

    if (onFileUploadedToPool) {
      onFileUploadedToPool({
        nome_arquivo: pickedFile.name,
        tamanho_bytes: pickedFile.size,
        md5_hash: md5Hex,
        conta_origem: bestAccount,
        id_remoto_google: remoteId
      });
    }

    setSyncProgress({
      stage: `✔ Arquivo sincronizado com sucesso e catalogado no SQLite!`,
      stepIndex: 5,
      totalSteps: 5,
      fileName: pickedFile.name,
      folderName: folder.nome_identificador,
      allocatedAccount: bestAccount,
      percent: 100
    });

    await new Promise(r => setTimeout(r, 800));
    setIsSyncing(false);
    setSyncProgress(null);
  };

  const handleSimulateWatcherEvent = () => {
    const activeFolder = folders.find(f => f.ativo) || folders[0];
    if (activeFolder) {
      triggerSyncForFolder(activeFolder);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header com Status do Watcher e Métricas Principais */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
                <FolderSync className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  Sincronização Automática de Pastas Locais
                  <span className="text-xs bg-emerald-500/20 text-emerald-300 font-semibold px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                    MFS Watcher
                  </span>
                </h2>
                <p className="text-sm text-slate-400">
                  Designação de pastas locais com observação contínua de arquivos e upload distribuído Most Free Space
                </p>
              </div>
            </div>
          </div>

          {/* Controle do Daemon Watcher */}
          <div className="flex items-center gap-3 bg-slate-950/80 border border-slate-800 rounded-xl p-2 px-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                {isWatcherRunning && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span
                  className={`relative inline-flex rounded-full h-3 w-3 ${
                    isWatcherRunning ? "bg-emerald-500" : "bg-slate-500"
                  }`}
                ></span>
              </span>
              <span className="text-xs font-semibold text-slate-300">
                {isWatcherRunning ? "Watcher Ativo (Loop de 5s)" : "Watcher Pausado"}
              </span>
            </div>

            <button
              onClick={() => setIsWatcherRunning(!isWatcherRunning)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
                isWatcherRunning
                  ? "bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/30"
              }`}
            >
              {isWatcherRunning ? (
                <>
                  <Pause className="w-3.5 h-3.5" /> Pausar
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" /> Iniciar Watcher
                </>
              )}
            </button>
          </div>
        </div>

        {/* Grade de Métricas da Sincronização */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-800/80">
          <div className="bg-slate-950/50 border border-slate-800/60 rounded-xl p-3.5">
            <div className="text-xs text-slate-400 font-medium">Pastas Designadas</div>
            <div className="text-xl font-bold text-white mt-1">
              {folders.length} <span className="text-xs text-emerald-400 font-normal">({activeFoldersCount} ativas)</span>
            </div>
          </div>

          <div className="bg-slate-950/50 border border-slate-800/60 rounded-xl p-3.5">
            <div className="text-xs text-slate-400 font-medium">Arquivos no Pool</div>
            <div className="text-xl font-bold text-sky-400 mt-1">{totalFiles} sincronizados</div>
          </div>

          <div className="bg-slate-950/50 border border-slate-800/60 rounded-xl p-3.5">
            <div className="text-xs text-slate-400 font-medium">Volume Transferido</div>
            <div className="text-xl font-bold text-indigo-400 mt-1">{formatBytes(totalBytes)}</div>
          </div>

          <div className="bg-slate-950/50 border border-slate-800/60 rounded-xl p-3.5">
            <div className="text-xs text-slate-400 font-medium">Algoritmo de Alocação</div>
            <div className="text-xs font-semibold text-emerald-400 mt-1.5 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Most Free Space (MFS)
            </div>
          </div>
        </div>
      </div>

      {/* Ações Rápidas & Barra de Teste Interativo */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg shadow-md shadow-emerald-600/20 transition"
          >
            <FolderPlus className="w-4 h-4" />
            + Designar Nova Pasta
          </button>

          <button
            onClick={handleSimulateWatcherEvent}
            disabled={isSyncing || folders.length === 0}
            className="flex items-center gap-2 px-3.5 py-2 bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 text-sm font-medium rounded-lg transition disabled:opacity-50"
            title="Simula um novo arquivo sendo salvo no disco e detectado pelo watcher"
          >
            <Sparkles className="w-4 h-4 text-sky-400" />
            Simular Arquivo Novo Detectado
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>Watcher Python:</span>
          <code className="bg-slate-950 px-2 py-1 rounded text-slate-300 border border-slate-800 font-mono">
            python main.py watch
          </code>
          <button
            onClick={() => handleCopy("python main.py watch", "cli-watch")}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition"
            title="Copiar comando"
          >
            {copiedCmd === "cli-watch" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Alerta / Progresso Animado de Sincronização MFS */}
      {isSyncing && syncProgress && (
        <div className="bg-slate-900 border border-emerald-500/40 rounded-xl p-5 shadow-2xl animate-fade-in relative overflow-hidden">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
                <RefreshCw className="w-5 h-5 animate-spin" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>MFS Watcher em Ação:</span>
                  <span className="text-emerald-400 font-mono">{syncProgress.fileName}</span>
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Pasta: <span className="text-slate-300">{syncProgress.folderName}</span> • Destino MFS:{" "}
                  <span className="text-sky-300 font-bold uppercase">{syncProgress.allocatedAccount}</span>
                </p>
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs font-mono font-bold text-emerald-400">
                Passo {syncProgress.stepIndex} de {syncProgress.totalSteps}
              </span>
              <div className="text-xs text-slate-400">{syncProgress.percent}%</div>
            </div>
          </div>

          <div className="mt-3.5">
            <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
              <div
                className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-300"
                style={{ width: `${syncProgress.percent}%` }}
              ></div>
            </div>
            <div className="text-xs text-emerald-300/90 font-medium mt-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
              {syncProgress.stage}
            </div>
          </div>
        </div>
      )}

      {/* Grid de Pastas Locais Designadas */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-emerald-400" />
            Pastas Locais Monitoradas
          </h3>
          <span className="text-xs text-slate-400">
            {folders.length} diretório(s) configurado(s) no SQLite
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {folders.map(folder => (
            <div
              key={folder.id}
              className={`bg-slate-900 border rounded-xl p-5 flex flex-col justify-between transition-all duration-200 relative group ${
                folder.ativo
                  ? "border-slate-800 hover:border-emerald-500/50 shadow-lg hover:shadow-emerald-500/5"
                  : "border-slate-800/60 opacity-70 bg-slate-950/40"
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        folder.ativo
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      <FolderSync className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white group-hover:text-emerald-300 transition">
                        {folder.nome_identificador}
                      </h4>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full inline-block mt-0.5 ${
                          folder.ativo
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : "bg-slate-800 text-slate-400 border border-slate-700"
                        }`}
                      >
                        {folder.ativo ? "Monitoramento Ativo" : "Pausado"}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteFolder(folder.id)}
                    className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 transition opacity-0 group-hover:opacity-100"
                    title="Remover pasta designada"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Caminho Local */}
                <div className="mt-3.5 bg-slate-950/70 border border-slate-800/80 rounded-lg p-2 px-2.5 flex items-center justify-between text-xs font-mono text-slate-300">
                  <span className="truncate" title={folder.caminho_local}>
                    {folder.caminho_local}
                  </span>
                  <button
                    onClick={() => handleCopy(folder.caminho_local, `path-${folder.id}`)}
                    className="text-slate-400 hover:text-white ml-1.5 p-1 transition shrink-0"
                    title="Copiar caminho"
                  >
                    {copiedCmd === `path-${folder.id}` ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {/* Métricas e Subpastas */}
                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-800/60 text-xs">
                  <div>
                    <span className="text-slate-400">Arquivos:</span>{" "}
                    <span className="font-semibold text-slate-200">{folder.total_arquivos}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Volume:</span>{" "}
                    <span className="font-semibold text-indigo-300">{formatBytes(folder.total_bytes)}</span>
                  </div>
                  <div className="col-span-2 text-[11px] text-slate-400">
                    <span className="text-slate-400">Subdiretórios:</span>{" "}
                    <span className="text-slate-300">
                      {folder.recursivo ? "Recursivo (inclusos)" : "Apenas raiz"}
                    </span>
                  </div>
                  <div className="col-span-2 text-[11px] text-slate-400 truncate">
                    <span>Último sync:</span>{" "}
                    <span className="text-slate-300">
                      {folder.ultimo_sync
                        ? new Date(folder.ultimo_sync).toLocaleString("pt-BR")
                        : "Ainda não sincronizado"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Botões de Ação do Card */}
              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-800/60">
                <button
                  onClick={() => triggerSyncForFolder(folder)}
                  disabled={isSyncing}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold rounded-lg transition disabled:opacity-50"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Sincronizar Agora
                </button>

                <button
                  onClick={() => handleToggleFolder(folder.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
                    folder.ativo
                      ? "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                      : "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/30"
                  }`}
                >
                  {folder.ativo ? "Pausar" : "Ativar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Histórico Recente de Sincronizações via MFS */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-400" />
              Histórico de Arquivos Sincronizados com o Pool
            </h3>
            <p className="text-xs text-slate-400">
              Registros gravados no SQLite após verificação de hash MD5 e distribuição automática MFS
            </p>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {history.length} transferência(s) registradas
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider">
                <th className="pb-3 font-semibold">Arquivo / Pasta</th>
                <th className="pb-3 font-semibold">Tamanho</th>
                <th className="pb-3 font-semibold">Hash MD5</th>
                <th className="pb-3 font-semibold">Destino MFS</th>
                <th className="pb-3 font-semibold">ID Remoto Google Drive</th>
                <th className="pb-3 font-semibold">Data / Hora</th>
                <th className="pb-3 font-semibold text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {history.map(item => (
                <tr key={item.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 pr-4">
                    <div className="font-semibold text-slate-200">{item.arquivo_nome}</div>
                    <div className="text-[11px] text-slate-400 font-mono truncate max-w-xs" title={item.arquivo_local}>
                      {item.arquivo_local}
                    </div>
                  </td>
                  <td className="py-3 pr-4 font-mono text-slate-300">
                    {formatBytes(item.tamanho_bytes)}
                  </td>
                  <td className="py-3 pr-4">
                    <code className="bg-slate-950 px-1.5 py-0.5 rounded text-[11px] text-slate-400 border border-slate-800 font-mono">
                      {item.md5_hash.slice(0, 10)}...
                    </code>
                  </td>
                  <td className="py-3 pr-4">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30 uppercase">
                      <HardDrive className="w-3 h-3" />
                      {item.conta_destino}
                    </span>
                  </td>
                  <td className="py-3 pr-4 font-mono text-[11px] text-slate-400">
                    {item.id_remoto_google}
                  </td>
                  <td className="py-3 pr-4 text-slate-400 text-[11px]">
                    {new Date(item.data_sync).toLocaleString("pt-BR")}
                  </td>
                  <td className="py-3 text-right">
                    <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Sincronizado
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Painel de Referência CLI & Watcher Script Python */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <Terminal className="w-4 h-4 text-amber-400" />
          <h4 className="text-sm font-bold text-white">
            Como Executar o Watcher Contínuo no seu Sistema Operacional
          </h4>
        </div>
        <p className="text-xs text-slate-400 mb-4 leading-relaxed">
          O script de monitoramento contínuo em segundo plano (<code>drive_pool/watcher.py</code>) monitora
          as pastas designadas locais e utiliza a mesma lógica de upload <strong>Most Free Space (MFS)</strong>,
          garantindo que qualquer arquivo novo ou modificado seja enviado para a conta Google Drive com mais espaço livre.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5">
            <div className="text-slate-400 font-semibold mb-1">Iniciar Watcher em Segundo Plano:</div>
            <div className="flex items-center justify-between bg-slate-900 px-3 py-2 rounded-lg font-mono text-emerald-400 border border-slate-800">
              <span>python main.py watch --interval 5</span>
              <button
                onClick={() => handleCopy("python main.py watch --interval 5", "cmd1")}
                className="text-slate-400 hover:text-white"
              >
                {copiedCmd === "cmd1" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Monitora todas as pastas ativas a cada 5 segundos com debounce de escrita.
            </p>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5">
            <div className="text-slate-400 font-semibold mb-1">Designar Nova Pasta via Terminal:</div>
            <div className="flex items-center justify-between bg-slate-900 px-3 py-2 rounded-lg font-mono text-sky-400 border border-slate-800">
              <span>python main.py add-sync-folder ./minha_pasta</span>
              <button
                onClick={() => handleCopy("python main.py add-sync-folder ./minha_pasta", "cmd2")}
                className="text-slate-400 hover:text-white"
              >
                {copiedCmd === "cmd2" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Registra imediatamente no catálogo SQLite e prepara o agendamento de sincronização.
            </p>
          </div>
        </div>
      </div>

      {/* Modal: Designar Nova Pasta */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                  <FolderPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Designar Pasta para Auto-Sync</h3>
                  <p className="text-xs text-slate-400">
                    O Watcher monitorará novos arquivos e enviará automaticamente ao Pool
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddFolderSubmit} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Caminho do Diretório Local no Disco
                </label>
                <input
                  type="text"
                  required
                  value={newFolderPath}
                  onChange={e => setNewFolderPath(e.target.value)}
                  placeholder="Ex: ~/Documentos/MinhaPasta ou /var/data/backups"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                />

                {/* Sugestões rápidas */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="text-[11px] text-slate-400 mr-1">Sugestões:</span>
                  {[
                    "~/Documentos/Projetos",
                    "~/Downloads/Backups",
                    "~/Imagens/Fotos",
                    "./dados_sincronizados"
                  ].map(sug => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => {
                        setNewFolderPath(sug);
                        if (!newFolderName) {
                          setNewFolderName(sug.split("/").pop() || "Pasta");
                        }
                      }}
                      className="text-[11px] bg-slate-800/60 hover:bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700/60 transition"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Nome Amigável de Identificação (Opcional)
                </label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  placeholder="Ex: Backups de Desenvolvimento"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="chk-rec"
                  checked={newFolderRecursive}
                  onChange={e => setNewFolderRecursive(e.target.checked)}
                  className="w-4 h-4 rounded bg-slate-950 border-slate-700 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="chk-rec" className="text-xs text-slate-300 cursor-pointer">
                  Sincronizar subdiretórios recursivamente (recomendado)
                </label>
              </div>

              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-xs text-slate-400 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  Arquivos temporários e de compilação (<code>.git</code>, <code>.tmp</code>,{" "}
                  <code>node_modules</code>, <code>__pycache__</code>) são automaticamente ignorados.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/30 transition flex items-center gap-1.5"
                >
                  <FolderPlus className="w-4 h-4" />
                  Salvar Pasta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
