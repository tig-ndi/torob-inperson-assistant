import { useWorkspace } from '../../base/state/Workspace.tsx';
import { Button } from '../../base/ui/primitives.tsx';
import { currentOffers, selectionReview } from './model.ts';

/** A changed condition must never silently promote the old selection. */
export function ReviewNotice() {
  const { state, dispatch } = useWorkspace();
  const selected = state.selectedOffer;
  if (!selected || !state.selectionNeedsReview) return null;
  const review = selectionReview(selected, currentOffers(state) ?? []);
  return <div className="uv-review" role="status">
    <strong>شرایط جست‌وجو، بودجه یا موقعیت تغییر کرده‌اند.</strong>
    <p>انتخاب قبلی به‌طور خودکار واجد شرایط معرفی نمی‌شود.</p>
    {review === 'visible'
      ? <><p>این آفر در نتیجهٔ بارگذاری‌شدهٔ فعلی دیده می‌شود؛ تأیید صریح شما لازم است.</p>
        <Button tone="secondary" onClick={() => dispatch({ type: 'selectOffer', value: selected })}>تأیید همین انتخاب</Button></>
      : <p>این آفر در صفحهٔ بارگذاری‌شدهٔ فعلی دیده نمی‌شود؛ آفر دیگری انتخاب کنید یا شرایط را بازگردانید.</p>}
  </div>;
}
