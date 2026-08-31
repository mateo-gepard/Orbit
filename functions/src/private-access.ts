export const THREADMAP_OWNER_CLAIM = 'threadmapOwner';

type PrivateAccessEnvironment = Record<string, string | undefined>;
type AuthToken = Record<string, unknown> | undefined;

export function privateModeEnabled(
  environment: PrivateAccessEnvironment = process.env,
): boolean {
  return environment.THREADMAP_PRIVATE_MODE === 'true';
}

export function privateOwnerAuthorized(
  token: AuthToken,
  environment: PrivateAccessEnvironment = process.env,
): boolean {
  return !privateModeEnabled(environment) || token?.[THREADMAP_OWNER_CLAIM] === true;
}
