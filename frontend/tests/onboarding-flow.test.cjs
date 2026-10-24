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
    import {useState} from 'react';
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
    window.fixturePosts=query.has('gallery')?Array.from({length:6},(_,i)=>({id:'gallery-'+i,image_url:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="'+['#635bff','#322b75','#a4a0ff'][i%3]+'"/><text x="200" y="210" text-anchor="middle" font-family="Arial" font-size="36" fill="white">Game '+(i+1)+'</text></svg>'),caption:'Weekend game '+(i+1),created_at:'2026-10-24T00:00:00Z'})):[];
    const player={...profile,id:'other-player',name:'Nearby Player',nickname:'Ace',city:'Ghaziabad',locality:'Indirapuram',sports:[{sport:'Badminton',skill_level:'advanced',play_intention:'both'}],connection_status:null,connection_direction:null,posts:[{id:'photo-1',image_url:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#635bff"/></svg>'),caption:'Weekend on court',created_at:'2026-10-24T00:00:00Z'}]};
    export function useResource(path){
      const [,setVersion]=useState(0);
      if(path==='/api/v1/users/me/posts')return {data:{posts:window.fixturePosts,uploads_enabled:!query.has('no_uploads'),max_posts:12,max_image_bytes:10485760},loading:false,error:'',reload:async()=>setVersion(v=>v+1)};
      if(path==='/api/v1/users/other-player')return {data:player,loading:false,error:'',reload};
      return resources[path]||{data:null,error:'',loading:false,reload};
    }
  `,
  );
  const api = fixture(
    'api.js',
    `
    export const API='http://fixture.invalid';
    export async function request(path,token,options={}){
      window.actions=window.actions||[];window.actions.push({path,method:options.method,body:typeof options.body==='string'?JSON.parse(options.body):null});
      if(path.startsWith('/api/v1/users/me/posts')&&options.method==='POST'){
        const post={id:'new-photo',image_url:URL.createObjectURL(options.body),caption:new URL('http://fixture'+path).searchParams.get('caption'),created_at:new Date().toISOString()};
        window.fixturePosts=[post,...window.fixturePosts];return post;
      }
      if(path.startsWith('/api/v1/users/me/posts/')&&options.method==='DELETE'){window.fixturePosts=window.fixturePosts.filter(p=>p.id!==path.split('/').pop());return;}
      if(path.startsWith('/api/v1/locations/'))return {city:'Ghaziabad',state:'Uttar Pradesh',localities:['Indirapuram']};
      return {success:true};
    }
  `,
  );
  const navigation = fixture(
    'navigation.js',
    `export function useRouter(){return {push:path=>{window.destination=path;}};}`,
  );
  const link = fixture(
    'link.js',
    `import React from 'react';export default function Link({href,children,...props}){return React.createElement('a',{...props,href},children);}`,
  );
  const loader = fixture(
    'loader.cjs',
    `module.exports=function(source){if(this.resourcePath.endsWith('OnboardingIntro.tsx')){source=source.replace('/onboarding-loader.svg',${JSON.stringify(pathToFileURL(path.join(root, 'public/onboarding-loader.svg')).href)}).replace('/onboarding-loader-static.svg',${JSON.stringify(pathToFileURL(path.join(root, 'public/onboarding-loader-static.svg')).href)});}return require(${JSON.stringify(require.resolve('typescript'))}).transpileModule(source,{compilerOptions:{jsx:4,module:99,target:7,esModuleInterop:true}}).outputText;};`,
  );
  const entry = fixture(
    'entry.tsx',
    `import React from 'react';import {createRoot} from 'react-dom/client';import Onboarding from ${JSON.stringify(path.join(root, 'src/app/(app)/onboarding/page.tsx'))};import PlayerProfile from ${JSON.stringify(path.join(root, 'src/app/(app)/players/[userId]/page.tsx'))};const params=Promise.resolve({userId:'other-player'});createRoot(document.getElementById('root')).render(<React.Suspense fallback={null}>{new URLSearchParams(location.search).has('public')?<PlayerProfile params={params}/>:<Onboarding/>}</React.Suspense>);`,
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
            'next/link$': link,
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
  browser.on('page', (page) =>
    page.on('pageerror', (error) => process.stderr.write(error.stack + '\n')),
  );
});
after(async () => {
  if (browser) await browser.close();
  if (directory) fs.rmSync(directory, { recursive: true, force: true });
});

test('signup flow retains illustrated choices and themed skills without duplicate identity or age prompts', async () => {
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
  await page.waitForFunction(() => {
    const inputs = [
      ...document.querySelectorAll('input[name="level-Badminton"]'),
    ];
    const unselected = inputs
      .filter((input) => !input.checked)
      .map(
        (input) => getComputedStyle(input.nextElementSibling).backgroundColor,
      );
    const selected = inputs.find((input) => input.checked);
    return (
      unselected.every((color) => color === unselected[0]) &&
      getComputedStyle(selected.nextElementSibling).backgroundColor !==
        unselected[0]
    );
  });
  const skillColors = await page
    .locator('input[name="level-Badminton"]')
    .evaluateAll((inputs) =>
      inputs.map((input) => ({
        selected: input.checked,
        background: getComputedStyle(input.nextElementSibling).backgroundColor,
        color: getComputedStyle(input.nextElementSibling).color,
      })),
    );
  const selectedColor = skillColors.find((choice) => choice.selected);
  const otherColors = skillColors.filter((choice) => !choice.selected);
  assert.equal(
    otherColors.every(
      (choice) => choice.background === otherColors[0].background,
    ),
    true,
  );
  assert.notEqual(selectedColor.background, otherColors[0].background);
  assert.notEqual(selectedColor.color, otherColors[0].color);
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

test('profile tabs separate content, retain edits, and save without leaving the profile', async () => {
  const page = await browser.newPage({ viewport: { width: 440, height: 956 } });
  await page.goto(url + '?edit=1');
  await page
    .getByRole('button', { name: 'Manage account', exact: true })
    .click();
  assert.equal(await page.evaluate(() => window.accountOpened), 1);
  assert.equal(
    await page
      .getByRole('tab', { name: 'Photos & posts' })
      .getAttribute('aria-selected'),
    'true',
  );
  assert.equal(await page.locator('input[type="file"]').count(), 1);
  assert.equal(await page.locator('#phone').count(), 0);
  await page.screenshot({
    path: '/private/tmp/playzo-profile-posts.png',
    fullPage: true,
  });
  await page.getByRole('tab', { name: 'Personal info' }).click();
  await page.getByLabel('Phone number (optional, private)').fill('9876543210');
  assert.equal(await page.locator('input[name="gender"]').count(), 5);
  assert.equal(await page.locator('input[name="looking-for"]').count(), 0);
  await page.screenshot({
    path: '/private/tmp/playzo-profile-personal.png',
    fullPage: true,
  });
  await page.getByRole('tab', { name: 'Sports & settings' }).click();
  assert.equal(await page.locator('input[name="looking-for"]').count(), 3);
  assert.equal(await page.locator('input[name="level-Badminton"]').count(), 5);
  assert.equal(await page.locator('#phone').count(), 0);
  await page.getByRole('radio', { name: /Advanced/ }).check();
  await page.getByRole('tab', { name: 'Personal info' }).click();
  assert.equal(
    await page.getByLabel('Phone number (optional, private)').inputValue(),
    '9876543210',
  );
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await page
    .getByRole('status')
    .filter({ hasText: 'Your profile has been saved.' })
    .waitFor();
  const saved = await page.evaluate(
    () =>
      window.actions.find(
        (a) => a.method === 'PUT' && a.path === '/api/v1/users/me/onboarding',
      ).body,
  );
  assert.equal(saved.phone, '+919876543210');
  assert.equal(saved.sports[0].skill_level, 'advanced');
  assert.equal(await page.evaluate(() => window.destination), undefined);
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

test('photo posts upload with a caption, validate file type, and can be removed', async () => {
  const page = await browser.newPage({ viewport: { width: 320, height: 900 } });
  await page.goto(url + '?edit=1');
  const upload = page.getByLabel('Choose a profile photo');
  await upload.setInputFiles({
    name: 'bad.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg/>'),
  });
  await page.getByText('Choose a JPEG, PNG, or WebP photo.').waitFor();
  await upload.setInputFiles({
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9kAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await page.getByLabel('Add a caption (optional)').fill('My weekend game');
  await page
    .getByRole('button', { name: 'Add to profile', exact: true })
    .click();
  await page.getByText('Photo added to your profile.').waitFor();
  await page
    .getByRole('img', { name: 'My weekend game', exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page
    .getByRole('button', { name: 'Remove photo: My weekend game', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Remove photo', exact: true })
    .click();
  await page.getByText('Photo removed.').waitFor();
  assert.equal(
    await page
      .getByRole('img', { name: 'My weekend game', exact: true })
      .count(),
    0,
  );
  await page.close();
});

test('missing cloud configuration explains upload availability', async () => {
  const page = await browser.newPage();
  await page.goto(url + '?edit=1&no_uploads=1');
  await page.getByText(/Photo uploads are coming soon/).waitFor();
  assert.equal(await page.locator('input[type="file"]').count(), 0);
  await page.getByRole('tab', { name: 'Personal info' }).click();
  await page.getByLabel('Phone number (optional, private)').waitFor();
  await page.close();
});

test('player detail has a compact header and shows photo posts without personal contact information', async () => {
  const page = await browser.newPage({ viewport: { width: 440, height: 956 } });
  await page.goto(url + '?public=1');
  await page
    .getByRole('heading', { name: 'Nearby Player', exact: true })
    .waitFor();
  await page
    .getByRole('img', { name: 'Weekend on court', exact: true })
    .waitFor();
  const back = await page
    .getByRole('link', { name: 'Discover players' })
    .boundingBox();
  const header = await page
    .getByRole('heading', { name: 'Nearby Player', exact: true })
    .boundingBox();
  assert.equal(header.y - (back.y + back.height) < 70, true);
  assert.equal(await page.getByText('9876543210').count(), 0);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: '/private/tmp/playzo-player-photo-profile.png',
    fullPage: true,
  });
  await page.close();
});

test('new signups see a three-second brand intro once before the first step', async () => {
  const page = await browser.newPage({ viewport: { width: 440, height: 956 } });
  await page.goto(url);
  const intro = page
    .getByRole('status')
    .filter({ hasText: 'Getting your playground ready…' });
  await intro.waitFor();
  const started = Date.now();
  assert.equal(await page.getByRole('progressbar').count(), 0);
  const image = intro.locator('img');
  await page.waitForFunction(
    () => document.querySelector('picture img')?.naturalWidth > 0,
  );
  await page.screenshot({
    path: '/private/tmp/playzo-onboarding-intro.png',
    fullPage: true,
  });
  await page
    .getByRole('heading', { name: 'How do you identify?', exact: true })
    .waitFor();
  assert.equal(Date.now() - started >= 2500, true);
  assert.equal(await intro.count(), 0);
  await page.reload();
  await page
    .getByRole('heading', { name: 'How do you identify?', exact: true })
    .waitFor();
  assert.equal(await intro.count(), 0);
  await page.close();
});

test('reduced motion uses a static brand asset during the signup intro', async () => {
  const page = await browser.newPage({
    reducedMotion: 'reduce',
    viewport: { width: 320, height: 700 },
  });
  await page.goto(url);
  const intro = page
    .getByRole('status')
    .filter({ hasText: 'Getting your playground ready…' });
  await intro.waitFor();
  await page.waitForFunction(() =>
    document
      .querySelector('picture img')
      ?.currentSrc.includes('onboarding-loader-static.svg'),
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.close();
});

test('profile photo grid uses small two-column mobile and three-column desktop cards', async () => {
  const page = await browser.newPage({ viewport: { width: 440, height: 956 } });
  await page.goto(url + '?edit=1&gallery=1');
  const photos = page.getByRole('tabpanel').locator('article img');
  await photos.first().waitFor();
  assert.equal(await photos.count(), 6);
  const first = await photos.nth(0).boundingBox(),
    second = await photos.nth(1).boundingBox();
  assert.equal(Math.abs(first.y - second.y) < 2, true);
  assert.equal(second.x > first.x, true);
  assert.equal(first.height <= 210, true);
  await page.screenshot({
    path: '/private/tmp/playzo-compact-profile-grid.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 1200, height: 900 });
  const desktopFirst = await photos.nth(0).boundingBox(),
    third = await photos.nth(2).boundingBox();
  assert.equal(Math.abs(desktopFirst.y - third.y) < 2, true);
  assert.equal(desktopFirst.height <= 260, true);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.close();
});
