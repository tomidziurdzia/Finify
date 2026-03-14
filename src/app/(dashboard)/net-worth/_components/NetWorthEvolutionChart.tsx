"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { formatAmount, MONTH_NAMES } from "@/lib/format";
import type { NetWorthEvolutionPoint } from "@/types/net-worth";

interface NetWorthEvolutionChartProps {
  data: NetWorthEvolutionPoint[];
  currencySymbol: string;
}

export function NetWorthEvolutionChart({
  data,
  currencySymbol,
}: NetWorthEvolutionChartProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardDescription>Evolución mensual</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center text-sm py-8">
            No hay datos para mostrar la evolución.
          </p>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map((point) => ({
    name: MONTH_NAMES[point.month - 1]?.slice(0, 3) ?? String(point.month),
    Activos: point.assets,
    Pasivos: point.liabilities,
    Neto: point.netWorth,
  }));

  return (
    <Card>
      <CardHeader className="px-4 pt-4 pb-2">
        <CardDescription>Evolución mensual</CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis
              tick={{ fontSize: 12 }}
              tickFormatter={(v: number) => formatAmount(v)}
            />
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Tooltip
              formatter={(value: any, name: any) => [
                `${currencySymbol} ${formatAmount(Number(value) || 0)}`,
                String(name),
              ]}
            />
            <Legend />
            <Bar dataKey="Activos" fill="#22c55e" radius={[2, 2, 0, 0]} />
            <Bar dataKey="Pasivos" fill="#ef4444" radius={[2, 2, 0, 0]} />
            <Bar dataKey="Neto" fill="#6366f1" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
