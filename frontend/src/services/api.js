import axios from 'axios';

const api = axios.create({
  // Use Vite proxy in dev (`vite.config.js`) and relative paths in production.
  // Optionally override via `VITE_API_BASE_URL` (e.g. "http://localhost:5001/api").
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  headers: {
    "Content-Type": "application/json",
  },
});


// Add token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle response errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const loggingOut = localStorage.getItem('loggingOut');
    const isAuthRequest =
      error.config?.url?.includes('/auth/login') ||
      error.config?.url?.includes('/auth/register');
    // Don't redirect on 401 from login/register (stay on page and show error) or when logging out
    if (error.response?.status === 401 && !loggingOut && !isAuthRequest) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  sendSignupOtp: (email) => api.post('/auth/send-signup-otp', { email }),
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),
  deleteAccount: (deleteData) => api.post('/auth/delete-account', { deleteData: !!deleteData }),
  forgotPassword: (data) => api.post('/auth/forgot-password', data),
  resendResetOtp: (data) => api.post('/auth/resend-reset-otp', data),
  verifyResetOtp: (data) => api.post('/auth/verify-reset-otp', data),
  resetPassword: (data) => api.post('/auth/reset-password', data),
};

// Groups API
export const groupsAPI = {
  getAll: () => api.get('/groups'),
  getOne: (id) => api.get(`/groups/${id}`),
  create: (data) => api.post('/groups', data),
  update: (id, data) => api.put(`/groups/${id}`, data),
  delete: (id) => api.delete(`/groups/${id}`),
  addMembers: (id, memberIds) => api.put(`/groups/${id}/members`, { memberIds }),
  removeMember: (id, memberId) => api.delete(`/groups/${id}/members/${memberId}`),
  getInvites: (groupId) => api.get(`/groups/${groupId}/invites`),
  invite: (id, data) => api.post(`/groups/${id}/invite`, data),
  inviteMemberByEmail: (groupId, email, message) =>
    api.post('/groups/invite-member', { groupId, email, message }),
  joinByToken: (token) => api.get(`/groups/join/${token}`),
};

// Invite API (public get by token; accept with optional auth)
export const inviteAPI = {
  getByToken: (token) => api.get('/invite', { params: { token } }),
  accept: (token) => api.post('/invite/accept', { token }),
  resend: (inviteId) => api.post(`/invite/${inviteId}/resend`),
  cancel: (inviteId) => api.delete(`/invite/${inviteId}`),
};

// Expenses API
export const expensesAPI = {
  getAll: () => api.get('/expenses'),
  getByGroup: (groupId) => api.get(`/expenses/group/${groupId}`),
  getOne: (id) => api.get(`/expenses/${id}`),
  create: (data) => api.post('/expenses', data),
  update: (id, data) => api.put(`/expenses/${id}`, data),
  delete: (id) => api.delete(`/expenses/${id}`),
};

// Balances API
export const balancesAPI = {
  getSummary: () => api.get('/balances/summary'),
  getByGroup: (groupId) => api.get(`/balances/group/${groupId}`),
};

// Settlements API
export const settlementsAPI = {
  getByGroup: (groupId) => api.get(`/settlements/group/${groupId}`),
  getSuggestions: (groupId) => api.get(`/settlements/group/${groupId}/suggestions`),
  create: (data) => api.post('/settlements', data),
  update: (id, data) => api.put(`/settlements/${id}`, data),
};

// Payments API
export const paymentsAPI = {
  createOrder: (data) => api.post('/payments/create-order', data),
  verify: (data) => api.post('/payments/verify', data),
  getHistory: () => api.get('/payments/history'),
};

export default api;

