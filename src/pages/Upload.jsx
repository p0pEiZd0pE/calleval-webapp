import React from 'react'
import { SiteHeader } from '@/components/upload/site-header';
import UploadSection from '../components/upload/upload_section';
import { columns } from '@/components/upload/columns';
import { DataTable } from '@/components/upload/data-table';
import { useEffect, useState } from "react";
import rawRecordings from '../components/upload/raw_recording';
import RecentlyUploadedCall from '../components/upload/recently_upload_call';

export default function Upload() {
    const [data, setData] = useState([]);
    
      useEffect(() => {
        async function getData() {
          rawRecordings; setData(rawRecordings);
        } getData();
      }, []);

    return (
        <>
            <SiteHeader />
            <div className='flex flex-col'>
                <h1 className="scroll-m-20 pb-2 text-3xl font-semibold tracking-tight p-4">Upload Call Recordings</h1>
                <div className='p-4'>
                    <UploadSection />
                </div>
                <div className="p-4">
                    <RecentlyUploadedCall />
                </div>
            </div>
        </>
  )
}
