// API Configuration
// Automatically uses environment variables for different environments

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const API_ENDPOINTS = {
  // Upload
  UPLOAD: `${API_URL}/api/upload`,
  
  // Calls
  CALLS: `${API_URL}/api/calls`,
  CALL_DETAIL: (id) => `${API_URL}/api/calls/${id}`,
  DELETE_CALL: (id) => `${API_URL}/api/calls/${id}`,
  
  // Audio
  AUDIO: (id) => `${API_URL}/api/audio/${id}`,
  TEMP_AUDIO: (id) => `${API_URL}/api/temp-audio/${id}`,

  // Agents
  AGENTS: `${API_URL}/api/agents`,
  AGENT_DETAIL: (id) => `${API_URL}/api/agents/${id}`,
  AGENT_CALLS: (id) => `${API_URL}/api/agents/${id}/calls`,  // NEW
  AGENT_STATS: `${API_URL}/api/agents/stats/summary`,
  
  // Health check
  ROOT: `${API_URL}/`,
};

// Export the base URL in case it's needed
export { API_URL };