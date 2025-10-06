import React from 'react'
import { SiteHeader } from '@/components/call_evaluation/site-header';
import { Button } from "@/components/ui/button"
import { Funnel } from 'lucide-react';
import { CloudUpload } from 'lucide-react';
import RecentCallEvaluations from '../components/call_evaluation/recent_call_evaluations';




export default function CallEvaluations() {
  
  return (
    <>
        <SiteHeader />
        <div className="flex justify-between items-center p-4">
            <h2 className="scroll-m-20 pb-2 text-3xl font-semibold tracking-tight">Call Evaluations</h2>
            <div className="flex flex-row gap-2">
                <Button className='bg-ring hover:bg-primary-foreground text-white'>
                  <Funnel />Advanced Filters
                </Button>
                <Button variant="secondary">
                  <CloudUpload />Upload New Call
                </Button>
            </div>
        </div>
        <div className='px-4'>
          <RecentCallEvaluations />
        </div>
    </>
  )
}
