export const CITY_SHOP_SPACING = 6;
// One 4x4 texture atlas supplies every shop, rather than a texture per building.
export const CITY_SHOP_SIGNS = [
  ['CÀ PHÊ', 'RANG XAY · MỖI NGÀY', '#294e49', '#f3e4bf'],
  ['BÁNH MÌ', 'NÓNG GIÒN', '#e2bd7c', '#704032'],
  ['MINI MART', 'TẠP HÓA · THỰC PHẨM', '#32645a', '#f4edce'],
  ['ĐIỆN THOẠI', 'PHỤ KIỆN · SỬA CHỮA', '#315872', '#f5e4b6'],
  ['NHÀ SÁCH', 'SÁCH · VĂN PHÒNG PHẨM', '#704638', '#f1ddaf'],
  ['PHỞ BÒ', 'PHỞ · BÚN · MIẾN', '#dbbd7f', '#6f3d2d'],
  ['CƠM TẤM', 'SƯỜN · BÌ · CHẢ', '#ece1bd', '#7b392c'],
  ['TIỆM BÁNH', 'BÁNH TƯƠI MỖI NGÀY', '#825343', '#f8e9c4'],
  ['HOA TƯƠI', 'HOA · CÂY CẢNH', '#4c6651', '#f4e0bd'],
  ['HỦ TIẾU', 'NÓNG HỔI MỖI NGÀY', '#b0714b', '#fff0ce'],
  ['TRÀ & CÀ PHÊ', 'NGỒI LẠI MỘT CHÚT', '#365952', '#f6e6be'],
  ['THỜI TRANG', 'QUẦN ÁO · PHỤ KIỆN', '#685346', '#f4e5ca'],
  ['KEM TRÀNG TIỀN', 'HÀ NỘI', '#466b54', '#f1e2bc'],
  ['CÀ PHÊ HÀ NỘI', 'CÀ PHÊ · TRÀ · BÁNH', '#6d4d39', '#f3deb0'],
  ['CÀ PHÊ SÀI GÒN', 'CÀ PHÊ SỮA ĐÁ', '#31584d', '#f1dfb5'],
  ['TẠP HÓA', 'ĐỒ DÙNG MỖI NGÀY', '#9b613b', '#fff0c6']
];

