import { test, expect } from '@playwright/test';
import { HOURS_CHECKED_AT, syntheticHours } from './fixtures/hours.mjs';
import { unknownCredit } from './fixtures/credit.mjs';
import path from 'node:path';

test('real UI: budget filter with Persian digits, active badge and offers modal with real dataset', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));

  await page.goto('/');

  // Search with query and Persian digits budget: ۱۰،۰۰۰،۰۰۰
  await page.getByLabel('نام کالا یا مدل', { exact: true }).fill('گوشی');
  await page.getByLabel('سقف بودجه (تومان - اختیاری)', { exact: true }).fill('۱۰،۰۰۰،۰۰۰');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();

  // Verify active budget badge
  await expect(page.locator('.active-filter-badge')).toContainText('۱۰٬۰۰۰٬۰۰۰ تومان');

  // Verify articles rendered
  const articles = page.getByRole('article');
  await expect(articles.first()).toBeVisible();

  // Click on first article's "مشاهدهٔ آفرها" button
  await page.locator('.product-card .secondary-btn').first().click();

  // Verify offers modal is open
  const modal = page.locator('.offers-modal');
  await expect(modal).toBeVisible();
  await expect(modal.locator('#offers-modal-title')).toHaveText('آفرهای فروشندگان');
  await expect(modal.locator('.budget-notice')).toContainText('۱۰٬۰۰۰٬۰۰۰ تومان');

  // Verify at least one offer card is rendered
  const offerCards = modal.locator('.offer-card');
  await expect(offerCards.first()).toBeVisible();
  await expect(modal.getByText('موجودی تأیید نشده', { exact: false }).first()).toBeVisible();
  await expect(modal.getByText('آخرین تغییر قیمت ثبت‌شده:', { exact: false }).first()).toBeVisible();

  // Verify responsive width without overflow in modal
  for (const width of [360, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(noOverflow).toBe(true);
    if (width === 390) {
      await page.screenshot({ path: path.resolve('../../.local/qa/offers-mobile.png') });
    }
  }

  // Close offers modal
  await modal.locator('.close-btn').click();
  await expect(modal).toHaveCount(0);

  // Clear budget filter
  await page.getByRole('button', { name: 'حذف بودجه ✕' }).click();
  await expect(page.locator('.active-filter-badge')).toHaveCount(0);

  expect(errors).toEqual([]);
});

test('real UI: compare 2 to 3 products, compare specs by key/section, enforce limit of 3, responsive widths', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));

  await page.goto('/');
  await page.getByLabel('نام کالا یا مدل', { exact: true }).fill('گوشی');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();

  // Select 1st product
  const cards = page.locator('.product-card');
  await expect(cards.first()).toBeVisible();

  await cards.nth(0).locator('.compare-btn').click();
  await expect(page.locator('.compare-bar')).toContainText('۱ محصول');

  // Select 2nd product
  await cards.nth(1).locator('.compare-btn').click();
  await expect(page.locator('.compare-bar')).toContainText('۲ محصول');

  // Select 3rd product
  await cards.nth(2).locator('.compare-btn').click();
  await expect(page.locator('.compare-bar')).toContainText('۳ محصول');

  // Attempt to select 4th product -> Should trigger limit warning
  await cards.nth(3).locator('.compare-btn').click();
  await expect(page.locator('.warning-notice')).toContainText('حداکثر می‌توانید ۳ محصول را برای مقایسه انتخاب کنید');

  // Open comparison modal
  await page.getByRole('button', { name: 'مشاهدهٔ مقایسهٔ محصولات' }).click();
  const modal = page.locator('.comparison-modal');
  await expect(modal).toBeVisible();
  await expect(modal.locator('#compare-modal-title')).toHaveText('مقایسهٔ ۲ تا ۳ محصول');

  // Verify 3 columns of compared products
  await expect(modal.locator('.compare-product-col')).toHaveCount(3);

  // Check responsive viewport and screenshots
  for (const width of [360, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(noOverflow).toBe(true);
    if (width === 390) {
      await page.screenshot({ path: path.resolve('../../.local/qa/compare-mobile.png') });
    }
  }

  // Remove one product in modal
  await modal.locator('.remove-col-btn').first().click();
  await expect(modal.locator('.compare-product-col')).toHaveCount(2);

  // Close modal
  await modal.locator('.close-btn').click();
  await expect(modal).toHaveCount(0);

  // Compare bar now shows 2 products
  await expect(page.locator('.compare-bar')).toContainText('۲ محصول');

  // Clear comparison
  await page.locator('.compare-bar .text-btn').click();
  await expect(page.locator('.compare-bar')).toHaveCount(0);

  expect(errors).toEqual([]);
});

