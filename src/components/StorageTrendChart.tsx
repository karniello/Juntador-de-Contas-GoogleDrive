import React, { useMemo, useState } from "react";
import {
  ResponsiveContainer,
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
import { TrendingUp, Layers } from "lucide-react";

export interface AccountSummary {
  id: string;
  name: string;
  color: string;
  limitBytes: number;
}

interface FileEntry {
  id: number;
  nome_arquivo: string;
  tamanho_bytes: number;
  conta_origem: string;
  data_upload: string;
}

interface StorageTrendChartProps {
  files: FileEntry[];
  accounts: AccountSummary[];
  totalPoolLimitBytes: number;
}

export const StorageTrendChart: React.FC<StorageTrendChartProps> = ({
  files,
  accounts,
  totalPoolLimitBytes,
}) => {
  const [chartMode, setChartMode] = useState<"all" | "pool" | "accounts">("all");

  const totalPoolLimitGB = parseFloat((totalPoolLimitBytes / (1024 * 1024 * 1024)).toFixed(1));

  // Constrói a linha temporal acumulada dinâmica para N contas
  const trendData = useMemo(() => {
    const sorted = [...files].sort(
      (a, b) => new Date(a.data_upload).getTime() - new Date(b.data_upload).getTime()
    );

    // Dicionário acumulador de bytes por conta
    const cumByAccount: Record<string, number> = {};
    accounts.forEach((acc) => {
      cumByAccount[acc.id] = 0;
    });

    const initialPoint: any = {
      timestamp: "2026-10-15T08:00:00Z",
      label: "15/10 (Início)",
      poolUsageGB: 0,
      fileName: "Início do Pool Virtual",
    };
    accounts.forEach((acc) => {
      initialPoint[`${acc.id}_GB`] = 0;
    });

    const points: any[] = [initialPoint];

    sorted.forEach((file) => {
      const sizeGB = file.tamanho_bytes / (1024 * 1024 * 1024);
      if (cumByAccount[file.conta_origem] === undefined) {
        cumByAccount[file.conta_origem] = 0;
      }
      cumByAccount[file.conta_origem] += sizeGB;

      const totalCumGB = Object.values(cumByAccount).reduce((acc, curr) => acc + curr, 0);

      const fileDate = new Date(file.data_upload);
      const day = String(fileDate.getDate()).padStart(2, "0");
      const month = String(fileDate.getMonth() + 1).padStart(2, "0");
      const hours = String(fileDate.getHours()).padStart(2, "0");
      const mins = String(fileDate.getMinutes()).padStart(2, "0");

      const point: any = {
        timestamp: file.data_upload,
        label: `${day}/${month} ${hours}:${mins}`,
        poolUsageGB: parseFloat(totalCumGB.toFixed(2)),
        fileName: file.nome_arquivo,
        fileAccount: file.conta_origem,
      };

      accounts.forEach((acc) => {
        point[`${acc.id}_GB`] = parseFloat((cumByAccount[acc.id] || 0).toFixed(2));
      });

      points.push(point);
    });

    return points;
  }, [files, accounts]);

  const currentUsageGB = trendData.length > 0 ? trendData[trendData.length - 1].poolUsageGB : 0;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg space-y-4">
      {/* Header do Gráfico */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800/80">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-lg bg-cyan-500/10 text-cyan-400">
              <TrendingUp className="w-4 h-4" />
            </span>
            <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              <span>Evolução do Armazenamento no Pool</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-cyan-400 border border-slate-700">
                {accounts.length} Contas Integradas
              </span>
            </h3>
          </div>
          <p className="text-xs text-slate-400">
            Acompanhe o crescimento acumulado no Pool Virtual e a alocação balanceada entre todas as contas conectadas.
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
            Todas as Contas
          </button>
          <button
            onClick={() => setChartMode("pool")}
            className={`px-2.5 py-1 rounded-lg font-medium transition ${
              chartMode === "pool"
                ? "bg-cyan-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Apenas Total Pool
          </button>
          <button
            onClick={() => setChartMode("accounts")}
            className={`px-2.5 py-1 rounded-lg font-medium transition ${
              chartMode === "accounts"
                ? "bg-cyan-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Apenas Contas
          </button>
        </div>
      </div>

      {/* Mini Métricas Rápidas Dinâmicas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
        <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/60">
          <span className="text-[10px] text-slate-400 uppercase font-semibold">Total do Pool</span>
          <div className="text-sm font-extrabold text-cyan-400 mt-0.5">
            {currentUsageGB} GB
          </div>
          <span className="text-[10px] text-slate-500">de {totalPoolLimitGB} GB</span>
        </div>

        {accounts.map((acc) => {
          const accGB = trendData[trendData.length - 1]?.[`${acc.id}_GB`] || 0;
          return (
            <div key={acc.id} className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/60">
              <span className="text-[10px] text-slate-400 uppercase font-semibold truncate block">
                {acc.name}
              </span>
              <div className="text-sm font-extrabold mt-0.5" style={{ color: acc.color }}>
                {accGB} GB
              </div>
              <span className="text-[10px] text-slate-500">
                limite {(acc.limitBytes / (1024 * 1024 * 1024)).toFixed(0)} GB
              </span>
            </div>
          );
        })}
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
                    <div className="rounded-xl border border-slate-700 bg-slate-950/95 p-3 shadow-2xl backdrop-blur-md text-xs space-y-1.5 min-w-[220px]">
                      <div className="font-bold text-white border-b border-slate-800 pb-1 flex items-center justify-between">
                        <span>{label}</span>
                        <span className="text-[10px] text-slate-400">
                          {dataPoint.fileName ? "Upload" : "Início"}
                        </span>
                      </div>
                      {dataPoint.fileName && (
                        <div className="text-[11px] text-slate-300 truncate max-w-[220px]">
                          📄 {dataPoint.fileName}
                        </div>
                      )}
                      <div className="space-y-1 pt-1 font-mono">
                        <div className="flex justify-between text-cyan-400 border-b border-slate-800/60 pb-1">
                          <span>Total do Pool:</span>
                          <strong>{dataPoint.poolUsageGB} GB</strong>
                        </div>
                        {accounts.map((acc) => (
                          <div
                            key={acc.id}
                            className="flex justify-between"
                            style={{ color: acc.color }}
                          >
                            <span>{acc.name}:</span>
                            <span>{dataPoint[`${acc.id}_GB`] || 0} GB</span>
                          </div>
                        ))}
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
                value: `Capacidade Total: ${totalPoolLimitGB} GB`,
                fill: "#f87171",
                fontSize: 10,
                position: "insideTopRight",
              }}
            />

            {/* Área do Pool Total */}
            {(chartMode === "all" || chartMode === "pool") && (
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
            )}

            {/* Linha Individual para cada Conta Cadastrada */}
            {(chartMode === "all" || chartMode === "accounts") &&
              accounts.map((acc) => (
                <Line
                  key={acc.id}
                  type="monotone"
                  dataKey={`${acc.id}_GB`}
                  name={`${acc.name} (GB)`}
                  stroke={acc.color}
                  strokeWidth={2}
                  dot={{ r: 3, fill: acc.color }}
                />
              ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
        <span>* O gráfico recalcula automaticamente as curvas para todas as {accounts.length} contas cadastradas.</span>
        <span className="text-cyan-400/80 font-medium">Recharts Multi-Account Engine</span>
      </div>
    </div>
  );
};
