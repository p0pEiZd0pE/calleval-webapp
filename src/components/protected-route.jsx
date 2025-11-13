import { Navigate } from "react-router-dom";

const ProtectedRoute = ({ children }) => {
  // Check for JWT token (preferred) or legacy auth flag
  const token = localStorage.getItem("auth_token");
  const isAuth = localStorage.getItem("auth");
  
  // User is authenticated if they have a valid token
  return (token || isAuth) ? children : <Navigate to="/login" />;
};

export default ProtectedRoute;