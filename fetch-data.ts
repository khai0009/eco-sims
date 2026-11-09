/**
 * fetch-data.ts
 * 
 * Kịch bản tải toàn bộ chỉ số quốc tế một lần duy nhất và xuất ra file `world-data.json`.
 * Hỗ trợ chạy bằng:
 *   - Bun:     bun fetch-data.ts
 *   - Node.js: npx tsx fetch-data.ts  (hoặc npx ts-node fetch-data.ts)
 */

import * as fs from 'fs';
import * as path from 'path';

// ==========================================
// 1. DANH MỤC INDICATOR CỦA WORLD BANK
// ==========================================
const WB_INDICATORS = {
  population: 'SP.POP.TOTL',          // Tổng dân số
  birthRate: 'SP.DYN.CBRT.IN',        // Tỉ lệ sinh thô (trên 1.000 dân)
  lifeExpectancy: 'SP.DYN.LE00.IN',   // Tuổi thọ trung bình khi sinh
  infantMortality: 'SP.DYN.IMRT.IN',  // Tỉ lệ tử vong trẻ sơ sinh (trên 1.000 ca sinh)
  gdpPerCapitaPPP: 'NY.GDP.PCAP.PP.CD', // Thu nhập bình quân theo sức mua tương đương (USD)
  unemployment: 'SL.UEM.TOTL.ZS',     // Tỉ lệ thất nghiệp (% lực lượng lao động)
  expectedSchool: 'SE.SCH.LIFE',      // Độ tuổi/số năm học kỳ vọng
  primaryEnroll: 'SE.PRM.ENRR',       // Tỉ lệ nhập học tiểu học (% gộp)
  secondaryEnroll: 'SE.SEC.ENRR',     // Tỉ lệ nhập học trung học/phổ thông (% gộp)
  tertiaryEnroll: 'SE.TER.ENRR',      // Tỉ lệ nhập học đại học/cao đẳng (% gộp)
  pm25Pollution: 'EN.ATM.PM25.MC.M3', // Nồng độ bụi mịn PM2.5 trung bình (µg/m³)
  giniIndex: 'SI.POV.GINI',           // Hệ số bất bình đẳng phân hóa giàu nghèo
};

// Danh sách tọa độ thủ đô một số quốc gia đại diện để lấy khí hậu từ Open-Meteo
const COUNTRY_COORDINATES: Record<string, { lat: number; lon: number; name: string; region: string }> = {
  VNM: { lat: 21.0285, lon: 105.8542, name: 'Việt Nam', region: 'Châu Á' },
  USA: { lat: 38.8951, lon: -77.0364, name: 'Hoa Kỳ', region: 'Châu Mỹ' },
  IND: { lat: 28.6139, lon: 77.2090, name: 'Ấn Độ', region: 'Châu Á' },
  CHN: { lat: 39.9042, lon: 116.4074, name: 'Trung Quốc', region: 'Châu Á' },
  JPN: { lat: 35.6762, lon: 139.6503, name: 'Nhật Bản', region: 'Châu Á' },
  DEU: { lat: 52.5200, lon: 13.4050, name: 'Đức', region: 'Châu Âu' },
  GBR: { lat: 51.5074, lon: -0.1278, name: 'Anh Quốc', region: 'Châu Âu' },
  NGA: { lat: 9.0765, lon: 7.3986, name: 'Nigeria', region: 'Châu Phi' },
  BRA: { lat: -15.7975, lon: -47.8919, name: 'Brazil', region: 'Châu Mỹ' },
  ZAF: { lat: -25.7461, lon: 28.1881, name: 'Nam Phi', region: 'Châu Phi' },
  NOR: { lat: 59.9139, lon: 10.7522, name: 'Na Uy', region: 'Châu Âu' },
  IDN: { lat: -6.2088, lon: 106.8456, name: 'Indonesia', region: 'Châu Á' },
  EGY: { lat: 30.0444, lon: 31.2357, name: 'Ai Cập', region: 'Châu Phi' },
  AUS: { lat: -35.2809, lon: 149.1300, name: 'Úc', region: 'Châu Đại Dương' },
  TCD: { lat: 12.1348, lon: 15.0557, name: 'Chad', region: 'Châu Phi' }
};

export interface CountryExportData {
  isoCode: string;
  name: string;
  region: string;
  population: number;
  birthRate: number;
  lifeExpectancy: number;
  infantMortality: number;
  gdpPPP: number;
  unemploymentRate: number;
  giniIndex: number;
  expectedSchoolYears: number;
  primaryRate: number;
  secondaryRate: number;
  tertiaryRate: number;
  masterRate: number;
  phdRate: number;
  avgTempC: number;
  annualRainMm: number;
  pm25Pollution: number;
  happinessScore: number;
}

/**
 * Hàm lấy giá trị mới nhất của một chỉ số từ World Bank API
 */
async function fetchWorldBankIndicator(indicatorCode: string): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    // Lấy bản ghi trong 5 năm gần nhất (2019-2024), per_page 500 để bao quát toàn cầu
    const url = `https://api.worldbank.org/v2/country/all/indicator/${indicatorCode}?format=json&date=2019:2024&per_page=500`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: any = await res.json();
    const records = json[1] || [];

    for (const item of records) {
      const code = item.countryiso3code;
      if (code && item.value !== null && !map.has(code)) {
        map.set(code, Number(item.value));
      }
    }
  } catch (err: any) {
    console.warn(`Lỗi khi lấy indicator ${indicatorCode}:`, err.message);
  }
  return map;
}

