import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Loader2, User, Phone } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"

export function CallDetailsDialog({ callId, open, onOpenChange, children }) {
  const [callData, setCallData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open && callId) {
      fetchCallDetails();
    }
  }, [open, callId]);

  const fetchCallDetails = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${backendUrl}/api/calls/${callId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch call details');
      }
      
      const data = await response.json();
      console.log('Call data received:', data); // Debug log
      setCallData(data);
    } catch (err) {
      console.error('Error fetching call details:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Parse transcript with speaker labels
  const parseTranscript = () => {
    if (!callData?.segments || callData.segments.length === 0) {
      // Fallback: if no segments, try to display plain transcript
      if (callData?.transcript) {
        return [{
          speaker: 'unknown',
          role: 'unknown',
          text: callData.transcript
        }];
      }
      return [];
    }
    
    const speakers = callData.speakers || {};
    const parsed = [];
    
    callData.segments.forEach(segment => {
      const speakerId = segment.speaker;
      const text = segment.text;
      const role = speakers[speakerId] || 'unknown';
      
      parsed.push({
        speaker: speakerId,
        role: role,
        text: text.trim()
      });
    });
    
    return parsed;
  };

  const transcriptLines = parseTranscript();
  const audioUrl = callData ? 
    `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/temp-audio/${callId}` : 
    null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children}
      <DialogContent className="max-w-6xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="text-2xl">Call Details</DialogTitle>
          <DialogDescription>
            View transcription and play recording
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2">Loading call details...</span>
          </div>
        )}

        {error && (
          <div className="text-red-500 py-4 text-center">
            <p>Error: {error}</p>
          </div>
        )}

        {callData && !loading && !error && (
          <div className="space-y-4">
            {/* Call Information */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">Filename</p>
                <p className="font-medium">{callData.filename}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Duration</p>
                <p className="font-medium">{callData.duration || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Score</p>
                <p className="font-medium text-lg">{callData.score ? `${callData.score}/100` : 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge variant={callData.status === 'completed' ? 'default' : 'secondary'}>
                  {callData.status}
                </Badge>
              </div>
            </div>

            {/* Audio Player */}
            {audioUrl && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm font-medium mb-2">Audio Recording</p>
                <audio 
                  controls 
                  className="w-full"
                  src={audioUrl}
                >
                  Your browser does not support the audio element.
                </audio>
              </div>
            )}

            {/* Speaker Legend */}
            {callData.speakers && (
              <div className="flex gap-4 p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium">Agent</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium">Caller</span>
                </div>
              </div>
            )}

            {/* Transcription */}
            <div>
              <h3 className="font-semibold text-lg mb-2">Transcription</h3>
              <Separator className="mb-3" />
              <ScrollArea className="h-[500px] w-full rounded-md border p-4">
                {transcriptLines.length > 0 ? (
                  <div className="space-y-3">
                    {transcriptLines.map((line, index) => (
                      <div 
                        key={index} 
                        className={`flex gap-3 ${
                          line.role === 'agent' ? 'bg-blue-50 dark:bg-blue-950' : 
                          line.role === 'caller' ? 'bg-green-50 dark:bg-green-950' : 
                          'bg-gray-50 dark:bg-gray-900'
                        } p-3 rounded-lg transition-colors`}
                      >
                        <div className="flex-shrink-0 pt-1">
                          {line.role === 'agent' && (
                            <User className="h-5 w-5 text-blue-500" />
                          )}
                          {line.role === 'caller' && (
                            <Phone className="h-5 w-5 text-green-500" />
                          )}
                          {line.role === 'unknown' && (
                            <User className="h-5 w-5 text-gray-400" />
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                            {line.role === 'unknown' ? 'Speaker' : line.role}
                          </p>
                          <p className="text-sm leading-relaxed">{line.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    <p>No transcription available yet.</p>
                    <p className="text-sm mt-2">
                      The transcription will appear here once processing is complete.
                    </p>
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}