"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Home,
  Landmark,
  Settings,
  LogOut,
  LucideIcon,
  BarChart3,
  CalendarDays,
  Wallet,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

function CollapsedDropdownItem({
  href,
  icon: Icon,
  label,
  asAnchor,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  asAnchor?: boolean;
}) {
  const { state } = useSidebar();
  const mounted = useMounted();
  const collapsed = mounted && state === "collapsed";

  const LinkOrAnchor = asAnchor ? "a" : Link;

  if (!collapsed) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild>
          <LinkOrAnchor href={href}>
            <Icon className="size-4" />
            <span>{label}</span>
          </LinkOrAnchor>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton className="cursor-pointer">
            <Icon className="size-4" />
            <span>{label}</span>
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start">
          <DropdownMenuItem asChild>
            <LinkOrAnchor href={href}>{label}</LinkOrAnchor>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const mounted = useMounted();
  const collapsed = mounted && state === "collapsed";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          {collapsed ? (
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton className="cursor-pointer">
                    <Wallet className="size-4 shrink-0" />
                    <span className="truncate font-semibold">Finify</span>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="start">
                  <DropdownMenuItem asChild>
                    <Link href="/">Finify</Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          ) : (
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Link href="/">
                  <Wallet className="size-4 shrink-0" />
                  <span className="truncate font-semibold">Finify</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navegación</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <CollapsedDropdownItem
                href="/"
                icon={Home}
                label="Dashboard"
              />
              <CollapsedDropdownItem
                href="/budget"
                icon={CalendarDays}
                label="Presupuesto"
              />
              <CollapsedDropdownItem
                href="/accounts"
                icon={Landmark}
                label="Cuentas"
              />
              <CollapsedDropdownItem
                href="/net-worth"
                icon={BarChart3}
                label="Patrimonio"
              />
              <CollapsedDropdownItem
                href="/settings"
                icon={Settings}
                label="Configuración"
              />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <CollapsedDropdownItem
            href="/auth/logout"
            icon={LogOut}
            label="Cerrar sesión"
            asAnchor
          />
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
