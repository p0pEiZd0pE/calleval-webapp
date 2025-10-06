import React from 'react'
import { LoginForm } from '../components/login/login-form'
import logo from "../assets/logo2.png";
import logo2 from "../assets/logo_dm.png";

export default function Login() {

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <a href="#" className="flex items-center gap-2 font-medium">
            <div className="bg-amber-50 text-primary-foreground flex size-6 items-center justify-center rounded-md">
              <img src={logo2} alt="Logo" className="size-max" />
            </div>
            CallEval
          </a>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <LoginForm />
          </div>
        </div>
      </div>
      <div className="bg-amber-50 relative hidden lg:block">
        <img
          src={logo}
          alt="Image"
          className="absolute inset-0 h-full w-full object-contain "
        />
      </div>
    </div>
  )
}