test('synthetic fixture: preserve multiple offers of same shop, format dates in Asia/Tehran, flag large money', async ({ page }) => {
  const syntheticProduct = {
    product_id: 'prod_synthetic_test',
    persian_title: 'گوشی آزمایشی چندآفر',
    brand_name: 'برند تستی',
    model: 'مدل ایکس',
    category_name: 'گوشی موبایل',
    specs: [
      { key: 'حافظه داخلی', section: 'حافظه', value: '۱۲۸ گیگابایت' },
      { key: 'رم', section: 'حافظه', value: '۸ گیگابایت' },
    ],
    image_urls: [],
    offer_summary: {
      offer_count: 3,
      min_price_toman: '5000000',
      max_price_toman: '733518940747298944',
      missing_price_count: 1,
    },
  };

  const syntheticOffers = {
    items: [
      {
        offer_id: 'offer_1',
        product_id: 'prod_synthetic_test',
        shop_id: 'shop_same',
        price_toman: '5000000',
        price_quality: 'not_assessed',
        last_price_changed_at: '2026-10-14T08:30:00Z',
        seller_title: 'رنگ مشکی با گارانتی رسمی',
        description: 'تحویل حضوری در فروشگاه',
        warranty: { description: 'گارانتی ۱۸ ماهه معتبر' },
        inventory_status: 'unconfirmed',
        shop: {
          name: 'فروشگاه نمونه بازار',
          address: 'تهران، خیابان جمهوری، پاساژ علاءالدین، طبقه اول، پلاک ۱۲',
          location_label: 'علاءالدین',
          lat: 35.69,
          lon: 51.41,
        },
      },
      {
        offer_id: 'offer_2',
        product_id: 'prod_synthetic_test',
        shop_id: 'shop_same',
        price_toman: '733518940747298944',
        price_quality: 'above_js_safe_integer',
        last_price_changed_at: '2026-10-15T12:00:00Z',
        seller_title: 'رنگ آبی پک اصلی',
        description: null,
        warranty: 'گارانتی شرکتی',
        inventory_status: 'unconfirmed',
        shop: {
          name: 'فروشگاه نمونه بازار',
          address: 'تهران، خیابان جمهوری، پاساژ علاءالدین، طبقه اول، پلاک ۱۲',
          location_label: 'علاءالدین',
          lat: 35.69,
          lon: 51.41,
        },
      },
      {
        offer_id: 'offer_3',
        product_id: 'prod_synthetic_test',
        shop_id: 'shop_same',
        price_toman: null,
        price_quality: 'missing',
        last_price_changed_at: null,
        seller_title: null,
        description: null,
        warranty: null,
        inventory_status: 'unconfirmed',
        shop: {
          name: 'فروشگاه نمونه بازار',
          address: 'تهران، خیابان جمهوری، پاساژ علاءالدین، طبقه اول، پلاک ۱۲',
          location_label: 'علاءالدین',
          lat: 35.69,
          lon: 51.41,
        },
      },
    ],
    has_more: false,
    limit: 10,
    offset: 0,
    provenance: {
      currency: 'toman',
      inventory_status: 'unconfirmed',
    },
  };

  await page.route('**/api/products?**', route => {
    return route.fulfill({
      json: {
        items: [syntheticProduct],
        has_more: false,
        provenance: { currency: 'toman', inventory_status: 'unconfirmed' },
      },
    });
  });

  await page.route('**/api/products/prod_synthetic_test/offers?**', route => {
    return route.fulfill({ json: { ...syntheticOffers, hours_evaluated_at: HOURS_CHECKED_AT,
      items: syntheticOffers.items.map(offer => ({ ...offer, opening_hours: syntheticHours(), in_person_credit: unknownCredit() })) } });
  });

  await page.goto('/');
  await page.getByLabel('نام کالا یا مدل', { exact: true }).fill('چندآفر');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();

  // Open offers
  await page.locator('.product-card .secondary-btn').click();
  const modal = page.locator('.offers-modal');
  await expect(modal).toBeVisible();

  // Verify all 3 offers preserved for same shop
  const cards = modal.locator('.offer-card');
  await expect(cards).toHaveCount(3);

  // Offer 1 checks
  await expect(cards.nth(0).getByText('۵٬۰۰۰٬۰۰۰')).toBeVisible();
  await expect(cards.nth(0).getByText('گارانتی ۱۸ ماهه معتبر')).toBeVisible();
  await expect(cards.nth(0).getByText('آخرین تغییر قیمت ثبت‌شده:')).toBeVisible();

  // Offer 2 checks (large money warning)
  await expect(cards.nth(1).getByText('هشدار: قیمت بسیار بزرگ در منبع')).toBeVisible();

  // Offer 3 checks (missing price)
  await expect(cards.nth(2).getByText('قیمتی ثبت نشده')).toBeVisible();
  await expect(cards.nth(2).getByText('تاریخ ثبت نشده')).toBeVisible();

  // Verify no fake contact links
  await expect(modal.locator('a[href^="tel:"],a[href*="wa.me"]')).toHaveCount(0);
});

