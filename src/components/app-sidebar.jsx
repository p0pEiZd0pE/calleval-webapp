import * as React from "react";
import {
  LayoutDashboard,
  PhoneCall,
  Upload,
  Users,
  FileText,
  Settings,
} from "lucide-react";
import logo from "../assets/logo_dm.png";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { getCurrentUser, isAdminOrManager, isAdmin } from "@/lib/permissions";  // ← ADD THIS

export function AppSidebar(props) {
  const user = getCurrentUser();  // ← ADD THIS
  
  // Build navigation items based on role
  const getNavItems = () => {
    const baseItems = [
      {
        title: "Dashboard",
        url: "/",
        icon: LayoutDashboard,
        isActive: true,
      },
      {
        title: "Call Evaluations",
        url: "/call_evaluations",
        icon: PhoneCall,
      },
    ];
    
    // Admin and Manager see these
    if (isAdminOrManager()) {
      baseItems.push(
        {
          title: "Upload",
          url: "/upload",
          icon: Upload,
        },
        {
          title: "Agent",
          url: "/agent",
          icon: Users,
        },
        {
          title: "Reports",
          url: "/reports",
          icon: FileText,
        }
      );
    }
    
    // Only Admin sees Settings
    if (isAdmin()) {
      baseItems.push({
        title: "Settings",
        url: "/settings",
        icon: Settings,
      });
    }
    
    return baseItems;
  };
  
  const data = {
    user: {
      name: user?.full_name || "User",
      email: user?.email || "user@example.com",
      avatar: "/avatars/shadcn.jpg",
    },
    navMain: getNavItems(),
  };

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg">
              <a href="#">
                <div className="flex items-center">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-amber-50">
                    <img src={logo} alt="Logo" className="size-max" />
                  </div>
                  <span className="m-2 text-base font-semibold">CallEval</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}