import React from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Download } from "lucide-react"
import { toast } from "sonner"

export default function RecentReports() {
  const [reports, setReports] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    // In a real implementation, this would fetch from your backend
    // For now, using mock data
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Mock data - replace with actual API call
      const mockReports = [
        {
          id: "REP001",
          type: "Monthly Summary",
          dateGenerated: "2024-10-15",
          format: "PDF",
          status: "Completed",
          agentName: "All Agents",
          downloadUrl: "#"
        },
        {
          id: "REP002",
          type: "Weekly Performance",
          dateGenerated: "2024-10-12",
          format: "CSV",
          status: "Completed",
          agentName: "All Agents",
          downloadUrl: "#"
        },
        {
          id: "REP003",
          type: "Custom Agent Report",
          dateGenerated: "2024-10-10",
          format: "XLSX",
          status: "Completed",
          agentName: "Sarah Johnson",
          downloadUrl: "#"
        },
        {
          id: "REP004",
          type: "Monthly Summary",
          dateGenerated: "2024-09-30",
          format: "PDF",
          status: "Completed",
          agentName: "All Agents",
          downloadUrl: "#"
        },
        {
          id: "REP005",
          type: "Weekly Performance",
          dateGenerated: "2024-10-05",
          format: "CSV",
          status: "Completed",
          agentName: "All Agents",
          downloadUrl: "#"
        },
      ];
      
      setReports(mockReports);
    } catch (error) {
      console.error('Error fetching reports:', error);
      toast.error("Failed to load reports");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = (report) => {
    // In a real implementation, this would trigger the actual download
    toast.success(`Downloading ${report.type} (${report.format})`);
    console.log('Downloading report:', report);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Reports</CardTitle>
        <CardDescription>
          A list of your recently generated reports.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading reports...
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No reports generated yet
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Report ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Date Generated</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell className="font-medium font-mono text-sm">
                      {report.id}
                    </TableCell>
                    <TableCell>{report.type}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {report.agentName}
                    </TableCell>
                    <TableCell>{formatDate(report.dateGenerated)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{report.format}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={report.status === "Completed" ? "default" : "secondary"}
                      >
                        {report.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownload(report)}
                        disabled={report.status !== "Completed"}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}