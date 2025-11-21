import React, { useCallback, useState, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CloudUpload, X, Loader2 } from "lucide-react";
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
import { authenticatedFetch } from '@/lib/api';

export default function UploadSection({ onUploadComplete }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [loadingAgents, setLoadingAgents] = useState(true);

  // Fetch agents on component mount
  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      setLoadingAgents(true);
      const response = await authenticatedFetch(API_ENDPOINTS.AGENTS);
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
    let successCount = 0;
    let errorCount = 0;
    
    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('agent_id', selectedAgent);

      // Add authentication header manually (can't use authenticatedFetch for file uploads)
      const token = localStorage.getItem('auth_token');
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      try {
        const response = await authenticatedFetch(API_ENDPOINTS.UPLOAD, {
          method: 'POST',
          headers,  // Add auth header
          body: formData,
        });

        if (response.status === 401) {
          localStorage.removeItem('auth_token');
          localStorage.removeItem('auth');
          localStorage.removeItem('user');
          window.location.href = '/login';
          throw new Error('Unauthorized');
        }
        
        if (!response.ok) {
          throw new Error('Upload failed');
        }
        
        const result = await response.json();
        console.log('Uploaded:', result);
        successCount++;
      } catch (error) {
        console.error('Upload error:', error);
        errorCount++;
      }
    }
    
    setUploading(false);
    setFiles([]);
    
    // Show results
    if (successCount > 0) {
      toast.success(`Successfully uploaded ${successCount} file(s)`);
    }
    if (errorCount > 0) {
      toast.error(`Failed to upload ${errorCount} file(s)`);
    }
    
    // Notify parent component to refresh the list
    if (onUploadComplete) {
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
                <p className="text-sm text-muted-foreground">Uploading files...</p>
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
          {uploading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <CloudUpload className="w-4 h-4 mr-2" />
              Upload All
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}