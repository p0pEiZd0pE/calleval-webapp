'use client'
import { ThemeProvider } from "@/components/theme-provider"
import { AppSidebar } from '@/components/app-sidebar'
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
import Login from "./pages/Login";
import ProtectedRoute from "./components/protected-route"

const App = () => {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route 
          path="/*" 
          element={
            <ProtectedRoute>
            <SidebarProvider>
                <AppSidebar />
                <SidebarInset>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/call_evaluations" element={<CallEvaluations />} />
                    <Route path="/upload" element={<Upload />} />
                    <Route path="/agent" element={<Agent />} />
                    <Route path="/reports" element={<Reports />} />
                    <Route path="/settings" element={<Settings />} />
                  </Routes>
                </SidebarInset>
              </SidebarProvider>
            </ProtectedRoute>
          }
        />
      </Routes>
    </ThemeProvider>
  );
};

export default App