// Small independently recycled shop modules follow the road bend. Foreground
// kiosks stay low; the complete upper-storey row lives on the far shoulder.
export function appendCityStreet(add, span, roadWidth, city, compact) {
  const edge = roadWidth / 2;
  for (let index = 0; index < span / CITY_SHOP_SPACING; index++) {
    const anchor = -span / 2 + (index + 0.5) * CITY_SHOP_SPACING;
    const beat = index % 16, seed = index * 131 + 17;
    for (const side of [-1, 1]) {
      const near = side === 1, facing = near ? Math.PI : 0;
      const part = (shape, x, y, z, scale, color, extras = {}) => add(shape, {
        anchor, radius: 12, x: near ? -x : x, y, z: side * (edge + 5) + (near ? -z : z),
        scale, color, yaw: facing, roll: 0, streetSide: side, ...extras
      });
      const sidewalk = side * (edge + 1.8);
      add('box', { anchor, radius: 12, x: 0, y: 0.1, z: sidewalk, scale: [6.04, 0.2, 3.05], color: 'cityPaving', yaw: 0, roll: 0, streetSide: side });
      const lakeside = city === 'hanoi' && beat >= 2 && beat <= 13;
      const floors = near || lakeside ? 1 : city === 'hcm' ? 2 + index % 3 : 2;
      const height = near ? index % 3 === 0 ? 1.65 : 2.05 : floors === 1 ? 2.4 : 2.7 + (floors - 1) * 1.75;
      const depth = near ? 2.9 : 4.2, front = depth / 2;
      const wall = `cityFacade:${index % 5}`;
      part('box', 0, height / 2 + 0.2, 0, [5.78, height, depth], wall, { storefront: true, floors });
      part('box', 0, 1.15, front + 0.04, [4.7, 1.9, 0.1], 'door');
      // Recessed shop windows and doors have a physical frame and sill.
      part('shopGlass', -0.8, 1.15, front + 0.11, [2.7, 1.75, 0.06], 'cityGlass');
      part('box', 0.8, 1.15, front + 0.16, [0.07, 1.8, 0.08], 'cityTrim');
      if (!compact) part('box', 0.05, 1.15, front + 0.16, [0.06, 1.8, 0.08], 'cityTrim');
      const shopIndex = city === 'hanoi' ? [13, 1, 12, 4, 0, 5, 8, 7][index % 8] : [14, 3, 2, 7, 6, 11, 9, 1][index % 8];
      const brand = index % 12 === 2;
      part(brand ? 'sign' : 'shopSign', 0, near ? height - 0.22 : 2.28, front + 0.2, [5.2, near ? 0.46 : 0.65, 1], 'white', { shopIndex });
      const awningY = near ? height - 0.43 : 1.94;
      part('awning', 0, awningY, front + 0.74, [5.65, 0.1, 1.22], index % 3 ? 'cityAwning' : 'cityRed');
      part('box', 0, awningY - 0.17, front + 1.31, [5.65, 0.24, 0.08], index % 3 ? 'cityAwning' : 'cityRed');
      // Foreground roofs do not rise above 2.4m or obscure the ranking lanes.
      if (near) {
        part('box', 0, height + 0.27, 0, [6, 0.14, 3.2], index % 3 ? 'cityAwning' : 'cityRoof');
        if (!compact && index % 3 === 0) {
          part('box', -1.8, height + 0.45, -0.9, [1, 0.25, 0.6], 'cityRed');
          part('round', -1.8, height + 0.7, -0.9, [1.2, 0.5, 0.7], 'treeCanopy:1');
        }
      }
      else if (city === 'hanoi') part('cityRoof', 0, height + 0.2, 0, [6.02, 0.55, depth + 0.6], 'cityRoof');
      else {
        part('box', 0, height + 0.3, 0, [5.98, 0.2, depth + 0.2], 'cream');
        if (!compact && floors > 1) part('box', -1.7, height + 0.6, -0.8, [1.4, 0.45, 1.2], 'cityTrim');
      }
      for (let floor = 1; floor < floors; floor++) {
        const y = 1.8 + floor * 1.75;
        part('shopGlass', 0, y, front + 0.06, [3.9, 1.3, 0.08], 'cityGlass');
        part('box', 0, y, front + 0.14, [0.09, 1.35, 0.09], 'cityTrim');
        for (const x of [-2.15, 2.15]) part('box', x, y, front + 0.12, [0.48, 1.4, 0.1], city === 'hanoi' ? 'cityAwning' : 'cream');
        part('box', 0, y - 0.76, front + 0.23, [5.4, 0.16, 0.52], 'cityTrim');
        if (!compact) {
          part('box', 0, y - 0.42, front + 0.52, [5.1, 0.08, 0.07], 'rail');
          for (const x of [-2.3, 0, 2.3]) part('box', x, y - 0.58, front + 0.52, [0.07, 0.35, 0.07], 'rail');
          part('box', 1.5, y - 0.55, front + 0.33, [0.55, 0.28, 0.4], 'cityRed');
          part('round', 1.5, y - 0.24, front + 0.33, [0.55, 0.4, 0.42], 'treeCanopy:1');
        }
      }
      // Sidewalk cafes, food carts and scooters alternate without entering lanes.
      if (index % 3 === 0) {
        part('pole', -1.1, 0.55, front + 1.65, [0.88, 0.08, 0.88], 'wood');
        part('pole', -1.1, 0.31, front + 1.65, [0.12, 0.48, 0.12], 'rail');
        for (const x of [-1.85, -0.35]) {
          part('box', x, 0.31, front + 1.65, [0.42, 0.45, 0.43], 'cityAwning');
          if (!compact) part('box', x, 0.55, front + 1.84, [0.42, 0.42, 0.07], 'cityAwning');
        }
      } else if (index % 3 === 1) {
        part('box', -1.3, 0.67, front + 1.35, [1.2, 0.9, 0.7], 'cityWall');
        part('shopGlass', -1.3, 1.3, front + 1.35, [1.16, 0.5, 0.72], 'cityGlass');
        part('box', -1.3, 1.63, front + 1.35, [1.5, 0.15, 1], 'cityRed');
        for (const x of [-1.76, -0.84]) part('wheel', x, 0.28, front + 1.35, [0.3, 0.3, 0.12], 'door');
      } else {
        part('box', -1.2, 0.58, front + 1.28, [0.36, 0.4, 0.9], 'cityRed');
        part('box', -1.2, 0.83, front + 1.28, [0.35, 0.12, 0.65], 'door');
        for (const z of [front + 0.9, front + 1.75]) part('wheel', -1.2, 0.37, z, [0.16, 0.5, 0.5], 'door', { yaw: facing + Math.PI / 2 });
        if (!compact) part('pole', -1.2, 0.99, front + 1.72, [0.06, 0.5, 0.06], 'rail');
      }
      if (!compact || index % 3 === 0) {
        part('box', 2.25, 0.39, front + 1.05, [0.55, 0.55, 0.55], 'cityRed');
        part('round', 2.25, 0.85, front + 1.05, [0.65, 0.65, 0.6], `treeCanopy:${index % 4}`);
      }
      if (!compact && index % 2 === 0) {
        part('pole', 1.1, 0.81, front + 1.6, [0.32, 0.85, 0.28], index % 4 ? 'cityAwning' : 'cityRed');
        part('round', 1.1, 1.4, front + 1.6, [0.27, 0.31, 0.27], 'citySkin');
        for (const x of [1.01, 1.19]) part('box', x, 0.35, front + 1.6, [0.11, 0.5, 0.12], 'door');
      }
      if (!near && index % 4 === 0) {
        part('pole', -2.6, 1.85, front + 1.35, [0.18, 3.3, 0.18], 'treeTrunk');
        part('round', -2.6, 3.55, front + 1.35, [1.7, 1, 1.4], 'treeCanopy:0', { motion: 'wind', phase: seed });
        if (!compact) part('round', -1.8, 3.8, front + 1.12, [1.4, 1.05, 1.2], 'treeCanopy:1', { motion: 'wind', phase: seed + 1 });
      }
    }
  }
}
