// Default Realistic Dataset for GHN KAS Ontime Reports
// Matches Google Sheet IDs: Pick (1312031199), Deli (940798880), Ca1 (1405399014)

export const MIEN_REGIONS = {
  'Miền Bắc': ['DBB', 'TBB', 'XBG', 'TNT', 'DSH', 'HNO'],
  'Miền Trung': ['BTB', 'TTB', 'TNG', 'NTB'],
  'Miền Nam': ['DNB', 'HCM', 'HCM - GXT', 'ĐCL', 'TNB']
};

export const MIEN_ORDER = ['Miền Bắc', 'Miền Trung', 'Miền Nam'];

export const TARGET_KPIS = {
  '1st Pickup': 97.0,
  'OPR': 90.0,
  '1st Deli': 95.0,
  'ODR': 90.0
};

// Generate date range: 2 weeks (W-1 full Mon-Sun + WTD up to D-1)
export function generateDateList() {
  const dates = [];
  // Today reference: 2026-08-06 (D-1 = 2026-08-05)
  // Week 31 (W-1): 2026-07-27 (Mon) to 2026-08-02 (Sun)
  // Week 32 (WTD): 2026-08-03 (Mon) to 2026-08-05 (Wed / D-1)
  const dStart = new Date(2026, 6, 27); // 27/7
  const dEnd = new Date(2026, 7, 5);   // 5/8 (D-1)

  let cur = new Date(dStart);
  while (cur <= dEnd) {
    const yyyy = cur.getFullYear();
    const mm = String(cur.getMonth() + 1).padStart(2, '0');
    const dd = String(cur.getDate()).padStart(2, '0');
    dates.push(`${yyyy}-${mm}-${dd}`);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

const REGION_HUBS = {
  'HNO': ['BC Cầu Giấy', 'BC Thanh Xuân', 'BC Hoàn Kiếm', 'BC Hà Đông', 'BC Nam Từ Liêm', 'BC Long Biên'],
  'DBB': ['BC Hải Phòng', 'BC Quảng Ninh', 'BC Hải Dương', 'BC Hưng Yên'],
  'TBB': ['BC Thái Nguyên', 'BC Phú Thọ', 'BC Vĩnh Phúc'],
  'XBG': ['BC Bắc Giang', 'BC Bắc Ninh'],
  'TNT': ['BC Thanh Hóa', 'BC Nghệ An'],
  'DSH': ['BC Ninh Bình', 'BC Nam Định'],
  'BTB': ['BC Quảng Bình', 'BC Trị Thiên'],
  'TTB': ['BC Đà Nẵng', 'BC Quảng Nam', 'BC Quảng Ngãi'],
  'TNG': ['BC Gia Lai', 'BC Đắk Lắk'],
  'NTB': ['BC Khánh Hòa', 'BC Ninh Thuận', 'BC Bình Thuận'],
  'HCM': ['BC Tân Bình', 'BC Thủ Đức', 'BC Bình Thạnh', 'BC Quận 7', 'BC Gò Vấp', 'BC Bình Tân'],
  'DNB': ['BC Đồng Nai', 'BC Bình Dương', 'BC Vũng Tàu'],
  'ĐCL': ['BC Long An', 'BC Tiền Giang', 'BC Bến Tre'],
  'TNB': ['BC Cần Thơ', 'BC An Giang', 'BC Kiên Giang', 'BC Cà Mau']
};

export function createDefaultPickDataset() {
  const dates = generateDateList();
  const rows = [];

  MIEN_ORDER.forEach(mien => {
    MIEN_REGIONS[mien].forEach(region => {
      const hubs = REGION_HUBS[region] || [`BC ${region} Central`];
      hubs.forEach(hub => {
        dates.forEach((report_date, dIdx) => {
          // Base total volume
          const baseVol = 800 + (region === 'HNO' || region === 'HCM' ? 1200 : 300) + Math.floor(Math.random() * 200);
          
          // Realistic rates
          let p1st_rate = 0.95 + (Math.random() * 0.04 - 0.015);
          let opr_rate = 0.88 + (Math.random() * 0.05 - 0.02);
          if (region === 'TNB' || region === 'DBB') {
            p1st_rate -= 0.04;
            opr_rate -= 0.05;
          }

          const mau_pu = baseVol;
          const ontime_pu_1st = Math.round(mau_pu * Math.min(0.99, Math.max(0.85, p1st_rate)));
          const ontime_pu_opr = Math.round(mau_pu * Math.min(0.96, Math.max(0.78, opr_rate)));

          // Best 6W & Sameday last month metrics (region-level historical baseline)
          const best_l6w_vol_1st = Math.round(mau_pu * 1.1);
          const best_l6w_ontime_1st = Math.round(best_l6w_vol_1st * 0.985);
          const best_l6w_vol_opr = Math.round(mau_pu * 1.1);
          const best_l6w_ontime_opr = Math.round(best_l6w_vol_opr * 0.935);

          const sameday_lm_vol = Math.round(mau_pu * 0.95);
          const sameday_lm_ontime_1st = Math.round(sameday_lm_vol * 0.965);
          const sameday_lm_ontime_opr = Math.round(sameday_lm_vol * 0.89);

          ['SPB', 'SPE'].forEach(client_name => {
            const ratio = client_name === 'SPB' ? 0.7 : 0.3;
            rows.push({
              report_date,
              region,
              hub,
              client_name,
              mau_pu: Math.round(mau_pu * ratio),
              ontime_pu_1st: Math.round(ontime_pu_1st * ratio),
              ontime_pu_opr: Math.round(ontime_pu_opr * ratio),
              best_l6w_vol_1st: Math.round(best_l6w_vol_1st * ratio),
              best_l6w_ontime_1st: Math.round(best_l6w_ontime_1st * ratio),
              best_l6w_vol_opr: Math.round(best_l6w_vol_opr * ratio),
              best_l6w_ontime_opr: Math.round(best_l6w_ontime_opr * ratio),
              sameday_lm_vol: Math.round(sameday_lm_vol * ratio),
              sameday_lm_ontime_1st: Math.round(sameday_lm_ontime_1st * ratio),
              sameday_lm_ontime_opr: Math.round(sameday_lm_ontime_opr * ratio)
            });
          });
        });
      });
    });
  });

  return rows;
}

export function createDefaultDeliDataset() {
  const dates = generateDateList();
  const rows = [];

  MIEN_ORDER.forEach(mien => {
    MIEN_REGIONS[mien].forEach(region => {
      const hubs = REGION_HUBS[region] || [`BC ${region} Central`];
      hubs.forEach(hub => {
        dates.forEach(report_date => {
          const baseVol = 750 + (region === 'HNO' || region === 'HCM' ? 1100 : 280) + Math.floor(Math.random() * 180);
          
          let d1st_rate = 0.935 + (Math.random() * 0.04 - 0.02);
          let odr_rate = 0.89 + (Math.random() * 0.05 - 0.025);
          if (region === 'DBB' || region === 'TTB') {
            d1st_rate -= 0.05;
            odr_rate -= 0.06;
          }

          const mau_del = baseVol;
          const ontime_del_1st = Math.round(mau_del * Math.min(0.99, Math.max(0.84, d1st_rate)));
          const ontime_del_odr = Math.round(mau_del * Math.min(0.96, Math.max(0.75, odr_rate)));

          const best_l6w_vol_1st = Math.round(mau_del * 1.12);
          const best_l6w_ontime_1st = Math.round(best_l6w_vol_1st * 0.975);
          const best_l6w_vol_odr = Math.round(mau_del * 1.12);
          const best_l6w_ontime_odr = Math.round(best_l6w_vol_odr * 0.925);

          const sameday_lm_vol = Math.round(mau_del * 0.94);
          const sameday_lm_ontime_1st = Math.round(sameday_lm_vol * 0.945);
          const sameday_lm_ontime_odr = Math.round(sameday_lm_vol * 0.885);

          ['SPB', 'SPE'].forEach(client_name => {
            const ratio = client_name === 'SPB' ? 0.7 : 0.3;
            rows.push({
              report_date,
              region,
              hub,
              client_name,
              mau_del: Math.round(mau_del * ratio),
              ontime_del_1st: Math.round(ontime_del_1st * ratio),
              ontime_del_odr: Math.round(ontime_del_odr * ratio),
              best_l6w_vol_1st: Math.round(best_l6w_vol_1st * ratio),
              best_l6w_ontime_1st: Math.round(best_l6w_ontime_1st * ratio),
              best_l6w_vol_odr: Math.round(best_l6w_vol_odr * ratio),
              best_l6w_ontime_odr: Math.round(best_l6w_vol_odr * ratio),
              sameday_lm_vol: Math.round(sameday_lm_vol * ratio),
              sameday_lm_ontime_1st: Math.round(sameday_lm_ontime_1st * ratio),
              sameday_lm_ontime_odr: Math.round(sameday_lm_ontime_odr * ratio)
            });
          });
        });
      });
    });
  });

  return rows;
}

export function createDefaultCa1Dataset() {
  const dates = generateDateList();
  const lanes = ['Intra City', 'Cross Metro*', 'Cross Metro', 'Cross Region', 'Intra Region'];
  const rows = [];

  lanes.forEach(lane => {
    const regions = lane.includes('Metro') ? ['TP. Hồ Chí Minh', 'Hà Nội', 'Đà Nẵng', 'Bình Dương'] : ['HNO', 'HCM', 'DBB', 'TTB', 'TNB', 'DNB'];
    regions.forEach(vung_giao => {
      dates.forEach(ngay => {
        const tong_don = 1200 + Math.floor(Math.random() * 1500);
        let ca1_rate = 0.75 + (Math.random() * 0.2 - 0.08);
        if (lane === 'Cross Region') ca1_rate -= 0.12;

        const don_hub_giao_ca1 = Math.round(tong_don * Math.max(0.4, Math.min(0.98, ca1_rate)));
        const best_l6w_vol_ca1 = Math.round(tong_don * 1.1);
        const best_l6w_ca1 = Math.round(best_l6w_vol_ca1 * 0.88);

        const sameday_lm_vol = Math.round(tong_don * 0.95);
        const sameday_lm_ca1 = Math.round(sameday_lm_vol * 0.78);

        rows.push({
          ngay,
          lane,
          vung_giao,
          tong_don,
          don_hub_giao_ca1,
          best_l6w_vol_ca1,
          best_l6w_ca1,
          sameday_lm_vol,
          sameday_lm_ca1
        });
      });
    });
  });

  return rows;
}

export function createDefaultSellersDataset() {
  const dates = generateDateList();
  const sellers = [
    { name: 'Shopee VIP — Coolmate Flagship', pickwh: 'BC Cầu Giấy', region: 'HNO' },
    { name: 'Shopee VIP — Anker Official Store', pickwh: 'BC Thanh Xuân', region: 'HNO' },
    { name: 'Shopee VIP — Lock&Lock Mall', pickwh: 'BC Hà Đông', region: 'HNO' },
    { name: 'Shopee VIP — Sunhouse Official', pickwh: 'BC Hoàn Kiếm', region: 'HNO' },
    { name: 'Shopee VIP — Samsung Mobile', pickwh: 'BC Nam Từ Liêm', region: 'HNO' },
    { name: 'Shopee VIP — Unilever Homecare', pickwh: 'BC Tân Bình', region: 'HCM' },
    { name: 'Shopee VIP — L’Oreal Paris', pickwh: 'BC Thủ Đức', region: 'HCM' },
    { name: 'Shopee VIP — Xiaomi Flagship', pickwh: 'BC Bình Thạnh', region: 'HCM' },
    { name: 'Shopee VIP — Rohto Mentholatum', pickwh: 'BC Gò Vấp', region: 'HCM' },
    { name: 'Shopee VIP — Nestlé Vietnam', pickwh: 'BC Bình Tân', region: 'HCM' }
  ];

  const rows = [];
  sellers.forEach(s => {
    dates.forEach(date => {
      const vol = 250 + Math.floor(Math.random() * 300);
      const ontime1st = Math.round(vol * (0.92 + Math.random() * 0.07));
      const ontimeOpr = Math.round(vol * (0.85 + Math.random() * 0.09));

      rows.push({
        report_date: date,
        clientcontactname: s.name,
        pickwh: s.pickwh,
        region: s.region,
        vol_lay: vol,
        vol_lay_dung_hen_1st: ontime1st,
        vol_lay_thanh_cong_dung_hen: ontimeOpr
      });
    });
  });

  return rows;
}
