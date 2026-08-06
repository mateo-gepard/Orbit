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
