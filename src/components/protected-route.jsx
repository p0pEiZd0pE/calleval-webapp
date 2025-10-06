import { Navigate } from "react-router-dom";

const ProtectedRoute = ({ children }) => {
  const isAuth = localStorage.getItem("auth"); // later: check JWT token
  return isAuth ? children : <Navigate to="/login" />;
};

export default ProtectedRoute;