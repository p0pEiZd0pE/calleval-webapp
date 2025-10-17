import React from 'react'
import { useNavigate } from 'react-router-dom'
import { SiteHeader } from '@/components/call_evaluation/site-header'
import { Button } from "@/components/ui/button"
import { Funnel, CloudUpload } from 'lucide-react'
import RecentCallEvaluations from '../components/call_evaluation/recent_call_evaluations'

export default function CallEvaluations() {
  const navigate = useNavigate()
  
  return (
    <>
      <SiteHeader />
      <div className="flex justify-between items-center p-4">
        <h2 className="scroll-m-20 pb-2 text-3xl font-semibold tracking-tight">Call Evaluations</h2>
        <div className="flex flex-row gap-2">
          <Button className='bg-ring hover:bg-primary-foreground text-white'>
            <Funnel />Advanced Filters
          </Button>
          <Button 
            variant="secondary"
            onClick={() => navigate('/upload')}
          >
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