import React from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { columns } from './columns';
import { DataTable } from './data-table';
import rawRecordings from './raw_recording';


export default function RecentlyUploadedCall() {
  const [data, setData] = React.useState([]);
    
      React.useEffect(() => {
        async function getData() {
          rawRecordings; setData(rawRecordings);
        } getData();
      }, []);

  return (
    <Card>
        <CardHeader>
            <CardTitle>Recently Uploaded Calls</CardTitle>
            <CardDescription>Overview of your latest audio file uploads and their processing status.</CardDescription>
        </CardHeader>
        <CardContent>
            <DataTable columns={columns} data={data} />
        </CardContent>
    </Card>
  )
}
