'use client';

import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from './firebase';

export interface ThreadmapMcpAuthorizationRequest {
  clientId: string;
  clientName: string;
  platform: string;
  scopes: string[];
  resource: string;
  createdAt: number;
  expiresAt: number;
}

export interface ThreadmapMcpAuthorizationDecision {
  location: string;
}

export interface ThreadmapMcpClient {
  clientId: string;
  clientName: string;
  platform: string;
  redirectUris: string[];
  tokenEndpointAuthMethod: 'none' | 'client_secret_basic' | 'client_secret_post';
  grantTypes: string[];
  responseTypes: ['code'];
  scopes: string[];
  resource: string;
  createdAt: number;
  updatedAt: number;
  revokedAt?: number;
  status: 'active' | 'revoked';
  revocationReason?: string;
}

export interface ThreadmapMcpTokenFamily {
  tokenFamilyId: string;
  clientId: string;
  userId: string;
  resource: string;
  status: 'active' | 'revoked';
  createdAt: number;
  expiresAt: number;
  latestSequence: number;
  lastRotatedAt?: number;
  revokedAt?: number;
  revocationReason?: string;
}

async function callMcpFunction<TData>(name: string, data: unknown): Promise<TData> {
  if (!cloudFunctions) throw new Error('Cloud Functions are unavailable.');
  const callable = httpsCallable<unknown, TData>(cloudFunctions, name);
  const result = await callable(data);
  return result.data;
}

export async function getThreadmapMcpAuthorizationRequest(
  requestToken: string,
): Promise<ThreadmapMcpAuthorizationRequest> {
  if (!requestToken.trim()) {
    throw new Error('The authorization request token is missing.');
  }
  return callMcpFunction<ThreadmapMcpAuthorizationRequest>(
    'getThreadmapMcpAuthorizationRequest',
    { request: requestToken.trim() },
  );
}

export async function approveThreadmapMcpAuthorizationRequest(
  requestToken: string,
  approvedScopes: string[],
): Promise<ThreadmapMcpAuthorizationDecision> {
  if (!requestToken.trim()) {
    throw new Error('The authorization request token is missing.');
  }
  return callMcpFunction<ThreadmapMcpAuthorizationDecision>(
    'approveThreadmapMcpAuthorizationRequest',
    {
      request: requestToken.trim(),
      approvedScopes,
    },
  );
}

export async function denyThreadmapMcpAuthorizationRequest(
  requestToken: string,
): Promise<ThreadmapMcpAuthorizationDecision> {
  if (!requestToken.trim()) {
    throw new Error('The authorization request token is missing.');
  }
  return callMcpFunction<ThreadmapMcpAuthorizationDecision>(
    'denyThreadmapMcpAuthorizationRequest',
    { request: requestToken.trim() },
  );
}

export async function listThreadmapMcpClients(includeRevoked = false): Promise<ThreadmapMcpClient[]> {
  const result = await callMcpFunction<{ clients: ThreadmapMcpClient[] }>(
    'listThreadmapMcpClients',
    { includeRevoked },
  );
  return result.clients;
}

export async function listThreadmapMcpTokenFamilies(
  clientId?: string,
  includeRevoked = false,
): Promise<ThreadmapMcpTokenFamily[]> {
  const normalizedClientId = clientId?.trim();
  const request = normalizedClientId ? { clientId: normalizedClientId, includeRevoked } : { includeRevoked };
  const result = await callMcpFunction<{ tokenFamilies: ThreadmapMcpTokenFamily[] }>(
    'listThreadmapMcpTokenFamilies',
    request,
  );
  return result.tokenFamilies;
}

export async function revokeThreadmapMcpClient(
  clientId: string,
): Promise<boolean> {
  if (!clientId.trim()) {
    throw new Error('The client ID is missing.');
  }
  const result = await callMcpFunction<{ success: boolean }>(
    'revokeThreadmapMcpClient',
    { clientId: clientId.trim() },
  );
  return result.success;
}

export async function revokeThreadmapMcpTokenFamily(
  tokenFamilyId: string,
): Promise<boolean> {
  if (!tokenFamilyId.trim()) {
    throw new Error('The session token family ID is missing.');
  }
  const result = await callMcpFunction<{ success: boolean }>(
    'revokeThreadmapMcpTokenFamily',
    { tokenFamilyId: tokenFamilyId.trim() },
  );
  return result.success;
}
