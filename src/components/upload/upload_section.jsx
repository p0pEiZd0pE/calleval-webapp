import React, { useCallback, useState } from 'react'
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

export default function UploadSection({ onUploadComplete }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);

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
    if (files.length === 0) return;
    
    setUploading(true);
    
    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);
      
      try {
        const response = await fetch(API_ENDPOINTS.UPLOAD, {
          method: 'POST',
          body: formData,
        });
        
        if (!response.ok) {
          throw new Error('Upload failed');
        }
        
        const result = await response.json();
        console.log('Uploaded:', result);
      } catch (error) {
        console.error('Upload error:', error);
      }
    }
    
    setUploading(false);
    setFiles([]);
    
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
          Drag and drop your audio files or browse to select for analysis.
        </CardDescription>
      </CardHeader>
      <CardContent>
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
          disabled={uploading || files.length === 0}
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