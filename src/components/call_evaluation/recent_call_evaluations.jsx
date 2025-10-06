import React from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Funnel, Download } from 'lucide-react';
import { columns } from './columns';
import { DataTable } from './data-table';
import callRecordings from './call_recordings';

export default function RecentCallEvaluations() {
    const [data, setData] = React.useState([]);
    
      React.useEffect(() => {
        async function getData() {
          callRecordings; setData(callRecordings);
        } getData();
      }, []);
    
  return (
    <Card>
        <CardHeader className='flex justify-between items-center w-full p-4'>
        <CardTitle className="text-xl font-bold">Recent Call Evaluations</CardTitle>
        <div className='flex flex-row gap-4'>
            <Input 
                placeholder="Search calls... "
                className='h-10 px-4 py-2 rounded-md border border-input text-sm'
            />
            <Button className='bg-ring hover:bg-primary-foreground text-white h-10 px-4 py-2 flex items-center gap-2 rounded-md border text-sm'>
                <Funnel className="h-4 w-4"/>Columns
            </Button>
            <Button className='bg-ring hover:bg-primary-foreground text-white h-10 px-4 py-2 flex items-center gap-2 rounded-md border text-sm'>
                <Download className="h-4 w-4"/>Export
            </Button>
        </div>
        </CardHeader>
        <CardContent>
            <DataTable columns={columns} data={data} />
        </CardContent>
    </Card>
  )
}
