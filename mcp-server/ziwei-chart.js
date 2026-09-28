import { createRequire } from 'node:module';
import { astro } from 'iztro';

const { version: IZTRO_VERSION } = createRequire(import.meta.url)('iztro/package.json');

// iztro timeIndex：0 = 早子時 (00:00~01:00)，1~11 = 丑~亥，12 = 晚子時 (23:00~24:00)
const HOUR_BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

// 十二宮傳統順序（由命宮起）
const PALACE_ORDER = ['命宮', '兄弟', '夫妻', '子女', '財帛', '疾厄', '遷移', '僕役', '官祿', '田宅', '福德', '父母'];

const SIHUA_ORDER = ['祿', '權', '科', '忌'];

export function toTimeIndex(birthHour) {
  const value = String(birthHour ?? '').trim().replace(/時$/, '');
  if (value === '早子') return 0;
  if (value === '晚子') return 12;
  const branchIndex = HOUR_BRANCHES.indexOf(value);
  if (branchIndex >= 0) return branchIndex;
  if (/^\d{1,2}$/.test(value) && Number(value) <= 23) {
    const hour = Number(value);
    return hour === 23 ? 12 : Math.floor((hour + 1) / 2);
  }
  throw new Error(`birth_hour 無效: ${birthHour}（請用 子~亥、早子/晚子，或 0~23 點）`);
}

function toInteger(key, value, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${key} 必須是 ${min}~${max} 的整數，收到: ${value}`);
  }
  return number;
}

function formatStar(star) {
  return {
    name: star.name,
    ...(star.brightness && { brightness: star.brightness }),
    ...(star.mutagen && { sihua: star.mutagen })
  };
}

/**
 * 排出紫微斗數本命盤。
 * input: { gender: '男'|'女', birth_year, birth_month, birth_day, birth_hour,
 *          calendar?: 'solar'|'lunar'（預設 solar）, is_leap_month?: boolean（農曆閏月） }
 */
export function buildChart(input = {}) {
  const { gender, calendar = 'solar' } = input;
  if (gender !== '男' && gender !== '女') {
    throw new Error(`gender 必須是「男」或「女」，收到: ${gender}`);
  }
  const year = toInteger('birth_year', input.birth_year, 1900, 2100);
  const month = toInteger('birth_month', input.birth_month, 1, 12);
  const day = toInteger('birth_day', input.birth_day, 1, 31);
  const timeIndex = toTimeIndex(input.birth_hour);
  const date = `${year}-${month}-${day}`;
  const isLeapMonth = Boolean(input.is_leap_month);

  let chart;
  if (calendar === 'solar') {
    // iztro 不檢查國曆日期是否存在（例如 2 月 30 日會照樣排盤）
    const probe = new Date(Date.UTC(year, month - 1, day));
    if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
      throw new Error(`國曆日期不存在: ${date}`);
    }
    chart = astro.bySolar(date, timeIndex, gender, true, 'zh-TW');
  } else if (calendar === 'lunar') {
    try {
      chart = astro.byLunar(date, timeIndex, gender, isLeapMonth, true, 'zh-TW');
    } catch (error) {
      throw new Error(`農曆日期不存在: ${date}（${error.message}）`);
    }
    // 指定的閏月不存在時 iztro 會改用當月排盤，必須擋下
    if (isLeapMonth && !chart.rawDates.lunarDate.isLeap) {
      throw new Error(`農曆 ${year} 年沒有閏${month}月`);
    }
  } else {
    throw new Error(`calendar 必須是 solar 或 lunar，收到: ${calendar}`);
  }

  const sihua = {};
  for (const palace of chart.palaces) {
    for (const star of [...palace.majorStars, ...palace.minorStars]) {
      if (star.mutagen) sihua[star.mutagen] = star.name;
    }
  }

  return {
    engine: `iztro ${IZTRO_VERSION}`,
    input: {
      gender, calendar, birth_year: year, birth_month: month, birth_day: day,
      birth_hour: input.birth_hour, ...(calendar === 'lunar' && { is_leap_month: isLeapMonth })
    },
    basic_info: {
      gender: chart.gender,
      solar_date: chart.solarDate,
      lunar_date: chart.lunarDate.replace('闰', '閏'),
      ganzhi: chart.chineseDate,
      birth_time: chart.time,
      time_range: chart.timeRange,
      zodiac: chart.zodiac,
      sign: chart.sign,
      wuxing_ju: chart.fiveElementsClass,
      ming_zhu: chart.soul,
      shen_zhu: chart.body,
      ming_gong_branch: chart.earthlyBranchOfSoulPalace,
      shen_gong_branch: chart.earthlyBranchOfBodyPalace
    },
    sihua: Object.fromEntries(SIHUA_ORDER.map((key) => [`化${key}`, sihua[key]])),
    palaces: [...chart.palaces]
      .sort((a, b) => PALACE_ORDER.indexOf(a.name) - PALACE_ORDER.indexOf(b.name))
      .map((palace) => ({
        name: palace.name.endsWith('宮') ? palace.name : `${palace.name}宮`,
        ganzhi: palace.heavenlyStem + palace.earthlyBranch,
        is_shen_gong: palace.isBodyPalace,
        major_stars: palace.majorStars.map(formatStar),
        minor_stars: palace.minorStars.map(formatStar),
        adjective_stars: palace.adjectiveStars.map((star) => star.name),
        changsheng12: palace.changsheng12,
        boshi12: palace.boshi12,
        jiangqian12: palace.jiangqian12,
        suiqian12: palace.suiqian12,
        daxian: palace.decadal.range,
        xiaoxian: palace.ages
      }))
  };
}
