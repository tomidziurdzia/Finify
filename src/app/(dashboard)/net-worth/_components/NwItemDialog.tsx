"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccounts, useCurrencies } from "@/hooks/useAccounts";
import { NW_ITEM_SIDE_LABELS, type NwItemWithRelations } from "@/types/net-worth";

interface NwItemDialogProps {
  item: NwItemWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    name: string;
    side: "asset" | "liability";
    account_id: string | null;
    currency: string;
  }) => Promise<void>;
}

export function NwItemDialog({
  item,
  open,
  onOpenChange,
  onSubmit,
}: NwItemDialogProps) {
  const [name, setName] = useState("");
  const [side, setSide] = useState<"asset" | "liability">("asset");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [currency, setCurrency] = useState("USD");

  const { data: accounts } = useAccounts();
  const { data: currencies } = useCurrencies();

  useEffect(() => {
    if (open) {
      setName(item?.name ?? "");
      setSide(item?.side ?? "asset");
      setAccountId(item?.account_id ?? null);
      setCurrency(item?.currency ?? "USD");
    }
  }, [open, item]);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    await onSubmit({
      name: name.trim(),
      side,
      account_id: accountId,
      currency,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {item ? "Editar ítem" : "Nuevo ítem de patrimonio"}
          </DialogTitle>
          <DialogDescription>
            {item
              ? "Modificá los datos del ítem."
              : "Agregá un activo o pasivo para seguimiento."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nombre</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Cuenta Banco, Préstamo Hipotecario"
            />
          </div>
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={side} onValueChange={(v) => setSide(v as "asset" | "liability")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asset">{NW_ITEM_SIDE_LABELS.asset}</SelectItem>
                <SelectItem value="liability">{NW_ITEM_SIDE_LABELS.liability}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Moneda</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(currencies ?? []).map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.code} ({c.symbol})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Cuenta asociada (opcional)</Label>
            <Select
              value={accountId ?? "none"}
              onValueChange={(v) => setAccountId(v === "none" ? null : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Ninguna" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ninguna</SelectItem>
                {(accounts ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim()}>
            {item ? "Guardar" : "Crear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
