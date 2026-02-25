"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateCategory, useUpdateCategory } from "@/hooks/useBudget";
import { CreateCategorySchema } from "@/lib/validations/budget.schema";
import { BUDGET_CATEGORY_TYPES, BUDGET_CATEGORY_LABELS } from "@/types/budget";
import type { BudgetCategory } from "@/types/budget";

interface CategoryDialogProps {
  category: BudgetCategory | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CategoryDialog({
  category,
  open,
  onOpenChange,
}: CategoryDialogProps) {
  const isEditing = !!category;
  const [name, setName] = useState("");
  const [categoryType, setCategoryType] = useState<string>("essential_expenses");
  const [monthlyAmount, setMonthlyAmount] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();

  useEffect(() => {
    if (category) {
      setName(category.name);
      setCategoryType(category.category_type);
      setMonthlyAmount(String(category.monthly_amount));
    } else {
      setName("");
      setCategoryType("essential_expenses");
      setMonthlyAmount("");
    }
    setErrors({});
  }, [category, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    const amount = parseFloat(monthlyAmount.replace(",", "."));
    const parsed = CreateCategorySchema.safeParse({
      name: name.trim(),
      category_type: categoryType,
      monthly_amount: isNaN(amount) ? 0 : amount,
    });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field && typeof field === "string") fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    try {
      if (isEditing) {
        await updateMutation.mutateAsync({ id: category.id, ...parsed.data });
      } else {
        await createMutation.mutateAsync(parsed.data);
      }
      onOpenChange(false);
    } catch {
      // toast in hook
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar categoría" : "Nueva categoría"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Modificá el nombre, tipo de movimiento o monto mensual."
              : "Agregá una categoría con su tipo de movimiento y monto estimado."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cat-name">Nombre</Label>
            <Input
              id="cat-name"
              placeholder="Ej: Alquiler, Supermercado, Sueldo..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isPending}
            />
            {errors.name && (
              <p className="text-destructive text-sm">{errors.name}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Tipo de movimiento</Label>
            <Select
              value={categoryType}
              onValueChange={setCategoryType}
              disabled={isPending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUDGET_CATEGORY_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {BUDGET_CATEGORY_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.category_type && (
              <p className="text-destructive text-sm">
                {errors.category_type}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-amount">Monto mensual</Label>
            <Input
              id="cat-amount"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={monthlyAmount}
              onChange={(e) => setMonthlyAmount(e.target.value)}
              disabled={isPending}
            />
            {errors.monthly_amount && (
              <p className="text-destructive text-sm">
                {errors.monthly_amount}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? "Guardando..."
                : isEditing
                  ? "Guardar"
                  : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
