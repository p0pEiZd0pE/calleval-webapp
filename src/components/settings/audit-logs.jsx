import React from 'react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import auditLogs from './audit_logs'

export default function AuditLogs() {
  return (
    <Card className="w-full h-full">
      <CardHeader>
        <CardTitle>Audit Logs</CardTitle>
        <CardDescription>
          Review a chronological record of system changes and user actions.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {auditLogs.map((log, index) => (
          <div
            key={index}
            className={`p-3 rounded-md`}
          >
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
              {log.message}
            </p>
            {log.timestamp && (
              <p className="text-xs text-muted-foreground mt-1">
                {log.timestamp} by {log.user} ({log.role})
              </p>
            )}
          </div>
        ))}
      </CardContent>

      <CardFooter>
        <Button variant="outline" className="w-full">
          View Full Logs
        </Button>
      </CardFooter>
    </Card>
  )
}
