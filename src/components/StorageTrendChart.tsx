import React, { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  Area,
  ComposedChart
} from "recharts";
import { TrendingUp, Calendar, ArrowUpRight, Zap, Filter } from "lucide-react";

interface FileEntry {
  id: number;
  nome_arquivo: string;
  tamanho_bytes: number;
  conta_origem: "drive_1" | "drive_2";
  data_upload: string;
}

interface StorageTrendChartProps {
  files: FileEntry[];
  totalPoolLimitBytes: number;
}

export const StorageTrendChart: React.FC<StorageTrendChartProps> = ({
  files,
  totalPoolLimitBytes,
}) => {
  const [chartMode, setChartMode] = useState<"all" | "pool" | "accounts">("all");

  const totalPoolLimitGB = parseFloat((totalPoolLimitBytes / (1024 * 1024 * 1024)).toFixed(1));

  // Constrói a linha temporal acumulada
  const trendData = useMemo(() => {
    // Ordena arquivos por data de upload crescente
    const sorted = [...files].sort(
      (a, b) => new Date(a.data_upload).getTime() - new Date(b.data_upload).getTime()
    );

    // Ponto inicial (Pool inicializado vazio há 5 dias)
    const points: Array<{
      timestamp: string;
      label: string;
      poolUsageGB: number;
      drive1UsageGB: number;
      drive2UsageGB: number;
      fileName?: string;
    }> = [
      {
        timestamp: "2026-10-15T08:00:00Z",
        label: "15/10 08:00 (Inicial)",
        poolUsageGB: 0,
        drive1UsageGB: 0,
        drive2UsageGB: 0,
        fileName: "Inicialização do Pool Virtual",
      },
    ];

    let cumD1 = 0;
    let cumD2 = 0;

    sorted.forEach((file) => {
      const sizeGB = file.tamanho_bytes / (1024 * 1024 * 1024);
      if (file.conta_origem === "drive_1") {
        cumD1 += sizeGB;
      } else {
        cumD2 += sizeGB;
      }

      const fileDate = new Date(file.data_upload);
      const day = String(fileDate.getDate()).padStart(2, "0");
      const month = String(fileDate.getMonth() + 1).padStart(2, "0");
      const hours = String(fileDate.getHours()).padStart(2, "0");
      const mins = String(fileDate.getMinutes()).padStart(2, "0");

      points.push({
        timestamp: file.data_upload,
        label: `${day}/${month} ${hours}:${mins}`,
        poolUsageGB: parseFloat((cumD1 + cumD2).toFixed(2)),
        drive1UsageGB: parseFloat(cumD1.toFixed(2)),
        drive2UsageGB: parseFloat(cumD2.toFixed(2)),
        fileName: file.nome_arquivo,
      });
    });

    return points;
  }, [files]);

  const currentUsageGB = trendData.length > 0 ? trendData[trendData.length - 1].poolUsageGB : 0;
  const growthRate =
    trendData.length > 1
      ? (
          ((currentUsageGB - trendData[1].poolUsageGB) /
            Math.max(trendData[1].poolUsageGB, 0.1)) *
          100
        ).toFixed(0)
      : "0";

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg space-y-4">
      {/* Header do Gráfico */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800/80">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-lg bg-cyan-500/10 text-cyan-400">
              <TrendingUp className="w-4 h-4" />
            </span>
            <h3 className="text-sm font-bold text-white tracking-tight">
              Evolução do Armazenamento ao Longo do Tempo (Trend Growth)
            </h3>
          </div>
          <p className="text-xs text-slate-400">
            Acompanhe o crescimento acumulado no Pool Virtual e o balanceamento inteligente entre Drive 1 e Drive 2.
          </p>
        </div>

        {/* Filtros de exibição */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs self-start sm:self-auto">
          <button
            onClick={() => setChartMode("all")}
            className={`px-2.5 py-1 rounded-lg font-medium transition ${
              chartMode === "all"
                ? "bg-cyan-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Todos
          </button>
          <button
            onClick={() => setChartMode("pool")}
            className={`px-2.5 py-1 rounded-lg font-medium transition ${
              chartMode === "pool"
                ? "bg-cyan-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Total Pool
          </button>
          <button
            onClick={() => setChartMode("accounts")}
            className={`px-2.5 py-1 rounded-lg font-medium transition ${
              chartMode === "accounts"
                ? "bg-cyan-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            D1 vs D2
          </button>
        </div>
      </div>

      {/* Mini Métricas Rápidas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/60">
          <span className="text-[11px] text-slate-400">Uso Atual Acumulado</span>
          <div className="text-sm font-extrabold text-cyan-400 mt-0.5">
            {currentUsageGB} GB
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/60">
          <span className="text-[11px] text-slate-400">Teto Total (Cota)</span>
          <div className="text-sm font-extrabold text-slate-200 mt-0.5">
            {totalPoolLimitGB} GB
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/60">
          <span className="text-[11px] text-slate-400">Drive 1 Acumulado</span>
          <div className="text-sm font-extrabold text-cyan-300 mt-0.5">
            {trendData[trendData.length - 1]?.drive1UsageGB || 0} GB
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/60">
          <span className="text-[11px] text-slate-400">Drive 2 Acumulado</span>
          <div className="text-sm font-extrabold text-amber-400 mt-0.5">
            {trendData[trendData.length - 1]?.drive2UsageGB || 0} GB
          </div>
        </div>
      </div>

      {/* Gráfico Recharts */}
      <div className="h-64 sm:h-72 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={trendData}
            margin={{ top: 10, right: 20, left: -10, bottom: 0 }}
          >
            <defs>
              <linearGradient id="poolGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.35} />

            <XAxis
              dataKey="label"
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: "#334155" }}
            />

            <YAxis
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: "#334155" }}
              unit=" GB"
              domain={[0, Math.max(totalPoolLimitGB, currentUsageGB + 5)]}
            />

            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const dataPoint = payload[0].payload;
                  return (
                    <div className="rounded-xl border border-slate-700 bg-slate-950/95 p-3 shadow-2xl backdrop-blur-md text-xs space-y-1.5 min-w-[200px]">
                      <div className="font-bold text-white border-b border-slate-800 pb-1 flex items-center justify-between">
                        <span>{label}</span>
                        <span className="text-[10px] text-slate-400">
                          {dataPoint.fileName ? "Upload de Arquivo" : "Ponto Base"}
                        </span>
                      </div>
                      {dataPoint.fileName && (
                        <div className="text-[11px] text-slate-300 truncate max-w-[220px]">
                          📄 {dataPoint.fileName}
                        </div>
                      )}
                      <div className="space-y-1 pt-1 font-mono">
                        <div className="flex justify-between text-cyan-400">
                          <span>Total do Pool:</span>
                          <strong>{dataPoint.poolUsageGB} GB</strong>
                        </div>
                        <div className="flex justify-between text-cyan-300">
                          <span>Drive 1:</span>
                          <span>{dataPoint.drive1UsageGB} GB</span>
                        </div>
                        <div className="flex justify-between text-amber-400">
                          <span>Drive 2:</span>
                          <span>{dataPoint.drive2UsageGB} GB</span>
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />

            <Legend
              verticalAlign="top"
              height={36}
              iconType="circle"
              wrapperStyle={{ fontSize: "11px", color: "#94a3b8" }}
            />

            {/* Linha de Referência da Cota Máxima do Pool */}
            <ReferenceLine
              y={totalPoolLimitGB}
              stroke="#ef4444"
              strokeDasharray="4 4"
              label={{
                value: `Capacidade Máx: ${totalPoolLimitGB} GB`,
                fill: "#f87171",
                fontSize: 10,
                position: "insideTopRight",
              }}
            />

            {/* Total Pool Usage Area & Line */}
            {(chartMode === "all" || chartMode === "pool") && (
              <>
                <Area
                  type="monotone"
                  dataKey="poolUsageGB"
                  name="Uso Total do Pool (GB)"
                  fill="url(#poolGrad)"
                  stroke="#06b6d4"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#06b6d4", strokeWidth: 1 }}
                  activeDot={{ r: 6, fill: "#38bdf8" }}
                />
              </>
            )}

            {/* Drive 1 Line */}
            {(chartMode === "all" || chartMode === "accounts") && (
              <Line
                type="monotone"
                dataKey="drive1UsageGB"
                name="Drive 1 (GB)"
                stroke="#38bdf8"
                strokeWidth={2}
                dot={{ r: 3, fill: "#38bdf8" }}
              />
            )}

            {/* Drive 2 Line */}
            {(chartMode === "all" || chartMode === "accounts") && (
              <Line
                type="monotone"
                dataKey="drive2UsageGB"
                name="Drive 2 (GB)"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ r: 3, fill: "#f59e0b" }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
        <span>* O gráfico reflete automaticamente novos uploads e exclusões no SQLite e Google Drive.</span>
        <span className="text-cyan-400/80 font-medium">Recharts Engine</span>
      </div>
    </div>
  );
};