/**
 * Hàm lấy nhiệt độ trung bình & lượng mưa từ Open-Meteo Archive API
 */
async function fetchClimateFromOpenMeteo(lat: number, lon: number) {
  try {
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=2023-01-01&end_date=2023-12-31&daily=temperature_2m_mean,precipitation_sum&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: any = await res.json();

    const temps: number[] = json.daily?.temperature_2m_mean || [];
    const precips: number[] = json.daily?.precipitation_sum || [];

    const avgTemp = temps.length > 0 ? temps.reduce((a, b) => a + b, 0) / temps.length : 20;
    const totalRain = precips.length > 0 ? precips.reduce((a, b) => a + b, 0) : 1000;

    return {
      avgTempC: Math.round(avgTemp * 10) / 10,
      annualRainMm: Math.round(totalRain)
    };
  } catch {
    return { avgTempC: 22.0, annualRainMm: 1100 };
  }
}

/**
 * Hàm chạy Pipeline chính
 */
async function main() {
  console.log('--- BẮT ĐẦU TẢI DỮ LIỆU TỪ CÁC API QUỐC TẾ ---');

  console.log('1. Đang tải các chỉ số kinh tế, giáo dục và dân số từ World Bank...');
  const [
    popMap,
    birthMap,
    lifeMap,
    infantMap,
    gdpMap,
    unempMap,
    schoolMap,
    primMap,
    secMap,
    terMap,
    pm25Map,
    giniMap
  ] = await Promise.all([
    fetchWorldBankIndicator(WB_INDICATORS.population),
    fetchWorldBankIndicator(WB_INDICATORS.birthRate),
    fetchWorldBankIndicator(WB_INDICATORS.lifeExpectancy),
    fetchWorldBankIndicator(WB_INDICATORS.infantMortality),
    fetchWorldBankIndicator(WB_INDICATORS.gdpPerCapitaPPP),
    fetchWorldBankIndicator(WB_INDICATORS.unemployment),
    fetchWorldBankIndicator(WB_INDICATORS.expectedSchool),
    fetchWorldBankIndicator(WB_INDICATORS.primaryEnroll),
    fetchWorldBankIndicator(WB_INDICATORS.secondaryEnroll),
    fetchWorldBankIndicator(WB_INDICATORS.tertiaryEnroll),
    fetchWorldBankIndicator(WB_INDICATORS.pm25Pollution),
    fetchWorldBankIndicator(WB_INDICATORS.giniIndex),
  ]);

  console.log('2. Đang đồng bộ khí hậu từ Open-Meteo và tính toán tỷ lệ giáo dục sau đại học...');
  const results: CountryExportData[] = [];

  for (const [isoCode, meta] of Object.entries(COUNTRY_COORDINATES)) {
    const climate = await fetchClimateFromOpenMeteo(meta.lat, meta.lon);

    const tertiaryRate = Math.min(100, Math.round(terMap.get(isoCode) ?? 35));
    // Ước tính học Thạc sĩ và Tiến sĩ dựa trên quy mô học Đại học và GDP
    const masterRate = Math.round((tertiaryRate * 0.18) * 10) / 10;
    const phdRate = Math.round((masterRate * 0.12) * 100) / 100;

    // Ước lượng mức độ hài lòng (0 - 10) dựa trên GDP, tuổi thọ và việc làm
    const gdp = gdpMap.get(isoCode) ?? 12000;
    const life = lifeMap.get(isoCode) ?? 72;
    const happiness = Math.min(9.5, Math.max(3.0, (Math.log10(gdp) * 1.5) + (life * 0.03) - 1.5));

    results.push({
      isoCode,
      name: meta.name,
      region: meta.region,
      population: Math.round(popMap.get(isoCode) ?? 50_000_000),
      birthRate: Math.round((birthMap.get(isoCode) ?? 15.0) * 10) / 10,
      lifeExpectancy: Math.round((lifeMap.get(isoCode) ?? 73.0) * 10) / 10,
      infantMortality: Math.round((infantMap.get(isoCode) ?? 12.0) * 10) / 10,
      gdpPPP: Math.round(gdp),
      unemploymentRate: Math.round((unempMap.get(isoCode) ?? 5.0) * 10) / 10,
      giniIndex: Math.round((giniMap.get(isoCode) ?? 36.0) * 10) / 10,
      expectedSchoolYears: Math.round((schoolMap.get(isoCode) ?? 13.0) * 10) / 10,
      primaryRate: Math.min(100, Math.round(primMap.get(isoCode) ?? 98)),
      secondaryRate: Math.min(100, Math.round(secMap.get(isoCode) ?? 85)),
      tertiaryRate,
      masterRate,
      phdRate,
      avgTempC: climate.avgTempC,
      annualRainMm: climate.annualRainMm,
      pm25Pollution: Math.round((pm25Map.get(isoCode) ?? 25.0) * 10) / 10,
      happinessScore: Math.round(happiness * 10) / 10,
    });
  }

  // 3. Ghi ra tệp JSON
  const outputPath = path.resolve(process.cwd(), 'world-data.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf-8');

  console.log(`\nTHÀNH CÔNG! Đã xuất dữ liệu của ${results.length} quốc gia ra tệp:`);
  console.log(`📁 ${outputPath}`);
}

main().catch(console.error);