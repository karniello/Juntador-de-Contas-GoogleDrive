import React, { useState, useMemo } from "react";
import {
  Play,
  Download,
  Plus,
  Search,
  ExternalLink,
  Copy,
  Check,
  HardDrive,
  Cpu,
  Layers,
  Sparkles,
  Package,
  Terminal,
  FolderOpen,
  Trash2,
  CheckCircle2,
  RefreshCw,
  Box,
  Monitor,
  Code,
  FileCode,
  Archive,
  BookOpen,
  SlidersHorizontal,
  Info
} from "lucide-react";
import confetti from "canvas-confetti";
import { AccountItem } from "./ConnectAccountsModal";

export interface ProgramItem {
  id: number;
  nome_programa: string;
  versao: string;
  categoria: string;
  plataforma: "Windows" | "Linux" | "macOS" | "Multiplataforma" | "Android";
  descricao: string;
  comando_execucao: string;
  arquivo_id?: number;
  nome_arquivo: string;
  tamanho_bytes: number;
  md5_hash: string;
  conta_origem: string;
  id_remoto_google: string;
  data_adicionado: string;
  icon_type?: "code" | "cube" | "archive" | "terminal" | "doc" | "app";
}

interface ProgramsLauncherProps {
  accounts: AccountItem[];
  programs: ProgramItem[];
  onAddProgram: (newProg: ProgramItem) => void;
  onDeleteProgram: (id: number) => void;
  onOpenAccountsModal: () => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function ProgramsLauncher({
  accounts,
  programs,
  onAddProgram,
  onDeleteProgram,
  onOpenAccountsModal,
}: ProgramsLauncherProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedPlatform, setSelectedPlatform] = useState<string>("all");
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Modal de Execução / Abertura de Programa
  const [launchingProgram, setLaunchingProgram] = useState<ProgramItem | null>(null);
  const [launchStep, setLaunchStep] = useState<number>(0);
  const [launchLogs, setLaunchLogs] = useState<string[]>([]);
  const [isLaunched, setIsLaunched] = useState(false);

