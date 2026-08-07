import {
  normalizeScopes,
  safeHeaderValue,
  validateHttpsUrl,
  validateResourceIdentifier,
} from './security';

export type SupportedClientAuthenticationMethod =
  | 'none'
  | 'client_secret_basic'
  | 'client_secret_post';

export interface OAuthEndpointConfiguration {
  issuer: string;
  resource: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint: string;
  revocationEndpoint: string;
  protectedResourceMetadataUrl: string;
  scopesSupported: readonly string[];
  resourceName?: string;
  resourceDocumentation?: string;
  serviceDocumentation?: string;
  clientAuthenticationMethods?: readonly SupportedClientAuthenticationMethod[];
}

export interface AuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  revocation_endpoint: string;
  response_types_supported: ['code'];
  response_modes_supported: ['query'];
  grant_types_supported: ['authorization_code', 'refresh_token'];
  code_challenge_methods_supported: ['S256'];
  token_endpoint_auth_methods_supported: SupportedClientAuthenticationMethod[];
  revocation_endpoint_auth_methods_supported: SupportedClientAuthenticationMethod[];
  scopes_supported: string[];
  client_id_metadata_document_supported: false;
  service_documentation?: string;
}

export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: [string];
  scopes_supported: string[];
  bearer_methods_supported: ['header'];
  resource_name?: string;
  resource_documentation?: string;
}

const DEFAULT_CLIENT_AUTH_METHODS: readonly SupportedClientAuthenticationMethod[] = [
  'none',
  'client_secret_basic',
  'client_secret_post',
];

function validateEndpoint(value: string, label: string, issuerOrigin: string): void {
  const endpoint = validateHttpsUrl(value, label, { allowPath: true, allowQuery: false });
  if (endpoint.origin !== issuerOrigin) {
    throw new Error(`${label} must use the authorization server issuer origin.`);
  }
}

export function validateOAuthEndpointConfiguration(
  configuration: OAuthEndpointConfiguration
): OAuthEndpointConfiguration {
  const issuer = validateHttpsUrl(configuration.issuer, 'issuer', {
    allowPath: true,
    allowQuery: false,
  });
  validateResourceIdentifier(configuration.resource);
  validateEndpoint(configuration.authorizationEndpoint, 'authorizationEndpoint', issuer.origin);
  validateEndpoint(configuration.tokenEndpoint, 'tokenEndpoint', issuer.origin);
  validateEndpoint(configuration.registrationEndpoint, 'registrationEndpoint', issuer.origin);
  validateEndpoint(configuration.revocationEndpoint, 'revocationEndpoint', issuer.origin);
  validateEndpoint(
    configuration.protectedResourceMetadataUrl,
    'protectedResourceMetadataUrl',
    new URL(configuration.resource).origin
  );

  if (configuration.resourceDocumentation) {
    validateHttpsUrl(configuration.resourceDocumentation, 'resourceDocumentation', {
      allowPath: true,
      allowQuery: false,
    });
  }
  if (configuration.serviceDocumentation) {
    validateHttpsUrl(configuration.serviceDocumentation, 'serviceDocumentation', {
      allowPath: true,
      allowQuery: false,
    });
  }

  const scopes = normalizeScopes(configuration.scopesSupported);
  if (scopes.length < 1) throw new Error('scopesSupported must not be empty.');

  const methods = configuration.clientAuthenticationMethods || DEFAULT_CLIENT_AUTH_METHODS;
  if (methods.length < 1 || new Set(methods).size !== methods.length
      || methods.some((method) => !DEFAULT_CLIENT_AUTH_METHODS.includes(method))) {
    throw new Error('clientAuthenticationMethods contains an unsupported value.');
  }
  return configuration;
}

export function createAuthorizationServerMetadata(
  configuration: OAuthEndpointConfiguration
): AuthorizationServerMetadata {
  validateOAuthEndpointConfiguration(configuration);
  const methods = [
    ...(configuration.clientAuthenticationMethods || DEFAULT_CLIENT_AUTH_METHODS),
  ];
  return {
    issuer: configuration.issuer,
    authorization_endpoint: configuration.authorizationEndpoint,
    token_endpoint: configuration.tokenEndpoint,
    registration_endpoint: configuration.registrationEndpoint,
    revocation_endpoint: configuration.revocationEndpoint,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: methods,
    revocation_endpoint_auth_methods_supported: [...methods],
    scopes_supported: normalizeScopes(configuration.scopesSupported),
    client_id_metadata_document_supported: false,
    ...(configuration.serviceDocumentation
      ? { service_documentation: configuration.serviceDocumentation }
      : {}),
  };
}

export function createProtectedResourceMetadata(
  configuration: OAuthEndpointConfiguration
): ProtectedResourceMetadata {
  validateOAuthEndpointConfiguration(configuration);
  return {
    resource: configuration.resource,
    authorization_servers: [configuration.issuer],
    scopes_supported: normalizeScopes(configuration.scopesSupported),
    bearer_methods_supported: ['header'],
    ...(configuration.resourceName ? { resource_name: configuration.resourceName } : {}),
    ...(configuration.resourceDocumentation
      ? { resource_documentation: configuration.resourceDocumentation }
      : {}),
  };
}

export interface BearerChallengeOptions {
  scope?: string | readonly string[];
  error?: 'invalid_request' | 'invalid_token' | 'insufficient_scope';
  errorDescription?: string;
}

export function createBearerChallenge(
  protectedResourceMetadataUrl: string,
  options: BearerChallengeOptions = {}
): string {
  validateHttpsUrl(protectedResourceMetadataUrl, 'protectedResourceMetadataUrl', {
    allowPath: true,
    allowQuery: false,
  });
  const parts = [`resource_metadata="${protectedResourceMetadataUrl}"`];
  if (options.scope) {
    const scope = normalizeScopes(options.scope).join(' ');
    if (scope) parts.push(`scope="${safeHeaderValue(scope)}"`);
  }
  if (options.error) parts.push(`error="${options.error}"`);
  if (options.errorDescription) {
    parts.push(`error_description="${safeHeaderValue(options.errorDescription)}"`);
  }
  return `Bearer ${parts.join(', ')}`;
}

export const OAUTH_JSON_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
  'Content-Type': 'application/json; charset=utf-8',
});