test('synthetic fixture: validate invalid budget input without network request', async ({ page }) => {
  let requestMade = false;
  await page.route('**/api/products?**', route => {
    requestMade = true;
    return route.fulfill({ json: { items: [], has_more: false, provenance: { currency: 'toman', inventory_status: 'unconfirmed' } } });
  });

  await page.goto('/');
  await page.getByLabel('نام کالا یا مدل', { exact: true }).fill('گوشی');
  // Enter invalid budget (letters)
  await page.getByLabel('سقف بودجه (تومان - اختیاری)', { exact: true }).fill('abc');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();

  await expect(page.getByRole('alert')).toContainText('بودجه باید فقط شامل ارقام عددی باشد');
  expect(requestMade).toBe(false);
});

test('real UI: manual coordinates, radius filter and direct distance calculation with real dataset', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));

  await page.goto('/');
  await page.getByLabel('نام کالا یا مدل', { exact: true }).fill('گوشی');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();

  // Open offers of first product
  await page.locator('.product-card .secondary-btn').first().click();
  const modal = page.locator('.offers-modal');
  await expect(modal).toBeVisible();

  // Initially before location: distance indicates location required
  await expect(modal.getByText('نیازمند تعیین موقعیت کاربر').first()).toBeVisible();

  // Enter manual coordinates (central Tehran) and radius 5km
  await modal.getByLabel('عرض جغرافیایی (lat)', { exact: true }).fill('35.700');
  await modal.getByLabel('طول جغرافیایی (lon)', { exact: true }).fill('51.400');
  await modal.getByLabel('شعاع جست‌وجو', { exact: true }).selectOption('5');
  await modal.getByRole('button', { name: 'اعمال فیلتر محدوده', exact: true }).click();

  // Active location badge visible
  await expect(modal.locator('.active-location-badge')).toContainText('شعاع: تا ۵ کیلومتر');

  // Verify direct distance is computed and shown
  await expect(modal.getByText('فاصلهٔ مستقیم هوایی:', { exact: false }).first()).toBeVisible();

  // Verify unique shop count is displayed
  await expect(modal.getByText('فروشگاه یکتا', { exact: false })).toBeVisible();

  // Responsive check
  for (const width of [360, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(noOverflow).toBe(true);
  }

  // Clear location
  await modal.getByRole('button', { name: 'حذف موقعیت', exact: true }).click();
  await expect(modal.locator('.active-location-badge')).toHaveCount(0);
  await expect(modal.getByText('نیازمند تعیین موقعیت کاربر').first()).toBeVisible();

  expect(errors).toEqual([]);
});

