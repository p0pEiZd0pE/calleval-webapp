import React, { useCallback, useState, useEffect, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CloudUpload, X, Loader2, StopCircle } from "lucide-react";
import { API_ENDPOINTS } from '@/config/api';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

export default function UploadSection({ onUploadComplete }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  
  // Reference to store abort controllers for each upload
  const abortControllersRef = useRef([]);

  // Fetch agents on component mount
  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      setLoadingAgents(true);
      const response = await fetch(API_ENDPOINTS.AGENTS);
      if (!response.ok) throw new Error('Failed to fetch agents');
      const data = await response.json();
      setAgents(data.filter(agent => agent.status === 'Active'));
    } catch (error) {
      console.error('Error fetching agents:', error);
      toast.error("Failed to load agents");
    } finally {
      setLoadingAgents(false);
    }
  };

  const onDrop = useCallback((acceptedFiles) => {
    setFiles(prev => [...prev, ...acceptedFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'audio/wav': ['.wav'],
      'audio/mpeg': ['.mp3'],
      'audio/mp4': ['.m4a']
    },
    multiple: true
  });

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    setFiles([]);
  };

  const cancelUpload = () => {
    // Abort all ongoing uploads
    abortControllersRef.current.forEach(controller => {
      if (controller) {
        controller.abort();
      }
    });
    
    // Clear the abort controllers
    abortControllersRef.current = [];
    
    // Reset state
    setUploading(false);
    setUploadProgress({ current: 0, total: 0 });
    
    toast.info("Upload process cancelled");
  };

  const uploadAll = async () => {
    if (files.length === 0) {
      toast.error("Please select files to upload");
      return;
    }
    
    if (!selectedAgent) {
      toast.error("Please select an agent before uploading");
      return;
    }
    
    setUploading(true);
    setUploadProgress({ current: 0, total: files.length });
    
    // Clear any existing abort controllers
    abortControllersRef.current = [];
    
    let successCount = 0;
    let errorCount = 0;
    let cancelledCount = 0;
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Create new AbortController for this upload
      const controller = new AbortController();
      abortControllersRef.current.push(controller);
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('agent_id', selectedAgent);
      
      try {
        setUploadProgress({ current: i + 1, total: files.length });
        
        const response = await fetch(API_ENDPOINTS.UPLOAD, {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });
        
        if (!response.ok) {
          throw new Error('Upload failed');
        }
        
        const result = await response.json();
        console.log('Uploaded:', result);
        successCount++;
      } catch (error) {
        if (error.name === 'AbortError') {
          console.log('Upload cancelled for:', file.name);
          cancelledCount++;
        } else {
          console.error('Upload error:', error);
          errorCount++;
        }
      }
    }
    
    setUploading(false);
    setFiles([]);
    setUploadProgress({ current: 0, total: 0 });
    
    // Clear abort controllers
    abortControllersRef.current = [];
    
    // Show results
    if (successCount > 0) {
      toast.success(`Successfully uploaded ${successCount} file(s)`);
    }
    if (errorCount > 0) {
      toast.error(`Failed to upload ${errorCount} file(s)`);
    }
    if (cancelledCount > 0) {
      toast.info(`Cancelled ${cancelledCount} file(s)`);
    }
    
    // Notify parent component to refresh the list
    if (onUploadComplete && successCount > 0) {
      onUploadComplete();
    }
  };

  return (
    <Card className="items-stretch w-full mx-auto">
      <CardHeader>
        <CardTitle>New Call Upload</CardTitle>
        <CardDescription>
          Select an agent and drag and drop audio files for analysis.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Agent Selector */}
        <div className="mb-6 space-y-2">
          <Label htmlFor="agent-select" className="text-base font-medium">
            Select Agent *
          </Label>
          <Select 
            value={selectedAgent} 
            onValueChange={setSelectedAgent}
            disabled={loadingAgents || uploading}
          >
            <SelectTrigger id="agent-select" className="w-full">
              <SelectValue placeholder={loadingAgents ? "Loading agents..." : "Choose an agent..."} />
            </SelectTrigger>
            <SelectContent>
              {agents.map((agent) => (
                <SelectItem key={agent.agentId} value={agent.agentId}>
                  {agent.agentName} - {agent.position}
                </SelectItem>
              ))}
              {agents.length === 0 && !loadingAgents && (
                <div className="p-2 text-sm text-muted-foreground">
                  No active agents found
                </div>
              )}
            </SelectContent>
          </Select>
          {!selectedAgent && files.length > 0 && (
            <p className="text-sm text-orange-600">
              ⚠️ Please select an agent to continue
            </p>
          )}
        </div>

        {/* File Drop Zone */}
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-md p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors
            ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}
            ${uploading ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary/50'}`}
        >
          <input {...getInputProps()} disabled={uploading} />
          <div className="flex flex-col items-center gap-2">
            {uploading ? (
              <>
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  Uploading files... ({uploadProgress.current}/{uploadProgress.total})
                </p>
              </>
            ) : (
              <>
                <CloudUpload className="h-12 w-12 text-muted-foreground" />
                <p className="font-medium text-sm">
                  {isDragActive
                    ? "Drop your files here"
                    : "Drop your WAV/MP3 files here or click to browse"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Supported formats: WAV, MP3, M4A
                </p>
              </>
            )}
          </div>
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium">Selected files ({files.length}):</p>
            {files.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-2 bg-muted rounded-md"
              >
                <span className="text-sm truncate flex-1">{file.name}</span>
                <span className="text-xs text-muted-foreground mx-2">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeFile(index)}
                  disabled={uploading}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <div className="flex justify-end space-x-2 p-6">
        {uploading ? (
          <Button
            variant="destructive"
            onClick={cancelUpload}
          >
            <StopCircle className="w-4 h-4 mr-2" />
            Stop Upload
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              onClick={clearAll}
              disabled={uploading || files.length === 0}
            >
              Clear All
            </Button>
            <Button
              className='bg-ring hover:bg-primary-foreground text-white'
              onClick={uploadAll}
              disabled={uploading || files.length === 0 || !selectedAgent}
            >
              <CloudUpload className="w-4 h-4 mr-2" />
              Upload All
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}