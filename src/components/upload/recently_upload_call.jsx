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
import { API_ENDPOINTS } from '@/config/api';
import { authenticatedFetch } from '@/lib/api';

export default function RecentlyUploadedCall({ refreshTrigger }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCalls = async () => {
    try {
      console.log('Fetching calls from:', API_ENDPOINTS.CALLS);
      const response = await authenticatedFetch(API_ENDPOINTS.CALLS);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const calls = await response.json();
      console.log('Fetched calls:', calls);
      
      // Transform backend data to match table format
      const formattedData = calls.map(call => ({
        id: call.id,
        fileName: call.filename,
        uploadDate: new Date(call.created_at).toLocaleDateString(),
        status: call.status || "pending",
        analysisStatus: call.analysis_status || "pending",
        // Keep full data for actions
        fullData: call
      }));
      
      setData(formattedData);
      setError(null);
    } catch (error) {
      console.error('Failed to fetch calls:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalls();
  }, [refreshTrigger]);

  // Poll for updates every 3 seconds if there are processing calls
  useEffect(() => {
    const hasPending = data.some(
      call => {
        const isProcessing = [
          'pending', 
          'processing', 
          'transcribing', 
          'analyzing',
          'analyzing_bert',
          'analyzing_wav2vec2'
        ].includes(call.status) || 
        [
          'pending', 
          'processing', 
          'transcribing', 
          'analyzing',
          'analyzing_bert',
          'analyzing_wav2vec2',
          'queued'
        ].includes(call.analysisStatus);
        
        console.log(`Call ${call.id}: status=${call.status}, analysisStatus=${call.analysisStatus}, isProcessing=${isProcessing}`);
        return isProcessing;
      }
    );
    
    if (hasPending) {
      console.log('Starting polling - found pending/processing calls');
      const interval = setInterval(() => {
        console.log('Polling for updates...');
        fetchCalls();
      }, 3000); // Poll every 3 seconds
      
      return () => {
        console.log('Stopping polling');
        clearInterval(interval);
      };
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

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recently Uploaded Calls</CardTitle>
          <CardDescription className="text-red-500">
            Error loading calls: {error}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <button 
            onClick={fetchCalls}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Retry
          </button>
        </CardContent>
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