import React from 'react'
import { DateRangePicker } from "@/components/reports/date-picker";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button"
import { Funnel } from 'lucide-react';

export default function ReportFilteringCard() {
  const [agent, setAgent] = React.useState("All Agents");
  const [classification, setClassification] = React.useState("All Classifications");

  return (
    <Card>
        <CardHeader>
            <CardTitle className='text-2xl font-semibold'>Report Generation and Export</CardTitle>
        </CardHeader>
        <CardContent  className='flex flex-row justify-between gap-4'>
            <div className="flex flex-row items-center gap-2">
                <label className="text-sm font-medium">Date Range</label>
                <div>
                    <DateRangePicker />
                </div>
            </div>
            <div className="flex flex-row items-center gap-2">
                <label className="text-sm font-medium">Agent</label>
                <Select value={agent} onValueChange={setAgent}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Agents" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="All Agents">All Agents</SelectItem>
                        <SelectItem value="Agent 1">Alice Johnson</SelectItem>
                        <SelectItem value="Agent 2">Bob Williams</SelectItem>
                        <SelectItem value="Agent 3">Charlie Brown</SelectItem>
                        <SelectItem value="Agent 4">Eve Adams</SelectItem>
                        <SelectItem value="Agent 5">Frank White</SelectItem>
                        <SelectItem value="Agent 6">Grace Kelly</SelectItem>
                        <SelectItem value="Agent 7">Henry Ford</SelectItem>
                        <SelectItem value="Agent 8">Ivy Green</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className="flex flex-row items-center gap-2">
                <label className="text-sm font-medium">Classification</label>
                <Select value={classification} onValueChange={setClassification}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Agents" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="All Classifications">All Classifications</SelectItem>
                        <SelectItem value="Satisfactory">Satisfactory</SelectItem>
                        <SelectItem value="Unsatisfactory">Unsatisfactory</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <Button className='bg-ring hover:bg-primary-foreground text-white'>
                <Funnel />
                Apply filters
            </Button>
        </CardContent>
    </Card>
  )
}
