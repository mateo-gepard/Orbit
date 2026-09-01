#!/usr/bin/env node

import fs from 'node:fs';
import nextEnv from '@next/env';

const { loadEnvConfig } = nextEnv;
const contractMode = process.argv.includes('--contract');

const requiredProductionEnvironment = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
  'NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY',
  'NEXT_PUBLIC_FIREBASE_VAPID_KEY',
  'NEXT_PUBLIC_THREADMAP_PRIVATE_MODE',
  'THREADMAP_DEPLOYMENT_MODE',
  'SCRAPE_RATE_LIMIT_SHARED_SECRET',
  'LEGAL_CONTACT_EMAIL',
  'SECURITY_CONTACT_EMAIL',
];
const publicLegalEnvironment = ['LEGAL_ENTITY_NAME', 'LEGAL_POSTAL_ADDRESS'];

function read(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function fail(title, findings) {
  console.error(title);
  for (const finding of findings) console.error(`  ${finding}`);
  process.exit(1);
}

function checkContract() {
  const findings = [];
  const rootExamples = `${read('.env.example')}\n${read('.env.local.example')}`;
  const functionExample = read('functions/.env.example');
  const authEmailSource = read('functions/src/auth-email.ts');
  const nextConfigSource = read('next.config.ts');
  const packageManifest = JSON.parse(read('package.json') || '{}');
  const functionsManifest = JSON.parse(read('functions/package.json') || '{}');
  const webManifest = JSON.parse(read('public/manifest.json') || '{}');
  const firebaseAliases = JSON.parse(read('.firebaserc') || '{}');
  const vercelConfig = JSON.parse(read('vercel.json') || '{}');
  const productionCors = JSON.parse(read('storage-cors.json') || '[]');
  const stagingCors = JSON.parse(read('storage-cors.staging.json') || '[]');
  const storageCorsScript = read('scripts/setup-storage-cors.sh');
  const firebaseSetupScript = read('scripts/setup-firebase.sh');
  const playwrightConfig = read('playwright.config.ts');
  const browserSmoke = read('e2e/cold-load.spec.ts');
  const pwaClient = read('src/lib/pwa.ts');
  const pwaProvider = read('src/components/providers/pwa-provider.tsx');
  const serviceWorkerRoute = read('src/app/sw.js/route.ts');
  const healthRoute = read('src/app/api/health/route.ts');
  const serviceWorkerTemplate = read('src/service-worker/worker.js.template');
  const calendarClient = read('src/lib/google-calendar.ts');
  const mcpSettings = read('src/components/settings/mcp-settings.tsx');
  const mcpSetup = read('MCP_SETUP.md');
  const wishlistPage = read('src/app/tools/wishlist/page.tsx');
  const privacyNotice = read('src/app/privacy/page.tsx');
  const gitignore = read('.gitignore');
  const releaseWorkflow = read('.github/workflows/release.yml');
  const releaseVerifier = read('scripts/verify-release-target.mjs');
  const releaseShaReader = read('scripts/read-release-sha.mjs');
  const readinessDocument = read('PRODUCTION_READINESS.md');
  const readinessScript = read('scripts/check-production-readiness.mjs');
  const functionsIndex = read('functions/src/index.ts');
  const uploadCleanupPolicy = read('functions/src/upload-cleanup-policy.ts');

  for (const name of [...requiredProductionEnvironment, ...publicLegalEnvironment]) {
    if (!rootExamples.includes(`${name}=`)) findings.push(`environment examples do not declare ${name}`);
  }
  for (const name of [
    'ENFORCE_APP_CHECK',
    'THREADMAP_PRIVATE_MODE',
    'MCP_ORIGIN',
    'MCP_ALLOW_LOOPBACK_REDIRECTS',
    'MCP_DYNAMIC_CLIENT_SCOPES',
    'GOOGLE_WORKSPACE_CLIENT_ID',
    'MCP_EXTRA_REDIRECT_URIS',
    'THREADMAP_APP_ORIGIN',
    'AUTH_EMAIL_FIREBASE_ACTION_HOSTS',
  ]) {
    if (!functionExample.includes(`${name}=`)) findings.push(`functions/.env.example does not declare ${name}`);
  }
  if (!read('firestore.rules').includes('request.auth.token.threadmapOwner == true')) {
    findings.push('Firestore Rules must require the private owner claim');
  }
  if (!read('storage.rules').includes('request.auth.token.threadmapOwner == true')) {
    findings.push('Storage Rules must require the private owner claim');
  }
  if (!functionsIndex.includes('privateOwnerAuthorized')) {
    findings.push('Functions must enforce the private owner claim');
  }
  for (const secretName of ['RESEND_API_KEY', 'AUTH_EMAIL_HMAC_KEY']) {
    if (!functionExample.includes(`# ${secretName}=`)) {
      findings.push(`functions/.env.example must document Secret Manager prerequisite ${secretName}`);
    }
  }
  if (!functionExample.includes('MCP_DYNAMIC_CLIENT_SCOPES=threadmap.read workspace.read offline_access')) {
    findings.push('functions/.env.example must use the read-only Threadmap, Workspace, and offline scopes');
  }
  if (!functionExample.includes('MCP_ORIGIN=https://staging.threadmap.app')) {
    findings.push('functions/.env.example must keep the safe staging MCP origin');
  }
  for (const marker of [
    'THREADMAP_APP_ORIGIN=https://staging.threadmap.app',
    'AUTH_EMAIL_FIREBASE_ACTION_HOSTS=threadmap-staging-9e0b6.firebaseapp.com,threadmap-staging-9e0b6.web.app',
  ]) {
    if (!functionExample.includes(marker)) {
      findings.push(`functions/.env.example is missing staging auth-email boundary ${marker}`);
    }
  }
  for (const marker of [
    'resolveAuthEmailBrandingConfig',
    'resolveThreadmapAppOrigin',
    'Boolean(configuredOrigin) !== Boolean(configuredHosts)',
    'environment.GCLOUD_PROJECT',
    'environment.GOOGLE_CLOUD_PROJECT',
    'environment.GCP_PROJECT',
    'projectId !== PRODUCTION_PROJECT_ID',
    'config.firebaseActionHosts.has',
  ]) {
    if (!authEmailSource.includes(marker)) {
      findings.push(`functions/src/auth-email.ts is missing environment-isolation marker ${marker}`);
    }
  }
  for (const marker of [
    'configuredAppOrigin = resolveThreadmapAppOrigin()',
    'attachmentUploadOriginAllowed(',
    "process.env.FUNCTIONS_EMULATOR === 'true'",
  ]) {
    if (!functionsIndex.includes(marker)) {
      findings.push(`functions/src/index.ts is missing attachment-origin boundary marker ${marker}`);
    }
  }
  for (const marker of [
    'if (requestOrigin === appOrigin) return true',
    'if (!emulator) return false',
    "requestOrigin === 'http://localhost:3000'",
    "requestOrigin === 'http://127.0.0.1:3000'",
  ]) {
    if (!uploadCleanupPolicy.includes(marker)) {
      findings.push(`attachment upload origin policy is missing marker ${marker}`);
    }
  }
  if (firebaseAliases.projects?.default !== 'threadmap-staging-9e0b6') {
    findings.push('.firebaserc default must be the staging project');
  }
  if (firebaseAliases.projects?.production !== 'orbit-9e0b6') {
    findings.push('.firebaserc must expose orbit-9e0b6 only through the production alias');
  }
  if (JSON.stringify(vercelConfig.regions) !== JSON.stringify(['fra1'])) {
    findings.push('vercel.json must configure Vercel Functions for fra1');
  }
  for (const marker of [
    'resolveDeploymentFirebaseProject',
    'const deploymentFirebaseProjectId = resolveDeploymentFirebaseProject()',
    'mcpFunctionOrigin = `https://${FIREBASE_FUNCTIONS_REGION}-${deploymentFirebaseProjectId}',
    'createFirebaseAuthRewrite(deploymentFirebaseProjectId)',
    'destination: `https://${projectId}.firebaseapp.com/__/auth/:path*`',
  ]) {
    if (!nextConfigSource.includes(marker)) {
      findings.push(`next.config.ts is missing environment-aligned Firebase routing marker ${marker}`);
    }
  }
  for (const marker of [
    '"frame-ancestors \'none\'"',
    '{ key: "X-Frame-Options", value: "DENY" }',
  ]) {
    if (!nextConfigSource.includes(marker)) {
      findings.push(`next.config.ts is missing clickjacking protection marker ${marker}`);
    }
  }
  if (nextConfigSource.includes("frame-ancestors 'self'")
      || nextConfigSource.includes('{ key: "X-Frame-Options", value: "SAMEORIGIN" }')) {
    findings.push('Threadmap pages must not permit same-origin framing');
  }
  const privateRouteBlock = nextConfigSource.match(
    /const privateRoutePrefixes = \[([\s\S]*?)\] as const;/,
  )?.[1] || '';
  for (const prefix of [
    'archive', 'areas', 'briefing', 'calendar', 'files', 'goals', 'habits', 'integrations',
    'notes', 'projects', 'settings', 'tasks', 'today', 'toolbox', 'tools',
  ]) {
    if (!new RegExp(`^[\\s]*["']${prefix}["'],?$`, 'm').test(privateRouteBlock)) {
      findings.push(`next.config.ts private-route indexing policy is missing ${prefix}`);
    }
  }
  for (const publicRoute of ['about', 'privacy', 'security', 'terms']) {
    if (new RegExp(`^[\\s]*["']${publicRoute}["'],?$`, 'm').test(privateRouteBlock)) {
      findings.push(`public route ${publicRoute} must not inherit the private noindex header`);
    }
  }
  for (const marker of [
    '{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }',
    '...privateRoutePrefixes.map((prefix)',
    'source: `/${prefix}/:path*`',
  ]) {
    if (!nextConfigSource.includes(marker)) {
      findings.push(`next.config.ts is missing private-route noindex marker ${marker}`);
    }
  }
  for (const marker of [
    "parsed.hostname === 'threadmap.app'",
    'isTrustedVercelTarget && process.env.VERCEL_AUTOMATION_BYPASS_SECRET',
    "redirect: 'manual'",
  ]) {
    if (!releaseShaReader.includes(marker)) {
      findings.push(`scripts/read-release-sha.mjs is missing protected-target marker ${marker}`);
    }
  }
  if (nextConfigSource.includes('destination: "https://orbit-9e0b6.firebaseapp.com/__/auth/:path*"')) {
    findings.push('Firebase auth rewrite must not be hard-coded to production for preview/staging artifacts');
  }
  if (vercelConfig.git?.deploymentEnabled?.main !== false) {
    findings.push('vercel.json must disable automatic main-branch promotion');
  }
  const releaseIdentityOrder = [
    'process.env.THREADMAP_BUILD_SHA',
    'process.env.VERCEL_GIT_COMMIT_SHA',
    'process.env.GITHUB_SHA',
  ].map((marker) => nextConfigSource.indexOf(marker));
  if (releaseIdentityOrder.some((index) => index < 0)
      || releaseIdentityOrder.some((index, position) =>
        position > 0 && index < releaseIdentityOrder[position - 1])) {
    findings.push('next.config.ts must prioritize the explicit candidate SHA over ambient provider SHA values');
  }
  const healthShaSource = healthRoute.slice(
    healthRoute.indexOf('const sha = firstValue'),
    healthRoute.indexOf(']) || EMBEDDED_RELEASE'),
  );
  const healthIdentityOrder = [
    "'THREADMAP_BUILD_SHA'",
    "'NEXT_PUBLIC_THREADMAP_RELEASE'",
    "'VERCEL_GIT_COMMIT_SHA'",
    "'GITHUB_SHA'",
  ].map((marker) => healthShaSource.indexOf(marker));
  if (healthIdentityOrder.some((index) => index < 0)
      || healthIdentityOrder.some((index, position) =>
        position > 0 && index < healthIdentityOrder[position - 1])) {
    findings.push('health route must prioritize the explicit candidate SHA over embedded/provider SHA values');
  }
  for (const script of [
    'deploy:rules:production',
    'deploy:functions:production',
    'deploy:firebase:production',
  ]) {
    const command = packageManifest.scripts?.[script] || '';
    if (!command.includes('guarded-firebase-deploy.mjs') || !command.includes('orbit-9e0b6')) {
      findings.push(`${script} must use the guarded deploy wrapper and an explicit production project`);
    }
  }
  if (packageManifest.packageManager !== 'npm@11.5.1') {
    findings.push('packageManager must pin npm@11.5.1');
  }
  if (packageManifest.version !== '0.1.0' || webManifest.version !== packageManifest.version) {
    findings.push('package.json and public/manifest.json must share product version 0.1.0');
  }
  if (packageManifest.devDependencies?.['@playwright/test'] !== '1.57.0') {
    findings.push('@playwright/test must be directly pinned to 1.57.0');
  }
  if (packageManifest.devDependencies?.['axe-core'] !== '4.11.1') {
    findings.push('axe-core must be directly pinned to 4.11.1');
  }
  for (const marker of [
    '`${productionProject}.firebaseapp.com`',
    '`${productionProject}.firebasestorage.app`',
    'appId.startsWith(`1:${senderId}:web:`)',
  ]) {
    if (!readinessScript.includes(marker)) {
      findings.push(`production preflight is missing Firebase plane-consistency marker ${marker}`);
    }
  }
  const functionsProductionDeploy = functionsManifest.scripts?.['deploy:production'] || '';
  if (!functionsProductionDeploy.includes('guarded-firebase-deploy.mjs')
      || !functionsProductionDeploy.includes('orbit-9e0b6')) {
    findings.push('functions deploy:production must use the guarded explicit production project');
  }
  const functionsStagingDeploy = functionsManifest.scripts?.['deploy:staging'] || '';
  if (!functionsStagingDeploy.includes('--project threadmap-staging-9e0b6')) {
    findings.push('functions deploy:staging must name the staging project explicitly');
  }

  for (const workflowName of fs.readdirSync('.github/workflows')) {
    if (!/\.ya?ml$/.test(workflowName)) continue;
    const workflow = read(`.github/workflows/${workflowName}`);
    for (const match of workflow.matchAll(/\buses:\s*[^\s@]+@([^\s#]+)/g)) {
      if (!/^[0-9a-f]{40}$/.test(match[1])) {
        findings.push(`.github/workflows/${workflowName} has an action not pinned to a full SHA: ${match[0]}`);
      }
    }
  }

  const productionCorsRule = productionCors[0] || {};
  const stagingCorsRule = stagingCors[0] || {};
  if (JSON.stringify(productionCorsRule.origin) !== JSON.stringify([
    'https://threadmap.app',
    'https://www.threadmap.app',
  ])) {
    findings.push('storage-cors.json must contain only the two approved production origins');
  }
  if ((stagingCorsRule.origin || []).some((origin) => /^https:\/\/(?:www\.)?threadmap\.app$/.test(origin))) {
    findings.push('storage-cors.staging.json must not duplicate production origins');
  }
  const stagingCorsOrigins = new Set(
    (stagingCorsRule.origin || []).filter((origin) => typeof origin === 'string'),
  );
  if (!stagingCorsOrigins.has(new URL('https://staging.threadmap.app').origin)) {
    findings.push('storage-cors.staging.json must include the configured stable staging origin');
  }
  for (const [file, rule] of [
    ['storage-cors.json', productionCorsRule],
    ['storage-cors.staging.json', stagingCorsRule],
  ]) {
    for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'DELETE']) {
      if (!rule.method?.includes(method)) findings.push(`${file} is missing ${method}`);
    }
    const unsupportedMethods = (rule.method || [])
      .filter((method) => !['GET', 'HEAD', 'POST', 'PUT', 'DELETE'].includes(method));
    if (unsupportedMethods.length) {
      findings.push(`${file} has unsupported methods: ${unsupportedMethods.join(', ')}`);
    }
    for (const header of [
      'Authorization',
      'Content-Type',
      'Content-Range',
      'Range',
      'x-goog-resumable',
      'x-goog-meta-threadmapuploadid',
    ]) {
      if (!rule.responseHeader?.includes(header)) findings.push(`${file} is missing ${header}`);
    }
  }
  if (fs.existsSync('storage.cors.json')) {
    findings.push('storage.cors.json is a deprecated competing CORS policy and must not exist');
  }
  for (const marker of [
    'storage-cors.json',
    'storage-cors.staging.json',
    'gcloud storage buckets describe',
    'gcloud projects describe',
    '--project="$PROJECT_ID"',
    'verify-storage-cors.mjs',
  ]) {
    if (!storageCorsScript.includes(marker)) {
      findings.push(`scripts/setup-storage-cors.sh must contain ${marker}`);
    }
  }
  if (!firebaseSetupScript.includes('retired') || firebaseSetupScript.includes('cat > .env.local')) {
    findings.push('scripts/setup-firebase.sh must remain a non-writing retired-script notice');
  }
  if (!gitignore.split(/\r?\n/).includes('.vercel')) {
    findings.push('.gitignore must ignore .vercel release/test artifacts');
  }
  for (const marker of [
    "outputDir: '.vercel/playwright-results'",
    "outputFolder: '.vercel/playwright-report'",
    "name: 'mobile-webkit'",
    "devices['iPhone 15']",
  ]) {
    if (!playwrightConfig.includes(marker)) findings.push(`playwright.config.ts is missing ${marker}`);
  }
  if (playwrightConfig.includes('x-vercel-protection-bypass')) {
    findings.push('playwright.config.ts must not send the Vercel bypass secret as a global browser header');
  }
  if (fs.existsSync('public/sw.js')) {
    findings.push('public/sw.js must not shadow the deployment-bound stable /sw.js route');
  }
  for (const marker of [
    "return '/sw.js'",
    'SERVICE_WORKER_UPDATE_INTERVAL_MS',
    'acceptedServiceWorkerUpdates',
    'announcedWaitingWorkers',
    'deferredWaitingWorkers',
    'observedCheckGeneration <= deferredAtGeneration',
    'registrationAttemptInFlight',
    "window.addEventListener('online', retryRegistrationWhenOnline)",
    'observeInstallingWorker(registration.installing)',
    'checkForUpdate();',
    "document.addEventListener('visibilitychange'",
    "window.addEventListener('online'",
  ]) {
    if (!pwaClient.includes(marker)) findings.push(`src/lib/pwa.ts is missing stable update marker ${marker}`);
  }
  for (const marker of [
    'if (!accepted) detail.defer()',
    'onDismiss: defer',
  ]) {
    if (!pwaProvider.includes(marker)) {
      findings.push(`PWA update prompt is missing explicit defer behavior ${marker}`);
    }
  }
  if (pwaClient.includes('const hadController =')) {
    findings.push('service-worker reload consent must not be blocked by first-install controller state');
  }
  for (const marker of [
    'renderServiceWorkerSource',
    "'Cache-Control': 'no-cache, no-store, must-revalidate'",
    "'CDN-Cache-Control': 'no-store'",
    "'Service-Worker-Allowed': '/'",
  ]) {
    if (!serviceWorkerRoute.includes(marker)) {
      findings.push(`src/app/sw.js/route.ts is missing deployment-bound worker marker ${marker}`);
    }
  }
  if (!serviceWorkerTemplate.includes('__THREADMAP_RELEASE_REVISION__')
      || `${pwaClient}\n${serviceWorkerRoute}\n${serviceWorkerTemplate}`.includes('/sw.js?revision')) {
    findings.push('service-worker identity must be embedded in stable /sw.js response bytes, not its URL');
  }
  for (const marker of [
    "store.get('generation')",
    'generation <= storedBriefingGeneration',
    "store.put(generation, 'generation')",
    'generation: event.data.generation',
  ]) {
    if (!serviceWorkerTemplate.includes(marker)) {
      findings.push(`service-worker briefing lifecycle is missing monotonic-generation marker ${marker}`);
    }
  }
  if (!nextConfigSource.includes('"/sw.js": ["./src/service-worker/worker.js.template"]')) {
    findings.push('next.config.ts must include the service-worker template in the /sw.js runtime trace');
  }
  for (const marker of [
    'axe.source',
    "violation.impact === 'moderate'",
    "'/privacy'",
    "'/tools/dispatch'",
    "'/areas/work'",
    "'/integrations/authorize'",
    "'/definitely-not-a-threadmap-route'",
    "response?.headers()['cache-control']",
    "response?.headers()['x-robots-tag']",
    'PRIVATE_ROUTE_PREFIXES',
    'must remain publicly indexable',
    'keeps the bottom of ${path} reachable in a short viewport',
    'main must own vertical scrolling',
  ]) {
    if (!browserSmoke.includes(marker)) findings.push(`e2e/cold-load.spec.ts is missing ${marker}`);
  }
  for (const marker of ['x-vercel-protection-bypass', 'x-vercel-set-bypass-cookie', 'maxRedirects: 0']) {
    if (!browserSmoke.includes(marker)) {
      findings.push(`e2e/cold-load.spec.ts must safely bootstrap protected targets with ${marker}`);
    }
  }
  for (const marker of ['Product lookup data:', 'Bing', 'DuckDuckGo']) {
    if (!privacyNotice.includes(marker)) {
      findings.push(`src/app/privacy/page.tsx is missing the product-lookup disclosure marker ${marker}`);
    }
  }
  for (const marker of ['public website', 'search providers', 'Google']) {
    if (!privacyNotice.includes(marker)) {
      findings.push(`src/app/privacy/page.tsx is missing the external product-lookup disclosure marker ${marker}`);
    }
  }
  for (const routePath of [
    'src/app/api/scrape/route.ts',
    'src/app/api/scrape/image/route.ts',
    'src/app/api/scrape/price/route.ts',
  ]) {
    const route = read(routePath);
    if (!route.includes('export async function POST(')
        || route.includes('export async function GET(')
        || !route.includes('readBoundedJsonObject')
        || !route.includes('hasOnlyObjectKeys')) {
      findings.push(`${routePath} must remain a bounded exact-schema JSON POST endpoint without GET`);
    }
  }
  if (/\/api\/scrape(?:\/[^?'"`]*)?\?/.test(wishlistPage)) {
    findings.push('wishlist product lookup must not put URLs or search terms in /api/scrape query strings');
  }
  for (const marker of [
    "'https://www.googleapis.com/auth/calendar.events.owned'",
    'include_granted_scopes: false',
  ]) {
    if (!calendarClient.includes(marker)) {
      findings.push(`src/lib/google-calendar.ts is missing narrow-consent marker ${marker}`);
    }
  }
  for (const marker of [
    '.env.orbit-9e0b6',
    'ENFORCE_APP_CHECK=true',
    'MCP_ORIGIN=https://threadmap.app',
    'MCP_ALLOW_LOOPBACK_REDIRECTS=false',
    'MCP_DYNAMIC_CLIENT_SCOPES=threadmap.read workspace.read threadmap.write offline_access',
    'GOOGLE_WORKSPACE_CLIENT_ID',
    'THREADMAP_APP_ORIGIN=https://threadmap.app',
    'AUTH_EMAIL_FIREBASE_ACTION_HOSTS=orbit-9e0b6.firebaseapp.com,orbit-9e0b6.web.app',
  ]) {
    if (!releaseWorkflow.includes(marker)) {
      findings.push(`release workflow production Functions configuration is missing ${marker}`);
    }
  }
  const capabilitiesBlock = mcpSettings.match(/const CAPABILITIES = \[([\s\S]*?)\n\];/)?.[1] || '';
  const hardCodedProductionMcpLiteral = /['"]https:\/\/threadmap\.app\/mcp['"]/;
  if (hardCodedProductionMcpLiteral.test(mcpSettings)
      || !mcpSettings.includes('new URL(MCP_ENDPOINT_PATH, window.location.origin).href')) {
    findings.push('MCP Settings must derive its endpoint from the current deployment origin');
  }
  for (const verb of ['create', 'update', 'complete', 'archive', 'link', 'delete', 'write']) {
    if (new RegExp(`\\b${verb}\\b`, 'i').test(capabilitiesBlock)) {
      findings.push(`MCP Settings launch capabilities must not advertise ${verb} access`);
    }
  }
  const clientsBlock = mcpSettings.match(/const CLIENTS = \[([\s\S]*?)\n\];/)?.[1] || '';
  if (/Claude Code/i.test(clientsBlock)) {
    findings.push('MCP Settings must not present Claude Code as a launch-supported client');
  }
  for (const marker of [
    'Production connections are read-only at launch.',
    'Claude Code is not enabled for the production launch.',
  ]) {
    if (!mcpSettings.includes(marker)) {
      findings.push(`src/components/settings/mcp-settings.tsx is missing launch-policy copy: ${marker}`);
    }
  }
  for (const marker of [
    'Dynamically registered clients receive `threadmap.read`',
    'Claude Code is not launch-supported.',
    '`MCP_ALLOW_LOOPBACK_REDIRECTS=false`',
  ]) {
    if (!mcpSetup.includes(marker)) {
      findings.push(`MCP_SETUP.md is missing launch-policy marker ${marker}`);
    }
  }
  for (const marker of [
    'vercel deploy --yes --prebuilt --prod --skip-domain',
    'Vercel deployment URL was not an HTTPS vercel.app host',
    'npm run release:verify:vercel-link',
    'release:read-sha -- https://threadmap.app',
    'Re-probe the previous web release after Firebase deployment',
    'vercel promote "${{ steps.stage.outputs.url }}"',
  ]) {
    if (!releaseWorkflow.includes(marker)) {
      findings.push(`release workflow is missing guarded staged-promotion marker ${marker}`);
    }
  }
  if (releaseWorkflow.includes('--token')) {
    findings.push('release workflow must use VERCEL_TOKEN from the environment, not CLI --token arguments');
  }
  for (const match of releaseWorkflow.matchAll(/^  ([a-zA-Z0-9_-]+):\n([\s\S]*?)(?=^  [a-zA-Z0-9_-]+:\n|(?![\s\S]))/gm)) {
    const stepsOffset = match[2].indexOf('    steps:');
    if (stepsOffset >= 0 && /\$\{\{\s*secrets\./.test(match[2].slice(0, stepsOffset))) {
      findings.push(`release workflow job ${match[1]} must scope production secrets to individual steps`);
    }
  }
  if (/deploy_firebase|inputs\.deploy_firebase/.test(releaseWorkflow)) {
    findings.push('release workflow must not permit promotion without deploying the compatible Firebase plane');
  }
  for (const marker of [
    'Capture and verify the currently live web release',
    'Deploy compatible Firebase plane',
    'Re-verify staged artifact after Firebase deployment',
    'Re-probe the previous web release after Firebase deployment',
  ]) {
    if (!releaseWorkflow.includes(marker)) {
      findings.push(`release workflow mandatory backend compatibility gate is missing ${marker}`);
    }
  }
  if (!/- name: Block production until the true-staging topology gate is implemented[\s\S]*?Production release unavailable[\s\S]*?threadmap-staging-9e0b6[\s\S]*?staging-configured Vercel artifact[\s\S]*?separate post-evidence production approval\/deploy job[\s\S]*?exit 1/.test(releaseWorkflow)) {
    findings.push('release workflow must fail closed until true staging and post-evidence production approval are implemented');
  }
  if (!/release:\s*[\s\S]*?needs: release-topology-blocker[\s\S]*?environment: production/.test(releaseWorkflow)) {
    findings.push('production-environment job must depend on the fail-closed topology blocker');
  }
  for (const marker of [
    "health.release?.environment === 'production'",
    "health.runtime?.provider === 'vercel'",
    'health.runtime?.configuredRegion === VERCEL_REGION',
    'health.runtime?.region === VERCEL_REGION',
    'requestOrigin === origin && requestOrigin === bypassOrigin',
    'THREADMAP_VERCEL_BYPASS_ORIGIN must exactly match the verified HTTPS origin',
    "redirect: 'manual'",
    "'X-Threadmap-Scrape-Secret': scrapeQuotaSecret",
    "quotaResponse.status !== 401 || quotaError !== 'invalid_app_check'",
  ]) {
    if (!releaseVerifier.includes(marker)) {
      findings.push(`scripts/verify-release-target.mjs is missing ${marker}`);
    }
  }
  for (const step of releaseWorkflow.split(/\n\s{6}- name:/)) {
    if (step.includes('npm run release:verify --')
        && !step.includes('SCRAPE_RATE_LIMIT_SHARED_SECRET: ${{ secrets.SCRAPE_RATE_LIMIT_SHARED_SECRET }}')) {
      findings.push('every release:verify workflow step must receive the cross-plane scrape quota secret');
    }
  }
  for (const step of releaseWorkflow.split(/\n\s{6}- name:/)) {
    if (step.includes('npm run release:verify --')
        && !step.includes('THREADMAP_VERCEL_BYPASS_ORIGIN:')) {
      findings.push('every release:verify workflow step must bind the bypass secret to its exact origin');
    }
  }
  for (const marker of ['iad1', 'remains a release blocker', 'runtime.region']) {
    if (!readinessDocument.includes(marker)) {
      findings.push(`PRODUCTION_READINESS.md is missing the observed live-region residual marker ${marker}`);
    }
  }
  for (const marker of [
    '`RESEND_API_KEY` and `AUTH_EMAIL_HMAC_KEY` are launch prerequisites',
    'disposable staging address',
    'one-time consumption',
    'suppression/bounce handling',
    '`support@threadmap.app` as',
    'provider-native hard-bounce/complaint suppression',
    'complaint rate above 0.05%',
    'open and click tracking remain disabled',
    'sent-email retention is 30 days',
    'sending executes in `eu-west-1`',
    'metadata remains in the United States',
    'link scanners/security gateway',
    'tested Vercel log/trace drain',
    'multi-location synthetic check',
    'LCP under 2.5 s',
    'INP under 200 ms',
    'CLS under 0.1',
    'TTFB under 800 ms',
    'bounded runtime-error scan',
  ]) {
    if (!readinessDocument.includes(marker)) {
      findings.push(`PRODUCTION_READINESS.md is missing auth-email release evidence marker ${marker}`);
    }
  }

  if (findings.length) fail('Threadmap release contract failed:', findings);
  console.log('Threadmap release contract passed: configuration, regions, and deploy commands are explicit.');
}

if (contractMode) {
  checkContract();
  process.exit(0);
}

checkContract();
loadEnvConfig(process.cwd());

const deploymentMode = process.env.THREADMAP_DEPLOYMENT_MODE?.trim();
const modeRequired = deploymentMode === 'public' ? publicLegalEnvironment : [];
const validatedEnvironment = [...requiredProductionEnvironment, ...modeRequired];
const missing = validatedEnvironment.filter((name) => !process.env[name]?.trim());
const placeholder = validatedEnvironment.filter((name) =>
  /example|changeme|placeholder|pre-release|pending|\btbd\b/i.test(process.env[name] || '')
);
const invalidEmails = ['LEGAL_CONTACT_EMAIL', 'SECURITY_CONTACT_EMAIL']
  .filter((name) => process.env[name] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env[name]));
const invalid = [];
const productionProject = 'orbit-9e0b6';

if (deploymentMode !== 'private' && deploymentMode !== 'public') {
  invalid.push('THREADMAP_DEPLOYMENT_MODE must be private or public');
}
if (deploymentMode === 'private'
    && process.env.NEXT_PUBLIC_THREADMAP_PRIVATE_MODE !== 'true') {
  invalid.push('NEXT_PUBLIC_THREADMAP_PRIVATE_MODE must be true for a private deployment');
}
if (deploymentMode === 'public'
    && process.env.NEXT_PUBLIC_THREADMAP_PRIVATE_MODE !== 'false') {
  invalid.push('NEXT_PUBLIC_THREADMAP_PRIVATE_MODE must be false for a public deployment');
}

if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== productionProject) {
  invalid.push(`NEXT_PUBLIC_FIREBASE_PROJECT_ID must be ${productionProject} for production`);
}
if (process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
    && process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN !== `${productionProject}.firebaseapp.com`) {
  invalid.push(`NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN must be ${productionProject}.firebaseapp.com for production`);
}
if (process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
    && process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET !== `${productionProject}.firebasestorage.app`) {
  invalid.push(`NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET must be ${productionProject}.firebasestorage.app for production`);
}
const senderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim();
const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim();
if (senderId && !/^\d+$/.test(senderId)) {
  invalid.push('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID must contain digits only');
}
if (senderId && appId && !appId.startsWith(`1:${senderId}:web:`)) {
  invalid.push('NEXT_PUBLIC_FIREBASE_APP_ID must belong to NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID');
}
if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') {
  invalid.push('VERCEL_ENV must be production when validating a production environment');
}
if (process.env.VERCEL_REGION && process.env.VERCEL_REGION !== 'fra1') {
  invalid.push(`VERCEL_REGION is ${process.env.VERCEL_REGION}; expected fra1`);
}

if (missing.length || placeholder.length || invalidEmails.length || invalid.length) {
  const findings = [];
  if (missing.length) findings.push(`Missing: ${missing.join(', ')}`);
  if (placeholder.length) findings.push(`Placeholder values: ${placeholder.join(', ')}`);
  if (invalidEmails.length) findings.push(`Invalid email values: ${invalidEmails.join(', ')}`);
  findings.push(...invalid);
  fail('Threadmap production preflight failed:', findings);
}

console.log('Threadmap production environment preflight passed.');
console.log('Run release:verify against the exact preview SHA before promotion.');
