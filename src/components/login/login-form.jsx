import React from "react"
import { useNavigate } from "react-router-dom"; 
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function LoginForm({ className, ...props }) {
  const [email, setEmail] = React.useState("");
    const [password, setPassword] = React.useState("");
    const navigate = useNavigate();

    const handleSubmit = (e) => {
    e.preventDefault();

    // MOCK login (replace with Django API later)
    if (email === "admin@example.com" && password === "1234") {
      localStorage.setItem("auth", "true"); // store login state
      navigate("/"); // redirect
    } else {
      alert("Invalid credentials");
    }
  };

  return (
    <form onSubmit={handleSubmit} className={cn("flex flex-col gap-6", className)} {...props}>
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">Login to your account</h1>
        <p className="text-muted-foreground text-sm text-balance">
          Enter your email below to login to your account
        </p>
      </div>

      <div className="grid gap-6">
        {/* Email field */}
        <div className="grid gap-3">
          <Label htmlFor="email">Email</Label>
          <Input id="email" 
            type="email" 
            placeholder="m@example.com" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            required />
        </div>

        {/* Password field */}
        <div className="grid gap-3">
          <div className="flex items-center">
            <Label htmlFor="password">Password</Label>
            
          </div>
          <Input 
            id="password" 
            type="password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required />
        </div>

        {/* Submit button */}
        <Button type="submit" className="w-full">
          Login
        </Button>

        
        
      </div>

      
    </form>
  )
}
