// ── Auth API Contracts ────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: {
    _id: string;
    name: string;
    email: string;
    role: string;
    tier: string;
    sp: number;
  };
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  registrationToken?: string;
}

export interface RegisterResponse {
  token: string;
  user: {
    _id: string;
    name: string;
    email: string;
    role: string;
  };
}
