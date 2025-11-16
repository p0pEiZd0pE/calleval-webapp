'use client'
import { ThemeProvider } from "@/components/theme-provider"
import { AppSidebar } from '@/components/app-sidebar'
import { Toaster } from "@/components/ui/sonner"
import {
  SidebarInset,
  SidebarProvider,
} from '@/components/ui/sidebar'
import { Routes, Route } from 'react-router-dom'
import Dashboard from "./pages/Dashboard"
import CallEvaluations from "./pages/CallEvaluations"
import Upload from "./pages/Upload"
import Agent from "./pages/Agent"
import Reports from "./pages/Reports"
import Settings from "./pages/Settings"
import Login from "./pages/Login"
import Unauthorized from "./pages/Unauthorized"
import ProtectedRoute from "./components/protected-route"
import { useEffect } from 'react'
import { fetchAndApplyUserTheme, applyStoredTheme } from "@/lib/theme-utils"

const App = () => {
  // ADDED: Sync theme on app initialization
  useEffect(() => {
    const syncTheme = async () => {
      const token = localStorage.getItem('auth_token');
      
      if (token) {
        // User is logged in - fetch theme from backend
        console.log('User logged in, fetching theme from backend...');
        await fetchAndApplyUserTheme();
      } else {
        // User not logged in - apply theme from localStorage
        console.log('User not logged in, applying stored theme...');
        applyStoredTheme();
      }
    };
    
    syncTheme();
  }, []); // Run once on mount

  return (
    <ThemeProvider defaultTheme="system" storageKey="theme">
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/unauthorized" element={<Unauthorized />} />
        
        {/* Protected routes with sidebar */}
        <Route 
          path="/*" 
          element={
            <ProtectedRoute>
              <SidebarProvider>
                <AppSidebar />
                <SidebarInset>
                  <Routes>
                    {/* Dashboard - All authenticated users */}
                    <Route path="/" element={<Dashboard />} />
                    
                    {/* Call Evaluations - All users (with data filtering on backend) */}
                    <Route path="/call_evaluations" element={<CallEvaluations />} />
                    
                    {/* Upload - Admin and Manager only */}
                    <Route 
                      path="/upload" 
                      element={
                        <ProtectedRoute allowedRoles={['Admin', 'Manager']}>
                          <Upload />
                        </ProtectedRoute>
                      } 
                    />
                    
                    {/* Agent - Admin and Manager only */}
                    <Route 
                      path="/agent" 
                      element={
                        <ProtectedRoute allowedRoles={['Admin', 'Manager']}>
                          <Agent />
                        </ProtectedRoute>
                      } 
                    />
                    
                    {/* Reports - Admin and Manager only */}
                    <Route 
                      path="/reports" 
                      element={
                        <ProtectedRoute allowedRoles={['Admin', 'Manager']}>
                          <Reports />
                        </ProtectedRoute>
                      } 
                    />
                    
                    {/* Settings - Admin only */}
                    <Route 
                      path="/settings" 
                      element={
                        <ProtectedRoute allowedRoles={['Admin']}>
                          <Settings />
                        </ProtectedRoute>
                      } 
                    />
                  </Routes>
                </SidebarInset>
              </SidebarProvider>
            </ProtectedRoute>
          }
        />
      </Routes>
      <Toaster />
    </ThemeProvider>
  )
}

export default App