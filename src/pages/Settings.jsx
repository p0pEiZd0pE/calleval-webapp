import React from 'react'
import { SiteHeader } from '../components/settings/site-header'
import UserAccessControl from '../components/settings/user-access-control'
import GeneralApplicationSettings from '../components/settings/general-application-settings'
import AuditLogs from '../components/settings/audit-logs'

export default function Settings() {
  return (
    <>
        <SiteHeader />
        <div className="flex flex-col p-4 gap-4">
            <div>
                <h2 className="scroll-m-20 pb-2 text-3xl font-semibold tracking-tight">
                  System Settings
                </h2>
            </div>
            <UserAccessControl />
            <div className="flex flex-row gap-4">
                <GeneralApplicationSettings />
                <AuditLogs />
            </div>
        </div>
    </>
  )
}
