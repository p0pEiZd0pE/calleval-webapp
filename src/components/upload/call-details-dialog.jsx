import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Loader2, User, Phone, UserCircle } from "lucide-react"
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
      console.log('Call data received:', data);
      console.log('Speakers mapping:', data.speakers);
      console.log('Segments:', data.segments);
      setCallData(data);
    } catch (err) {
      console.error('Error fetching call details:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Parse transcript with proper speaker diarization
  const parseTranscript = () => {
    if (!callData?.segments || callData.segments.length === 0) {
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
    console.log('Parsing with speakers:', speakers);
    
    const parsed = [];
    
    callData.segments.forEach((segment, index) => {
      const speakerId = segment.speaker;
      const text = segment.text;
      
      // Get role from speakers mapping
      let role = speakers[speakerId] || 'unknown';
      
      console.log(`Segment ${index}: Speaker=${speakerId}, Role=${role}`);
      
      parsed.push({
        speaker: speakerId,
        role: role,
        text: text.trim(),
        start: segment.start,
        end: segment.end
      });
    });
    
    return parsed;
  };

  const transcriptLines = parseTranscript();
  const audioUrl = callData ? 
    `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/temp-audio/${callId}` : 
    null;

  // Get speaker stats
  const getAgentStats = () => {
    if (!callData?.speakers) return null;
    
    const agentSpeaker = Object.entries(callData.speakers).find(([_, role]) => role === 'agent')?.[0];
    const callerSpeaker = Object.entries(callData.speakers).find(([_, role]) => role === 'caller')?.[0];
    
    return { agentSpeaker, callerSpeaker };
  };

  const stats = getAgentStats();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children}
      <DialogContent className="xl:max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl">Call Details</DialogTitle>
          <DialogDescription>
            View diarized transcription and play recording
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
          <ScrollArea className="flex-1 pr-4">
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
                  <p className="text-sm font-medium mb-2">🎵 Audio Recording</p>
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
              {callData.speakers && stats && (
                <div className="p-4 bg-gradient-to-r from-blue-50 to-green-50 dark:from-blue-950 dark:to-green-950 rounded-lg border">
                  <p className="text-sm font-semibold mb-3">Speaker Identification</p>
                  <div className="flex gap-6">
                    <div className="flex items-center gap-2 bg-blue-100 dark:bg-blue-900 px-3 py-2 rounded-md">
                      <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      <div>
                        <span className="text-sm font-bold text-blue-700 dark:text-blue-300">AGENT</span>
                        <span className="text-xs text-blue-600 dark:text-blue-400 ml-2">
                          ({stats.agentSpeaker || 'Unknown'})
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 bg-green-100 dark:bg-green-900 px-3 py-2 rounded-md">
                      <Phone className="h-5 w-5 text-green-600 dark:text-green-400" />
                      <div>
                        <span className="text-sm font-bold text-green-700 dark:text-green-300">CALLER</span>
                        <span className="text-xs text-green-600 dark:text-green-400 ml-2">
                          ({stats.callerSpeaker || 'Unknown'})
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Transcription */}
              <div>
                <h3 className="font-semibold text-lg mb-2">📝 Diarized Transcription</h3>
                <Separator className="mb-3" />
                <div className="space-y-4 p-4 bg-white dark:bg-gray-950 rounded-md border">
                  {transcriptLines.length > 0 ? (
                    transcriptLines.map((line, index) => {
                      const isAgent = line.role === 'agent';
                      const isCaller = line.role === 'caller';
                      const isUnknown = line.role === 'unknown';
                      
                      return (
                        <div 
                          key={index} 
                          className={`flex gap-3 p-4 rounded-lg border-l-4 transition-all hover:shadow-md ${
                            isAgent 
                              ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-500' 
                              : isCaller 
                              ? 'bg-green-50 dark:bg-green-950/30 border-green-500' 
                              : 'bg-gray-50 dark:bg-gray-900 border-gray-400'
                          }`}
                        >
                          <div className="flex-shrink-0 pt-1">
                            {isAgent && (
                              <div className="bg-blue-500 p-2 rounded-full">
                                <User className="h-5 w-5 text-white" />
                              </div>
                            )}
                            {isCaller && (
                              <div className="bg-green-500 p-2 rounded-full">
                                <Phone className="h-5 w-5 text-white" />
                              </div>
                            )}
                            {isUnknown && (
                              <div className="bg-gray-400 p-2 rounded-full">
                                <UserCircle className="h-5 w-5 text-white" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <p className={`text-xs font-bold uppercase tracking-wide ${
                                isAgent 
                                  ? 'text-blue-700 dark:text-blue-300' 
                                  : isCaller 
                                  ? 'text-green-700 dark:text-green-300' 
                                  : 'text-gray-600 dark:text-gray-400'
                              }`}>
                                {line.role === 'unknown' ? `Speaker ${line.speaker}` : line.role}
                              </p>
                              {line.start !== undefined && (
                                <span className="text-xs text-muted-foreground">
                                  [{Math.floor(line.start)}s]
                                </span>
                              )}
                            </div>
                            <p className="text-sm leading-relaxed">{line.text}</p>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center text-muted-foreground py-8">
                      <UserCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p className="font-medium">No transcription available yet.</p>
                      <p className="text-sm mt-2">
                        The diarized transcription will appear here once processing is complete.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Debug Info (optional - remove in production) */}
              {callData.segments && callData.segments.length === 0 && (
                <div className="p-3 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded text-xs">
                  <p className="font-semibold text-yellow-800 dark:text-yellow-200">Debug: No segments found</p>
                  <p className="text-yellow-700 dark:text-yellow-300 mt-1">
                    The backend may not be storing segments properly. Check the console for details.
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}