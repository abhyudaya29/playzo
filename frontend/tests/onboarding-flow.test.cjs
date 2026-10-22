// Render the real onboarding and UI components with isolated auth/API fixtures.
// No Clerk accounts, backend writes, or production test routes are required.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('@playwright/test');
const bundled = require('next/dist/compiled/webpack/webpack');
bundled.init();
const webpack = bundled.webpack;
const root = path.resolve(__dirname, '..');
let directory, browser, url;
function fixture(name, content) {
  const file = path.join(directory, name);
  fs.writeFileSync(file, content);
  return file;
}
before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'playzo-onboarding-'));
  const auth = fixture(
    'clerk.js',
    `
    const user={id:'fixture',fullName:'Signup Player',firstName:'Signup',imageUrl:null};
    const getToken=async()=> 'fixture-token';
    export function useUser(){return {user};}
    export function useAuth(){return {getToken,isLoaded:true,isSignedIn:true,userId:user.id};}
    export function useClerk(){return {openUserProfile:()=>{window.accountOpened=(window.accountOpened||0)+1;}};}
  `,
  );
  const resource = fixture(
    'resource.js',
    `
    const query=new URLSearchParams(location.search);
    const edit=query.has('edit'),resume=query.has('resume');
    const profile={id:'fixture',name:'Backend Name',phone:null,nickname:null,age:null,gender:null,motivation:null,looking_for:edit?'join_individually':null,languages:[],
      bio:null,gender_self_description:null,gender_visibility:'private',discovery_visible:true,role:'USER',participation_interests:[],teammate_preference:'no_preference',availability:[],
      onboarding_completed:edit,onboarding_step:resume?3:0,
      onboarding_draft:resume?{name:'Old draft name',looking_for:'join_individually',pincode:'201014',city:'Ghaziabad',state:'Uttar Pradesh',locality:'Indirapuram',sports:[{sport:'Badminton',skill_level:'advanced',play_intention:'casual'}]}:{},
      search_radius_km:5,sports:edit?[{sport:'Badminton',skill_level:'intermediate',play_intention:'both'}]:[],
      location:edit?{pincode:'201014',city:'Ghaziabad',state:'Uttar Pradesh',locality:'Indirapuram',street_address:null,latitude:null,longitude:null}:null};
    const reload=async()=>{};
    const resources={'/api/v1/users/me':{data:profile,error:'',loading:false,reload},'/api/v1/sports':{data:['Badminton','Cricket','Tennis'],error:'',loading:false,reload}};
    export function useResource(path){return resources[path]||{data:null,error:'',loading:false,reload};}
  `,
  );
  const api = fixture(
    'api.js',
    `
    export const API='http://fixture.invalid';
    export async function request(path,token,options={}){
      window.actions=window.actions||[];window.actions.push({path,method:options.method,body:options.body?JSON.parse(options.body):null});
      if(path.startsWith('/api/v1/locations/'))return {city:'Ghaziabad',state:'Uttar Pradesh',localities:['Indirapuram']};
      return {success:true};
    }
  `,
  );
  const navigation = fixture(
    'navigation.js',
    `export function useRouter(){return {push:path=>{window.destination=path;}};}`,
  );
  const loader = fixture(
    'loader.cjs',
    `module.exports=function(source){return require(${JSON.stringify(require.resolve('typescript'))}).transpileModule(source,{compilerOptions:{jsx:4,module:99,target:7,esModuleInterop:true}}).outputText;};`,
  );
  const entry = fixture(
    'entry.tsx',
    `import React from 'react';import {createRoot} from 'react-dom/client';import Onboarding from ${JSON.stringify(path.join(root, 'src/app/(app)/onboarding/page.tsx'))};createRoot(document.getElementById('root')).render(<Onboarding/>);`,
  );
  await new Promise((resolve, reject) =>
    webpack(
      {
        mode: 'development',
        devtool: false,
        entry,
        output: { path: directory, filename: 'bundle.js' },
        resolve: {
          extensions: ['.tsx', '.ts', '.js', '.cjs'],
          modules: [path.join(root, 'node_modules'), 'node_modules'],
          alias: {
            '@clerk/nextjs$': auth,
            '@/lib/use-resource$': resource,
            '@/lib/api$': api,
            'next/navigation$': navigation,
            '@': path.join(root, 'src'),
          },
        },
        module: {
          rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: loader }],
        },
      },
      (error, stats) =>
        error
          ? reject(error)
          : stats.hasErrors()
            ? reject(new Error(stats.toString({ all: false, errors: true })))
            : resolve(),
    ),
  );
  const cssDirectory = path.join(root, '.next/static/css');
  const styles = fs.existsSync(cssDirectory)
    ? fs
        .readdirSync(cssDirectory)
        .filter((f) => f.endsWith('.css'))
        .map(
          (f) =>
            `<link rel="stylesheet" href="${pathToFileURL(path.join(cssDirectory, f)).href}">`,
        )
        .join('')
    : '';
  const html = fixture(
    'index.html',
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${styles}</head><body><main style="padding:28px 16px"><div id="root"></div></main><script src="./bundle.js"></script></body></html>`,
  );
  url = pathToFileURL(html).href;
  browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--allow-file-access-from-files'],
  });
});
after(async () => {
  if (browser) await browser.close();
  if (directory) fs.rmSync(directory, { recursive: true, force: true });
});

test('signup flow retains illustrated choices and colorful skills without duplicate identity or age prompts', async () => {
  const page = await browser.newPage({
    viewport: { width: 390, height: 1000 },
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page
    .getByRole('heading', { name: 'How do you identify?', exact: true })
    .waitFor();
  assert.equal(await page.locator('input[type="file"]').count(), 0);
  assert.equal(await page.locator('input[name="gender"]').count(), 5);
  assert.equal(
    await page
      .locator('input[name="gender"]')
      .locator('..')
      .locator('svg')
      .count(),
    5,
  );
  await page.getByRole('radio', { name: 'Male', exact: true }).check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page
    .getByRole('radio', { name: 'Join individually', exact: true })
    .waitFor();
  assert.equal(await page.locator('input[name="looking-for"]').count(), 3);
  assert.equal(
    (await page
      .locator('input[name="looking-for"]')
      .locator('..')
      .locator('[aria-hidden="true"]')
      .count()) >= 3,
    true,
  );
  await page
    .getByRole('radio', { name: 'Join individually', exact: true })
    .check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('PIN code').fill('201014');
  await page.getByLabel('Locality', { exact: true }).fill('Indirapuram');
  await page.getByLabel('City', { exact: true }).fill('Ghaziabad');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Badminton', exact: true }).check();
  assert.equal(await page.locator('input[name="level-Badminton"]').count(), 5);
  assert.equal(await page.getByRole('combobox').count(), 0);
  await page.getByRole('radio', { name: /Intermediate/ }).check();
  assert.equal(await page.locator('.bg-orange-300').count(), 1);
  await page.screenshot({
    path: '/private/tmp/playzo-restored-sports-mobile.png',
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page
    .getByRole('button', { name: 'Review my profile', exact: true })
    .click();
  await page.getByRole('button', { name: 'Let’s play', exact: true }).waitFor();
  assert.equal(await page.locator('#name').count(), 0);
  assert.equal(await page.getByText(/I confirm I am 18/).count(), 0);
  await page.getByRole('button', { name: 'Let’s play', exact: true }).click();
  await page.waitForFunction(() => window.destination === '/dashboard');
  const saved = await page.evaluate(
    () =>
      window.actions.find(
        (a) => a.method === 'PUT' && a.path === '/api/v1/users/me/onboarding',
      ).body,
  );
  assert.equal(saved.name, 'Signup Player');
  assert.equal(saved.sports[0].skill_level, 'intermediate');
  assert.equal('adult_confirmed' in saved, false);
  assert.deepEqual(errors, []);
  await page.close();
});

test('profile editing uses Clerk account controls and restores all illustrated selections', async () => {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.goto(url + '?edit=1');
  await page
    .getByRole('button', { name: 'Manage account', exact: true })
    .click();
  assert.equal(await page.evaluate(() => window.accountOpened), 1);
  assert.equal(await page.locator('input[type="file"]').count(), 0);
  assert.equal(await page.locator('#name').count(), 0);
  assert.equal(await page.locator('input[name="gender"]').count(), 5);
  assert.equal(await page.locator('input[name="looking-for"]').count(), 3);
  assert.equal(await page.locator('input[name="level-Badminton"]').count(), 5);
  assert.equal(
    await page
      .getByRole('button', { name: 'Save profile', exact: true })
      .count(),
    1,
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.close();
});

test('saved illustrated flow resumes sports preferences while using the signup identity', async () => {
  const page = await browser.newPage({ viewport: { width: 320, height: 900 } });
  await page.goto(url + '?resume=1');
  await page
    .getByRole('heading', { name: 'What do you love playing?', exact: true })
    .waitFor();
  assert.equal(
    await page
      .locator('input[name="level-Badminton"][value="advanced"]')
      .isChecked(),
    true,
  );
  assert.equal(
    await page
      .getByRole('button', { name: 'casual', exact: true })
      .getAttribute('aria-pressed'),
    'true',
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.close();
});
