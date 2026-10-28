import { test, expect } from '@playwright/test';

test('record, edit, reset; production cache and network remain isolated', async ({page}) => {
  const errors:string[]=[]; const unexpectedRequests:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',request=>{if(!request.url().startsWith('http://127.0.0.1:4173/')&&!request.url().startsWith('data:')) unexpectedRequests.push(request.url());});
  await page.addInitScript(()=>{
    localStorage.setItem('meal-planner-state:v1','PRIVATE_CACHE_SENTINEL');
    localStorage.setItem('meal-planner-device-token:v1','PRIVATE_TOKEN_SENTINEL');
  });
  await page.goto('/');
  await expect(page.getByText('公開デモ · 架空データ · 2030/4/11')).toBeVisible();
  await page.getByRole('button',{name:'食事',exact:true}).click();
  await expect(page.getByText('実績 450 kcal・予定として計算 1,240 kcal')).toBeVisible();
  await page.getByRole('button',{name:'今日',exact:true}).click();
  await page.getByRole('button',{name:'食べた記録へ',exact:true}).click();
  await page.getByRole('button',{name:'予定どおり食べた',exact:true}).click();
  await page.getByRole('button',{name:'食事',exact:true}).click();
  await expect(page.getByText('実績 1,110 kcal・予定として計算 580 kcal')).toBeVisible();
  await page.getByRole('button',{name:/きのこのパスタ/}).click();
  await page.getByRole('button',{name:'量を0.1増やす',exact:true}).click();
  await page.getByRole('button',{name:'変更を保存',exact:true}).click();
  await expect(page.getByText('実績 1,176 kcal・予定として計算 580 kcal')).toBeVisible();
  await page.getByRole('button',{name:'今日',exact:true}).click();
  await page.getByRole('button',{name:'設定',exact:true}).click();
  await page.getByRole('button',{name:'デモをリセット',exact:true}).click();
  await page.getByRole('button',{name:'食事',exact:true}).click();
  await expect(page.getByText('実績 450 kcal・予定として計算 1,240 kcal')).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('meal-planner-state:v1'))).toBe('PRIVATE_CACHE_SENTINEL');
  expect(await page.evaluate(()=>localStorage.getItem('meal-planner-device-token:v1'))).toBe('PRIVATE_TOKEN_SENTINEL');
  expect(unexpectedRequests).toEqual([]); expect(errors).toEqual([]);
});

test('four screens, dark theme, missing data, mobile and device preview', async ({page}) => {
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  for(const [name,title,file] of [['今日','今日','today'],['食事','食事','meals'],['運動','運動','move'],['コンディション','コンディション','body']]) {
    await page.getByRole('navigation',{name:'メインナビゲーション'}).getByRole('button',{name,exact:true}).click();
    await expect(page.getByRole('heading',{name:title,exact:true}).first()).toBeVisible();
    await expect(page.getByText('公開デモ · 架空データ · 2030/4/11')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    if(process.env.CAPTURE_DEMO && ['today','meals'].includes(file)) await page.screenshot({path:`docs/${file}.png`,animations:'disabled'});
  }
  await page.getByRole('button',{name:'今日',exact:true}).click();
  await page.getByRole('button',{name:'設定',exact:true}).click();
  await page.getByRole('button',{name:'ダーク',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-ayumu-theme','dark');
  await page.getByRole('button',{name:'今日へ戻る',exact:true}).click();
  await page.goto('/?screen=body&bodyState=missing');
  await expect(page.getByText('データが不足しています',{exact:true}).first()).toBeVisible();
  await page.setViewportSize({width:1280,height:1000});
  await page.goto('/?preview=1');
  await expect(page.getByTestId('phone-frame')).toBeVisible();
  expect(errors).toEqual([]);
});
