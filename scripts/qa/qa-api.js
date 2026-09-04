/**
 * ה-API שבתוך הדף לשערי ה-QA של הרצועה: „מצא את הפקד הזה, אמור לי מה מצבו,
 * ותן לי את המלבן שלו כדי שהלחיצה תהיה לחיצה אמיתית”.
 *
 * למה מלבן ולא `element.click()`: כל פקד ברצועה עושה `@pointerdown.prevent`
 * כדי לא לגזול את המיקוד מהעורך, ו-`click()` תכנותי מדלג בדיוק על השלב הזה —
 * כלומר בודק מסלול שהמשתמש לעולם אינו עובר בו. הלחיצות נשלחות מ-Node דרך
 * `Input.dispatchMouseEvent`.
 */
(function () {
  var Q = (window.__qa = {});

  Q.log = [];
  ['error', 'warn'].forEach(function (level) {
    var original = console[level];
    console[level] = function () {
      try {
        Q.log.push(level + ': ' + Array.prototype.map.call(arguments, String).join(' ').slice(0, 400));
      } catch (e) {}
      return original.apply(console, arguments);
    };
  });
  window.addEventListener('error', function (e) {
    Q.log.push('uncaught: ' + (e && e.message));
  });
  window.addEventListener('unhandledrejection', function (e) {
    Q.log.push('rejected: ' + String((e && e.reason && e.reason.message) || (e && e.reason)));
  });

  Q.ready = function () {
    return !!window.__otzariaEditor && !document.getElementById('otzaria-splash');
  };

  Q.ribbon = function () {
    return document.querySelector('.word-ribbon-container');
  };

  /**
   * שם הפקד כפי שהשער מזהה אותו.
   *
   * `data-tip-title` הוא המקור: תכונת `title` הוסרה מכל התוסף, כדי שמערכת
   * ההפעלה לא תצייר טולטיפ שני מעל הכרטיס המעוצב. הנפילה אליה נשארת כאן כדי
   * שהשער יוכל לרוץ גם על dist ארוז ישן.
   */
  function nameOf(el) {
    var tip = el.getAttribute('data-tip-title');
    if (tip) return tip;
    var title = el.getAttribute('title') || '';
    // ה-title נושא את הקיצור בסוגריים; השם הוא מה שלפניו.
    return title.replace(/\s*\([^)]*\)\s*$/, '') || el.getAttribute('aria-label') || (el.textContent || '').trim();
  }
  Q.nameOf = nameOf;

  /** הלשוניות של הרצועה: המזהה שלהן הוא התווית שמופיעה על הכפתור. */
  Q.tabs = function () {
    return Array.prototype.map.call(document.querySelectorAll('.word-tab-btn'), function (b) {
      return { label: (b.textContent || '').trim(), active: b.classList.contains('active') };
    });
  };

  Q.tabRect = function (label) {
    var found = null;
    Array.prototype.forEach.call(document.querySelectorAll('.word-tab-btn'), function (b) {
      if (!found && (b.textContent || '').trim() === label) found = b;
    });
    return found ? Q.rectOf(found) : null;
  };

  Q.activeTab = function () {
    var b = document.querySelector('.word-tab-btn.active');
    return b ? (b.textContent || '').trim() : null;
  };

  Q.rectOf = function (el) {
    var r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    return {
      x: Math.round(r.x + r.width / 2),
      y: Math.round(r.y + r.height / 2),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  };

  /** כל הפקדים בגוף הלשונית הפעילה. `scope` מאפשר לחפש גם בתפריט פתוח. */
  Q.controls = function (scope) {
    var root = document.querySelector(scope || '.word-ribbon-body');
    if (!root) return [];
    return Array.prototype.map.call(root.querySelectorAll('button, select, input'), function (el) {
      return {
        tag: el.tagName.toLowerCase(),
        name: nameOf(el),
        text: (el.textContent || '').trim().slice(0, 40),
        disabled: !!el.disabled,
        active: el.classList.contains('active'),
        pressed: el.getAttribute('aria-pressed'),
        // גם בורר החיפוש מדווח ערך: הוא `<input>`, וה-`value` שלו הוא הגופן
        // הנוכחי כל עוד לא מקלידים בו (ראו RibbonCombo).
        value: el.tagName === 'SELECT' || el.getAttribute('role') === 'combobox' ? el.value : undefined,
        cls: el.className,
      };
    });
  };

  function match(el, name, exact) {
    var n = nameOf(el);
    return exact ? n === name : n.indexOf(name) === 0;
  }

  /**
   * מאתר פקד לפי שם. מחפש בכל הדף — תפריטים נפתחים מחוץ לגוף הלשונית.
   *
   * נראה קודם, ומוסתר רק כשאין נראה: יש שערים שמודדים פקד לפני שהתפריט
   * שמחזיק אותו נפתח, ולכן אי אפשר להתעלם ממוסתר לגמרי.
   */
  Q.el = function (name, opts) {
    opts = opts || {};
    var scope = document.querySelector(opts.scope || 'body');
    if (!scope) return null;
    var nodes = scope.querySelectorAll(opts.selector || 'button, select, input, [role="menuitem"], [role="option"]');
    var shown = [];
    var hidden = [];
    Array.prototype.forEach.call(nodes, function (el) {
      if (!match(el, name, opts.exact)) return;
      (Q.rectOf(el) ? shown : hidden).push(el);
    });
    var hits = shown.length ? shown : hidden;
    return hits[opts.index || 0] || null;
  };

  /** מה ש-`Q.el` סורק בברירת מחדל, ומה שיכול להחזיק שורות `option`/`menuitem`. */
  var NAME_SEL = 'button, select, input, [role="menuitem"], [role="option"]';
  var LIST_HOSTS = '[role="listbox"], [role="menu"], .ribbon-menu__popover, .ribbon-combo-list';

  /*
    אזורי המעטפת שנושאים שמות של פקודות רצועה מתוך תכנון: סרגל הגישה המהירה,
    טאבי המסמכים, שורת המצב, רשימת ה-Tell Me, ותפריטים/דיאלוגים/פופאוברים
    שנפתחים. הופעת אזור חדש כאן היא החלטה של אדם, ולא ברירת מחדל שקטה.
  */
  var MIRRORS =
    '.quick-access-tools, .word-doctabs-strip, .word-tab-bar, .word-statusbar, ' +
    '#tell-me-listbox, .color-palette-popover, [role="dialog"], ' + LIST_HOSTS;

  /**
   * עמימות בפתרון שם פקד בלשונית הפעילה.
   *
   * הפתרון הוא התאמת קידומת על `textContent` בכל הדף, ולכן השאלה אינה „האם
   * `Q.el` החזיר מוסתר” — זה רק אחד הביטויים — אלא „אילו אלמנטים אחרים נושאים
   * את השם, ומה מעמדם”. `findings` הם אדום: אלמנט שאינו פקד ואינו שורת רשימה,
   * או פקד מחוץ לרצועה ומחוץ לאזורי המראה. `notes` הם מדידה: כפילות לגיטימית
   * בממשק, שאין להמציא עליה אדום שווא.
   */
  Q.shadowed = function () {
    var body = document.querySelector('.word-ribbon-body');
    if (!body) return { tab: null, scanned: 0, findings: [], notes: [], duplicates: [] };

    var tab = Q.activeTab();
    var all = Array.prototype.slice.call(document.querySelectorAll(NAME_SEL));

    function classify(el) {
      var t = el.tagName;
      var control = t === 'BUTTON' || t === 'SELECT' || t === 'INPUT';
      if (!control && !el.closest(LIST_HOSTS)) return 'זר';
      if (body.contains(el)) return 'ribbon';
      if (el.closest(MIRRORS)) return 'mirror';
      return 'מחוץ';
    }
    function tagOf(el) {
      var role = el.getAttribute('role');
      return el.tagName.toLowerCase() + (role ? '[' + role + ']' : '');
    }
    function placeOf(el) {
      var p = el.parentElement;
      return p ? String(p.className || p.tagName).slice(0, 40) : '?';
    }

    var holders = {};
    var names = [];
    Array.prototype.forEach.call(body.querySelectorAll('button, select, input'), function (el) {
      var n = nameOf(el);
      if (!n || !Q.rectOf(el)) return;
      if (holders[n]) return holders[n].push(el);
      holders[n] = [el];
      names.push(n);
    });

    var findings = [];
    var notes = [];
    var duplicates = [];

    names.forEach(function (n) {
      var mine = holders[n];
      var picked = Q.el(n);

      all.forEach(function (x) {
        if (mine.indexOf(x) >= 0 || nameOf(x).indexOf(n) !== 0) return;
        var kind = classify(x);
        var row = { tab: tab, name: n, kind: kind, el: tagOf(x), at: placeOf(x), visible: !!Q.rectOf(x), picked: picked === x };
        if (kind === 'זר' || kind === 'מחוץ') return findings.push(row);
        if (kind === 'mirror') return notes.push({ tab: tab, name: n, kind: 'מראה', at: row.at, picked: row.picked });
        if (nameOf(x) !== n) notes.push({ tab: tab, name: n, kind: 'משפחת-קידומת', other: nameOf(x).slice(0, 30), picked: row.picked });
      });

      if (picked && !Q.rectOf(picked)) {
        findings.push({ tab: tab, name: n, kind: 'מוסתר', el: tagOf(picked), at: placeOf(picked), visible: false, picked: true });
      }
      if (mine.length > 1) {
        // הפקד שלפניו הוא הזהות של כל מופע: „בחירת צבע” הוא חץ של כפתור מפוצל.
        duplicates.push({
          tab: tab,
          name: n,
          holders: mine.map(function (el) {
            var prev = el.previousElementSibling;
            return prev ? nameOf(prev).slice(0, 30) : '';
          }),
        });
      }
    });

    return { tab: tab, scanned: names.length, findings: findings, notes: notes, duplicates: duplicates };
  };

  Q.state = function (name, opts) {
    var el = Q.el(name, opts);
    if (!el) return { found: false };
    return {
      found: true,
      tag: el.tagName.toLowerCase(),
      name: nameOf(el),
      disabled: !!el.disabled,
      active: el.classList.contains('active'),
      pressed: el.getAttribute('aria-pressed'),
      // גם INPUT: בוררי הגופן והגודל הם `input[role="combobox"]`, ושער
      // שמדווח `undefined` על התיבה שלהם אינו יכול לאמת מה היא מציגה.
      value: el.tagName === 'SELECT' || el.tagName === 'INPUT' ? el.value : undefined,
      rect: Q.rectOf(el),
      visible: !!Q.rectOf(el),
    };
  };

  /** המלבן ללחיצה. `null` כשהפקד לא נמצא או אינו מוצג. */
  Q.rect = function (name, opts) {
    var el = Q.el(name, opts);
    return el ? Q.rectOf(el) : null;
  };

  /** שני סוגי בוררים: `<select>` נייטיב, ובורר החיפוש (RibbonCombo). */
  var PICKER = 'select, input[role="combobox"]';

  /**
   * פותח את בורר החיפוש ומחזיר את האפשרויות שברשימה שלו.
   *
   * הרשימה קיימת ב-DOM רק כשהבורר פתוח — בניגוד ל-`<select>`, שאפשרויותיו שם
   * תמיד. לכן כל קריאה כאן פותחת בפועל, ומי שקורא אחראי לסגור.
   */
  function comboOpen(el) {
    el.focus();
    // ניקוי השאילתה: פתיחה אחרי הקלדה קודמת הייתה מחזירה רשימה מסוננת.
    var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, '');
    el.dispatchEvent(new Event('input', { bubbles: true }));

    /*
      ההמתנה אינה נימוס — בלעדיה זה פשוט לא עובד. Vue מרנדר במיקרו-משימה,
      ולכן מיד אחרי `focus` הרשימה עוד אינה ב-DOM ו-`getElementById` מחזיר
      null. נמדד: `Q.el` מצא את הפקד ו-`Q.options` החזיר null באותה נשימה.

      שלושה סבבים ולא אחד: הפתיחה מעדכנת גם את `activeIndex`, ויש `watch`
      עם `nextTick` משלו. `Runtime.evaluate` נשלח עם `awaitPromise`, ולכן
      החזרת Promise מכאן תקינה לגמרי.
    */
    var listId = el.getAttribute('aria-controls');
    return Promise.resolve()
      .then(function () { return null; })
      .then(function () { return null; })
      .then(function () {
        return listId ? document.getElementById(listId) : null;
      });
  }

  function comboClose(el) {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    el.blur();
  }

  function comboOptions(list) {
    return Array.prototype.map.call(list.querySelectorAll('[role="option"]'), function (o) {
      return {
        value: o.getAttribute('data-value') || '',
        label: (o.textContent || '').trim(),
        group: o.getAttribute('data-group') || ''
      };
    });
  }

  /**
   * בחירה בבורר. ב-`<select>` — הצבה ואירוע; ב-RibbonCombo — פתיחה ולחיצה
   * על השורה, כי הקומפוננטה אינה מקשיבה ל-`change`.
   *
   * `pointerdown` ולא `mousedown`: שורת האפשרות מחוברת ל-`@pointerdown` בלבד
   * (RibbonCombo.vue), ולכן `mousedown` מסונתז לא הפעיל מאזין כלל — והשער
   * שמעליו קרא „נבחר אך אינו ב-OOXML” על מוצר שעובד.
   *
   * ולכן ה-`ok` נמדד ולא מוצהר: `choose` סוגר את הרשימה וה-`v-if` מוציא אותה
   * מה-DOM, ורשימה שנשארה פתוחה היא הוכחה שהמאזין לא רץ.
   */
  Q.selectValue = function (name, value) {
    var el = Q.el(name, { selector: PICKER });
    if (!el) return 'not-found';

    if (el.tagName === 'SELECT') {
      var found = Array.prototype.some.call(el.options, function (o) {
        return o.value === value;
      });
      if (!found) {
        return 'no-option:' + Array.prototype.map.call(el.options, function (o) { return o.value; }).join(',');
      }
      el.value = value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return 'ok';
    }

    return comboOpen(el).then(function (list) {
      if (!list) { comboClose(el); return 'no-list'; }
      var hit = list.querySelector('[role="option"][data-value="' + String(value).replace(/"/g, '\\"') + '"]');
      if (!hit) {
        var all = comboOptions(list).map(function (o) { return o.value; });
        comboClose(el);
        return 'no-option:' + all.slice(0, 40).join(',');
      }
      hit.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          pointerType: 'mouse',
          isPrimary: true,
        })
      );
      var listId = el.getAttribute('aria-controls');
      return Promise.resolve()
        .then(function () { return null; })
        .then(function () { return null; })
        .then(function () {
          return listId && document.getElementById(listId) ? 'no-commit' : 'ok';
        });
    });
  };

  Q.options = function (name) {
    var el = Q.el(name, { selector: PICKER });
    if (!el) return null;

    if (el.tagName !== 'SELECT') {
      return comboOpen(el).then(function (list) {
        var rows = list ? comboOptions(list) : null;
        comboClose(el);
        return rows;
      });
    }

    return Array.prototype.map.call(el.options, function (o) {
      return {
        value: o.value,
        label: o.textContent.trim(),
        // כותרת ה-`<optgroup>` שהאפשרות יושבת בו, או '' לאפשרות חשופה. בורר
        // הגופן מקבץ מרגע שהמכונה נמנתה (src/engine/system-fonts.ts), ובלי
        // הקבוצה אי אפשר לדעת מהרשימה השטוחה אם הקיבוץ בכלל קרה.
        group: o.parentElement && o.parentElement.tagName === 'OPTGROUP' ? o.parentElement.label : ''
      };
    });
  };

  /** שורת המצב: ההודעה שהתוסף הראה, ואם היא שגיאה. */
  Q.status = function () {
    var el = document.querySelector('.status-message');
    return {
      text: el ? (el.textContent || '').trim() : null,
      error: el ? el.classList.contains('error') : false,
    };
  };

  /** מה שהוצג דרך המאחז מאז ה-reset האחרון. */
  Q.messages = function () {
    return (window.__qaHost && window.__qaHost.messages) || [];
  };
  Q.hostCalls = function () {
    return (window.__qaHost && window.__qaHost.calls) || [];
  };
  Q.reset = function () {
    if (window.__qaHost) window.__qaHost.reset();
    Q.log.length = 0;
    return true;
  };


  /* -------------------- תפריטים, פופאוברים ודיאלוגים -------------------- */

  /** התוויות בתפריט שנפתח מ-RibbonMenuButton. */
  Q.menuItems = function () {
    return Array.prototype.map.call(document.querySelectorAll('.ribbon-menu__popover .ribbon-menu__item'), function (b) {
      var label = b.querySelector('.ribbon-menu__item-label');
      var hint = b.querySelector('.ribbon-menu__item-hint');
      return {
        label: label ? label.textContent.trim() : b.textContent.trim(),
        hint: hint ? hint.textContent.trim() : '',
      };
    });
  };

  Q.menuRect = function (label) {
    var found = null;
    Array.prototype.forEach.call(document.querySelectorAll('.ribbon-menu__popover .ribbon-menu__item'), function (b) {
      if (found) return;
      var el = b.querySelector('.ribbon-menu__item-label');
      var text = el ? el.textContent.trim() : b.textContent.trim();
      if (text === label) found = b;
    });
    return found ? Q.rectOf(found) : null;
  };

  Q.menuOpen = function () {
    return !!document.querySelector('.ribbon-menu__popover');
  };

  /** הפופאובר של הצבעים: כפתור החץ פותח, והמשבצות הן `.color-swatch` וכד'. */
  Q.paletteOpen = function () {
    return !!document.querySelector('.color-palette-popover');
  };
  Q.paletteSwatches = function () {
    return Array.prototype.map.call(
      document.querySelectorAll('.color-palette-popover button'),
      function (b) {
        return { title: nameOf(b), cls: b.className };
      },
    );
  };
  Q.paletteRect = function (index) {
    var nodes = document.querySelectorAll('.color-palette-popover button');
    return nodes[index] ? Q.rectOf(nodes[index]) : null;
  };
  Q.paletteRectByTitle = function (title) {
    var found = null;
    Array.prototype.forEach.call(document.querySelectorAll('.color-palette-popover button'), function (b) {
      if (!found && nameOf(b) === title) found = b;
    });
    return found ? Q.rectOf(found) : null;
  };

  /** גלריית הסגנונות. */
  Q.galleryItems = function () {
    return Array.prototype.map.call(document.querySelectorAll('.style-card'), function (b) {
      return { label: nameOf(b), active: b.classList.contains('active'), disabled: !!b.disabled };
    });
  };
  Q.galleryRect = function (label) {
    var found = null;
    Array.prototype.forEach.call(document.querySelectorAll('.style-card'), function (b) {
      if (!found && nameOf(b) === label) found = b;
    });
    return found ? Q.rectOf(found) : null;
  };

  /** בורר הטבלה: תא לפי שורה ועמודה (1-מבוסס). */
  Q.tableCellRect = function (row, col) {
    var rows = document.querySelectorAll('.table-picker-popover .grid-row');
    var r = rows[row - 1];
    if (!r) return null;
    var cells = r.querySelectorAll('[role="gridcell"], .grid-cell');
    return cells[col - 1] ? Q.rectOf(cells[col - 1]) : null;
  };

  /** הדיאלוג הפתוח: שמו, והפקדים שבו. */
  Q.dialog = function () {
    var el = document.querySelector('[role="dialog"]');
    if (!el) return null;
    return {
      label: el.getAttribute('aria-label') || '',
      cls: el.className,
      controls: Array.prototype.map.call(el.querySelectorAll('button, input, select, textarea'), function (c) {
        return {
          tag: c.tagName.toLowerCase(),
          type: c.type,
          name: nameOf(c),
          text: (c.textContent || '').trim().slice(0, 40),
          id: c.id,
          value: c.value,
          disabled: !!c.disabled,
          checked: c.type === 'checkbox' || c.type === 'radio' ? !!c.checked : undefined,
        };
      }),
    };
  };

  Q.dialogRect = function (name) {
    var root = document.querySelector('[role="dialog"]');
    if (!root) return null;
    var found = null;
    Array.prototype.forEach.call(root.querySelectorAll('button, input, select, textarea'), function (c) {
      if (found) return;
      if (nameOf(c) === name || (c.textContent || '').trim() === name || c.id === name) found = c;
    });
    return found ? Q.rectOf(found) : null;
  };

  /** כתיבה לשדה בדיאלוג — `input` ו-`change` כדי ש-v-model יראה. */
  Q.dialogFill = function (idOrName, value) {
    var root = document.querySelector('[role="dialog"]');
    if (!root) return 'no-dialog';
    var found = null;
    Array.prototype.forEach.call(root.querySelectorAll('input, select, textarea'), function (c) {
      if (found) return;
      if (c.id === idOrName || nameOf(c) === idOrName) found = c;
    });
    if (!found) return 'not-found';
    if (found.type === 'checkbox' || found.type === 'radio') {
      found.checked = !!value;
    } else {
      found.value = String(value);
    }
    found.dispatchEvent(new Event('input', { bubbles: true }));
    found.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
  };

  /** מלבן לפי בורר CSS, לכל מה שאין לו עזר ייעודי. */
  Q.rectSel = function (selector, index) {
    var nodes = document.querySelectorAll(selector);
    var el = nodes[index || 0];
    return el ? Q.rectOf(el) : null;
  };

  Q.exists = function (selector) {
    return !!document.querySelector(selector);
  };

  /* -------------------- המסמך -------------------- */

  Q.sd = function () {
    return window.__otzariaEditor && window.__otzariaEditor.superdoc;
  };
  Q.doc = function () {
    var sd = Q.sd();
    return sd && sd.activeEditor && sd.activeEditor.doc;
  };
  Q.ui = function () {
    return window.__otzariaEditor && window.__otzariaEditor.ui;
  };

  /** מצב פקודה כפי שהמנוע מדווח אותו — לא כפי שהרצועה מציירת. */
  Q.cmd = function (id) {
    var ui = Q.ui();
    if (!ui) return { error: 'no-ui' };
    if (!ui.commands.has(id)) return { has: false };
    var s = ui.commands.get(id).getState();
    return { has: true, supported: s.supported, enabled: s.enabled, active: s.active, value: s.value, reason: s.reason };
  };

  var LINE_SEL = '.superdoc-line, .superdoc-fragment';

  /**
   * שורה ראשונה של טקסט במסמך — יעד ללחיצה שממקמת סמן.
   *
   * **האינדקס כאן אינו אינדקס פסקה**: `.superdoc-line` מקונן בתוך
   * `.superdoc-fragment`, שני האלמנטים נענים לסלקטור, ולכן כל פסקה תופסת שני
   * אינדקסים — `lineRect(1)` הוא עוד הפסקה הראשונה. לכתובת חד-משמעית יש
   * `Q.paraRect` / `Q.paraRectByText` שלהלן.
   */
  Q.lineRect = function (index) {
    var lines = document.querySelectorAll(LINE_SEL);
    var el = lines[index || 0];
    return el ? rectFor(el) : null;
  };

  Q.lineCount = function () {
    return document.querySelectorAll(LINE_SEL).length;
  };

  function rectFor(el) {
    var r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x + Math.min(20, r.width / 2)),
      y: Math.round(r.y + r.height / 2),
      right: Math.round(r.x + r.width - 4),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  }

  /**
   * פסקה אחת לכל כתובת.
   *
   * `.superdoc-fragment` הוא היחיד שנושא את מזהה הבלוק
   * (`data-source-node-id`), ולכן הוא הכתובת; `.superdoc-line` הוא **שורה
   * חזותית** — פסקה שנגלשת מציירת שלוש, ואינדקס עליה אינו אינדקס פסקה.
   * פסקה שנחצית בין עמודים מציירת שני fragment עם אותו מזהה, והראשון נשמר.
   */
  function paraFragments() {
    var seen = {};
    var out = [];
    Array.prototype.forEach.call(document.querySelectorAll('.superdoc-fragment[data-source-node-id]'), function (el) {
      var id = el.getAttribute('data-source-node-id');
      if (seen[id]) return;
      seen[id] = true;
      out.push(el);
    });
    return out;
  }

  Q.paraCount = function () {
    return paraFragments().length;
  };

  /**
   * הטקסט של הפסקה עצמה. `textContent` של fragment אינו זה: בפריט רשימה הוא
   * „1. פריט” — הסמן מצויר בתוך ה-fragment (`.superdoc-list-marker` ועוד תו
   * רווח ב-`.superdoc-marker-suffix-tab`), ונמדד שהתוכן שלה הוא בדיוק הטקסט
   * שב-`.superdoc-text-run`.
   */
  function paraText(el) {
    return Array.prototype.map
      .call(el.querySelectorAll('.superdoc-text-run'), function (run) {
        return run.textContent || '';
      })
      .join('')
      .trim();
  }

  function paraRectOf(el, index) {
    // ה-fragment עצמו מחזיר מלבן שלילי אחרי reflow (נמדד: x=-495); השורה
    // החזותית שבתוכו היא הגאומטריה שאפשר ללחוץ עליה.
    var box = el.querySelector('.superdoc-line') || el;
    var r = box.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return {
      // בימין מתחיל הטקסט העברי; 20px מהשמאל נופלים בשורה קצרה על אזור ריק.
      x: Math.round(r.x + r.width - Math.min(14, r.width / 2)),
      y: Math.round(r.y + r.height / 2),
      left: Math.round(r.x + 6),
      right: Math.round(r.x + r.width - 6),
      w: Math.round(r.width),
      h: Math.round(r.height),
      index: index,
      nodeId: el.getAttribute('data-source-node-id'),
      text: (el.textContent || '').trim().slice(0, 40),
    };
  }

  /** מלבן ללחיצה על הפסקה ה-n — אינדקס פסקה אמיתי, אחד לפסקה. */
  Q.paraRect = function (index) {
    var paras = paraFragments();
    var i = index || 0;
    return paras[i] ? paraRectOf(paras[i], i) : null;
  };

  /** אותו מלבן, לפי הטקסט שבפסקה — כתובת שאינה תלויה בספירת אינדקסים. */
  Q.paraRectByText = function (text) {
    var paras = paraFragments();
    var i;
    for (i = 0; i < paras.length; i++) {
      if ((paras[i].textContent || '').trim() === text) return paraRectOf(paras[i], i);
    }
    for (i = 0; i < paras.length; i++) {
      if ((paras[i].textContent || '').indexOf(text) >= 0) return paraRectOf(paras[i], i);
    }
    return null;
  };

  /** כמה זמן לחכות למנוע. נמדד: `blocks.list` הראשון אחרי מוטציה 390ms, אחריו ~1ms. */
  var ENGINE_MS = 20000;

  /**
   * באיזו פסקה הסמן יושב **לפי המנוע** — ההוכחה שהלחיצה נחתה במקום שהתכוונו
   * אליו. בלעדיה נחיתה על פסקה שכנה עוברת בשקט.
   *
   * ‏`answered:false` ולא זריקה, ולא ערך שנראה כמו תשובה: „המנוע לא ענה” אינו
   * „הסמן במקום אחר”, ושער שמערבב ביניהם מדווח נחיתה שגויה על קליק שנחת נכון.
   */
  Q.caretBlock = function (timeoutMs) {
    var d = Q.doc();
    if (!d) return Promise.resolve({ answered: false, why: 'אין מסמך פתוח' });
    var ms = timeoutMs || ENGINE_MS;
    // סמן ייחודי, ולא ה-Promise עצמו: `resolve(bell)` בתוך `bell` הוא מחזור.
    var LATE = {};
    // קריאה ל-Document API שנתקעת מקפיאה את `awaitPromise` של CDP לנצח.
    var bell = new Promise(function (resolve) {
      setTimeout(function () { resolve(LATE); }, ms);
    });
    return Promise.race([Promise.all([d.selection.current(), d.blocks.list()]), bell]).then(function (out) {
      if (out === LATE) return { answered: false, why: 'המנוע לא ענה בתוך ' + ms + 'ms' };
      var sel = out[0];
      var blocks = (out[1] && out[1].blocks) || [];
      var id = (((sel && sel.target && sel.target.segments) || []).find(function (s) { return s.blockId; }) || {}).blockId;
      return {
        answered: true,
        blockId: id || null,
        index: id ? blocks.findIndex(function (b) { return b.nodeId === id; }) : -1,
        count: blocks.length,
        empty: sel ? sel.empty : undefined,
        text: id ? paraTextOf(id) : null,
      };
    }, function (e) {
      return { answered: false, why: 'הקריאה למנוע נכשלה: ' + String(e && e.message) };
    });
  };

  /** הטקסט של הפסקה שמזהה הבלוק הזה מצייר, לשמה בהודעת כשל. */
  function paraTextOf(nodeId) {
    var hit = paraFragments().filter(function (el) {
      return el.getAttribute('data-source-node-id') === nodeId;
    })[0];
    return hit ? paraText(hit).slice(0, 40) : null;
  }

  /** הטקסט שהמנוע צייר על המסך. גס, אבל מספיק כדי לראות שמשהו נכנס. */
  Q.screenText = function () {
    var stack = document.querySelector('.editor-stack');
    return stack ? (stack.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 4000) : null;
  };

  Q.selection = function () {
    var ui = Q.ui();
    if (!ui) return { error: 'no-ui' };
    try {
      var s = ui.selection.get();
      return { status: s.status, empty: s.empty, text: s.text };
    } catch (e) {
      return { error: String(e && e.message) };
    }
  };

  /** מייצא docx ומחזיר base64. זו ההוכחה היחידה שמשהו נכתב למסמך. */
  Q.exportBase64 = function () {
    var sd = Q.sd();
    if (!sd) return Promise.resolve(null);
    return sd.export({ exportType: ['docx'], triggerDownload: false }).then(function (blob) {
      return new Promise(function (resolve) {
        var reader = new FileReader();
        reader.onload = function () {
          var s = String(reader.result);
          resolve(s.slice(s.indexOf(',') + 1));
        };
        reader.readAsDataURL(blob);
      });
    });
  };
})();
