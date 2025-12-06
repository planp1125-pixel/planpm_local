'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bot, FlaskConical, LayoutDashboard, Wrench, PanelLeft, ClipboardList } from 'lucide-react';
import {
  Sidebar,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';

const menuItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/instruments', label: 'Instruments', icon: Wrench },
  { href: '/results', label: 'Maintenance Results', icon: ClipboardList },
  { href: '/design-results', label: 'Design Results', icon: ClipboardList },
  { href: '/advisor', label: 'Predictive Advisor', icon: Bot },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { open, toggleSidebar } = useSidebar();

  return (
    <Sidebar className="border-r">
      <SidebarHeader>
        <div className={`flex items-center ${open ? 'justify-between' : 'justify-center'} p-2`}>
          <Link href="/" className="flex items-center gap-2">
            <FlaskConical className="w-8 h-8 text-primary" />
            {open && <h1 className="text-2xl font-bold font-headline text-foreground">LabTrack</h1>}
          </Link>
        </div>
      </SidebarHeader>
      <Separator />
      <SidebarMenu className="flex-1 p-4">
        {menuItems.map((item) => (
          <SidebarMenuItem key={item.href}>
            <Link href={item.href}>
              <SidebarMenuButton
                isActive={pathname === item.href}
                className="w-full"
                tooltip={!open ? item.label : undefined}
              >
                <item.icon className="w-5 h-5" />
                {open && <span className="truncate">{item.label}</span>}
              </SidebarMenuButton>
            </Link>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
      <Separator />
      <SidebarFooter className="p-4">
        <div className="flex items-center justify-between">
          {open && <p className="text-xs text-muted-foreground">&copy; 2024 LabTrack</p>}
          <Button variant="ghost" size="icon" onClick={toggleSidebar} className={open ? "ml-auto" : "mx-auto"}>
            <PanelLeft className="w-4 h-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
