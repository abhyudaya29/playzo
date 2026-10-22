const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');
const source = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, '../src/lib/analytics.ts'), 'utf8'),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  },
).outputText;
function setup(failing = false) {
  const stored = new Map(),
    events = [],
    identified = [];
  let inits = 0,
    resets = 0,
    config;
  const sdk = {
    identify: (id) => identified.push(id),
    reset: () => resets++,
    opt_out_capturing: () => {},
    opt_in_capturing: () => {},
    capture: (event, properties) => {
      const payload = config.before_send({
        event,
        properties: {
          ...properties,
          $current_url: 'https://private.test/?email=secret@example.com',
        },
      });
      if (payload) events.push(payload);
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(source, {
    exports: module.exports,
    module,
    require: (name) => {
      if (failing) throw Error('Analytics unavailable');
      assert.equal(name, 'posthog-js');
      return {
        init: (_key, options) => {
          inits++;
          config = options;
          return sdk;
        },
      };
    },
    process: {
      env: {
        NEXT_PUBLIC_POSTHOG_KEY: 'test-project',
        NEXT_PUBLIC_POSTHOG_HOST: 'https://ingest.example',
      },
    },
    localStorage: {
      getItem: (k) => stored.get(k) || null,
      setItem: (k, v) => stored.set(k, v),
    },
    window: { dispatchEvent: () => {} },
    Event: class {},
    crypto: { randomUUID },
  });
  return {
    analytics: module.exports,
    events,
    identified,
    get inits() {
      return inits;
    },
    get resets() {
      return resets;
    },
    get config() {
      return config;
    },
  };
}
test('analytics requires consent, initializes once, and strips sensitive properties', async () => {
  const s = setup();
  await s.analytics.identifyUser('internal-id');
  assert.equal(s.inits, 0);
  await s.analytics.setAnalyticsConsent(true);
  await s.analytics.initializeAnalytics();
  assert.equal(s.inits, 1);
  s.analytics.trackEvent('recommendation_clicked', {
    sport: 'Badminton',
    gender: 'woman',
    phone: 'secret',
    latitude: 28,
  });
  const event = s.events.find((e) => e.event === 'recommendation_clicked');
  assert.ok(event);
  assert.equal(event.properties.sport, 'Badminton');
  assert.equal(event.properties.gender, undefined);
  assert.equal(event.properties.phone, undefined);
  assert.equal(event.properties.latitude, undefined);
  assert.equal(event.properties.$current_url, undefined);
  assert.equal(s.config.disable_session_recording, true);
  assert.equal(s.config.autocapture, false);
  await s.analytics.setAnalyticsConsent(false);
  const n = s.events.length;
  s.analytics.trackEvent('discovery_opened');
  assert.equal(s.events.length, n);
  await s.analytics.setAnalyticsConsent(true);
  assert.equal(s.inits, 1);
});
test('identity changes and logout reset the SDK and prevent cross-account events', async () => {
  const s = setup();
  await s.analytics.setAnalyticsConsent(true);
  await s.analytics.identifyUser('first');
  await s.analytics.identifyUser('second');
  assert.equal(s.resets, 1);
  assert.equal(s.identified.at(-1), 'second');
  s.analytics.resetAnalytics();
  const n = s.events.length;
  s.analytics.trackEvent('discovery_opened');
  assert.equal(s.events.length, n);
});
test('SDK failure does not break product actions', async () => {
  const s = setup(true);
  await s.analytics.setAnalyticsConsent(true);
  await s.analytics.identifyUser('internal-id');
  assert.doesNotThrow(() => s.analytics.trackEvent('discovery_opened'));
  assert.equal(s.events.length, 0);
});