test('synthetic fixture: browser geolocation explicit click and error handling', async ({ page }) => {
  // Override geolocation to simulate permission denied
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (success, error) => {
      error({ code: 1, message: 'User denied Geolocation' });
    };
  });

  await page.goto('/');
  await page.getByLabel('نام کالا یا مدل', { exact: true }).fill('گوشی');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();

  // Open offers
  await page.locator('.product-card .secondary-btn').first().click();
  const modal = page.locator('.offers-modal');
  await expect(modal).toBeVisible();

  // Click on "دریافت موقعیت از مرورگر"
  await modal.getByRole('button', { name: 'دریافت موقعیت از مرورگر', exact: true }).click();

  // Expect polite error message
  await expect(modal.getByRole('alert')).toContainText('اجازهٔ دسترسی به موقعیت مکانی داده نشد');
});

test('synthetic fixture: radius without coordinates is rejected before network request', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('نام کالا یا مدل', { exact: true }).fill('گوشی');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();

  await page.locator('.product-card .secondary-btn').first().click();
  const modal = page.locator('.offers-modal');
  await expect(modal).toBeVisible();

  // Choose radius without entering lat/lon
  await modal.getByLabel('شعاع جست‌وجو', { exact: true }).selectOption('5');
  await modal.getByRole('button', { name: 'اعمال فیلتر محدوده', exact: true }).click();

  await expect(modal.getByRole('alert')).toContainText('تعیین شعاع فاصله نیازمند ارائهٔ موقعیت معتبر');
});

test('local UI: budget formatting with commas and real-time Persian words conversion', async ({ page }) => {
  await page.goto('/');

  const budgetInput = page.getByLabel('سقف بودجه (تومان - اختیاری)', { exact: true });
  const wordsCaption = page.locator('.budget-words-caption');

  // Initially words caption is hidden
  await expect(wordsCaption).toHaveCount(0);

  // Type 10000000
  await budgetInput.fill('10000000');
  await expect(budgetInput).toHaveValue('10,000,000');
  await expect(wordsCaption).toBeVisible();
  await expect(wordsCaption).toContainText('ده میلیون تومان');

  // Type 50000000
  await budgetInput.fill('50000000');
  await expect(budgetInput).toHaveValue('50,000,000');
  await expect(wordsCaption).toContainText('پنجاه میلیون تومان');

  // Type 0
  await budgetInput.fill('0');
  await expect(budgetInput).toHaveValue('0');
  await expect(wordsCaption).toContainText('صفر تومان');

  // Clear input
  await budgetInput.fill('');
  await expect(wordsCaption).toHaveCount(0);

  // Type Persian digits
  await budgetInput.fill('۱۰،۰۰۰،۰۰۰');
  await expect(budgetInput).toHaveValue('۱۰٬۰۰۰٬۰۰۰');
  await expect(wordsCaption).toContainText('ده میلیون تومان');
});

test('real UI: floating toast appears in viewport after scroll when selecting 4th product', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('نام کالا یا مدل', { exact: true }).fill('گوشی');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();

  const cards = page.locator('.product-card');
  await expect(cards.first()).toBeVisible();

  // Select 3 products
  await cards.nth(0).locator('.compare-btn').click();
  await cards.nth(1).locator('.compare-btn').click();
  await cards.nth(2).locator('.compare-btn').click();

  // Scroll down so the top of the page is out of viewport
  await page.evaluate(() => window.scrollTo(0, 600));
  const scrollY = await page.evaluate(() => window.scrollY);
  expect(scrollY).toBeGreaterThan(100);

  // Select 4th product
  await cards.nth(3).locator('.compare-btn').click();

  // Floating toast notification should be visible immediately in current viewport
  const toast = page.locator('.toast-notification');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('حداکثر می‌توانید ۳ محصول را برای مقایسه انتخاب کنید');

  // Verify toast bounding box is in viewport
  const toastBox = await toast.boundingBox();
  expect(toastBox).not.toBeNull();
  const viewport = page.viewportSize();
  if (toastBox && viewport) {
    expect(toastBox.y + toastBox.height).toBeLessThanOrEqual(viewport.height);
    expect(toastBox.y).toBeGreaterThanOrEqual(0);
  }

  // Dismiss via close button
  await toast.locator('.toast-close-btn').click();
  await expect(toast).toHaveCount(0);
});
