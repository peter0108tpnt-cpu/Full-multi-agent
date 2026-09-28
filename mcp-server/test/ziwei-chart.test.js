import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildChart, toTimeIndex } from '../ziwei-chart.js';

// fate.windada.com 對同一生辰的排盤結果（由專案根目錄的 corrected_response.html 擷取）
const windada = JSON.parse(readFileSync(new URL('./fixtures/windada-1990-05-15-wu-male.json', import.meta.url), 'utf8'));

const BIRTH = { gender: '男', birth_year: 1990, birth_month: 5, birth_day: 15, birth_hour: '午' };
const chart = buildChart(BIRTH);
const byBranch = Object.fromEntries(chart.palaces.map((palace) => [palace.ganzhi[1], palace]));

const WINDADA_PALACE_NAMES = { '命宮-身宮': '命宮', 事業宮: '官祿宮', 交友宮: '僕役宮' };

// windada 用五級亮度：iztro 的「得」顯示為「地」，「不」併入「陷」
const WINDADA_BRIGHTNESS = { 得: '地', 不: '陷' };

// 雜曜的流派差異：windada 另列月馬與第二個旬空；iztro 另列天廚、天德、月德、年解；
// 天殤/天傷為同星異字；截路、空亡在午、未兩宮的陰陽分配相反
const ADJECTIVE_DIFFERENCES = {
  寅: { windada: [], iztro: ['天廚'] },
  卯: { windada: [], iztro: ['天德'] },
  辰: { windada: ['天殤'], iztro: ['天傷', '年解'] },
  午: { windada: ['空亡'], iztro: ['截路'] },
  未: { windada: ['截路'], iztro: ['空亡'] },
  亥: { windada: ['旬空', '月馬'], iztro: ['月德'] }
};

test('基本資料與生年四化與 windada 相同', () => {
  const { header } = windada;
  assert.equal(chart.basic_info.ganzhi.replaceAll(' ', ''), header.ganzhi.replace(/[年月日時]/g, ''));
  assert.ok(header.wuxing_ju.endsWith(chart.basic_info.wuxing_ju));
  assert.equal(chart.basic_info.ming_zhu, header.ming_zhu);
  assert.equal(chart.basic_info.shen_zhu, header.shen_zhu);
  const sihua = Object.entries(chart.sihua).map(([kind, star]) => `${star}${kind}`);
  assert.deepEqual(sihua.sort(), header.sihua.split(',').sort());
});

test('十二宮的宮名、干支、主星與亮度、輔星、長生與博士十二神、大限、小限與 windada 相同', () => {
  assert.equal(chart.palaces.length, 12);
  for (const [branch, site] of Object.entries(windada.palaces)) {
    const palace = byBranch[branch];
    assert.equal(palace.name, WINDADA_PALACE_NAMES[site.name] ?? site.name, branch);
    assert.equal(palace.ganzhi, site.ganzhi, branch);
    assert.equal(palace.is_shen_gong, site.name.includes('身宮'), branch);
    assert.deepEqual(
      palace.major_stars.map((star) => star.name + (WINDADA_BRIGHTNESS[star.brightness] ?? star.brightness)).sort(),
      [...site.red].sort(),
      branch
    );
    assert.deepEqual(palace.minor_stars.map((star) => star.name).sort(), [...site.blue].sort(), branch);
    assert.ok(site.black.includes(palace.changsheng12), branch);
    assert.ok(site.black.includes(palace.boshi12), branch);
    assert.deepEqual(palace.daxian, site.daxian, branch);
    assert.deepEqual(palace.xiaoxian.slice(0, site.xiaoxian.length), site.xiaoxian, branch);
  }
});

test('雜曜只在已知的流派差異上與 windada 不同', () => {
  for (const [branch, site] of Object.entries(windada.palaces)) {
    const palace = byBranch[branch];
    const ours = [...palace.adjective_stars, palace.changsheng12, palace.boshi12];
    const expected = ADJECTIVE_DIFFERENCES[branch] ?? { windada: [], iztro: [] };
    assert.deepEqual(site.black.filter((star) => !ours.includes(star)).sort(), [...expected.windada].sort(), branch);
    assert.deepEqual(ours.filter((star) => !site.black.includes(star)).sort(), [...expected.iztro].sort(), branch);
  }
});

test('時辰：子~亥、早子/晚子、0~23 點', () => {
  assert.equal(toTimeIndex('子'), 0);
  assert.equal(toTimeIndex('早子'), 0);
  assert.equal(toTimeIndex('午時'), 6);
  assert.equal(toTimeIndex('亥'), 11);
  assert.equal(toTimeIndex('晚子'), 12);
  assert.equal(toTimeIndex(0), 0);
  assert.equal(toTimeIndex('1'), 1);
  assert.equal(toTimeIndex(12), 6);
  assert.equal(toTimeIndex(22), 11);
  assert.equal(toTimeIndex(23), 12);
  assert.throws(() => toTimeIndex('24'), /birth_hour/);
  assert.throws(() => toTimeIndex('noon'), /birth_hour/);
  assert.equal(buildChart({ ...BIRTH, birth_hour: '晚子' }).basic_info.birth_time, '晚子時');
});

test('農曆輸入與國曆輸入排出同一張盤', () => {
  const lunar = buildChart({ ...BIRTH, birth_month: 4, birth_day: 21, calendar: 'lunar' });
  assert.equal(lunar.basic_info.solar_date, '1990-5-15');
  assert.deepEqual(lunar.palaces, chart.palaces);
});

test('農曆閏月：存在時照排，不存在時拒絕', () => {
  const leap = { gender: '女', birth_year: 2020, birth_month: 4, birth_day: 15, birth_hour: '午', calendar: 'lunar', is_leap_month: true };
  const leapChart = buildChart(leap);
  assert.equal(leapChart.basic_info.solar_date, '2020-6-6');
  assert.match(leapChart.basic_info.lunar_date, /閏四月/);
  assert.throws(() => buildChart({ ...leap, birth_year: 2021 }), /沒有閏4月/);
});

test('拒絕無效輸入', () => {
  assert.throws(() => buildChart({ ...BIRTH, gender: 'M' }), /gender/);
  assert.throws(() => buildChart({ ...BIRTH, birth_year: 1800 }), /birth_year/);
  assert.throws(() => buildChart({ ...BIRTH, birth_month: 2, birth_day: 30 }), /國曆日期不存在/);
  assert.throws(() => buildChart({ ...BIRTH, calendar: 'lunar', birth_month: 4, birth_day: 30 }), /農曆日期不存在/);
  assert.throws(() => buildChart({ ...BIRTH, calendar: 'julian' }), /calendar/);
});
