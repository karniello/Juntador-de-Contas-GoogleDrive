import React, { useState } from "react";
import {
  X,
  Key,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Plus,
  Trash2,
  ShieldCheck,
  Copy,
  Check,
  Terminal,
  ExternalLink,
  HardDrive
} from "lucide-react";
import confetti from "canvas-confetti";

export interface AccountItem {
  id: string;
  name: string;
  email: string;
  limitBytes: number;
  connected: boolean;
  color: string;
}

interface ConnectAccountsModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: AccountItem[];
  setAccounts: React.Dispatch<React.SetStateAction<AccountItem[]>>;
  onGoToGcpGuide: () => void;
  onRunCliAuth: (accountId?: string) => void;
}

const PALETTE = [
  "#06b6d4", // cyan
  "#f59e0b", // amber
  "#10b981", // emerald
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#3b82f6", // blue
  "#f97316", // orange
  "#14b8a6", // teal
];

export const ConnectAccountsModal: React.FC<ConnectAccountsModalProps> = ({
  isOpen,
  onClose,
  accounts,
  setAccounts,
  onGoToGcpGuide,
  onRunCliAuth,
}) => {
  const [activeTab, setActiveTab] = useState<"accounts" | "add-account" | "credentials" | "flow">("accounts");
  const [authenticatingAccount, setAuthenticatingAccount] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [copiedTemplate, setCopiedTemplate] = useState(false);

  // Formulário para Nova Conta
  const [newAccountId, setNewAccountId] = useState(`drive_${accounts.length + 1}`);
  const [newAccountName, setNewAccountName] = useState(`Conta ${accounts.length + 1} (drive_${accounts.length + 1})`);
  const [newAccountEmail, setNewAccountEmail] = useState("");
  const [newAccountLimit, setNewAccountLimit] = useState<number>(15 * 1024 * 1024 * 1024);

  const [credentialsJson, setCredentialsJson] = useState(`{
  "installed": {
    "client_id": "23609977731-xxxxxxxxxxxx.apps.googleusercontent.com",
    "project_id": "drive-virtual-pool",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_secret": "GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx",
    "redirect_uris": ["http://localhost"]
  }
}`);
  const [jsonValidation, setJsonValidation] = useState<{ valid: boolean; message: string } | null>(null);

  if (!isOpen) return null;

  const handleSimulateAuth = (accId: string) => {
    setAuthenticatingAccount(accId);
    const target = accounts.find((a) => a.id === accId);
    setStatusMessage(`Iniciando autorização OAuth 2.0 para ${accId.toUpperCase()}...`);

    setTimeout(() => {
      setStatusMessage(
        `Abrindo navegador para consentimento OAuth da Google (${target?.email || accId})...`
      );

      setTimeout(() => {
        setAccounts((prev) =>
          prev.map((acc) => (acc.id === accId ? { ...acc, connected: true } : acc))
        );
        setAuthenticatingAccount(null);
        setStatusMessage(
          `✔ Conta ${accId.toUpperCase()} conectada com sucesso! Token salvo em token_${accId}.json`
        );

        try {
          confetti({ particleCount: 50, spread: 50, origin: { y: 0.6 } });
        } catch (_) {}

        setTimeout(() => setStatusMessage(null), 4000);
      }, 1200);
    }, 800);
  };

  const handleDisconnect = (accId: string) => {
    setAccounts((prev) =>
      prev.map((acc) => (acc.id === accId ? { ...acc, connected: false } : acc))
    );
    setStatusMessage(`Conta ${accId.toUpperCase()} desconectada (token_${accId}.json removido).`);
    setTimeout(() => setStatusMessage(null), 3500);
  };

  const handleRemoveAccount = (accId: string) => {
    if (accounts.length <= 1) {
      alert("O pool precisa manter ao menos 1 conta Google Drive cadastrada.");
      return;
    }
    if (confirm(`Tem certeza que deseja remover a conta '${accId}' do Virtual Pool?`)) {
      setAccounts((prev) => prev.filter((a) => a.id !== accId));
      setStatusMessage(`Conta '${accId}' removida do pool.`);
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  const handleUpdateLimit = (accId: string, limitBytes: number) => {
    setAccounts((prev) =>
      prev.map((acc) => (acc.id === accId ? { ...acc, limitBytes } : acc))
    );
  };

  const handleUpdateEmail = (accId: string, email: string) => {
    setAccounts((prev) =>
      prev.map((acc) => (acc.id === accId ? { ...acc, email } : acc))
    );
  };

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = newAccountId.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (!cleanId) {
      alert("Por favor, informe um identificador válido (ex: drive_3)");
      return;
    }
    if (accounts.some((a) => a.id === cleanId)) {
      alert(`A conta '${cleanId}' já existe no pool.`);
      return;
    }

    const assignedColor = PALETTE[accounts.length % PALETTE.length];
    const newAcc: AccountItem = {
      id: cleanId,
      name: newAccountName.trim() || `Conta ${accounts.length + 1} (${cleanId})`,
      email: newAccountEmail.trim() || `${cleanId}@gmail.com`,
      limitBytes: newAccountLimit,
      connected: true,
      color: assignedColor,
    };

    setAccounts((prev) => [...prev, newAcc]);
    setStatusMessage(`✔ Nova conta '${cleanId}' adicionada com sucesso ao Pool! Total: ${accounts.length + 1} contas.`);
    setActiveTab("accounts");

    // Prepara próximo id para conveniência
    setNewAccountId(`drive_${accounts.length + 2}`);
    setNewAccountName(`Conta ${accounts.length + 2} (drive_${accounts.length + 2})`);
    setNewAccountEmail("");

    try {
      confetti({ particleCount: 60, spread: 60, origin: { y: 0.5 } });
    } catch (_) {}
  };

  const handleValidateJson = () => {
    try {
      const parsed = JSON.parse(credentialsJson);
      if (!parsed.installed && !parsed.web) {
        setJsonValidation({
          valid: false,
          message: "O JSON deve conter a chave raiz 'installed' (tipo Desktop app).",
        });
        return;
      }
      const client = parsed.installed || parsed.web;
      if (!client.client_id || !client.client_secret) {
        setJsonValidation({
          valid: false,
          message: "Campos 'client_id' ou 'client_secret' ausentes no JSON.",
        });
        return;
      }
      setJsonValidation({
        valid: true,
        message: `Credenciais válidas! Client ID: ${client.client_id.substring(0, 18)}...`,
      });
    } catch (e: any) {
      setJsonValidation({
        valid: false,
        message: `JSON inválido: ${e.message}`,
      });
    }
  };

  const handleCopyTemplate = () => {
    navigator.clipboard.writeText(credentialsJson);
    setCopiedTemplate(true);
    setTimeout(() => setCopiedTemplate(false), 2000);
  };

  const totalPoolCapacityGB = (
    accounts.reduce((acc, curr) => acc + curr.limitBytes, 0) /
    (1024 * 1024 * 1024)
  ).toFixed(0);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto space-y-5 text-slate-100">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          title="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>Gerenciador de Contas Google Drive ({accounts.length} Contas)</span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  Total: {totalPoolCapacityGB} GB
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Adicione quantas contas desejar para expandir a capacidade do Pool Virtual (ex: 3x15GB = 45GB, 4x15GB = 60GB)
              </p>
            </div>
          </div>
        </div>

        {/* Status Notification Banner */}
        {statusMessage && (
          <div className="p-3 rounded-xl bg-cyan-950/60 border border-cyan-500/30 text-xs text-cyan-200 flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-800 pb-2 text-xs">
          <button
            onClick={() => setActiveTab("accounts")}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              activeTab === "accounts"
                ? "bg-cyan-600 text-white"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            Contas Conectadas ({accounts.length})
          </button>
          <button
            onClick={() => setActiveTab("add-account")}
            className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
              activeTab === "add-account"
                ? "bg-emerald-600 text-white"
                : "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/30"
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Adicionar Nova Conta</span>
          </button>
          <button
            onClick={() => setActiveTab("credentials")}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              activeTab === "credentials"
                ? "bg-cyan-600 text-white"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            credentials.json
          </button>
          <button
            onClick={() => setActiveTab("flow")}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              activeTab === "flow"
                ? "bg-cyan-600 text-white"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            Fluxo OAuth Multi-Conta
          </button>
        </div>

        {/* ======================================================== */}
        {/* TAB 1: LISTAGEM DE CONTAS (N CONTAS)                     */}
        {/* ======================================================== */}
        {activeTab === "accounts" && (
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Gerencie as contas ativas no balanceador de armazenamento (MFS):
              </span>
              <button
                onClick={() => setActiveTab("add-account")}
                className="px-2.5 py-1 text-xs rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 font-semibold flex items-center gap-1 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Adicionar Conta</span>
              </button>
            </div>

            <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
              {accounts.map((acc, index) => (
                <div
                  key={acc.id}
                  className="p-4 rounded-xl border bg-slate-950/70 space-y-3 transition"
                  style={{ borderColor: `${acc.color}40` }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs"
                        style={{
                          backgroundColor: `${acc.color}20`,
                          color: acc.color,
                          border: `1px solid ${acc.color}40`,
                        }}
                      >
                        {acc.id.toUpperCase().slice(0, 3)}
                      </span>
                      <div>
                        <h3 className="text-xs font-bold text-white flex items-center gap-2">
                          <span>{acc.name}</span>
                          {acc.connected ? (
                            <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.2 rounded-full font-medium flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Conectado (token_{acc.id}.json)
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 bg-slate-800 border border-slate-700 px-2 py-0.2 rounded-full font-medium">
                              Desconectado
                            </span>
                          )}
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          {acc.email} • Token: token_{acc.id}.json
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {acc.connected ? (
                        <button
                          onClick={() => handleDisconnect(acc.id)}
                          className="px-2.5 py-1 text-xs rounded-lg bg-slate-800 hover:bg-red-950/50 hover:text-red-300 text-slate-400 border border-slate-700 transition"
                        >
                          Desconectar
                        </button>
                      ) : null}

                      <button
                        disabled={authenticatingAccount === acc.id}
                        onClick={() => handleSimulateAuth(acc.id)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg text-white flex items-center gap-1.5 transition disabled:opacity-50"
                        style={{ backgroundColor: acc.color }}
                      >
                        {authenticatingAccount === acc.id ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Autenticando...</span>
                          </>
                        ) : (
                          <>
                            <Key className="w-3.5 h-3.5" />
                            <span>{acc.connected ? "Reautorizar" : `Conectar ${acc.id}`}</span>
                          </>
                        )}
                      </button>

                      {accounts.length > 1 && (
                        <button
                          onClick={() => handleRemoveAccount(acc.id)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-900/40 text-slate-400 hover:text-red-300 transition"
                          title="Remover conta do pool"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Settings row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800/80">
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">E-mail da Conta Google:</label>
                      <input
                        type="email"
                        value={acc.email}
                        onChange={(e) => handleUpdateEmail(acc.id, e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Cota Contratada desta Conta:</label>
                      <select
                        value={acc.limitBytes}
                        onChange={(e) => handleUpdateLimit(acc.id, Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                      >
                        <option value={15 * 1024 * 1024 * 1024}>15 GB (Plano Gratuito Padrão)</option>
                        <option value={100 * 1024 * 1024 * 1024}>100 GB (Google One Basic)</option>
                        <option value={200 * 1024 * 1024 * 1024}>200 GB (Google One Standard)</option>
                        <option value={2048 * 1024 * 1024 * 1024}>2 TB (Google One Premium)</option>
                        <option value={5120 * 1024 * 1024 * 1024}>5 TB (Google Workspace Enterprise)</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 2: ADICIONAR NOVA CONTA                              */}
        {/* ======================================================== */}
        {activeTab === "add-account" && (
          <form onSubmit={handleCreateAccount} className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-400" />
                Cadastrar Nova Conta no Pool Virtual
              </h3>
              <p className="text-xs text-slate-400">
                Você pode adicionar contas adicionais (ex: <code>drive_3</code>, <code>drive_4</code>, <code>drive_trabalho</code>).
                Cada conta terá seu token OAuth independente e participará do balanceamento Most Free Space.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="font-semibold text-slate-300 block mb-1">
                    ID da Conta (sem espaços):
                  </label>
                  <input
                    type="text"
                    required
                    value={newAccountId}
                    onChange={(e) => setNewAccountId(e.target.value)}
                    placeholder="ex: drive_3, drive_pessoal"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Gera o arquivo <code>token_{newAccountId.trim().toLowerCase() || "drive_N"}.json</code>
                  </span>
                </div>

                <div>
                  <label className="font-semibold text-slate-300 block mb-1">
                    Nome de Exibição / Rótulo:
                  </label>
                  <input
                    type="text"
                    required
                    value={newAccountName}
                    onChange={(e) => setNewAccountName(e.target.value)}
                    placeholder="ex: Conta 3 (Google One 100GB)"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-300 block mb-1">
                    E-mail do Google:
                  </label>
                  <input
                    type="email"
                    required
                    value={newAccountEmail}
                    onChange={(e) => setNewAccountEmail(e.target.value)}
                    placeholder="ex: usuario3@gmail.com"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-300 block mb-1">
                    Capacidade / Cota Contratada:
                  </label>
                  <select
                    value={newAccountLimit}
                    onChange={(e) => setNewAccountLimit(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-cyan-500"
                  >
                    <option value={15 * 1024 * 1024 * 1024}>15 GB (Plano Gratuito Padrão)</option>
                    <option value={100 * 1024 * 1024 * 1024}>100 GB (Google One Basic)</option>
                    <option value={200 * 1024 * 1024 * 1024}>200 GB (Google One Standard)</option>
                    <option value={2048 * 1024 * 1024 * 1024}>2 TB (Google One Premium)</option>
                    <option value={5120 * 1024 * 1024 * 1024}>5 TB (Google Workspace Enterprise)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveTab("accounts")}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1.5 transition shadow-md shadow-emerald-700/20"
              >
                <Plus className="w-4 h-4" />
                <span>Adicionar ao Pool Virtual</span>
              </button>
            </div>
          </form>
        )}

        {/* ======================================================== */}
        {/* TAB 3: CREDENTIALS.JSON                                  */}
        {/* ======================================================== */}
        {activeTab === "credentials" && (
          <div className="space-y-4 text-xs">
            <p className="text-slate-300">
              O arquivo <code className="text-cyan-300">credentials.json</code> é compartilhado por todas as contas.
              Basta adicionar os e-mails de todas as contas na lista de <strong>Usuários de Teste (Test Users)</strong> no Google Cloud Console.
            </p>

            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-2">
              <textarea
                value={credentialsJson}
                onChange={(e) => {
                  setCredentialsJson(e.target.value);
                  setJsonValidation(null);
                }}
                rows={8}
                className="w-full bg-transparent text-slate-200 font-mono text-xs focus:outline-none resize-none leading-relaxed"
                placeholder="Cole o conteúdo do credentials.json aqui..."
              />
            </div>

            {jsonValidation && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                  jsonValidation.valid
                    ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-200"
                    : "bg-red-950/40 border-red-500/40 text-red-200"
                }`}
              >
                {jsonValidation.valid ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                )}
                <span>{jsonValidation.message}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                onClick={handleValidateJson}
                className="px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-medium flex items-center gap-2 transition"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Validar Estrutura JSON</span>
              </button>

              <button
                onClick={handleCopyTemplate}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-2 transition"
              >
                {copiedTemplate ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copiedTemplate ? "Copiado!" : "Copiar Modelo"}</span>
              </button>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 4: FLUXO OAUTH MULTI-CONTA                           */}
        {/* ======================================================== */}
        {activeTab === "flow" && (
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <h4 className="font-bold text-white flex items-center gap-2">
                <Terminal className="w-4 h-4 text-cyan-400" />
                Como Escalar para N Contas Google Drive no Terminal
              </h4>
              <p className="text-slate-400 leading-relaxed">
                O Virtual Pool suporta adicionar contas dinamicamente através dos seguintes comandos:
              </p>
              <div className="p-3 rounded-lg bg-slate-900 font-mono text-slate-300 space-y-1">
                <p className="text-slate-500"># 1. Listar todas as contas registradas</p>
                <p className="text-cyan-300">python main.py accounts</p>
                <p className="text-slate-500 pt-1"># 2. Adicionar uma nova conta (ex: drive_3, drive_4)</p>
                <p className="text-cyan-300">python main.py add-account drive_3 --nome "Drive 3 Pessoal" --email usuario3@gmail.com</p>
                <p className="text-slate-500 pt-1"># 3. Autenticar a nova conta</p>
                <p className="text-cyan-300">python main.py auth drive_3</p>
                <p className="text-slate-500 pt-1"># 4. Enviar arquivos com alocação MFS em todas as contas</p>
                <p className="text-cyan-300">python main.py upload arquivo_grande.iso</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                onClick={() => {
                  onClose();
                  onRunCliAuth();
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium border border-slate-700 flex items-center gap-2 transition"
              >
                <Terminal className="w-4 h-4 text-cyan-400" />
                <span>Testar Comandos no Console CLI</span>
              </button>

              <button
                onClick={() => {
                  onClose();
                  onGoToGcpGuide();
                }}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-medium flex items-center gap-2 transition"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Ver Guia do Google Cloud Console</span>
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>{accounts.length} Contas • Capacidade Somada: {totalPoolCapacityGB} GB</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
};
