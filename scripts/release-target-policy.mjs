export const RELEASE_TARGET_PROFILES = Object.freeze({
  production: Object.freeze({
    name: 'production',
    firebaseProject: 'orbit-9e0b6',
    vercelEnvironment: 'production',
    stableHostname: 'threadmap.app',
    mcpOrigin: 'https://threadmap.app',
  }),
  staging: Object.freeze({
    name: 'staging',
    firebaseProject: 'threadmap-staging-9e0b6',
    vercelEnvironment: 'preview',
    stableHostname: 'staging.threadmap.app',
    mcpOrigin: null,
  }),
});

const TRUSTED_VERCEL_DEPLOYMENT_HOST = /^orbit-[a-z0-9-]+-mateos-projects-c394726f\.vercel\.app$/;

export function resolveReleaseTargetProfile(rawName = 'production') {
  const name = rawName.trim().toLowerCase();
  const profile = RELEASE_TARGET_PROFILES[name];
  if (!profile) {
    throw new Error('--environment must be exactly production or staging');
  }
  return profile;
}

export function resolveAllowedReleaseOrigin(rawUrl, profile) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('the release target must be a valid URL');
  }
  if (parsed.protocol !== 'https:') throw new Error('the release target must use HTTPS');
  if (parsed.username || parsed.password || parsed.search || parsed.hash
      || (parsed.pathname !== '' && parsed.pathname !== '/')) {
    throw new Error('the release target must be a bare HTTPS origin');
  }
  if (parsed.hostname !== profile.stableHostname
      && !TRUSTED_VERCEL_DEPLOYMENT_HOST.test(parsed.hostname)) {
    throw new Error(`the release target is not an approved ${profile.name} hostname`);
  }
  return parsed.origin;
}

export function resolveExpectedMcpOrigin(profile, targetOrigin) {
  return profile.mcpOrigin || targetOrigin;
}
