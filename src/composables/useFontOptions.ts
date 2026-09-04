/**
 * אפשרויות הגופן, כפי שקומפוננטה רואה אותן.
 *
 * ברירת המחדל של ה-inject היא הרשימה שלנו ולא רשימה ריקה: קומפוננטה שמורכבת
 * בלי המעטפת (בדיקה, או Ribbon שעולה לפני שנפתח מסמך) צריכה בורר עובד ולא
 * בורר ריק.
 */
import { computed, inject, shallowRef, type ComputedRef } from 'vue';
import type { FontSizeOption } from 'superdoc/ui';
import { fallbackFontOptions, type FontFamilyChoice } from '../engine/font-options';
import { FONT_OPTIONS } from './keys';

export interface UseFontOptions {
  families: ComputedRef<readonly FontFamilyChoice[]>;
  sizes: ComputedRef<readonly FontSizeOption[]>;
}

export function useFontOptions(): UseFontOptions {
  // הצורה עם factory (`true`) ולא ערך ישיר: אחרת הרשימה נבנית בכל הרכבה גם
  // כשהמעטפת כן מספקת את המפתח.
  const options = inject(FONT_OPTIONS, () => shallowRef(fallbackFontOptions()), true);

  return {
    families: computed(() => options.value.families),
    sizes: computed(() => options.value.sizes),
  };
}
