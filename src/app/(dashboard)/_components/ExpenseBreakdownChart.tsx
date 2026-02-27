"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatAmount, CATEGORY_COLORS } from "@/lib/format";
import type { MonthSummary } from "@/hooks/useMonthSummary";

interface ExpenseBreakdownChartProps {
  summary: MonthSummary;
  currencySymbol: string;
}

export function ExpenseBreakdownChart({
  summary,
  currencySymbol,
}: ExpenseBreakdownChartProps) {
  const raw = [
    {
      name: "Gastos Esenciales",
      value: summary.essentialExpenses,
      fill: CATEGORY_COLORS.essential_expenses,
    },
    {
      name: "Gastos Discrecionales",
      value: summary.discretionaryExpenses,
      fill: CATEGORY_COLORS.discretionary_expenses,
    },
    {
      name: "Pago de Deudas",
      value: summary.debtPayments,
      fill: CATEGORY_COLORS.debt_payments,
    },
    {
      name: "Ahorros",
      value: summary.savings,
      fill: CATEGORY_COLORS.savings,
    },
    {
      name: "Inversiones",
      value: summary.investments,
      fill: CATEGORY_COLORS.investments,
    },
  ];

  const data = raw.filter((d) => d.value > 0);

  return (
    <Card>
      <CardHeader className="px-4 pt-4 pb-2">
        <CardTitle className="text-sm font-semibold">
          Distribución de Gastos
        </CardTitle>
        <CardDescription className="text-xs">
          Proporción por tipo de categoría.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {data.length === 0 ? (
          <div className="flex h-[250px] items-center justify-center">
            <p className="text-muted-foreground text-sm">
              Sin gastos registrados este mes.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={90}
                paddingAngle={2}
              >
                {data.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v) => [
                  `${currencySymbol} ${formatAmount(Number(v ?? 0))}`,
                  "Monto",
                ]}
              />
              <Legend
                verticalAlign="bottom"
                iconSize={10}
                wrapperStyle={{ fontSize: 11 }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
