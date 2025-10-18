import React from 'react'
import { Download, CalendarDays, Settings, Calendar } from "lucide-react";
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

export default function GenerateReportCard({ filters }) {
  const [reportType, setReportType] = React.useState("weekly");
  const [exportFormat, setExportFormat] = React.useState("pdf");
  const [dateRange, setDateRange] = React.useState({ from: null, to: null });
  const [generating, setGenerating] = React.useState(false);

  const handleGenerateReport = async () => {
    setGenerating(true);
    
    try {
      // Simulate report generation
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const reportData = {
        type: reportType,
        format: exportFormat,
        dateRange: reportType === "custom" ? dateRange : null,
        filters: filters,
        generatedAt: new Date().toISOString()
      };
      
      toast.success(`Report generated successfully in ${exportFormat.toUpperCase()} format`);
      
      // Here you would typically trigger the actual download
      console.log('Report data:', reportData);
      
    } catch (error) {
      toast.error("Failed to generate report");
      console.error(error);
    } finally {
      setGenerating(false);
    }
  };

  return (
      <Card className="flex flex-col w-full h-full rounded-xl border shadow-sm">
        <CardHeader className="flex-shrink-0">
          <h2 className="text-base md:text-lg font-semibold">Generate New Report</h2>
          <p className="text-xs md:text-sm text-muted-foreground">Configure and download performance reports.</p>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col space-y-3 md:space-y-4 py-4">
          {/* Report Type */}
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

          {/* Custom Date Range Picker */}
          {reportType === "custom" && (
            <div className="space-y-2">
              <Label className="text-xs md:text-sm font-medium">Date Range</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal text-xs md:text-sm",
                      !dateRange.from && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-3 w-3 md:h-4 md:w-4" />
                    {dateRange.from ? (
                      dateRange.to ? (
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
                    defaultMonth={dateRange.from}
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Export Format */}
          <div>
            <Label className="text-xs md:text-sm font-medium mb-2 block">Export Format</Label>
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
            disabled={generating || (reportType === "custom" && (!dateRange.from || !dateRange.to))}
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
        "border rounded-lg p-2 md:p-4 text-center cursor-pointer transition flex items-center justify-center min-h-[80px] md:min-h-[100px]",
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