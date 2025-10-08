import React, { useEffect, useState } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { columns } from './columns';
import { DataTable } from './data-table';

export default function RecentlyUploadedCall({ refreshTrigger }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchCalls = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/calls');
      const calls = await response.json();
      
      // Transform backend data to match table format
      const formattedData = calls.map(call => ({
        id: call.id,
        fileName: call.file_name,
        uploadDate: new Date(call.date_time).toLocaleDateString(),
        status: call.status,
        analysisStatus: call.analysis_status,
        // Keep full data for actions
        fullData: call
      }));
      
      setData(formattedData);
    } catch (error) {
      console.error('Failed to fetch calls:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalls();
  }, [refreshTrigger]);

  // Poll for updates every 5 seconds if there are pending uploads
  useEffect(() => {
    const hasPending = data.some(
      call => call.status === 'pending' || call.status === 'transcribing'
    );
    
    if (hasPending) {
      const interval = setInterval(fetchCalls, 5000);
      return () => clearInterval(interval);
    }
  }, [data]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recently Uploaded Calls</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recently Uploaded Calls</CardTitle>
        <CardDescription>
          Overview of your latest audio file uploads and their processing status.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable columns={columns} data={data} />
      </CardContent>
    </Card>
  );
}