/**
 * Permission utilities for role-based access control
 */

// Get current user from localStorage
export const getCurrentUser = () => {
  const userStr = localStorage.getItem('user');
  if (!userStr) return null;
  
  try {
    return JSON.parse(userStr);
  } catch (e) {
    console.error('Failed to parse user data:', e);
    return null;
  }
};

// Check if user has a specific role
export const hasRole = (requiredRole) => {
  const user = getCurrentUser();
  if (!user || !user.role) return false;
  
  return user.role === requiredRole;
};

// Check if user has any of the specified roles
export const hasAnyRole = (roles = []) => {
  const user = getCurrentUser();
  if (!user || !user.role) return false;
  
  return roles.includes(user.role);
};

// Check if user is admin
export const isAdmin = () => {
  return hasRole('Admin');
};

// Check if user is manager
export const isManager = () => {
  return hasRole('Manager');
};

// Check if user is agent
export const isAgent = () => {
  return hasRole('Agent');
};

// Check if user is admin or manager
export const isAdminOrManager = () => {
  return hasAnyRole(['Admin', 'Manager']);
};

// Check if user can manage agents (Admin or Manager)
export const canManageAgents = () => {
  return isAdminOrManager();
};

// Check if user can manage users (Admin only)
export const canManageUsers = () => {
  return isAdmin();
};

// Check if user can view all calls (Admin or Manager)
export const canViewAllCalls = () => {
  return isAdminOrManager();
};

// Check if user can upload calls (Admin or Manager)
export const canUploadCalls = () => {
  return isAdminOrManager();
};

// Check if user can delete calls (Admin only)
export const canDeleteCalls = () => {
  return isAdmin();
};

// Check if user can export reports (Admin or Manager)
export const canExportReports = () => {
  return isAdminOrManager();
};

// Check if user owns a resource (for Agents viewing their own data)
export const ownsResource = (resourceOwnerId) => {
  const user = getCurrentUser();
  if (!user) return false;
  
  // Admin and Manager can access all resources
  if (isAdminOrManager()) return true;
  
  // Check if user owns the resource
  return user.id === resourceOwnerId;
};

// Get permission levels
export const PERMISSIONS = {
  // User Management
  MANAGE_USERS: 'manage_users',           // Admin only
  VIEW_USERS: 'view_users',                // Admin only
  
  // Agent Management
  MANAGE_AGENTS: 'manage_agents',          // Admin, Manager
  VIEW_ALL_AGENTS: 'view_all_agents',      // Admin, Manager
  
  // Call Management
  UPLOAD_CALLS: 'upload_calls',            // Admin, Manager
  VIEW_ALL_CALLS: 'view_all_calls',        // Admin, Manager
  VIEW_OWN_CALLS: 'view_own_calls',        // Agent
  DELETE_CALLS: 'delete_calls',            // Admin only
  
  // Reports & Analytics
  EXPORT_REPORTS: 'export_reports',        // Admin, Manager
  VIEW_DASHBOARD: 'view_dashboard',        // All authenticated users
  
  // Settings
  MANAGE_SETTINGS: 'manage_settings',      // Admin only
  VIEW_AUDIT_LOGS: 'view_audit_logs',      // Admin only
};

// Check if user has a specific permission
export const hasPermission = (permission) => {
  const user = getCurrentUser();
  if (!user) return false;
  
  const role = user.role;
  
  switch (permission) {
    // Admin only
    case PERMISSIONS.MANAGE_USERS:
    case PERMISSIONS.VIEW_USERS:
    case PERMISSIONS.DELETE_CALLS:
    case PERMISSIONS.MANAGE_SETTINGS:
    case PERMISSIONS.VIEW_AUDIT_LOGS:
      return role === 'Admin';
    
    // Admin and Manager
    case PERMISSIONS.MANAGE_AGENTS:
    case PERMISSIONS.VIEW_ALL_AGENTS:
    case PERMISSIONS.UPLOAD_CALLS:
    case PERMISSIONS.VIEW_ALL_CALLS:
    case PERMISSIONS.EXPORT_REPORTS:
      return role === 'Admin' || role === 'Manager';
    
    // All authenticated users
    case PERMISSIONS.VIEW_DASHBOARD:
      return ['Admin', 'Manager', 'Agent'].includes(role);
    
    // Agent specific
    case PERMISSIONS.VIEW_OWN_CALLS:
      return role === 'Agent';
    
    default:
      return false;
  }
};

// Role display helper
export const getRoleDisplay = (role) => {
  const roleMap = {
    'Admin': { label: 'Administrator', color: 'red', variant: 'destructive' },
    'Manager': { label: 'Manager', color: 'blue', variant: 'default' },
    'Agent': { label: 'Agent', color: 'green', variant: 'secondary' }
  };
  
  return roleMap[role] || { label: role, color: 'gray', variant: 'outline' };
};
