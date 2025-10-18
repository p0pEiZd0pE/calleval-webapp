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
import { API_ENDPOINTS } from '@/config/api'

export default function RecentReports({ refreshTrigger }) {
  const [reports, setReports] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetchReports();
  }, [refreshTrigger]);

  const fetchReports = async () => {
    try {
      setLoading(true);
      const response = await fetch(API_ENDPOINTS.REPORTS);
      
      if (!response.ok) {
        throw new Error('Failed to fetch reports');
      }
      
      const data = await response.json();
      setReports(data);
    } catch (error) {
      console.error('Error fetching reports:', error);
      toast.error("Failed to load reports");
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (report) => {
    try {
      toast.info(`Regenerating ${report.type} report...`);
      
      // Fetch the calls data again
      const callsResponse = await fetch(API_ENDPOINTS.CALLS);
      const callsData = await callsResponse.json();
      
      // Parse the date range from the report
      const startDate = new Date(report.start_date);
      const endDate = new Date(report.end_date);
      
      // Filter calls by the original date range
      let filteredCalls = callsData.filter(call => {
        const callDate = new Date(call.created_at);
        return callDate >= startDate && callDate <= endDate && call.status === 'completed';
      });
      
      // Apply agent filter if it was used
      if (report.agent_id) {
        filteredCalls = filteredCalls.filter(call => call.agent_id === report.agent_id);
      }
      
      // Apply classification filter if it was used
      if (report.classification && report.classification !== 'all') {
        filteredCalls = filteredCalls.filter(call => {
          const score = call.score || 0;
          switch(report.classification) {
            case 'excellent':
              return score >= 90;
            case 'good':
              return score >= 80 && score < 90;
            case 'needs_improvement':
              return score < 80;
            default:
              return true;
          }
        });
      }
      
      if (filteredCalls.length === 0) {
        toast.error("No data available for this report");
        return;
      }
      
      // Generate the report based on format
      if (report.format === 'csv') {
        generateCSV(filteredCalls, report);
      } else if (report.format === 'xlsx') {
        await generateXLSX(filteredCalls, report);
      } else if (report.format === 'pdf') {
        await generatePDF(filteredCalls, report);
      }
      
      toast.success(`Report downloaded successfully`);
    } catch (error) {
      console.error('Error regenerating report:', error);
      toast.error("Failed to regenerate report");
    }
  };
  
  const generateCSV = (data, report) => {
    const headers = ['Call ID', 'Agent ID', 'Agent Name', 'Filename', 'Score', 'Duration', 'Status', 'Created At'];
    const rows = data.map(call => [
      call.id,
      call.agent_id || 'N/A',
      call.agent_name || 'N/A',
      call.filename,
      call.score || 0,
      call.duration || 'N/A',
      call.status,
      new Date(call.created_at).toLocaleString()
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `${report.id}_${report.type}_Report.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const generateXLSX = async (data, report) => {
    const XLSX = await import('xlsx');
    
    const worksheetData = [
      ['CallEval Performance Report'],
      ['Report ID:', report.id],
      ['Generated:', new Date().toLocaleString()],
      ['Report Type:', report.type],
      [],
      ['Call ID', 'Agent ID', 'Agent Name', 'Filename', 'Score', 'Duration', 'Status', 'Created At']
    ];
    
    data.forEach(call => {
      worksheetData.push([
        call.id,
        call.agent_id || 'N/A',
        call.agent_name || 'N/A',
        call.filename,
        call.score || 0,
        call.duration || 'N/A',
        call.status,
        new Date(call.created_at).toLocaleString()
      ]);
    });
    
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    
    worksheet['!cols'] = [
      { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 30 },
      { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 20 }
    ];
    
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
    XLSX.writeFile(workbook, `${report.id}_${report.type}_Report.xlsx`);
  };
  
  const generatePDF = async (data, report) => {
    const jsPDF = (await import('jspdf')).default;
    await import('jspdf-autotable');
    
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text('CallEval Performance Report', 14, 20);
    
    doc.setFontSize(10);
    doc.text(`Report ID: ${report.id}`, 14, 30);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 36);
    doc.text(`Type: ${report.type}`, 14, 42);
    
    const tableData = data.map(call => [
      call.id,
      call.agent_name || 'N/A',
      call.filename,
      (call.score || 0).toFixed(1),
      call.duration || 'N/A',
      call.status,
      new Date(call.created_at).toLocaleDateString()
    ]);
    
    doc.autoTable({
      startY: 50,
      head: [['Call ID', 'Agent', 'Filename', 'Score', 'Duration', 'Status', 'Date']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [34, 197, 94] },
      styles: { fontSize: 8 }
    });
    
    doc.save(`${report.id}_${report.type}_Report.pdf`);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };
  
  const formatReportType = (type) => {
    return type.charAt(0).toUpperCase() + type.slice(1) + ' Report';
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
                    <TableCell>{formatReportType(report.type)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {report.agent_name || 'All Agents'}
                    </TableCell>
                    <TableCell>{formatDate(report.created_at)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{report.format.toUpperCase()}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={report.status === "completed" ? "default" : "secondary"}
                      >
                        {report.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownload(report)}
                        disabled={report.status !== "completed"}
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