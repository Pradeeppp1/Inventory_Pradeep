/* ═══════════════════════════════════════════════════════════
   nepali_date.js  — Bikram Sambat ↔ Gregorian (AD) converter
   Covers BS 2070 – 2095 (extendable by adding rows to BS_MONTHS)
   ═══════════════════════════════════════════════════════════ */

/**
 * Days per month for each BS year.
 * Index 0 = year number, indices 1-12 = days in that BS month.
 * Source: verified against published Nepali calendars.
 */
const BS_MONTHS = [
  /* year  B  C  D  E  F  G  H  I  J  K  L  M */
  [2070, 31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  [2071, 31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  [2072, 31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  [2073, 30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  [2074, 31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  [2075, 31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  [2076, 31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  [2077, 30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  [2078, 31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  [2079, 31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  [2080, 31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  [2081, 31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30],
  [2082, 31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  [2083, 31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  [2084, 31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  [2085, 30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  [2086, 31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  [2087, 31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  [2088, 31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  [2089, 30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  [2090, 31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  [2091, 31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  [2092, 31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  [2093, 30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  [2094, 31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  [2095, 31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
];

/** BS year where our table starts, and its AD epoch */
const BS_START_YEAR = 2070;
const AD_EPOCH = { year: 2013, month: 4, day: 14 }; // 2070 Baisakh 1

const BS_MONTH_NAMES = [
  "Baisakh (बैशाख)",
  "Jestha (जेठ)",
  "Ashadh (अषाढ)",
  "Shrawan (श्रावण)",
  "Bhadra (भाद्र)",
  "Ashwin (असोज)",
  "Kartik (कार्तिक)",
  "Mangsir (मंसिर)",
  "Poush (पौष)",
  "Magh (माघ)",
  "Falgun (फाल्गुन)",
  "Chaitra (चैत)",
];

/** Total days in a BS year from the table */
function _bsYearDays(bsYear) {
  const row = BS_MONTHS.find(r => r[0] === bsYear);
  if (!row) return null;
  return row.slice(1).reduce((a, b) => a + b, 0);
}

/** Days in a specific BS month */
function bsMonthDays(bsYear, bsMonth) {
  const row = BS_MONTHS.find(r => r[0] === bsYear);
  if (!row) return 30;
  return row[bsMonth]; // bsMonth is 1-indexed
}

/**
 * Convert BS date → AD date.
 * Returns { year, month, day } in AD, or null on error.
 */
function bsToAd(bsYear, bsMonth, bsDay) {
  if (!BS_MONTHS.find(r => r[0] === bsYear)) return null;

  // Count total days from BS epoch (2070/1/1 = AD 2013/4/14)
  let totalDays = 0;

  for (let y = BS_START_YEAR; y < bsYear; y++) {
    const yd = _bsYearDays(y);
    if (yd === null) return null;
    totalDays += yd;
  }
  const row = BS_MONTHS.find(r => r[0] === bsYear);
  for (let m = 1; m < bsMonth; m++) totalDays += row[m];
  totalDays += bsDay - 1;

  // Add to AD epoch
  let adDate = new Date(AD_EPOCH.year, AD_EPOCH.month - 1, AD_EPOCH.day);
  adDate.setDate(adDate.getDate() + totalDays);

  return {
    year:  adDate.getFullYear(),
    month: adDate.getMonth() + 1,
    day:   adDate.getDate(),
  };
}

/**
 * Convert AD date → BS date.
 * Returns { year, month, day } in BS, or null on error.
 */
function adToBs(adYear, adMonth, adDay) {
  const adDate = new Date(adYear, adMonth - 1, adDay);
  const epoch  = new Date(AD_EPOCH.year, AD_EPOCH.month - 1, AD_EPOCH.day);
  let diffDays = Math.round((adDate - epoch) / 86400000);

  if (diffDays < 0) return null;

  let bsYear = BS_START_YEAR;
  for (let i = 0; i < BS_MONTHS.length; i++) {
    const yr = BS_MONTHS[i][0];
    const yd = _bsYearDays(yr);
    if (diffDays < yd) { bsYear = yr; break; }
    diffDays -= yd;
    if (i === BS_MONTHS.length - 1) return null;
  }

  const row = BS_MONTHS.find(r => r[0] === bsYear);
  let bsMonth = 1;
  for (let m = 1; m <= 12; m++) {
    if (diffDays < row[m]) { bsMonth = m; break; }
    diffDays -= row[m];
  }

  return { year: bsYear, month: bsMonth, day: diffDays + 1 };
}

/**
 * Populate the three BS date selects and wire up change events.
 * @param {object} opts
 *   yearSel   - <select> element for year
 *   monthSel  - <select> element for month
 *   daySel    - <select> element for day
 *   hiddenAd  - <input type="hidden"> for AD date (YYYY-MM-DD)
 *   adHint    - element to show the AD equivalent
 *   initBs    - { year, month, day } to initialise to (defaults to today)
 */
function populateBsDateSelects({ yearSel, monthSel, daySel, hiddenAd, adHint, initBs }) {
  // Years
  yearSel.innerHTML = "";
  BS_MONTHS.forEach(row => {
    const opt = new Option(row[0], row[0]);
    yearSel.appendChild(opt);
  });

  // Months
  monthSel.innerHTML = "";
  BS_MONTH_NAMES.forEach((name, i) => {
    const opt = new Option(`${i + 1}. ${name}`, i + 1);
    monthSel.appendChild(opt);
  });

  function updateDays() {
    const y = parseInt(yearSel.value);
    const m = parseInt(monthSel.value);
    const prevDay = parseInt(daySel.value) || 1;
    const total = bsMonthDays(y, m);
    daySel.innerHTML = "";
    for (let d = 1; d <= total; d++) {
      daySel.appendChild(new Option(d, d));
    }
    daySel.value = Math.min(prevDay, total);
    updateHidden();
  }

  function updateHidden() {
    const y = parseInt(yearSel.value);
    const m = parseInt(monthSel.value);
    const d = parseInt(daySel.value);
    const ad = bsToAd(y, m, d);
    if (ad && hiddenAd) {
      const pad = n => String(n).padStart(2, "0");
      hiddenAd.value = `${ad.year}-${pad(ad.month)}-${pad(ad.day)}`;
    }
    if (adHint && ad) {
      const adDate = new Date(ad.year, ad.month - 1, ad.day);
      adHint.textContent = `📅 AD: ${adDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`;
    }
  }

  yearSel.addEventListener("change", updateDays);
  monthSel.addEventListener("change", updateDays);
  daySel.addEventListener("change", updateHidden);

  // Set initial value
  const bs = initBs || adToBs(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
  if (bs) {
    yearSel.value  = bs.year;
    monthSel.value = bs.month;
  }
  updateDays();
  if (bs) {
    daySel.value = bs.day;
    updateHidden();
  }
}
