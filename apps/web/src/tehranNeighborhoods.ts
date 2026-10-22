export interface TehranDistrict {
  id: string;
  label: string;
  lat: number;
  lon: number;
}

// مختصات تقریبی مرکز هر منطقهٔ شهرداری تهران؛ برای تخمین فاصلهٔ هوایی است و مرجع ناوبری نیست.
export const tehranDistricts: TehranDistrict[] = [
  { id: 'd1', label: 'منطقهٔ ۱ — تجریش', lat: 35.8044, lon: 51.4336 },
  { id: 'd2', label: 'منطقهٔ ۲ — ستارخان', lat: 35.7323, lon: 51.3717 },
  { id: 'd3', label: 'منطقهٔ ۳ — ونک', lat: 35.7606, lon: 51.4084 },
  { id: 'd4', label: 'منطقهٔ ۴ — تهران‌پارس', lat: 35.7317, lon: 51.5388 },
  { id: 'd5', label: 'منطقهٔ ۵ — پونک', lat: 35.7621, lon: 51.3398 },
  { id: 'd6', label: 'منطقهٔ ۶ — امیرآباد', lat: 35.7259, lon: 51.3903 },
  { id: 'd7', label: 'منطقهٔ ۷ — سهروردی', lat: 35.7302, lon: 51.4433 },
  { id: 'd8', label: 'منطقهٔ ۸ — نارمک', lat: 35.737, lon: 51.495 },
  { id: 'd9', label: 'منطقهٔ ۹ — مهرآباد', lat: 35.6928, lon: 51.3545 },
  { id: 'd10', label: 'منطقهٔ ۱۰ — بریانک', lat: 35.6865, lon: 51.3844 },
  { id: 'd11', label: 'منطقهٔ ۱۱ — جمهوری', lat: 35.6768, lon: 51.4073 },
  { id: 'd12', label: 'منطقهٔ ۱۲ — بازار', lat: 35.6747, lon: 51.4208 },
  { id: 'd13', label: 'منطقهٔ ۱۳ — تهران‌نو', lat: 35.701, lon: 51.4748 },
  { id: 'd14', label: 'منطقهٔ ۱۴ — چهارصد متر', lat: 35.6656, lon: 51.4653 },
  { id: 'd15', label: 'منطقهٔ ۱۵ — کیان‌شهر', lat: 35.6367, lon: 51.4876 },
  { id: 'd16', label: 'منطقهٔ ۱۶ — نازی‌آباد', lat: 35.6496, lon: 51.4078 },
  { id: 'd17', label: 'منطقهٔ ۱۷ — آذری', lat: 35.6512, lon: 51.3706 },
  { id: 'd18', label: 'منطقهٔ ۱۸ — یافت‌آباد', lat: 35.6506, lon: 51.3222 },
  { id: 'd19', label: 'منطقهٔ ۱۹ — خانی‌آباد نو', lat: 35.6285, lon: 51.3706 },
  { id: 'd20', label: 'منطقهٔ ۲۰ — شهر ری', lat: 35.5965, lon: 51.4388 },
  { id: 'd21', label: 'منطقهٔ ۲۱ — تهرانسر', lat: 35.6892, lon: 51.2981 },
  { id: 'd22', label: 'منطقهٔ ۲۲ — چیتگر', lat: 35.7514, lon: 51.1831 },
];

export function districtById(id: string): TehranDistrict | undefined {
  return tehranDistricts.find(d => d.id === id);
}
