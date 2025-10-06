import React from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { columns } from '@/components/reports/columns';
import { DataTable } from '@/components/reports/data-table';
import generatedReports from './generated_reports';


export default function RecentReports() {
  const [data, setData] = React.useState([]);
    
      React.useEffect(() => {
        async function getData() {
        generatedReports  ; setData(generatedReports);
        } getData();
      }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Reports</CardTitle>
        <CardDescription>
          A list of your recently generated reports.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable columns={columns} data={data} />
      </CardContent>
    </Card>
  )
}
