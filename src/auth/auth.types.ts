import type { Request } from 'express';

export const PAPEIS = ['aluno', 'professor', 'admin'] as const;
export type Papel = (typeof PAPEIS)[number];

// Formato que sai da API. Não tem senha_hash nem celular.
export interface UsuarioPublico {
  id: number;
  nome: string;
  email: string;
  papel: Papel;
  professor_reino_id: number | null;
}

// Payload do access token. sub é string porque a RFC 7519 define assim.
export interface AccessTokenPayload {
  sub: string;
  papel: Papel;
}

export interface UsuarioAutenticado {
  id: number;
  papel: Papel;
}

export type RequestAutenticada = Request & { usuario: UsuarioAutenticado };
