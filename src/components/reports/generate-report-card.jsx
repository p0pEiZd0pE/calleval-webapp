import React from 'react'
import { Download, CalendarDays, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { toast } from "sonner";
import { API_ENDPOINTS } from '@/config/api';
import { authenticatedFetch } from '@/lib/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function GenerateReportCard({ filters, onReportGenerated }) {
  const [reportType, setReportType] = React.useState("weekly");
  const [exportFormat, setExportFormat] = React.useState("pdf");
  const [dateRange, setDateRange] = React.useState({ from: null, to: null });
  const [generating, setGenerating] = React.useState(false);

  const handleGenerateReport = async () => {
    setGenerating(true);
    
    try {
      // Calculate date range based on report type
      let startDate, endDate;
      const today = new Date();
      
      if (reportType === 'weekly') {
        endDate = today;
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 7);
      } else if (reportType === 'monthly') {
        endDate = today;
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 30);
      } else if (reportType === 'custom') {
        if (!dateRange?.from) {
          toast.error("Please select a date range");
          setGenerating(false);
          return;
        }
        startDate = new Date(dateRange.from);
        startDate.setHours(0, 0, 0, 0);
        
        endDate = dateRange.to ? new Date(dateRange.to) : new Date(dateRange.from);
        endDate.setHours(23, 59, 59, 999);
      }
      
      const callsResponse = await authenticatedFetch(API_ENDPOINTS.CALLS);
      const callsData = await callsResponse.json();
      
      console.log('Date range:', { startDate, endDate });
      console.log('Total calls:', callsData.length);
      
      let filteredCalls = callsData.filter(call => {
        if (call.status !== 'completed') return false;
        
        const callDate = new Date(call.created_at);
        const isInRange = callDate >= startDate && callDate <= endDate;
        
        return isInRange;
      });
      
      console.log('Calls after date filter:', filteredCalls.length);
      
      if (filters?.agentId && filters.agentId !== 'all') {
        filteredCalls = filteredCalls.filter(call => call.agent_id === filters.agentId);
      }
      
      if (filters?.classification && filters.classification !== 'all') {
        filteredCalls = filteredCalls.filter(call => {
          const score = call.score || 0;
          switch(filters.classification) {
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
        toast.error("No data available for the selected criteria");
        setGenerating(false);
        return;
      }
      
      if (exportFormat === 'csv') {
        generateCSV(filteredCalls);
      } else if (exportFormat === 'xlsx') {
        await generateXLSX(filteredCalls);
      } else if (exportFormat === 'pdf') {
        await generatePDF(filteredCalls);
      }
      
      await saveReportMetadata(filteredCalls, startDate, endDate);
      
      if (onReportGenerated) {
        onReportGenerated();
      }
      
      toast.success(`Report generated successfully in ${exportFormat.toUpperCase()} format`);
      
    } catch (error) {
      toast.error("Failed to generate report");
      console.error(error);
    } finally {
      setGenerating(false);
    }
  };
  
  const generateCSV = (data) => {
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
    
    const reportTypeName = reportType.charAt(0).toUpperCase() + reportType.slice(1);
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `CallEval_${reportTypeName}_Report_${timestamp}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const generateXLSX = async (data) => {
    const XLSX = await import('xlsx');
    
    const worksheetData = [
      ['CallEval Performance Report'],
      ['Generated:', new Date().toLocaleString()],
      ['Report Type:', reportType.charAt(0).toUpperCase() + reportType.slice(1)],
      ['Agent Filter:', filters?.agentId === 'all' ? 'All Agents' : filters?.agentId || 'All Agents'],
      ['Classification:', filters?.classification === 'all' ? 'All Classifications' : filters?.classification || 'All Classifications'],
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
    
    const reportTypeName = reportType.charAt(0).toUpperCase() + reportType.slice(1);
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `CallEval_${reportTypeName}_Report_${timestamp}.xlsx`;
    
    XLSX.writeFile(workbook, filename);
  };
  
  const generatePDF = async (data) => {
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text('CallEval Performance Report', 14, 20);
    
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);
    doc.text(`Report Type: ${reportType.charAt(0).toUpperCase() + reportType.slice(1)}`, 14, 36);
    doc.text(`Agent Filter: ${filters?.agentId === 'all' ? 'All Agents' : filters?.agentId || 'All Agents'}`, 14, 42);
    doc.text(`Classification: ${filters?.classification === 'all' ? 'All Classifications' : filters?.classification || 'All'}`, 14, 48);
    
    const tableData = data.map(call => [
      call.id,
      call.agent_name || 'N/A',
      call.filename,
      (call.score || 0).toFixed(1),
      call.duration || 'N/A',
      call.status,
      new Date(call.created_at).toLocaleDateString()
    ]);
    
    autoTable(doc, {
      startY: 55,
      head: [['Call ID', 'Agent', 'Filename', 'Score', 'Duration', 'Status', 'Date']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [34, 197, 94] },
      styles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 20 }, 1: { cellWidth: 25 }, 2: { cellWidth: 45 },
        3: { cellWidth: 15 }, 4: { cellWidth: 20 }, 5: { cellWidth: 20 }, 6: { cellWidth: 25 }
      }
    });
    
    const finalY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.text(`Total Calls: ${data.length}`, 14, finalY);
    
    const avgScore = data.reduce((sum, c) => sum + (c.score || 0), 0) / data.length;
    doc.text(`Average Score: ${avgScore.toFixed(1)}`, 14, finalY + 6);

    // Add signature section at bottom left
    const pageHeight = doc.internal.pageSize.height;
    doc.setFontSize(10);
    doc.text('Approved by:', 14, pageHeight - 40);
    doc.line(14, pageHeight - 30, 70, pageHeight - 30); // Underline for signature
    doc.setFontSize(9);
    doc.text('QA Specialist', 14, pageHeight - 22);
    
    const reportTypeName = reportType.charAt(0).toUpperCase() + reportType.slice(1);
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `CallEval_${reportTypeName}_Report_${timestamp}.pdf`;
    
    doc.save(filename);
  };
  
  const saveReportMetadata = async (data, startDate, endDate) => {
    try {
      const avgScore = data.length > 0
        ? data.reduce((sum, c) => sum + (c.score || 0), 0) / data.length
        : 0;
      
      const validStartDate = startDate instanceof Date ? startDate : new Date(startDate);
      const validEndDate = endDate instanceof Date ? endDate : new Date(endDate);
      
      const reportMetadata = {
        type: reportType,
        format: exportFormat,
        agent_id: filters?.agentId !== 'all' ? filters?.agentId : null,
        agent_name: filters?.agentId !== 'all' ? filters?.agentId : null,
        classification: filters?.classification !== 'all' ? filters?.classification : null,
        start_date: validStartDate.toISOString(),
        end_date: validEndDate.toISOString(),
        total_calls: data.length,
        avg_score: parseFloat(avgScore.toFixed(1))
      };
      
      const response = await authenticatedFetch(API_ENDPOINTS.REPORTS, {
        method: 'POST',
        body: JSON.stringify(reportMetadata)
      });
      
      if (!response.ok) {
        console.error('Failed to save report metadata');
      }
    } catch (error) {
      console.error('Error saving report metadata:', error);
    }
  };

  return (
      <Card className="flex flex-col w-full h-full rounded-xl border shadow-sm">
        <CardHeader className="flex-shrink-0">
          <h2 className="text-base md:text-lg font-semibold">Generate New Report</h2>
          <p className="text-xs md:text-sm text-muted-foreground">Configure and download performance reports.</p>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col space-y-3 md:space-y-4 py-4">
          <div className="flex-1 flex flex-col min-h-0">
            <Label className="text-xs md:text-sm font-medium mb-2 flex-shrink-0">Report Type</Label>
            <div className="grid grid-cols-3 gap-2 md:gap-3 flex-1 min-h-0">
              <ReportTypeCard
                icon={<CalendarDays className="h-4 w-4 md:h-5 md:w-5" />}
                title="Weekly"
                subtitle="Last 7 days"
                selected={reportType === "weekly"}
                onClick={() => setReportType("weekly")}
              />
              <ReportTypeCard
                icon={<CalendarDays className="h-4 w-4 md:h-5 md:w-5" />}
                title="Monthly"
                subtitle="Last 30 days"
                selected={reportType === "monthly"}
                onClick={() => setReportType("monthly")}
              />
              <ReportTypeCard
                icon={<Settings className="h-4 w-4 md:h-5 md:w-5" />}
                title="Custom"
                subtitle="Select date range"
                selected={reportType === "custom"}
                onClick={() => setReportType("custom")}
              />
            </div>
          </div>

          {reportType === "custom" && (
            <div className="space-y-2 flex-shrink-0">
              <Label className="text-xs md:text-sm font-medium">Date Range</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal text-xs md:text-sm",
                      !dateRange?.from && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-3 w-3 md:h-4 md:w-4" />
                    {dateRange?.from ? (
                      dateRange?.to ? (
                        <>
                          {format(dateRange.from, "LLL dd, y")} -{" "}
                          {format(dateRange.to, "LLL dd, y")}
                        </>
                      ) : (
                        format(dateRange.from, "LLL dd, y")
                      )
                    ) : (
                      <span>Pick a date range</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange?.from}
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          <div className="space-y-2 flex-shrink-0">
            <Label className="text-xs md:text-sm font-medium">Export Format</Label>
            <Select value={exportFormat} onValueChange={setExportFormat}>
              <SelectTrigger className="w-full text-xs md:text-sm">
                <SelectValue placeholder="Select format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf">PDF (.pdf)</SelectItem>
                <SelectItem value="csv">CSV (.csv)</SelectItem>
                <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>

        <CardFooter className="flex-shrink-0">
          <Button 
            className="w-full bg-ring hover:bg-primary-foreground text-white text-xs md:text-sm"
            onClick={handleGenerateReport}
            disabled={generating || (reportType === "custom" && !dateRange?.from)}
          >
            {generating ? (
              <>
                <Download className="mr-2 h-3 w-3 md:h-4 md:w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Download className="mr-2 h-3 w-3 md:h-4 md:w-4" />
                Download Report
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
  );
}

function ReportTypeCard({ icon, title, subtitle, selected, onClick }) {
  return (
    <div 
      className={cn(
        "border rounded-lg p-2 md:p-3 text-center cursor-pointer transition flex items-center justify-center h-full",
        selected ? "border-ring bg-ring/10" : "hover:border-ring"
      )}
      onClick={onClick}
    >
      <div className="flex flex-col items-center justify-center gap-1 md:gap-2">
        {icon}
        <div className="text-xs md:text-sm font-medium leading-tight">{title}</div>
        <div className="text-[10px] md:text-xs text-muted-foreground leading-tight">{subtitle}</div>
      </div>
    </div>
  );
}