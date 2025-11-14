import React from 'react'
import { useNavigate } from 'react-router-dom'
import { SiteHeader } from '@/components/call_evaluation/site-header'
import { Button } from "@/components/ui/button"
import { CloudUpload } from 'lucide-react'
import RecentCallEvaluations from '../components/call_evaluation/recent_call_evaluations'
import Can from '@/components/Can'  // ← ADD THIS

export default function CallEvaluations() {
  const navigate = useNavigate()
  
  return (
    <>
      <SiteHeader />
      <div className="flex justify-between items-center p-4">
        <h2 className="scroll-m-20 pb-2 text-3xl font-semibold tracking-tight">Call Evaluations</h2>
        
        {/* Only Admin/Manager see upload button */}
        <Can roles={['Admin', 'Manager']}>  {/* ← ADD THIS */}
          <div className="flex flex-row gap-2">
            <Button 
              variant="secondary"
              onClick={() => navigate('/upload')}
            >
              <CloudUpload />Upload New Call
            </Button>
          </div>
        </Can>  {/* ← ADD THIS */}
      </div>
      <div className='px-4'>
        <RecentCallEvaluations />
      </div>
    </>
  )
}