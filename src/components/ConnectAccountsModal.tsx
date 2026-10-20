import React, { useState } from "react";
import {
  X,
  Key,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sliders,
  ExternalLink,
  ShieldCheck,
  FileCode,
  Download,
  Copy,
  Check,
  Terminal,
  ArrowRight,
  HardDrive
} from "lucide-react";
import confetti from "canvas-confetti";

interface ConnectAccountsModalProps {
  isOpen: boolean;
  onClose: () => void;
  account1Email: string;
  setAccount1Email: (email: string) => void;
  account2Email: string;
  setAccount2Email: (email: string) => void;
  account1Connected: boolean;
  setAccount1Connected: (val: boolean) => void;
  account2Connected: boolean;
  setAccount2Connected: (val: boolean) => void;
  drive1Limit: number;
  setDrive1Limit: (val: number) => void;
  drive2Limit: number;
  setDrive2Limit: (val: number) => void;
  onGoToGcpGuide: () => void;
  onRunCliAuth: () => void;
}

export const ConnectAccountsModal: React.FC<ConnectAccountsModalProps> = ({
  isOpen,
  onClose,
  account1Email,
  setAccount1Email,
  account2Email,
  setAccount2Email,
  account1Connected,
  setAccount1Connected,
  account2Connected,
  setAccount2Connected,
  drive1Limit,
  setDrive1Limit,
  drive2Limit,
  setDrive2Limit,
  onGoToGcpGuide,
  onRunCliAuth,
}) => {
  const [activeTab, setActiveTab] = useState<"accounts" | "credentials" | "flow">("accounts");
  const [authenticatingAccount, setAuthenticatingAccount] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [copiedTemplate, setCopiedTemplate] = useState(false);

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

  const handleSimulateAuth = (accountId: "drive_1" | "drive_2") => {
    setAuthenticatingAccount(accountId);
    setStatusMessage(`Iniciando autorização OAuth 2.0 para ${accountId.toUpperCase()}...`);

    setTimeout(() => {
      setStatusMessage(`Abrindo navegador para consentimento OAuth da Google (${accountId === "drive_1" ? account1Email : account2Email})...`);

      setTimeout(() => {
        if (accountId === "drive_1") {
          setAccount1Connected(true);
        } else {
          setAccount2Connected(true);
        }
        setAuthenticatingAccount(null);
        setStatusMessage(`✔ Conta ${accountId.toUpperCase()} conectada com sucesso! Token salvo em token_${accountId}.json`);

        try {
          confetti({ particleCount: 50, spread: 50, origin: { y: 0.6 } });
        } catch (_) {}

        setTimeout(() => setStatusMessage(null), 4000);
      }, 1200);
    }, 800);
  };

  const handleDisconnect = (accountId: "drive_1" | "drive_2") => {
    if (accountId === "drive_1") {
      setAccount1Connected(false);
    } else {
      setAccount2Connected(false);
    }
    setStatusMessage(`Conta ${accountId.toUpperCase()} desconectada (token_${accountId}.json removido).`);
    setTimeout(() => setStatusMessage(null), 3500);
  };

  const handleValidateJson = () => {
    try {
      const parsed = JSON.parse(credentialsJson);
      if (!parsed.installed && !parsed.web) {
        setJsonValidation({
          valid: false,
          message: "O JSON deve conter a chave raiz 'installed' (tipo App para computador / Desktop app).",
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
              <h2 className="text-base font-bold text-white tracking-tight">
                Gerenciador de Conexões OAuth 2.0 (Google Drive)
              </h2>
              <p className="text-xs text-slate-400">
                Configure as credenciais e tokens independentes para Drive 1 e Drive 2
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
        <div className="flex items-center gap-1.5 border-b border-slate-800 pb-2 text-xs">
          <button
            onClick={() => setActiveTab("accounts")}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              activeTab === "accounts"
                ? "bg-cyan-600 text-white"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            Contas & Tokens
          </button>
          <button
            onClick={() => setActiveTab("credentials")}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              activeTab === "credentials"
                ? "bg-cyan-600 text-white"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            Arquivo credentials.json
          </button>
          <button
            onClick={() => setActiveTab("flow")}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              activeTab === "flow"
                ? "bg-cyan-600 text-white"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            Fluxo & Comandos CLI
          </button>
        </div>

        {/* ======================================================== */}
        {/* TAB 1: CONTAS & TOKENS                                   */}
        {/* ======================================================== */}
        {activeTab === "accounts" && (
          <div className="space-y-4">
            {/* Account 1 Card */}
            <div className="p-4 rounded-xl border border-cyan-500/30 bg-slate-950/70 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-bold text-xs border border-cyan-500/30">
                    D1
                  </span>
                  <div>
                    <h3 className="text-xs font-bold text-white flex items-center gap-2">
                      <span>Conta 1 (drive_1)</span>
                      {account1Connected ? (
                        <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.2 rounded-full font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Conectado (token_drive1.json)
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 bg-slate-800 border border-slate-700 px-2 py-0.2 rounded-full font-medium">
                          Desconectado
                        </span>
                      )}
                    </h3>
                    <p className="text-[11px] text-slate-400">Escopo: https://www.googleapis.com/auth/drive</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {account1Connected ? (
                    <button
                      onClick={() => handleDisconnect("drive_1")}
                      className="px-2.5 py-1 text-xs rounded-lg bg-slate-800 hover:bg-red-950/50 hover:text-red-300 text-slate-400 border border-slate-700 transition"
                    >
                      Desconectar
                    </button>
                  ) : null}
                  <button
                    disabled={authenticatingAccount === "drive_1"}
                    onClick={() => handleSimulateAuth("drive_1")}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-1.5 transition disabled:opacity-50"
                  >
                    {authenticatingAccount === "drive_1" ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Autenticando...</span>
                      </>
                    ) : (
                      <>
                        <Key className="w-3.5 h-3.5" />
                        <span>{account1Connected ? "Reautorizar" : "Conectar Drive 1"}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Email & Quota Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-800/80">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">E-mail da Conta Google 1:</label>
                  <input
                    type="email"
                    value={account1Email}
                    onChange={(e) => setAccount1Email(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Cota Contratada (Simulação):</label>
                  <select
                    value={drive1Limit}
                    onChange={(e) => setDrive1Limit(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                  >
                    <option value={15 * 1024 * 1024 * 1024}>15 GB (Plano Gratuito Padrão)</option>
                    <option value={100 * 1024 * 1024 * 1024}>100 GB (Google One Basic)</option>
                    <option value={200 * 1024 * 1024 * 1024}>200 GB (Google One Standard)</option>
                    <option value={2048 * 1024 * 1024 * 1024}>2 TB (Google One Premium)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Account 2 Card */}
            <div className="p-4 rounded-xl border border-amber-500/30 bg-slate-950/70 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold text-xs border border-amber-500/30">
                    D2
                  </span>
                  <div>
                    <h3 className="text-xs font-bold text-white flex items-center gap-2">
                      <span>Conta 2 (drive_2)</span>
                      {account2Connected ? (
                        <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.2 rounded-full font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Conectado (token_drive2.json)
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 bg-slate-800 border border-slate-700 px-2 py-0.2 rounded-full font-medium">
                          Desconectado
                        </span>
                      )}
                    </h3>
                    <p className="text-[11px] text-slate-400">Escopo: https://www.googleapis.com/auth/drive</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {account2Connected ? (
                    <button
                      onClick={() => handleDisconnect("drive_2")}
                      className="px-2.5 py-1 text-xs rounded-lg bg-slate-800 hover:bg-red-950/50 hover:text-red-300 text-slate-400 border border-slate-700 transition"
                    >
                      Desconectar
                    </button>
                  ) : null}
                  <button
                    disabled={authenticatingAccount === "drive_2"}
                    onClick={() => handleSimulateAuth("drive_2")}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-1.5 transition disabled:opacity-50"
                  >
                    {authenticatingAccount === "drive_2" ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Autenticando...</span>
                      </>
                    ) : (
                      <>
                        <Key className="w-3.5 h-3.5" />
                        <span>{account2Connected ? "Reautorizar" : "Conectar Drive 2"}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Email & Quota Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-800/80">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">E-mail da Conta Google 2:</label>
                  <input
                    type="email"
                    value={account2Email}
                    onChange={(e) => setAccount2Email(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Cota Contratada (Simulação):</label>
                  <select
                    value={drive2Limit}
                    onChange={(e) => setDrive2Limit(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  >
                    <option value={15 * 1024 * 1024 * 1024}>15 GB (Plano Gratuito Padrão)</option>
                    <option value={100 * 1024 * 1024 * 1024}>100 GB (Google One Basic)</option>
                    <option value={200 * 1024 * 1024 * 1024}>200 GB (Google One Standard)</option>
                    <option value={2048 * 1024 * 1024 * 1024}>2 TB (Google One Premium)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 2: CREDENTIALS.JSON                                  */}
        {/* ======================================================== */}
        {activeTab === "credentials" && (
          <div className="space-y-4 text-xs">
            <p className="text-slate-300">
              O arquivo <code className="text-cyan-300">credentials.json</code> é obtido no Google Cloud Console
              (tipo <em>Desktop app</em>) e deve ficar na raiz do projeto. Cole ou edite o seu arquivo abaixo para validá-lo:
            </p>

            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-2">
              <textarea
                value={credentialsJson}
                onChange={(e) => {
                  setCredentialsJson(e.target.value);
                  setJsonValidation(null);
                }}
                rows={9}
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

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
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
        {/* TAB 3: FLUXO OAUTH & CLI                                 */}
        {/* ======================================================== */}
        {activeTab === "flow" && (
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <h4 className="font-bold text-white flex items-center gap-2">
                <Terminal className="w-4 h-4 text-cyan-400" />
                Como o Google Drive Pool Autentica no Computador
              </h4>
              <p className="text-slate-400 leading-relaxed">
                Ao rodar <code className="text-cyan-300">python main.py auth</code> ou clicar em "Conectar Contas" no app nativo:
              </p>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-300 pl-1">
                <li>O script carrega o arquivo <code className="text-slate-200 font-mono">credentials.json</code>.</li>
                <li>Inicia um listener local temporário em porta dinâmica (<code className="text-slate-200 font-mono">port=0</code>).</li>
                <li>Abre o navegador oficial para você selecionar a conta do Drive 1 e autorizar o app.</li>
                <li>Gera o token de longa duração e salva em <code className="text-slate-200 font-mono">token_drive1.json</code>.</li>
                <li>Repete o fluxo para o Drive 2, salvando em <code className="text-slate-200 font-mono">token_drive2.json</code>.</li>
              </ol>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={() => {
                  onClose();
                  onRunCliAuth();
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium border border-slate-700 flex items-center gap-2 transition"
              >
                <Terminal className="w-4 h-4 text-cyan-400" />
                <span>Testar Comando no CLI Simulator</span>
              </button>

              <button
                onClick={() => {
                  onClose();
                  onGoToGcpGuide();
                }}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-medium flex items-center gap-2 transition"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Ver Guia Completo do Google Cloud Console</span>
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>Capacidade Atual Somada: {((drive1Limit + drive2Limit) / (1024 * 1024 * 1024)).toFixed(0)} GB</span>
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
