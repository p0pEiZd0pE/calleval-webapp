import { Download, CalendarDays, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function GenerateReportCard() {
  return (
      <Card className="flex flex-col justify-evenly w-full h-full rounded-xl border shadow-sm">
        <CardHeader>
          <h2 className="text-lg font-semibold">Generate New Report</h2>
          <p className="text-sm text-muted-foreground">Configure and download performance reports.</p>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Report Type */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Report Type</Label>
            <div className="grid grid-cols-3 gap-4">
              <ReportTypeCard
                icon={<CalendarDays className="h-5 w-5" />}
                title="Weekly Summary"
                subtitle="Last 7 days data"
              />
              <ReportTypeCard
                icon={<CalendarDays className="h-5 w-5" />}
                title="Monthly Summary"
                subtitle="Last 30 days data"
              />
              <ReportTypeCard
                icon={<Settings className="h-5 w-5" />}
                title="Custom Range"
                subtitle="Define your own dates"
              />
            </div>
          </div>

          {/* Export Format */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Export Format</Label>
            <Select>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="PDF (.pdf)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf">PDF (.pdf)</SelectItem>
                <SelectItem value="csv">CSV (.csv)</SelectItem>
                <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>

        <CardFooter>
          <Button className="w-full bg-ring hover:bg-primary-foreground text-white">
            <Download className="mr-2 h-4 w-4" />
            Download Report
          </Button>
        </CardFooter>
      </Card>
  );
}

// Subcomponent for report options
function ReportTypeCard({ icon, title, subtitle }) {
  return (
    <div className="border rounded-lg p-4 text-center cursor-pointer hover:border-ring transition">
      <div className="flex flex-col items-center justify-center gap-2">
        {icon}
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{subtitle}</div>
      </div>
    </div>
  );
}
