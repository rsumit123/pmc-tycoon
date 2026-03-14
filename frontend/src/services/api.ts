import axios from 'axios';

// Create axios instance with base URL
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
});

// Add request logging
api.interceptors.request.use(
  (config) => {
    console.log('API Request:', config.method?.toUpperCase(), config.url);
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Add response logging
api.interceptors.response.use(
  (response) => {
    console.log('API Response:', response.config.method?.toUpperCase(), response.config.url, response.status);
    return response;
  },
  (error) => {
    console.error('API Response Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// Request interceptor for adding auth token (if needed)
api.interceptors.request.use(
  (config) => {
    // You can add auth token here if implementing authentication
    // const token = localStorage.getItem('token');
    // if (token) {
    //   config.headers.Authorization = `Bearer ${token}`;
    // }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for handling errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export const apiService = {
  // User endpoints
  getUser: (userId: number) => api.get(`/api/user/${userId}`),
  updateUser: (userId: number, data: any) => api.put(`/api/user/${userId}`, data),
  
  // Units endpoints
  getUnitTemplates: () => api.get('/units/templates'),
  getOwnedUnits: () => api.get('/units/owned'),
  createOwnedUnit: (unitData: any) => api.post('/units/owned', unitData),
  updateOwnedUnit: (unitId: number, unitData: any) => api.put(`/units/owned/${unitId}`, unitData),
  deleteOwnedUnit: (unitId: number) => api.delete(`/units/owned/${unitId}`),
  
  // Contractors endpoints
  getContractorTemplates: () => api.get('/contractors/templates'),
  getOwnedContractors: () => api.get('/contractors/owned'),
  createOwnedContractor: (contractorData: any) => api.post('/contractors/owned', contractorData),
  updateOwnedContractor: (contractorId: number, contractorData: any) => api.put(`/contractors/owned/${contractorId}`, contractorData),
  deleteOwnedContractor: (contractorId: number) => api.delete(`/contractors/owned/${contractorId}`),
  
  // Contracts endpoints
  getMissionTemplates: () => api.get('/contracts/templates'),
  getActiveContracts: () => api.get('/contracts/active'),
  createActiveContract: (contractData: any) => api.post('/contracts/active', contractData),
  updateActiveContract: (contractId: number, contractData: any) => api.put(`/contracts/active/${contractId}`, contractData),
  deleteActiveContract: (contractId: number) => api.delete(`/contracts/active/${contractId}`),
  getMissionLogs: () => api.get('/contracts/logs'),
  createMissionLog: (logData: any) => api.post('/contracts/logs', logData),
  
  // Simulation endpoints (legacy)
  runMissionSimulation: (contractId: number) => api.post(`/simulation/run-mission/${contractId}`),
  getMissionHistory: (userId: number) => api.get(`/simulation/mission-history/${userId}`),

  // Hardware catalog
  getAircraft: () => api.get('/aircraft/'),
  getWeapons: (type?: string) => api.get('/weapons/', { params: type ? { type } : {} }),
  getShips: () => api.get('/ships/'),

  // Battle system
  startBattle: (data: any) => api.post('/battle/start', data),
  submitLoadout: (battleId: number, data: any) => api.post(`/battle/${battleId}/loadout`, data),
  getBattleState: (battleId: number) => api.get(`/battle/${battleId}/state`),
  submitChoice: (battleId: number, choice: string) => api.post(`/battle/${battleId}/choose`, { choice }),
  getBattleReport: (battleId: number) => api.get(`/battle/${battleId}/report`),
};

export default apiService;