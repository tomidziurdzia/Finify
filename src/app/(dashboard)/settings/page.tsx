"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserPreferences, useUpdateUserPreferences } from "@/hooks/useUserPreferences";
import { useCurrencies } from "@/hooks/useAccounts";

export default function SettingsPage() {
  const [baseCurrency, setBaseCurrency] = useState("USD");
  const [fxSource, setFxSource] = useState("frankfurter");

  const { data: prefs, isLoading } = useUserPreferences();
  const { data: currencies } = useCurrencies();
  const updatePrefs = useUpdateUserPreferences();

  useEffect(() => {
    if (prefs) {
      setBaseCurrency(prefs.base_currency);
      setFxSource(prefs.fx_source);
    }
  }, [prefs]);

  const handleSave = async () => {
    await updatePrefs.mutateAsync({
      base_currency: baseCurrency,
      fx_source: fxSource,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configuración</h1>
        <p className="text-muted-foreground text-sm">
          Preferencias de moneda y reportes.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Moneda base</CardTitle>
          <CardDescription>
            Todas las conversiones y totales se muestran en esta moneda.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Moneda</Label>
            <Select value={baseCurrency} onValueChange={setBaseCurrency}>
              <SelectTrigger className="w-48">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fuente de cotizaciones</CardTitle>
          <CardDescription>
            API usada para obtener tipos de cambio (fiat).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Fuente FX</Label>
            <Select value={fxSource} onValueChange={setFxSource}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="frankfurter">Frankfurter</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={updatePrefs.isPending}>
        {updatePrefs.isPending ? "Guardando..." : "Guardar preferencias"}
      </Button>
    </div>
  );
}
