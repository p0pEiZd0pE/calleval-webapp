import { API_URL } from '@/config/api';

/**
 * Get auth headers with JWT token
 */
export function getAuthHeaders() {
  const token = localStorage.getItem('auth_token');
  const headers = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return headers;
}

/**
 * Wrapper for fetch that includes authentication token
 * Automatically redirects to login if unauthorized (401)
 */
export async function authenticatedFetch(url, options = {}) {
  const token = localStorage.getItem('auth_token');
  
  // ✓ Only add Content-Type for non-FormData requests
  const headers = {
    ...options.headers,
  };
  
  // Don't set Content-Type for FormData - browser will set it with boundary
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(url, {
    ...options,
    headers,
  });
  
  // If unauthorized, clear token and redirect to login
  if (response.status === 401) {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  
  return response;
}

/**
 * GET request with authentication
 */
export async function apiGet(endpoint) {
  const response = await authenticatedFetch(`${API_URL}${endpoint}`);
  return response.json();
}

/**
 * POST request with authentication
 */
export async function apiPost(endpoint, data) {
  const response = await authenticatedFetch(`${API_URL}${endpoint}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.json();
}

/**
 * PUT request with authentication
 */
export async function apiPut(endpoint, data) {
  const response = await authenticatedFetch(`${API_URL}${endpoint}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return response.json();
}

/**
 * DELETE request with authentication
 */
export async function apiDelete(endpoint) {
  const response = await authenticatedFetch(`${API_URL}${endpoint}`, {
    method: 'DELETE',
  });
  return response.json();
}

/**
 * Upload file with authentication
 */
export async function apiUploadFile(endpoint, formData) {
  const token = localStorage.getItem('auth_token');
  
  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: 'POST',
    headers,
    body: formData, // Don't set Content-Type, browser will set it with boundary
  });
  
  if (response.status === 401) {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  
  return response.json();
}
