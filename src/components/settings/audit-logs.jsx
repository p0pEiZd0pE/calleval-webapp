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
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { API_URL } from '@/config/api'
import { toast } from 'sonner'

export default function AuditLogs() {
  const [logs, setLogs] = React.useState([])
  const [filteredLogs, setFilteredLogs] = React.useState([])
  const [searchTerm, setSearchTerm] = React.useState('')
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    fetchAuditLogs()
  }, [])

  React.useEffect(() => {
    if (searchTerm) {
      const filtered = logs.filter(log => 
        log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.user?.toLowerCase().includes(searchTerm.toLowerCase())
      )
      setFilteredLogs(filtered)
    } else {
      setFilteredLogs(logs.slice(0, 5)) // Show only 5 in preview
    }
  }, [searchTerm, logs])

  const fetchAuditLogs = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/audit-logs`)
      if (response.ok) {
        const data = await response.json()
        setLogs(data)
        setFilteredLogs(data.slice(0, 5))
      }
    } catch (error) {
      console.error('Failed to fetch audit logs:', error)
      toast.error('Failed to load audit logs')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full h-full flex flex-col">
      <CardHeader className="flex-shrink-0">
        <CardTitle>Audit Logs</CardTitle>
        <CardDescription>
          Review a chronological record of system changes and user actions.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 flex-1 flex flex-col min-h-0">
        <div className="relative flex-shrink-0">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search logs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>

        {/* Scrollable logs section with fixed height */}
        <div className="flex-1 overflow-y-auto space-y-3 min-h-0 max-h-[400px] pr-2">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading logs...
            </div>
          ) : filteredLogs.length > 0 ? (
            filteredLogs.map((log, index) => (
              <div key={index} className="p-3 rounded-md border">
                <p className="text-sm font-medium">
                  {log.message}
                </p>
                {log.timestamp && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(log.timestamp).toLocaleString()} by {log.user} ({log.role})
                  </p>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No logs found
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex-shrink-0">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="w-full">
              View Full Logs
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Complete Audit Logs</SheetTitle>
              <SheetDescription>
                Detailed view of all system activities
              </SheetDescription>
            </SheetHeader>
            <div className="mt-6 space-y-3">
              {logs.map((log, index) => (
                <div key={index} className="p-4 rounded-md border">
                  <p className="text-sm font-medium">
                    {log.message}
                  </p>
                  {log.timestamp && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(log.timestamp).toLocaleString()} • {log.user} • {log.role}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </CardFooter>
    </Card>
  )
}