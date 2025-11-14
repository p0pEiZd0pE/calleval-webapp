import React from 'react';
import { hasPermission, hasRole, hasAnyRole, getCurrentUser } from '@/lib/permissions';

/**
 * Can Component
 * Conditionally renders children based on user permissions
 * 
 * Usage examples:
 * <Can permission="manage_agents">
 *   <Button>Create Agent</Button>
 * </Can>
 * 
 * <Can role="Admin">
 *   <AdminPanel />
 * </Can>
 * 
 * <Can roles={['Admin', 'Manager']}>
 *   <ManagerTools />
 * </Can>
 * 
 * <Can condition={() => isAdmin() || ownsResource(resourceId)}>
 *   <EditButton />
 * </Can>
 */
const Can = ({ 
  children, 
  permission = null, 
  role = null, 
  roles = null,
  condition = null,
  fallback = null 
}) => {
  let hasAccess = false;

  // Check custom condition first
  if (condition && typeof condition === 'function') {
    hasAccess = condition();
  }
  // Check specific permission
  else if (permission) {
    hasAccess = hasPermission(permission);
  }
  // Check specific role
  else if (role) {
    hasAccess = hasRole(role);
  }
  // Check if user has any of the specified roles
  else if (roles && Array.isArray(roles)) {
    hasAccess = hasAnyRole(roles);
  }
  // If no conditions specified, check if user is authenticated
  else {
    const user = getCurrentUser();
    hasAccess = !!user;
  }

  return hasAccess ? <>{children}</> : (fallback || null);
};

export default Can;
