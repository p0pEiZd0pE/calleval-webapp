import React from 'react'
import { SiteHeader } from '../components/settings/site-header'
import UserAccessControl from '../components/settings/user-access-control'
import GeneralApplicationSettings from '../components/settings/general-application-settings'
import AuditLogs from '../components/settings/audit-logs'

export default function Settings() {
  const [auditLogsRefreshKey, setAuditLogsRefreshKey] = React.useState(0);

  const handleUserActionComplete = () => {
    // Trigger refresh of AuditLogs component
    setAuditLogsRefreshKey(prev => prev + 1);
  };

  const handleSettingsActionComplete = () => {
    // Trigger refresh of AuditLogs component
    setAuditLogsRefreshKey(prev => prev + 1);
  };

  return (
    <>
        <SiteHeader />
        <div className="flex flex-col p-4 gap-4">
            <div>
                <h2 className="scroll-m-20 pb-2 text-3xl font-semibold tracking-tight">
                  System Settings
                </h2>
            </div>
            <UserAccessControl onUserActionComplete={handleUserActionComplete} />
            <div className="flex flex-row gap-4">
                <GeneralApplicationSettings onSettingsActionComplete={handleSettingsActionComplete} />
                <AuditLogs refreshTrigger={auditLogsRefreshKey} />
            </div>
        </div>
    </>
  )
}