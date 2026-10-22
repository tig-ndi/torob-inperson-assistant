import { StrictMode, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import {
  OFFERS_PAGE_SIZE,
  PAGE_SIZE,
  extractAllSpecKeys,
  fetchProductOffers,
  formatBudgetInput,
  formatDistance,
  formatTehranDateTime,
  formatWarranty,
  getProductSpecValue,
  normalizeBudget,
  numberToPersianWords,
  parseCoordinateWithValidation,
  searchProducts,
  validateBudget,
} from './api';
import type { AssistantBatteryRequirement, OfferPage, Product, ProductPage } from './api';
import { OpeningHoursDetails } from './OpeningHours';
import { InPersonCreditDetails } from './InPersonCredit';
import { Assistant } from './Assistant';
import { Modal } from './Modal';
import { SpecEvidence } from './SpecEvidence';
import { focusFromNeed, type SpecFocus } from './specEvidenceData';
import './style.css';

type SearchState =
  | { kind: 'idle' }
  | { kind: 'loading'; query: string; offset: number; budget: string | null; categoryName?: string | null; categoryCleared?: boolean }
  | { kind: 'success'; query: string; offset: number; budget: string | null; page: ProductPage; categoryName: string | null; categoryCleared: boolean }
  | { kind: 'error'; query: string; offset: number; budget: string | null; message: string; categoryName?: string | null; categoryCleared?: boolean };

type OffersState =
  | { kind: 'idle' }
  | { kind: 'loading'; offset: number }
  | { kind: 'success'; offset: number; page: OfferPage }
  | { kind: 'error'; offset: number; message: string };

const numbers = new Intl.NumberFormat('fa-IR');
const formatMoney = (value: string) => numbers.format(BigInt(value));

function ProductCard({
  product,
  isSelected,
  onToggleCompare,
  onViewOffers,
  specFocus,
}: {
  product: Product;
  isSelected: boolean;
  onToggleCompare: (product: Product) => void;
  onViewOffers: (product: Product) => void;
  specFocus: SpecFocus | null;
}) {
  const summary = product.offer_summary;
  const min = summary.min_price_toman;
  const max = summary.max_price_toman;
  const precisionWarning = max !== null && BigInt(max) > 9007199254740991n;

  return (
    <article className={`product-card ${isSelected ? 'selected' : ''}`} data-product-id={product.product_id}>
      <div className="card-top">
        <span className="category">{product.category_name?.trim() || 'دسته ثبت نشده'}</span>
        <span className="product-mark" aria-hidden="true">کالا</span>
      </div>
      <h3>{product.persian_title?.trim() || 'عنوان محصول ثبت نشده'}</h3>
      <p className="brand">
        {product.brand_name?.trim() || 'برند ثبت نشده'}
        {product.model?.trim() ? ` · مدل: ${product.model.trim()}` : ''}
      </p>
      <div className="price-block">
        <p className="caption">بازهٔ کل قیمت‌های ثبت‌شده</p>
        <p className="price">
          {min === null ? (
            'قیمتی ثبت نشده'
          ) : (
            <>
              <bdi>{formatMoney(min)}</bdi>
              {max !== null && max !== min && (
                <> تا <bdi>{formatMoney(max)}</bdi></>
              )}{' '}
              <span>تومان</span>
            </>
          )}
        </p>
        {precisionWarning && <p className="warning">عدد بسیار بزرگ در منبع؛ نیازمند بررسی قیمت</p>}
      </div>
      <p className="offer-count">
        {numbers.format(summary.offer_count)} آفر ثبت‌شده
        {summary.missing_price_count > 0 && (
          <> · {numbers.format(summary.missing_price_count)} بدون قیمت</>
        )}
      </p>
      <p className="inventory">موجودی تأیید نشده (سابقهٔ کاتالوگ)</p>
      {product.battery_capacity && (
        <p className="battery-capacity-line">
          {product.battery_capacity.status === 'known' && product.battery_capacity.capacity_mah !== null ? (
            <>
              ظرفیت باتری ثبت‌شده: <bdi>{numbers.format(product.battery_capacity.capacity_mah)}</bdi> میلی‌آمپرساعت
            </>
          ) : product.battery_capacity.status === 'conflicting' ? (
            'ظرفیت باتری در منبع به‌صورت متناقض ثبت شده است'
          ) : (
            'ظرفیت باتری در منبع ثبت نشده است'
          )}
        </p>
      )}
      {specFocus && <SpecEvidence product={product} focus={specFocus} />}
      <div className="card-actions">
        <button
          type="button"
          className="secondary-btn"
          onClick={() => onViewOffers(product)}
        >
          مشاهدهٔ آفرها ({numbers.format(summary.offer_count)})
        </button>
        <button
          type="button"
          className={`compare-btn ${isSelected ? 'active' : ''}`}
          onClick={() => onToggleCompare(product)}
          aria-pressed={isSelected}
        >
          {isSelected ? '✓ در مقایسه' : '+ انتخاب برای مقایسه'}
        </button>
      </div>
    </article>
  );
}

function ComparisonModal({
  products,
  onClose,
  onRemove,
  onViewOffers,
}: {
  products: Product[];
  onClose: () => void;
  onRemove: (productId: string) => void;
  onViewOffers: (product: Product) => void;
}) {
  const specKeys = extractAllSpecKeys(products);

  return (
    <Modal isOpen onClose={onClose} titleId="compare-modal-title" className="comparison-modal">
      <div className="modal-header">
          <div>
            <h2 id="compare-modal-title">مقایسهٔ ۲ تا ۳ محصول</h2>
            <p className="caption">مشخصات بر اساس کلید و بخش منبع تطبیق داده شده‌اند؛ اطلاعات ناموجود به‌طور صریح مشخص‌اند.</p>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="بستن پنجرهٔ مقایسه">✕</button>
        </div>

        {products.length < 2 ? (
          <div className="state-panel">
            <h3>حداقل ۲ محصول را انتخاب کنید</h3>
            <p>برای مقایسه، لطفاً حداقل ۲ کالا از نتایج جست‌وجو به لیست مقایسه اضافه کنید.</p>
          </div>
        ) : (
          <div className="comparison-body">
            <div className="comparison-products-row">
              {products.map(p => {
                const s = p.offer_summary;
                return (
                  <div key={p.product_id} className="compare-product-col">
                    <button
                      type="button"
                      className="remove-col-btn"
                      onClick={() => onRemove(p.product_id)}
                      title="حذف از مقایسه"
                    >
                      حذف از مقایسه ✕
                    </button>
                    <h3 className="compare-product-title">{p.persian_title?.trim() || 'عنوان محصول ثبت نشده'}</h3>
                    <p className="caption">برند: {p.brand_name?.trim() || 'ثبت نشده'}</p>
                    <p className="caption">دسته: {p.category_name?.trim() || 'ثبت نشده'}</p>
                    <p className="price">
                      {s.min_price_toman === null ? (
                        'قیمتی ثبت نشده'
                      ) : (
                        <>
                          <bdi>{formatMoney(s.min_price_toman)}</bdi>
                          {s.max_price_toman !== null && s.max_price_toman !== s.min_price_toman && (
                            <> تا <bdi>{formatMoney(s.max_price_toman)}</bdi></>
                          )}{' '}
                          <span>تومان</span>
                        </>
                      )}
                    </p>
                    <button
                      type="button"
                      className="secondary-btn small-btn"
                      onClick={() => {
                        onClose();
                        onViewOffers(p);
                      }}
                    >
                      مشاهدهٔ آفرها
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="specs-section">
              <h3>جدول مقایسهٔ مشخصات فنی</h3>
              {specKeys.length === 0 ? (
                <p className="caption">مشخصات فنی ساختاریافته در کاتالوگ برای این محصولات ثبت نشده است.</p>
              ) : (
                <div className="specs-list">
                  {specKeys.map(k => (
                    <div key={`${k.section}:::${k.key}`} className="spec-row">
                      <div className="spec-label">
                        <strong>{k.displayKey}</strong>
                        {k.displaySection && k.displaySection !== 'مشخصات عمومی' && (
                          <span className="spec-section-badge">{k.displaySection}</span>
                        )}
                      </div>
                      <div className="spec-values">
                        {products.map(p => (
                          <div key={p.product_id} className="spec-val-item">
                            <span className="product-tag">{p.persian_title?.slice(0, 20) || 'کالا'}</span>
                            <span className="val-text">{getProductSpecValue(p, k.section, k.key)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
  );
}

function OffersModal({
  product,
  budget,
  userLat,
  userLon,
  maxDistanceKm,
  openNowOnly,
  inPersonCreditOnly,
  state,
  onClose,
  onPageChange,
  onLocationChange,
  onHoursFilterChange,
  onCreditFilterChange,
  onRefreshHours,
  onRetry,
}: {
  product: Product;
  budget: string | null;
  userLat: number | null;
  userLon: number | null;
  maxDistanceKm: number | null;
  openNowOnly: boolean;
  inPersonCreditOnly: boolean;
  state: OffersState;
  onClose: () => void;
  onPageChange: (offset: number) => void;
  onLocationChange: (lat: number | null, lon: number | null, radius: number | null) => void;
  onHoursFilterChange: (openOnly: boolean) => void;
  onCreditFilterChange: (creditOnly: boolean) => void;
  onRefreshHours: () => void;
  onRetry: () => void;
}) {
  const [latInput, setLatInput] = useState(userLat !== null ? String(userLat) : '');
  const [lonInput, setLonInput] = useState(userLon !== null ? String(userLon) : '');
  const [radiusInput, setRadiusInput] = useState(maxDistanceKm !== null ? String(maxDistanceKm) : '');
  const [locationError, setLocationError] = useState('');
  const [isLocating, setIsLocating] = useState(false);

  function handleLocateMe() {
    setLocationError('');
    if (!('geolocation' in navigator)) {
      setLocationError('مرورگر شما از دریافت خودکار موقعیت مکانی پشتیبانی نمی‌کند؛ لطفاً مختصات را دستی وارد کنید.');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      position => {
        setIsLocating(false);
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        setLatInput(lat.toFixed(5));
        setLonInput(lon.toFixed(5));
        const rad = radiusInput ? Number(radiusInput) : null;
        onLocationChange(lat, lon, rad);
      },
      error => {
        setIsLocating(false);
        if (error.code === 1) {
          setLocationError('اجازهٔ دسترسی به موقعیت مکانی داده نشد؛ می‌توانید مختصات را دستی وارد کنید.');
        } else {
          setLocationError('دریافت موقعیت مکانی با خطا مواجه شد؛ لطفاً مختصات را دستی وارد کنید.');
        }
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  }

  function handleApplyLocation(e: FormEvent) {
    e.preventDefault();
    setLocationError('');
    const latRes = parseCoordinateWithValidation(latInput, 'lat');
    const lonRes = parseCoordinateWithValidation(lonInput, 'lon');
    const rad = radiusInput ? Number(radiusInput) : null;

    if (latRes.status === 'empty' && lonRes.status === 'empty' && rad === null) {
      onLocationChange(null, null, null);
      return;
    }

    if (latRes.status === 'invalid') {
      setLocationError(latRes.error);
      return;
    }

    if (lonRes.status === 'invalid') {
      setLocationError(lonRes.error);
      return;
    }

    const lat = latRes.status === 'valid' ? latRes.value : null;
    const lon = lonRes.status === 'valid' ? lonRes.value : null;

    if ((lat === null) !== (lon === null)) {
      setLocationError('مختصات عرض (lat) و طول (lon) جغرافیایی باید هر دو با هم وارد شوند.');
      return;
    }

    if (rad !== null && (lat === null || lon === null)) {
      setLocationError('تعیین شعاع فاصله نیازمند ارائهٔ موقعیت معتبر (عرض و طول جغرافیایی) است.');
      return;
    }

    if (rad !== null && (!Number.isFinite(rad) || rad <= 0 || rad > 1000)) {
      setLocationError('شعاع فاصله باید عددی مثبت و حداکثر ۱۰۰۰ کیلومتر باشد.');
      return;
    }

    onLocationChange(lat, lon, rad);
  }

  function handleClearLocation() {
    setLatInput('');
    setLonInput('');
    setRadiusInput('');
    setLocationError('');
    onLocationChange(null, null, null);
  }

  const hasLocationFilter = userLat !== null && userLon !== null;
  const uniqueShopCount = state.kind === 'success'
    ? new Set(state.page.items.map(o => o.shop_id)).size
    : 0;

  return (
    <Modal isOpen onClose={onClose} titleId="offers-modal-title" className="offers-modal">
      <div className="modal-header">
          <div>
            <h2 id="offers-modal-title">آفرهای فروشندگان</h2>
            <p className="caption">
              کالا: <strong>{product.persian_title?.trim() || 'عنوان محصول ثبت نشده'}</strong>
            </p>
            {budget ? (
              <p className="budget-notice">
                سقف بودجهٔ فعال: <strong>{formatMoney(budget)} تومان</strong> (آفرهای گران‌تر یا بدون قیمت حذف شده‌اند).
              </p>
            ) : (
              <p className="budget-notice neutral">
                نمایش همهٔ آفرهای ثبت‌شده در منبع (شامل قیمت‌های نامعلوم؛ چند آفر یک فروشگاه حفظ شده‌اند).
              </p>
            )}
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="بستن لیست آفرها">✕</button>
        </div>

        <div className="hours-filter-box">
          <label className="hours-filter-label">
            <input type="checkbox" checked={openNowOnly} onChange={e => onHoursFilterChange(e.target.checked)} />
            فقط فروشگاه‌هایی که طبق ساعات ثبت‌شده اکنون بازند
          </label>
          <p className="caption">این فیلتر تأیید زنده نیست؛ فروشگاه‌های با ساعت نامشخص را هم کنار می‌گذارد.</p>
          {state.kind === 'success' && <p className="caption hours-checked-at">
            زمان بررسی ساعات: {formatTehranDateTime(state.page.hours_evaluated_at, true)} (به وقت تهران)
          </p>}
          <button type="button" className="secondary small-action-btn" disabled={state.kind === 'loading'}
            onClick={onRefreshHours}>به‌روزرسانی وضعیت ساعت</button>
        </div>

        <div className="credit-filter-box">
          <label className="hours-filter-label">
            <input type="checkbox" checked={inPersonCreditOnly} onChange={e => onCreditFilterChange(e.target.checked)} />
            فقط آفرهای منطبق با شرایط ثبت‌شدهٔ خرید اعتباری حضوری
          </label>
          <p className="caption">کانال نامشخص، قیمت نامعلوم و شرایط ناقص کنار گذاشته می‌شوند. این فیلتر تأیید اعتبار یا امکان قطعی خرید نیست.</p>
        </div>

        {/* Location & Radius Filter Section */}
        <div className="location-filter-box">
          <div className="location-filter-header">
            <strong>موقعیت کاربر و فیلتر شعاع فروشگاه‌ها</strong>
            <p className="caption">
              محاسبهٔ فاصله بر مبنای تقریب کروی هاورسین است و زمان مسیر یا مسافت رانندگی نیست.
            </p>
          </div>

          <form onSubmit={handleApplyLocation} className="location-form">
            <div className="location-inputs-row">
              <div className="loc-field">
                <label htmlFor="user-lat">عرض جغرافیایی (lat)</label>
                <input
                  id="user-lat"
                  value={latInput}
                  onChange={e => setLatInput(e.target.value)}
                  placeholder="مثلاً ۳۵.۷۰۰"
                  inputMode="decimal"
                />
              </div>

              <div className="loc-field">
                <label htmlFor="user-lon">طول جغرافیایی (lon)</label>
                <input
                  id="user-lon"
                  value={lonInput}
                  onChange={e => setLonInput(e.target.value)}
                  placeholder="مثلاً ۵۱.۴۰۰"
                  inputMode="decimal"
                />
              </div>

              <div className="loc-field">
                <label htmlFor="radius-select">شعاع جست‌وجو</label>
                <select
                  id="radius-select"
                  value={radiusInput}
                  onChange={e => setRadiusInput(e.target.value)}
                >
                  <option value="">بدون محدودیت شعاع</option>
                  <option value="2">۲ کیلومتر</option>
                  <option value="5">۵ کیلومتر</option>
                  <option value="10">۱۰ کیلومتر</option>
                  <option value="20">۲۰ کیلومتر</option>
                </select>
              </div>
            </div>

            <div className="location-actions-row">
              <button type="submit" className="small-action-btn">اعمال فیلتر محدوده</button>
              <button
                type="button"
                className="secondary small-action-btn"
                onClick={handleLocateMe}
                disabled={isLocating}
              >
                {isLocating ? 'در حال دریافت…' : 'دریافت موقعیت از مرورگر'}
              </button>
              {hasLocationFilter && (
                <button
                  type="button"
                  className="text-btn"
                  onClick={handleClearLocation}
                >
                  حذف موقعیت
                </button>
              )}
            </div>

            {locationError && (
              <p className="error-text" role="alert">{locationError}</p>
            )}

            {hasLocationFilter && (
              <div className="active-location-badge">
                <span>
                  موقعیت فعال: {userLat.toFixed(3)}, {userLon.toFixed(3)}
                  {maxDistanceKm !== null ? ` · شعاع: تا ${numbers.format(maxDistanceKm)} کیلومتر` : ' · بدون سقف شعاع'}
                </span>
              </div>
            )}
          </form>
        </div>

        {state.kind === 'loading' && (
          <div className="state-panel" role="status">
            <span className="spinner" aria-hidden="true" />
            <p>در حال دریافت آفرهای فروشندگان…</p>
          </div>
        )}

        {state.kind === 'error' && (
          <div className="state-panel error-panel" role="alert">
            <h3>خطا در دریافت آفرها</h3>
            <p>{state.message}</p>
            <button type="button" className="secondary" onClick={onRetry}>تلاش مجدد</button>
          </div>
        )}

        {state.kind === 'success' && (
          <div className="offers-body">
            {state.page.items.length === 0 ? (
              <div className="state-panel">
                <h3>هیچ آفری با شرایط انتخابی یافت نشد</h3>
                <p>
                  {inPersonCreditOnly
                    ? 'آفری با همهٔ فیلترهای فعال و شرایط ثبت‌شدهٔ خرید اعتباری حضوری یافت نشد. می‌توانید فیلتر اعتباری را بردارید؛ اطلاعات نامشخص هم کنار گذاشته شده‌اند.'
                    : openNowOnly
                    ? 'آفری با همهٔ فیلترهای فعال و ساعتِ اعلام‌شدهٔ باز یافت نشد؛ ساعت‌های نامشخص هم کنار گذاشته شده‌اند. می‌توانید فیلتر ساعت را بردارید.'
                    : maxDistanceKm !== null
                    ? 'هیچ فروشگاهی در شعاع تعیین‌شده ثبت نشده است (یا فاقد مختصات جغرافیایی بوده است).'
                    : budget
                    ? 'هیچ فروشگاهی با قیمت کمتر یا مساوی سقف بودجهٔ تعیین‌شده ثبت نشده است.'
                    : 'هیچ آفری برای این کالا در کاتالوگ ثبت نشده است.'}
                </p>
              </div>
            ) : (
              <>
                <div className="offers-meta">
                  <span className="caption">
                    صفحهٔ {numbers.format(Math.floor(state.offset / OFFERS_PAGE_SIZE) + 1)} · نمایش {numbers.format(state.page.items.length)} آفر از {numbers.format(uniqueShopCount)} فروشگاه یکتا
                  </span>
                  {state.page.has_more && (
                    <span className="caption warning-caption">
                      صفحهٔ فعلی شامل همهٔ آفرها نیست؛ برای مشاهدهٔ سایر فروشندگان از دکمهٔ «صفحهٔ بعد» استفاده کنید.
                    </span>
                  )}
                </div>

                <div className="offers-grid">
                  {state.page.items.map(offer => {
                    const price = offer.price_toman;
                    const isVeryLarge = offer.price_quality === 'above_js_safe_integer';
                    const hasShopCoords = offer.shop.lat !== null && offer.shop.lon !== null;
                    return (
                      <article key={offer.offer_id} className="offer-card">
                        <div className="offer-header">
                          <h4 className="shop-name">{offer.shop.name?.trim() || 'فروشگاه بدون نام (ناشناس‌شده)'}</h4>
                          <span className="offer-badge" aria-hidden="true">آفر</span>
                        </div>

                        <p className="shop-address">
                          📍 {offer.shop.address?.trim() || offer.shop.location_label?.trim() || 'نشانی ثبت نشده'}
                        </p>

                        {offer.seller_title?.trim() && (
                          <p className="seller-title">عنوان اعلامی فروشنده: {offer.seller_title.trim()}</p>
                        )}

                        <div className="offer-price-block">
                          <p className="price">
                            {price === null ? (
                              'قیمتی ثبت نشده'
                            ) : (
                              <>
                                <bdi>{formatMoney(price)}</bdi> <span>تومان</span>
                              </>
                            )}
                          </p>
                          {isVeryLarge && (
                            <p className="warning">هشدار: قیمت بسیار بزرگ در منبع</p>
                          )}
                        </div>

                        <div className="offer-details">
                          <p className="detail-row">
                            <span>آخرین تغییر قیمت ثبت‌شده:</span>
                            <strong>{formatTehranDateTime(offer.last_price_changed_at)}</strong>
                          </p>
                          <p className="detail-row">
                            <span>گارانتی:</span>
                            <span>{formatWarranty(offer.warranty)}</span>
                          </p>

                          <p className="detail-row">
                            <span>فاصلهٔ مستقیم هوایی:</span>
                            {offer.direct_distance_meters !== null ? (
                              <strong>{formatDistance(offer.direct_distance_meters)}</strong>
                            ) : !hasShopCoords ? (
                              <span className="warning">موقعیت ثبت نشده (فاصله نامشخص)</span>
                            ) : (
                              <span className="muted-text">نیازمند تعیین موقعیت کاربر</span>
                            )}
                          </p>

                          <p className="detail-row provenance-row">
                            <span>شناسهٔ آفر:</span>
                            <code>{offer.offer_id}</code>
                          </p>
                        </div>

                        <OpeningHoursDetails hours={offer.opening_hours} />
                        <InPersonCreditDetails credit={offer.in_person_credit} />
                        <p className="inventory-warning">موجودی تأیید نشده (سوابق کاتالوگ تاریخی)</p>
                      </article>
                    );
                  })}
                </div>

                {(state.offset > 0 || state.page.has_more) && (
                  <nav className="pagination" aria-label="صفحه‌های آفرها">
                    <button
                      type="button"
                      className="secondary"
                      disabled={state.offset === 0}
                      onClick={() => onPageChange(Math.max(0, state.offset - OFFERS_PAGE_SIZE))}
                    >
                      صفحهٔ قبل
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={!state.page.has_more}
                      onClick={() => onPageChange(state.offset + OFFERS_PAGE_SIZE)}
                    >
                      صفحهٔ بعد
                    </button>
                  </nav>
                )}
              </>
            )}
          </div>
        )}
      </Modal>
  );
}

function App() {
  const [input, setInput] = useState('');
  const [budgetInput, setBudgetInput] = useState('');
  const [activeBudget, setActiveBudget] = useState<string | null>(null);
  const [queryError, setQueryError] = useState('');
  const [budgetError, setBudgetError] = useState('');
  const [state, setState] = useState<SearchState>({ kind: 'idle' });

  // Comparison state
  const [selectedForComparison, setSelectedForComparison] = useState<Product[]>([]);
  const [showComparisonView, setShowComparisonView] = useState(false);
  const [comparisonWarning, setComparisonWarning] = useState('');

  // Offers modal state
  const [activeOffersProduct, setActiveOffersProduct] = useState<Product | null>(null);
  const [offersState, setOffersState] = useState<OffersState>({ kind: 'idle' });
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLon, setUserLon] = useState<number | null>(null);
  const [maxDistanceKm, setMaxDistanceKm] = useState<number | null>(null);
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [inPersonCreditOnly, setInPersonCreditOnly] = useState(false);

  const budgetInputRef = useRef<HTMLInputElement | null>(null);
  const activeSearch = useRef<AbortController | null>(null);
  const activeOffers = useRef<AbortController | null>(null);
  const interactionVersion = useRef(0);
  const budgetDraftVersion = useRef(0);
  const assistantStartDraftVersion = useRef(0);
  const lastCatalogueQuery = useRef<string | null>(null);
  const [assistantCancelVersion, setAssistantCancelVersion] = useState(0);
  const [assistantContextQuery, setAssistantContextQuery] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [categoryCleared, setCategoryCleared] = useState(false);
  const [assistantContextCategory, setAssistantContextCategory] = useState<string | null>(null);
  const [specFocus, setSpecFocus] = useState<SpecFocus | null>(null);
  const [batteryRequirement, setBatteryRequirement] = useState<AssistantBatteryRequirement | null>(null);
  const [activeBatteryMah, setActiveBatteryMah] = useState<number | null>(null);

  const budgetWords = numberToPersianWords(budgetInput);

  useEffect(() => {
    return () => {
      activeSearch.current?.abort();
      activeOffers.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!comparisonWarning) return;
    const timer = setTimeout(() => {
      setComparisonWarning('');
    }, 4500);
    return () => clearTimeout(timer);
  }, [comparisonWarning]);

  function handleBudgetChange(e: React.ChangeEvent<HTMLInputElement>) {
    const inputEl = e.target;
    const raw = inputEl.value;
    const oldPos = inputEl.selectionStart ?? raw.length;
    const rawBefore = raw.slice(0, oldPos);
    const digitsBefore = rawBefore.replace(/[\s,،_٬]/g, '').length;

    const formatted = formatBudgetInput(raw);
    setBudgetInput(formatted);
    budgetDraftVersion.current++;

    requestAnimationFrame(() => {
      if (!budgetInputRef.current) return;
      if (digitsBefore === 0) {
        budgetInputRef.current.setSelectionRange(0, 0);
        return;
      }
      let targetPos = formatted.length;
      let counted = 0;
      for (let i = 0; i < formatted.length; i++) {
        const char = formatted[i];
        if (char && !/[\s,،_٬]/.test(char)) {
          counted++;
        }
        if (counted >= digitsBefore) {
          targetPos = i + 1;
          break;
        }
      }
      budgetInputRef.current.setSelectionRange(targetPos, targetPos);
    });
  }

  function readBudgetDraft(): { ok: true; budget: string | null } | { ok: false; error: string } {
    const normalized = normalizeBudget(budgetInput);
    if (!normalized) return { ok: true, budget: null };
    const check = validateBudget(normalized);
    if (!check.valid) {
      return { ok: false, error: check.error || 'بودجهٔ واردشده نامعتبر است.' };
    }
    return { ok: true, budget: normalized };
  }

  async function search(
    query: string,
    offset = 0,
    budget: string | null = activeBudget,
    categoryName: string | null = activeCategory,
    isCategoryCleared: boolean = categoryCleared,
    batteryMah: number | null = activeBatteryMah
  ) {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length > 120) {
      setQueryError('نام کالا را بین ۱ تا ۱۲۰ نویسه وارد کنید.');
      return;
    }

    if (budget) {
      const budgetCheck = validateBudget(budget);
      if (!budgetCheck.valid) {
        setBudgetError(budgetCheck.error || 'بودجهٔ واردشده نامعتبر است.');
        return;
      }
    }

    setQueryError('');
    setBudgetError('');
    lastCatalogueQuery.current = trimmed;
    interactionVersion.current++;
    setAssistantCancelVersion(version => version + 1);
    setAssistantContextQuery(null);
    activeSearch.current?.abort();
    const controller = new AbortController();
    activeSearch.current = controller;
    setState({
      kind: 'loading',
      query: trimmed,
      offset,
      budget,
      categoryName,
      categoryCleared: isCategoryCleared,
    });
    try {
      const page = await searchProducts(
        trimmed,
        offset,
        budget,
        controller.signal,
        categoryName,
        isCategoryCleared,
        batteryMah
      );
      if (!controller.signal.aborted) {
        const resolvedCategory = isCategoryCleared ? null : (page.category_name ?? categoryName);
        setActiveCategory(resolvedCategory);
        setCategoryCleared(isCategoryCleared);
        setState({
          kind: 'success',
          query: trimmed,
          offset,
          budget,
          page,
          categoryName: resolvedCategory,
          categoryCleared: isCategoryCleared,
        });
        setAssistantContextQuery(trimmed);
        setAssistantContextCategory(resolvedCategory);
        const hasPhones = resolvedCategory === 'گوشی موبایل' || page.items.some(p => p.category_name === 'گوشی موبایل');
        setSpecFocus(previous => hasPhones ? focusFromNeed(trimmed) ?? previous : null);
      }
    } catch (error: unknown) {
      if (!controller.signal.aborted) {
        setState({
          kind: 'error',
          query: trimmed,
          offset,
          budget,
          categoryName,
          categoryCleared: isCategoryCleared,
          message: error instanceof Error ? error.message : 'پاسخ کاتالوگ قابل خواندن نیست. دوباره تلاش کنید.',
        });
      }
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQueryError('');
    setBudgetError('');
    const sameQuery = input.trim() === lastCatalogueQuery.current;
    const nextCategory = sameQuery ? activeCategory : null;
    const nextCleared = sameQuery ? categoryCleared : false;
    const nextBatteryMah = sameQuery ? activeBatteryMah : null;
    if (!sameQuery) {
      setActiveBatteryMah(null);
      setBatteryRequirement(null);
    }
    const draft = readBudgetDraft();
    if (!draft.ok) {
      setBudgetError(draft.error);
      return;
    }
    setActiveBudget(draft.budget);
    void search(input, 0, draft.budget, nextCategory, nextCleared, nextBatteryMah);
  }

  function clearBudget() {
    setBudgetInput('');
    setActiveBudget(null);
    if (state.kind === 'success' || state.kind === 'loading' || state.kind === 'error') {
      void search(state.query, 0, null, activeCategory, categoryCleared);
    }
  }

  function handleClearCategory() {
    setActiveCategory(null);
    setCategoryCleared(true);
    setAssistantContextCategory(null);
    setActiveBatteryMah(null);
    setBatteryRequirement(null);
    if (state.kind === 'success' || state.kind === 'loading' || state.kind === 'error') {
      void search(state.query, 0, activeBudget, null, true, null);
    }
  }

  function handleClearBattery() {
    setActiveBatteryMah(null);
    setBatteryRequirement(null);
    if (state.kind === 'success' || state.kind === 'loading' || state.kind === 'error') {
      void search(state.query, 0, activeBudget, activeCategory, categoryCleared, null);
    }
  }

  function toggleCompare(product: Product) {
    setComparisonWarning('');
    const exists = selectedForComparison.some(p => p.product_id === product.product_id);
    if (exists) {
      setSelectedForComparison(selectedForComparison.filter(p => p.product_id !== product.product_id));
    } else {
      if (selectedForComparison.length >= 3) {
        setComparisonWarning('حداکثر می‌توانید ۳ محصول را برای مقایسه انتخاب کنید.');
        return;
      }
      setSelectedForComparison([...selectedForComparison, product]);
    }
  }

  function removeProductFromComparison(productId: string) {
    setSelectedForComparison(selectedForComparison.filter(p => p.product_id !== productId));
  }

  function openOffers(product: Product, offset = 0) {
    setActiveOffersProduct(product);
    loadOffers(product.product_id, offset, activeBudget, userLat, userLon, maxDistanceKm);
  }

  async function loadOffers(
    productId: string,
    offset: number,
    budget: string | null,
    lat: number | null = userLat,
    lon: number | null = userLon,
    radiusKm: number | null = maxDistanceKm,
    openOnly: boolean = openNowOnly,
    creditOnly: boolean = inPersonCreditOnly
  ) {
    activeOffers.current?.abort();
    const controller = new AbortController();
    activeOffers.current = controller;
    setOffersState({ kind: 'loading', offset });
    try {
      const page = await fetchProductOffers(productId, offset, budget, lat, lon, radiusKm, openOnly, creditOnly, controller.signal);
      if (!controller.signal.aborted) {
        setOffersState({ kind: 'success', offset, page });
      }
    } catch (error: unknown) {
      if (!controller.signal.aborted) {
        setOffersState({
          kind: 'error',
          offset,
          message: error instanceof Error ? error.message : 'خطا در دریافت اطلاعات آفرها.',
        });
      }
    }
  }

  return (
    <>
      <header className="header">
        <div className="shell header-inner">
          <span className="logo" aria-hidden="true">ت</span>
          <div>
            <p className="site-name">دستیار خرید حضوری</p>
            <p className="header-note">کاتالوگ تهران · پروژهٔ مستقل چالش ترب</p>
          </div>
        </div>
      </header>

      <main className="shell">
        <section className="intro" aria-labelledby="page-title">
          <p className="eyebrow">از پیدا کردن کالا شروع کنیم</p>
          <h1 id="page-title">دنبال چه کالایی می‌گردید؟</h1>
          <p className="intro-copy">
            نام کالا را جست‌وجو کنید، سقف بودجه تعیین کنید و ۲ تا ۳ کالا را برای مقایسه مشخصات و آفرها انتخاب کنید.
          </p>

          <form onSubmit={submit} className="search-form">
            <div className="form-fields">
              <div className="field-group">
                <label htmlFor="query">نام کالا یا مدل</label>
                <input
                  id="query"
                  value={input}
                  maxLength={120}
                  onChange={e => setInput(e.target.value)}
                  placeholder="مثلاً گوشی، کفش یا سونی"
                  autoComplete="off"
                  aria-describedby={queryError ? 'query-validation' : 'search-help'}
                  aria-invalid={Boolean(queryError)}
                />
                {queryError && (
                  <p id="query-validation" className="error-text" role="alert">
                    {queryError}
                  </p>
                )}
              </div>

              <div className="field-group budget-field">
                <label htmlFor="budget">سقف بودجه (تومان - اختیاری)</label>
                <input
                  ref={budgetInputRef}
                  id="budget"
                  value={budgetInput}
                  maxLength={30}
                  onChange={handleBudgetChange}
                  placeholder="مثلاً ۱۰٬۰۰۰٬۰۰۰ یا خالی"
                  autoComplete="off"
                  inputMode="numeric"
                  aria-describedby={budgetError ? 'validation' : undefined}
                  aria-invalid={Boolean(budgetError)}
                />
                {budgetWords && (
                  <p className="budget-words-caption" aria-live="polite">
                    <span className="words-label">معادل به حروف:</span> <strong>{budgetWords}</strong>
                  </p>
                )}
                {budgetError && (
                  <p id="validation" className="error-text" role="alert">
                    {budgetError}
                  </p>
                )}
              </div>
            </div>

            <div className="form-actions">
              <button type="submit">جست‌وجو</button>
            </div>

            <p id="search-help" className="caption">
              جست‌وجو به اطلاعات ثبت‌شده در کاتالوگ محدود است. ارقام بودجه می‌توانند فارسی یا انگلیسی باشند.
            </p>
          </form>

          <div className="examples">
            <span>برای شروع:</span>
            {['گوشی', 'کفش', 'سونی'].map(query => (
              <button
                key={query}
                type="button"
                className="chip"
                onClick={() => {
                  setInput(query);
                  setActiveCategory(null);
                  setCategoryCleared(false);
                  setActiveBatteryMah(null);
                  setBatteryRequirement(null);
                  const draft = readBudgetDraft();
                  if (!draft.ok) {
                    setBudgetError(draft.error);
                    return;
                  }
                  setBudgetError('');
                  setActiveBudget(draft.budget);
                  void search(query, 0, draft.budget, null, false, null);
                }}
              >
                {query}
              </button>
            ))}
          </div>

          {(activeBudget || (state.kind === 'success' && (state.categoryName || (state.categoryCleared && !state.categoryName))) || (activeBatteryMah !== null && batteryRequirement?.status === 'minimum')) && (
            <div className="active-filters-container" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '14px' }}>
              {activeBudget && (
                <div className="active-filter-badge">
                  <span>سقف بودجهٔ فعال: <strong>{formatMoney(activeBudget)} تومان</strong></span>
                  <button type="button" className="clear-filter-btn" onClick={clearBudget} title="حذف فیلتر بودجه">
                    حذف بودجه ✕
                  </button>
                </div>
              )}
              {activeBatteryMah !== null && batteryRequirement?.status === 'minimum' && (
                <div className="active-filter-badge">
                  <span>حداقل ظرفیت باتری: <strong>{numbers.format(activeBatteryMah)} میلی‌آمپرساعت</strong></span>
                  <button
                    type="button"
                    className="clear-filter-btn"
                    onClick={handleClearBattery}
                    title="حذف شرط ظرفیت باتری"
                    aria-label="حذف شرط ظرفیت باتری"
                  >
                    حذف شرط ✕
                  </button>
                </div>
              )}
              {state.kind === 'success' && state.categoryName && (
                <div className="active-category-badge">
                  <span>دسته: <strong>{state.categoryName}</strong></span>
                  <button
                    type="button"
                    className="clear-filter-btn"
                    onClick={handleClearCategory}
                    title="حذف فیلتر دسته"
                    aria-label="حذف فیلتر دسته"
                  >
                    حذف فیلتر دسته ✕
                  </button>
                </div>
              )}
              {state.kind === 'success' && state.categoryCleared && !state.categoryName && (
                <div className="active-category-badge" style={{ background: '#f1f5f9', borderColor: '#cbd5e1', color: '#475569' }}>
                  <span>فیلتر دسته برداشته شد (جست‌وجو در تمام دسته‌ها)</span>
                </div>
              )}
            </div>
          )}
        </section>

        <Assistant
          budget={budgetInput ? normalizeBudget(budgetInput) : null}
          cancelVersion={assistantCancelVersion}
          contextQuery={assistantContextQuery}
          contextCategory={assistantContextCategory}
          categoryCleared={categoryCleared}
          contextBatteryRequirement={batteryRequirement}
          contextTopics={
            specFocus === 'camera'
              ? ['camera']
              : specFocus === 'battery'
              ? ['battery']
              : specFocus === 'both'
              ? ['camera', 'battery']
              : null
          }
          onContext={(query, category, version) => {
            if (version !== undefined && version !== interactionVersion.current) return;
            setAssistantContextQuery(query);
            if (query === null && version === undefined) {
              setCategoryCleared(false);
              setSpecFocus(null);
              setBatteryRequirement(null);
              setActiveBatteryMah(null);
            }
            if (category !== undefined) {
              setAssistantContextCategory(category);
              setActiveCategory(category);
            }
          }}
          onStart={() => {
            const draft = readBudgetDraft();
            if (!draft.ok) {
              setBudgetError(draft.error);
              return null;
            }
            setActiveBudget(draft.budget);
            assistantStartDraftVersion.current = budgetDraftVersion.current;
            setBudgetError('');
            setQueryError('');
            activeSearch.current?.abort();
            setState({ kind: 'idle' });
            return ++interactionVersion.current;
          }}
          onResults={(page, query, budget, version, category, need, batteryReq) => {
            if (version !== interactionVersion.current) return;
            lastCatalogueQuery.current = query;
            setInput(query);
            setAssistantContextQuery(query);
            setAssistantContextCategory(category);
            setBatteryRequirement(batteryReq ?? null);
            setActiveBatteryMah(batteryReq?.status === 'minimum' && batteryReq.minimum_mah !== null ? batteryReq.minimum_mah : null);
            const hasPhones = category === 'گوشی موبایل' || page.items.some(p => p.category_name === 'گوشی موبایل');
            setSpecFocus(previous => hasPhones ? focusFromNeed(need) ?? previous : null);
            setActiveCategory(category);
            const isCleared = category !== null ? false : categoryCleared;
            setCategoryCleared(isCleared);
            setActiveBudget(budget);
            if (budgetDraftVersion.current === assistantStartDraftVersion.current) {
              setBudgetInput(budget === null ? '' : formatBudgetInput(budget));
            }
            setState({
              kind: 'success',
              query,
              offset: 0,
              budget,
              page,
              categoryName: category,
              categoryCleared: isCleared,
            });
          }}
          onBudget={(budget, version, need, batteryReq) => {
            if (version !== interactionVersion.current) return;
            const requestedFocus = focusFromNeed(need);
            if (requestedFocus) setSpecFocus(requestedFocus);
            setBatteryRequirement(batteryReq ?? null);
            setActiveBatteryMah(batteryReq?.status === 'minimum' && batteryReq.minimum_mah !== null ? batteryReq.minimum_mah : null);
            setActiveBudget(budget);
            if (budgetDraftVersion.current === assistantStartDraftVersion.current) {
              setBudgetInput(budget === null ? '' : formatBudgetInput(budget));
            }
          }}
        />

        {comparisonWarning && (
          <aside className="toast-notification warning-notice" role="alert" aria-live="assertive">
            <div className="toast-message">
              <span className="toast-icon" aria-hidden="true">⚠️</span>
              <div>
                <strong>محدودیت مقایسه: </strong>
                <span>{comparisonWarning}</span>
              </div>
            </div>
            <button
              type="button"
              className="toast-close-btn"
              onClick={() => setComparisonWarning('')}
              aria-label="بستن پیام"
            >
              ✕
            </button>
          </aside>
        )}

        <aside className="notice">
          <strong>قبل از مراجعه، قیمت و موجودی را تأیید کنید.</strong>
          <span>
            این کاتالوگ سابقهٔ آفرهای ثبت‌شده است؛ قیمت ثبت‌شده نشانهٔ موجودی فعلی یا قطعی فروشگاه نیست.
          </span>
        </aside>

        {/* Sticky comparison bar */}
        {selectedForComparison.length > 0 && (
          <aside className="compare-bar" aria-label="نوار ابزار مقایسهٔ محصولات">
            <div className="compare-bar-info">
              <strong>{numbers.format(selectedForComparison.length)} محصول</strong> برای مقایسه انتخاب شده (حداکثر ۳ کالا)
            </div>
            <div className="compare-bar-actions">
              <button
                type="button"
                className="secondary"
                disabled={selectedForComparison.length < 2}
                onClick={() => setShowComparisonView(true)}
              >
                مشاهدهٔ مقایسهٔ محصولات
              </button>
              <button
                type="button"
                className="text-btn"
                onClick={() => setSelectedForComparison([])}
              >
                پاک کردن
              </button>
            </div>
          </aside>
        )}

        <section className="results" aria-labelledby="results-title" aria-busy={state.kind === 'loading'}>
          <div className="results-heading">
            <h2 id="results-title">
              {state.kind === 'idle'
                ? 'نتایج جست‌وجو'
                : `نتایج برای «${state.query}»`}
            </h2>
            {state.kind === 'success' && state.page.items.length > 0 && (
              <span className="caption">
                صفحهٔ {numbers.format(state.offset / PAGE_SIZE + 1)}
              </span>
            )}
          </div>

          {state.kind === 'idle' && (
            <div className="state-panel">
              <h3>اولین کالا را پیدا کنید</h3>
              <p>نام کالا را وارد کنید یا یکی از پیشنهادهای بالا را بزنید.</p>
            </div>
          )}

          {state.kind === 'loading' && (
            <div className="state-panel" role="status">
              <span className="spinner" aria-hidden="true" />
              <p>در حال جست‌وجوی کاتالوگ…</p>
            </div>
          )}

          {state.kind === 'error' && (
            <div className="state-panel error-panel" role="alert">
              <h3>جست‌وجو انجام نشد</h3>
              <p>{state.message}</p>
              <button
                type="button"
                className="secondary"
                onClick={() => void search(state.query, state.offset, state.budget, activeCategory, categoryCleared)}
              >
                تلاش مجدد
              </button>
            </div>
          )}

          {state.kind === 'success' && (
            <>
              {(state.categoryName === 'گوشی موبایل' || state.page.items.some(p => p.category_name === 'گوشی موبایل')) && (
                <fieldset className="spec-focus-controls">
                  <legend>کدام مشخصات برای بررسی نیاز شما مهم‌تر است؟</legend>
                  <p className="caption">مشخصات دوربین یا باتری را بررسی کنید؛ عدد مگاپیکسل یا ظرفیت باتری به‌تنهایی کیفیت واقعی را ثابت نمی‌کند.</p>
                  <p className="caption">این انتخاب نمایش مشخصات را تغییر می‌دهد؛ فیلتر یا رتبه‌بندی بر اساس این ویژگی‌ها اعمال نمی‌شود.</p>
                  <div className="spec-focus-actions">
                    {([['camera', 'دوربین'], ['battery', 'باتری'], ['both', 'هر دو']] as const).map(([value, label]) => (
                      <button key={value} type="button" className="secondary" aria-pressed={specFocus === value}
                        onClick={() => setSpecFocus(value)}>بررسی {label}</button>
                    ))}
                    {specFocus && <button type="button" className="secondary" onClick={() => setSpecFocus(null)}>بستن مشخصات مرتبط</button>}
                  </div>
                </fieldset>
              )}
              <p role="status" className="sr-only">
                {numbers.format(state.page.items.length)} محصول در این صفحه
              </p>
              {state.page.items.length === 0 ? (
                <div className="state-panel">
                  <h3>کالایی با این جست‌وجو پیدا نشد</h3>
                  <p>
                    {state.budget
                      ? 'کالایی با این نام و واجد سقف بودجهٔ انتخابی ثبت نشده است. سقف بودجه را تغییر داده یا حذف کنید.'
                      : 'نام کوتاه‌تر یا واژهٔ دیگری را امتحان کنید؛ نبود نتیجه به معنی نبود کالا در بازار نیست.'}
                  </p>
                </div>
              ) : (
                <div className="product-grid">
                  {state.page.items.map(product => {
                    const isSelected = selectedForComparison.some(p => p.product_id === product.product_id);
                    return (
                      <ProductCard
                        key={product.product_id}
                        product={product}
                        specFocus={specFocus}
                        isSelected={isSelected}
                        onToggleCompare={toggleCompare}
                        onViewOffers={openOffers}
                      />
                    );
                  })}
                </div>
              )}

              {(state.offset > 0 || state.page.has_more) && (
                <nav className="pagination" aria-label="صفحه‌های نتایج">
                  <button
                    type="button"
                    className="secondary"
                    disabled={state.offset === 0}
                    onClick={() =>
                      void search(
                        state.query,
                        Math.max(0, state.offset - PAGE_SIZE),
                        state.budget,
                        activeCategory,
                        categoryCleared
                      )
                    }
                  >
                    صفحهٔ قبل
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={!state.page.has_more}
                    onClick={() =>
                      void search(
                        state.query,
                        state.offset + PAGE_SIZE,
                        state.budget,
                        activeCategory,
                        categoryCleared
                      )
                    }
                  >
                    صفحهٔ بعد
                  </button>
                </nav>
              )}
            </>
          )}
        </section>
      </main>

      {/* Comparison Modal */}
      {showComparisonView && (
        <ComparisonModal
          products={selectedForComparison}
          onClose={() => setShowComparisonView(false)}
          onRemove={removeProductFromComparison}
          onViewOffers={openOffers}
        />
      )}

      {/* Offers Modal */}
      {activeOffersProduct && (
        <OffersModal
          product={activeOffersProduct}
          budget={activeBudget}
          userLat={userLat}
          userLon={userLon}
          maxDistanceKm={maxDistanceKm}
          openNowOnly={openNowOnly}
          inPersonCreditOnly={inPersonCreditOnly}
          state={offersState}
          onClose={() => setActiveOffersProduct(null)}
          onPageChange={offset => loadOffers(activeOffersProduct.product_id, offset, activeBudget, userLat, userLon, maxDistanceKm)}
          onLocationChange={(newLat, newLon, newRadius) => {
            setUserLat(newLat);
            setUserLon(newLon);
            setMaxDistanceKm(newRadius);
            loadOffers(activeOffersProduct.product_id, 0, activeBudget, newLat, newLon, newRadius);
          }}
          onHoursFilterChange={openOnly => {
            setOpenNowOnly(openOnly);
            void loadOffers(activeOffersProduct.product_id, 0, activeBudget, userLat, userLon, maxDistanceKm, openOnly);
          }}
          onRefreshHours={() => void loadOffers(activeOffersProduct.product_id, 0, activeBudget, userLat, userLon, maxDistanceKm)}
          onCreditFilterChange={creditOnly => {
            setInPersonCreditOnly(creditOnly);
            void loadOffers(activeOffersProduct.product_id, 0, activeBudget, userLat, userLon, maxDistanceKm, openNowOnly, creditOnly);
          }}
          onRetry={() => {
            const currentOffset = 'offset' in offersState ? offersState.offset : 0;
            void loadOffers(activeOffersProduct.product_id, currentOffset, activeBudget, userLat, userLon, maxDistanceKm);
          }}
        />
      )}

      <footer className="shell footer">
        اطلاعات ثبت‌شده برای بررسی خرید حضوری · بدون تأیید زندهٔ فروشنده · پروژهٔ مستقل مسابقهٔ ترب
      </footer>
    </>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
