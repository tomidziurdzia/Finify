"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  Layers,
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
  active,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  asAnchor?: boolean;
  active?: boolean;
}) {
  const { state } = useSidebar();
  const mounted = useMounted();
  const collapsed = mounted && state === "collapsed";

  const LinkOrAnchor = asAnchor ? "a" : Link;
  const buttonClass = active
    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
    : "";

  if (!collapsed) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild className={buttonClass}>
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
          <SidebarMenuButton className={`cursor-pointer ${buttonClass}`}>
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
  const pathname = usePathname();
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
                active={pathname === "/"}
              />
              <CollapsedDropdownItem
                href="/budget"
                icon={CalendarDays}
                label="Presupuesto"
                active={pathname === "/budget"}
              />
              <CollapsedDropdownItem
                href="/budget/categories"
                icon={Layers}
                label="Categorías"
                active={pathname.startsWith("/budget/categories")}
              />
              <CollapsedDropdownItem
                href="/accounts"
                icon={Landmark}
                label="Cuentas"
                active={pathname.startsWith("/accounts")}
              />
              <CollapsedDropdownItem
                href="/net-worth"
                icon={BarChart3}
                label="Patrimonio"
                active={pathname.startsWith("/net-worth")}
              />
              <CollapsedDropdownItem
                href="/settings"
                icon={Settings}
                label="Configuración"
                active={pathname.startsWith("/settings")}
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