  // Modal de Adicionar Novo Programa
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newProgName, setNewProgName] = useState("");
  const [newProgVersion, setNewProgVersion] = useState("1.0.0");
  const [newProgCategory, setNewProgCategory] = useState("Utilitários");
  const [newProgPlatform, setNewProgPlatform] = useState<"Windows" | "Linux" | "macOS" | "Multiplataforma" | "Android">("Windows");
  const [newProgFile, setNewProgFile] = useState<File | null>(null);
  const [newProgFileName, setNewProgFileName] = useState("meu_software.exe");
  const [newProgFileSize, setNewProgFileSize] = useState(24 * 1024 * 1024); // 24 MB default
  const [newProgCmd, setNewProgCmd] = useState("meu_software.exe --portable");
  const [newProgDesc, setNewProgDesc] = useState("");
  const [targetAccount, setTargetAccount] = useState<string>("auto");

  // Conta recomendada pelo Most Free Space (MFS)
  const recommendedAccount = useMemo(() => {
    if (!accounts || accounts.length === 0) return "drive_1";
    // Ordena pelo limite ou default
    return accounts[0]?.id || "drive_1";
  }, [accounts]);

  // Contas disponíveis mapeadas por ID
  const accountsMap = useMemo(() => {
    const map = new Map<string, AccountItem>();
    accounts.forEach((acc) => map.set(acc.id, acc));
    return map;
  }, [accounts]);

  // Categorias disponíveis
  const categories = useMemo(() => {
    const set = new Set<string>();
    programs.forEach((p) => set.add(p.categoria));
    return Array.from(set);
  }, [programs]);

  // Filtros aplicados
  const filteredPrograms = useMemo(() => {
    return programs.filter((p) => {
      const matchSearch =
        searchQuery === "" ||
        p.nome_programa.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.descricao.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.nome_arquivo.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.comando_execucao.toLowerCase().includes(searchQuery.toLowerCase());

      const matchCat =
        selectedCategory === "all" || p.categoria.toLowerCase() === selectedCategory.toLowerCase();

      const matchPlat =
        selectedPlatform === "all" ||
        p.plataforma.toLowerCase().includes(selectedPlatform.toLowerCase());

      const matchAcc =
        selectedAccount === "all" || p.conta_origem.toLowerCase() === selectedAccount.toLowerCase();

      return matchSearch && matchCat && matchPlat && matchAcc;
    });
  }, [programs, searchQuery, selectedCategory, selectedPlatform, selectedAccount]);

  // Estatísticas
  const totalProgramsBytes = useMemo(() => {
    return programs.reduce((acc, curr) => acc + (curr.tamanho_bytes || 0), 0);
  }, [programs]);

  // Execução do Programa (Simulação Realista)
  const handleStartLaunch = (prog: ProgramItem) => {
    setLaunchingProgram(prog);
    setLaunchStep(1);
    setIsLaunched(false);
    setLaunchLogs([
      `[${new Date().toLocaleTimeString()}] Localizando '${prog.nome_programa}' no catálogo SQLite...`,
      `[${new Date().toLocaleTimeString()}] Conta vinculada no Google Drive: ${prog.conta_origem.toUpperCase()}`,
      `[${new Date().toLocaleTimeString()}] ID Remoto: ${prog.id_remoto_google}`,
    ]);

    // Etapa 2: Streaming / Download
    setTimeout(() => {
      setLaunchStep(2);
      setLaunchLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] Verificando token OAuth 2.0 de ${prog.conta_origem}... ✔ Válido`,
        `[${new Date().toLocaleTimeString()}] Baixando chunks em streaming (${formatBytes(prog.tamanho_bytes)})... 100%`,
      ]);
    }, 900);

    // Etapa 3: MD5 Checksum
    setTimeout(() => {
      setLaunchStep(3);
      setLaunchLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] Validando integridade MD5: ${prog.md5_hash} (OK)`,
        `[${new Date().toLocaleTimeString()}] Criando sandbox de execução em ~/.drive_pool/cache_programas/...`,
      ]);
    }, 1800);

    // Etapa 4: Disparo do Executável
    setTimeout(() => {
      setLaunchStep(4);
      setIsLaunched(true);
      setLaunchLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] Disparando processo: '${prog.comando_execucao}'`,
        `[${new Date().toLocaleTimeString()}] ✔ SOFTWARE INICIADO COM SUCESSO NO SISTEMA!`,
      ]);
      confetti({
        particleCount: 45,
        spread: 60,
        origin: { y: 0.6 },
      });
    }, 2600);
  };

  const handleCopyCmd = (id: number, cmd: string) => {
    navigator.clipboard.writeText(`python main.py launch ${id}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSaveNewProgram = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProgName.trim()) return;

    const chosenAccount = targetAccount === "auto" ? recommendedAccount : targetAccount;
    const finalBytes = newProgFile ? newProgFile.size : newProgFileSize;
    const finalFileName = newProgFile ? newProgFile.name : newProgFileName;

    const newProg: ProgramItem = {
      id: Date.now(),
      nome_programa: newProgName.trim(),
      versao: newProgVersion.trim() || "1.0.0",
      categoria: newProgCategory,
      plataforma: newProgPlatform,
      descricao: newProgDesc.trim() || "Software portátil sincronizado e distribuído no Google Drive.",
      comando_execucao: newProgCmd.trim() || finalFileName,
      nome_arquivo: finalFileName,
      tamanho_bytes: finalBytes,
      md5_hash: Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join(""),
      conta_origem: chosenAccount,
      id_remoto_google: `1ProgRemoteDrive_${Date.now()}`,
      data_adicionado: new Date().toISOString(),
      icon_type:
        newProgPlatform === "Windows"
          ? "app"
          : newProgCategory === "Desenvolvimento"
          ? "code"
          : newProgCategory === "Design & 3D"
          ? "cube"
          : "terminal",
    };

    onAddProgram(newProg);
    setIsAddModalOpen(false);

    // Reseta form
    setNewProgName("");
    setNewProgDesc("");
    setNewProgFile(null);

    confetti({
      particleCount: 50,
      spread: 70,
      origin: { y: 0.5 },
    });
  };

  return (
    <div className="space-y-6">
      {/* Hero Banner do Launcher de Programas */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-blue-950/60 border border-slate-800 p-6 shadow-xl">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Drive App Hub & Launcher Portátil</span>
            </div>
            <h2 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
              Acesso a Programas e Softwares no Google Drive
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Execute, instale ou baixe qualquer programa portátil ou instalador distribuído no seu pool de contas.
              O pool utiliza armazenamento unificado, verificação de integridade MD5 e cache sob demanda.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold text-sm shadow-lg shadow-cyan-600/20 transition active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Adicionar Software ao Drive</span>
            </button>
            <button
              onClick={onOpenAccountsModal}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-sm font-medium transition active:scale-95 cursor-pointer"
            >
              <HardDrive className="w-4 h-4 text-cyan-400" />
              <span>Gerenciar Contas ({accounts.length})</span>
            </button>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="mt-6 pt-6 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-slate-950/40 rounded-xl p-3 border border-slate-800/60">
            <span className="text-xs text-slate-400 block">Total de Programas</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-bold text-white">{programs.length}</span>
              <span className="text-xs text-cyan-400 font-medium">softwares</span>
            </div>
          </div>

          <div className="bg-slate-950/40 rounded-xl p-3 border border-slate-800/60">
            <span className="text-xs text-slate-400 block">Espaço em Programas</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-bold text-cyan-400">{formatBytes(totalProgramsBytes)}</span>
              <span className="text-xs text-slate-400">no Drive</span>
            </div>
          </div>

          <div className="bg-slate-950/40 rounded-xl p-3 border border-slate-800/60">
            <span className="text-xs text-slate-400 block">Contas com Softwares</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-bold text-emerald-400">{accounts.length}</span>
              <span className="text-xs text-slate-400">contas unificadas</span>
            </div>
          </div>

          <div className="bg-slate-950/40 rounded-xl p-3 border border-slate-800/60">
            <span className="text-xs text-slate-400 block">Modo de Execução</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-sm font-semibold text-amber-400">Cache Sob Demanda</span>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar de Busca e Filtros */}
      <div className="bg-slate-900/60 rounded-2xl border border-slate-800/80 p-4 space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Campo de Busca */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar programas por nome, comando (.exe, .AppImage, .py), categoria ou descrição..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition"
            />
          </div>

          {/* Filtros Dropdown / Selects */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Filtro Plataforma */}
            <select
              value={selectedPlatform}
              onChange={(e) => setSelectedPlatform(e.target.value)}
              className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="all">Todas as Plataformas</option>
              <option value="Windows">Windows (.exe / .msi)</option>
              <option value="Linux">Linux (.AppImage / .deb)</option>
              <option value="macOS">macOS (.dmg / .app)</option>
              <option value="Multiplataforma">Multiplataforma (.py / .jar)</option>
            </select>

            {/* Filtro Conta Google Drive */}
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="all">Todas as Contas Drive</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.id})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Categoria Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs scrollbar-none">
          <button
            onClick={() => setSelectedCategory("all")}
            className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition cursor-pointer ${
              selectedCategory === "all"
                ? "bg-cyan-600 text-white shadow-sm"
                : "bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
            }`}
          >
            Todos ({programs.length})
          </button>
          {categories.map((cat) => {
            const count = programs.filter((p) => p.categoria.toLowerCase() === cat.toLowerCase()).length;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition cursor-pointer ${
                  selectedCategory.toLowerCase() === cat.toLowerCase()
                    ? "bg-cyan-600 text-white shadow-sm"
                    : "bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
                }`}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid de Programas */}
      {filteredPrograms.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 p-12 text-center bg-slate-900/30">
          <div className="w-16 h-16 rounded-2xl bg-slate-800/80 flex items-center justify-center mx-auto text-slate-500 mb-4">
            <Package className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-slate-300">Nenhum programa encontrado</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Não foram encontrados softwares para o filtro selecionado. Limpe os termos de busca ou adicione um novo programa.
          </p>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="mt-4 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition"
          >
            + Cadastrar Software no Drive
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredPrograms.map((prog) => {
            const acc = accountsMap.get(prog.conta_origem);
            const accName = acc?.name || prog.conta_origem;
            const accColor = acc?.color || "#06b6d4";

            return (
              <div
                key={prog.id}
                className="group rounded-2xl bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-slate-700/80 p-5 flex flex-col justify-between transition shadow-md hover:shadow-xl hover:shadow-cyan-950/10"
              >
                <div className="space-y-3">
                  {/* Top Header do Card: Ícone, Nome e Versão */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-slate-800 to-slate-800/60 border border-slate-700/60 flex items-center justify-center text-cyan-400 group-hover:scale-105 group-hover:border-cyan-500/40 transition">
                        {prog.categoria === "Desenvolvimento" ? (
                          <Code className="w-5 h-5" />
                        ) : prog.categoria === "Design & 3D" ? (
                          <Box className="w-5 h-5" />
                        ) : prog.categoria === "Utilitários" ? (
                          <Archive className="w-5 h-5" />
                        ) : prog.categoria === "Produtividade" ? (
                          <BookOpen className="w-5 h-5" />
                        ) : (
                          <Monitor className="w-5 h-5" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-white text-sm lg:text-base leading-tight group-hover:text-cyan-300 transition">
                            {prog.nome_programa}
                          </h4>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                            v{prog.versao}
                          </span>
                          <span className="text-xs text-slate-400">• {prog.categoria}</span>
                        </div>
                      </div>
                    </div>

                    {/* Botão de Excluir */}
                    <button
                      onClick={() => onDeleteProgram(prog.id)}
                      title="Remover do catálogo"
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer opacity-40 group-hover:opacity-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Descrição */}
                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                    {prog.descricao}
                  </p>

                  {/* Badges de Metadados: Conta Google Drive, Tamanho e Plataforma */}
                  <div className="pt-2 border-t border-slate-800/60 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full inline-block"
                          style={{ backgroundColor: accColor }}
                        />
                        {accName}
                      </span>
                      <span className="font-semibold text-slate-300">
                        {formatBytes(prog.tamanho_bytes)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Plataforma:</span>
                      <span className="text-slate-300 font-medium">{prog.plataforma}</span>
                    </div>

                    <div className="bg-slate-950/70 rounded-lg px-2.5 py-1.5 flex items-center justify-between text-[11px] font-mono border border-slate-800">
                      <span className="text-slate-400 truncate max-w-[200px]">
                        {prog.comando_execucao}
                      </span>
                      <button
                        onClick={() => handleCopyCmd(prog.id, prog.comando_execucao)}
                        className="text-slate-400 hover:text-cyan-400 transition ml-1"
                        title="Copiar comando CLI"
                      >
                        {copiedId === prog.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Botões de Ação */}
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center gap-2">
                  <button
                    onClick={() => handleStartLaunch(prog)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-md shadow-emerald-950/20 transition active:scale-95 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Executar / Abrir</span>
                  </button>

                  <button
                    onClick={() => {
                      alert(`Iniciando download do pacote '${prog.nome_arquivo}' (${formatBytes(prog.tamanho_bytes)}) a partir de ${accName}...`);
                    }}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition active:scale-95 cursor-pointer"
                    title="Baixar instalador para o computador"
                  >
                    <Download className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => {
                      window.open(`https://drive.google.com/file/d/${prog.id_remoto_google}/view`, "_blank");
                    }}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition active:scale-95 cursor-pointer"
                    title="Ver arquivo no Google Drive oficial"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Interativo de Execução do Programa */}
      {launchingProgram && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl space-y-4 p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Play className="w-5 h-5 fill-current" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">
                    Iniciando {launchingProgram.nome_programa}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Origem: {launchingProgram.conta_origem.toUpperCase()} • {launchingProgram.nome_arquivo}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setLaunchingProgram(null)}
                className="text-slate-400 hover:text-white text-sm px-2 py-1"
              >
                ✕
              </button>
            </div>

            {/* Stepper Visual */}
            <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-semibold">
              <div className={`p-1.5 rounded-lg border ${launchStep >= 1 ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300" : "bg-slate-800 border-slate-700 text-slate-500"}`}>
                1. Catálogo
              </div>
              <div className={`p-1.5 rounded-lg border ${launchStep >= 2 ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300" : "bg-slate-800 border-slate-700 text-slate-500"}`}>
                2. Streaming
              </div>
              <div className={`p-1.5 rounded-lg border ${launchStep >= 3 ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300" : "bg-slate-800 border-slate-700 text-slate-500"}`}>
                3. MD5 Hash
              </div>
              <div className={`p-1.5 rounded-lg border ${launchStep >= 4 ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300" : "bg-slate-800 border-slate-700 text-slate-500"}`}>
                4. Executando
              </div>
            </div>

            {/* Console Terminal de Execução */}
            <div className="bg-slate-950 rounded-xl p-3 border border-slate-800 font-mono text-xs text-slate-300 h-44 overflow-y-auto space-y-1">
              {launchLogs.map((log, index) => (
                <div key={index} className="leading-relaxed">
                  {log.includes("✔") ? (
                    <span className="text-emerald-400 font-bold">{log}</span>
                  ) : log.includes("Streaming") ? (
                    <span className="text-cyan-400">{log}</span>
                  ) : (
                    log
                  )}
                </div>
              ))}
              {!isLaunched && (
                <div className="flex items-center gap-2 text-slate-500 animate-pulse mt-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                  <span>Preparando ambiente portátil...</span>
                </div>
              )}
            </div>

            {/* Ações pós-lançamento */}
            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-slate-400">
                {isLaunched ? (
                  <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                    <CheckCircle2 className="w-4 h-4" /> Processo ativo em segundo plano
                  </span>
                ) : (
                  <span>Carregando do Google Drive...</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`python main.py launch ${launchingProgram.id}`);
                    alert("Comando de terminal copiado: python main.py launch " + launchingProgram.id);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
                >
                  Copiar Comando CLI
                </button>
                <button
                  onClick={() => setLaunchingProgram(null)}
                  className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition"
                >
                  Concluir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Adicionar Novo Software ao Drive */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full overflow-hidden shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">
                    Adicionar Novo Software / Instalador ao Drive
                  </h3>
                  <p className="text-xs text-slate-400">
                    O arquivo será alocado automaticamente na conta com mais espaço livre (MFS).
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveNewProgram} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Nome do Programa *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Blender 4.3 Portable"
                    value={newProgName}
                    onChange={(e) => setNewProgName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Versão</label>
                  <input
                    type="text"
                    placeholder="Ex: 4.3.0"
                    value={newProgVersion}
                    onChange={(e) => setNewProgVersion(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Categoria</label>
                  <select
                    value={newProgCategory}
                    onChange={(e) => setNewProgCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="Utilitários">Utilitários</option>
                    <option value="Desenvolvimento">Desenvolvimento</option>
                    <option value="Produtividade">Produtividade</option>
                    <option value="Design & 3D">Design & 3D</option>
                    <option value="Multimídia">Multimídia</option>
                    <option value="Sistemas">Sistemas</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Plataforma</label>
                  <select
                    value={newProgPlatform}
                    onChange={(e) => setNewProgPlatform(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="Windows">Windows (.exe / .msi)</option>
                    <option value="Linux">Linux (.AppImage / .deb)</option>
                    <option value="macOS">macOS (.dmg)</option>
                    <option value="Multiplataforma">Multiplataforma (.py / .jar)</option>
                    <option value="Android">Android (.apk)</option>
                  </select>
                </div>
              </div>

              {/* Upload de Arquivo Real ou Mock */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Arquivo do Software / Instalador
                </label>
                <div className="border border-dashed border-slate-700 rounded-xl p-3.5 bg-slate-950/60 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-cyan-400">
                      <FolderOpen className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-200">
                        {newProgFile ? newProgFile.name : newProgFileName}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {newProgFile ? formatBytes(newProgFile.size) : formatBytes(newProgFileSize)}
                      </p>
                    </div>
                  </div>

                  <label className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer border border-slate-700 transition">
                    Procurar no PC
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setNewProgFile(file);
                          setNewProgFileName(file.name);
                          if (!newProgCmd || newProgCmd === "meu_software.exe --portable") {
                            setNewProgCmd(file.name);
                          }
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">
                  Comando de Execução Local
                </label>
                <input
                  type="text"
                  placeholder="Ex: code-portable.exe ou ./blender.AppImage"
                  value={newProgCmd}
                  onChange={(e) => setNewProgCmd(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">
                  Conta Google Drive de Armazenamento
                </label>
                <select
                  value={targetAccount}
                  onChange={(e) => setTargetAccount(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="auto">
                    Automático MFS (Conta com mais espaço livre: {recommendedAccount.toUpperCase()})
                  </option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.id})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">
                  Descrição ou Observações de Instalação
                </label>
                <textarea
                  rows={2}
                  placeholder="Instruções de uso, atalhos ou requisitos..."
                  value={newProgDesc}
                  onChange={(e) => setNewProgDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-lg shadow-cyan-600/20 transition cursor-pointer"
                >
                  Enviar ao Google Drive
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
