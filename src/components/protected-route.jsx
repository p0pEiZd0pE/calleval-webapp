import { Navigate } from "react-router-dom";
import { getCurrentUser, hasAnyRole } from "@/lib/permissions";

/**
 * ProtectedRoute Component
 * Protects routes based on authentication and optional role requirements
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Component to render if authorized
 * @param {string[]} props.allowedRoles - Array of roles allowed to access (optional)
 * @param {string} props.redirectTo - Path to redirect if unauthorized (default: "/login")
 */
const ProtectedRoute = ({ children, allowedRoles = null, redirectTo = "/login" }) => {
  // Check for JWT token
  const token = localStorage.getItem("auth_token");
  
  // If no token, redirect to login
  if (!token) {
    return <Navigate to={redirectTo} replace />;
  }
  
  // If specific roles are required, check user role
  if (allowedRoles && allowedRoles.length > 0) {
    const user = getCurrentUser();
    
    // If no user data or user doesn't have required role
    if (!user || !hasAnyRole(allowedRoles)) {
      // Redirect to unauthorized page or dashboard
      return <Navigate to="/unauthorized" replace />;
    }
  }
  
  // User is authenticated and has required role (if specified)
  return children;
};

export default ProtectedRoute;