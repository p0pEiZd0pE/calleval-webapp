import React, { useState } from 'react'
import { SiteHeader } from '@/components/upload/site-header';
import UploadSection from '../components/upload/upload_section';
import RecentlyUploadedCall from '../components/upload/recently_upload_call';

export default function Upload() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleUploadComplete = () => {
    // Trigger refresh of the calls list
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <>
      <SiteHeader />
      <div className='flex flex-col'>
        <h1 className="scroll-m-20 pb-2 text-3xl font-semibold tracking-tight p-4">
          Upload Call Recordings
        </h1>
        <div className='p-4'>
          <UploadSection onUploadComplete={handleUploadComplete} />
        </div>
        <div className="p-4">
          <RecentlyUploadedCall refreshTrigger={refreshTrigger} />
        </div>
      </div>
    </>
  );
}