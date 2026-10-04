/**
 * Uganda administrative geography used to validate delivery addresses.
 *
 * - REGIONS: the four statutory regions.
 * - DISTRICTS: every district with its region, sub-region and approximate
 *   centroid (WGS84). Centroids are used to cross-check that a customer's map
 *   pin really lies in the district they selected.
 * - PLACES: cities, municipalities, towns and well-known neighbourhoods with
 *   coordinates, so customers can find their area quickly even when the
 *   online geocoder is unavailable.
 *
 * The shape is country-agnostic ({ code, regions, districts, places, bounds })
 * so another country can be added later as a sibling module.
 */

const COUNTRY = { code: 'UG', name: 'Uganda', callingCode: '+256', currency: 'UGX' };

// Generous bounding box of Uganda (land + Ugandan waters of Lake Victoria).
const BOUNDS = { minLat: -1.48, maxLat: 4.234, minLng: 29.573, maxLng: 35.036 };

const REGIONS = [
  { code: 'CENTRAL', name: 'Central' },
  { code: 'EASTERN', name: 'Eastern' },
  { code: 'NORTHERN', name: 'Northern' },
  { code: 'WESTERN', name: 'Western' },
];

// [name, region, subRegion, lat, lng, radiusKm?]
// radiusKm is the max distance from the centroid a pin may be; large or
// elongated districts get a wider tolerance (default 45 km).
const DISTRICT_ROWS = [
  // ---------------- Central (Buganda) ----------------
  ['Kampala', 'CENTRAL', 'Buganda', 0.3476, 32.5825, 18],
  ['Wakiso', 'CENTRAL', 'Buganda', 0.4044, 32.4594, 40],
  ['Mukono', 'CENTRAL', 'Buganda', 0.3533, 32.7553, 45],
  ['Buikwe', 'CENTRAL', 'Buganda', 0.3375, 33.0106, 40],
  ['Buvuma', 'CENTRAL', 'Buganda', 0.2500, 33.2800, 40],
  ['Kayunga', 'CENTRAL', 'Buganda', 0.7025, 32.8886, 45],
  ['Luweero', 'CENTRAL', 'Buganda', 0.8492, 32.4731, 45],
  ['Nakasongola', 'CENTRAL', 'Buganda', 1.3089, 32.4564, 50],
  ['Nakaseke', 'CENTRAL', 'Buganda', 0.9000, 32.1500, 50],
  ['Mityana', 'CENTRAL', 'Buganda', 0.4175, 32.0228, 40],
  ['Mubende', 'CENTRAL', 'Buganda', 0.5904, 31.3950, 50],
  ['Kassanda', 'CENTRAL', 'Buganda', 0.5500, 31.8000, 45],
  ['Kiboga', 'CENTRAL', 'Buganda', 0.9161, 31.7742, 45],
  ['Kyankwanzi', 'CENTRAL', 'Buganda', 1.1500, 31.7000, 55],
  ['Mpigi', 'CENTRAL', 'Buganda', 0.2250, 32.3136, 40],
  ['Butambala', 'CENTRAL', 'Buganda', 0.1750, 32.1060, 30],
  ['Gomba', 'CENTRAL', 'Buganda', 0.1800, 31.8600, 45],
  ['Masaka', 'CENTRAL', 'Buganda', -0.3333, 31.7333, 40],
  ['Kalungu', 'CENTRAL', 'Buganda', -0.1000, 31.7667, 35],
  ['Bukomansimbi', 'CENTRAL', 'Buganda', -0.1500, 31.6000, 35],
  ['Lwengo', 'CENTRAL', 'Buganda', -0.4167, 31.4167, 40],
  ['Lyantonde', 'CENTRAL', 'Buganda', -0.4031, 31.1572, 40],
  ['Rakai', 'CENTRAL', 'Buganda', -0.7200, 31.4800, 50],
  ['Kyotera', 'CENTRAL', 'Buganda', -0.6300, 31.5400, 50],
  ['Sembabule', 'CENTRAL', 'Buganda', -0.0772, 31.4567, 50],
  ['Kalangala', 'CENTRAL', 'Buganda', -0.3089, 32.2250, 70],

  // ---------------- Eastern ----------------
  ['Jinja', 'EASTERN', 'Busoga', 0.4244, 33.2042, 35],
  ['Iganga', 'EASTERN', 'Busoga', 0.6092, 33.4686, 35],
  ['Mayuge', 'EASTERN', 'Busoga', 0.4594, 33.4800, 50],
  ['Bugiri', 'EASTERN', 'Busoga', 0.5714, 33.7417, 40],
  ['Bugweri', 'EASTERN', 'Busoga', 0.5800, 33.6000, 30],
  ['Namayingo', 'EASTERN', 'Busoga', 0.2397, 33.8849, 45],
  ['Kamuli', 'EASTERN', 'Busoga', 0.9472, 33.1197, 40],
  ['Buyende', 'EASTERN', 'Busoga', 1.1500, 33.1600, 40],
  ['Kaliro', 'EASTERN', 'Busoga', 0.8950, 33.5000, 35],
  ['Luuka', 'EASTERN', 'Busoga', 0.7000, 33.3000, 30],
  ['Namutumba', 'EASTERN', 'Busoga', 0.8364, 33.6858, 35],
  ['Busia', 'EASTERN', 'Bukedi', 0.4669, 34.0900, 30],
  ['Tororo', 'EASTERN', 'Bukedi', 0.6928, 34.1808, 40],
  ['Butaleja', 'EASTERN', 'Bukedi', 0.9255, 33.9480, 30],
  ['Pallisa', 'EASTERN', 'Bukedi', 1.1450, 33.7092, 35],
  ['Budaka', 'EASTERN', 'Bukedi', 1.0167, 33.9450, 30],
  ['Kibuku', 'EASTERN', 'Bukedi', 1.0433, 33.7975, 30],
  ['Butebo', 'EASTERN', 'Bukedi', 1.2000, 33.9000, 30],
  ['Mbale', 'EASTERN', 'Bugisu', 1.0806, 34.1750, 30],
  ['Manafwa', 'EASTERN', 'Bugisu', 0.9700, 34.3400, 30],
  ['Namisindwa', 'EASTERN', 'Bugisu', 0.8500, 34.4000, 30],
  ['Bududa', 'EASTERN', 'Bugisu', 1.0100, 34.3300, 25],
  ['Sironko', 'EASTERN', 'Bugisu', 1.2300, 34.2500, 35],
  ['Bulambuli', 'EASTERN', 'Bugisu', 1.3600, 34.3900, 35],
  ['Kapchorwa', 'EASTERN', 'Sebei', 1.3964, 34.4508, 30],
  ['Kween', 'EASTERN', 'Sebei', 1.4440, 34.5970, 35],
  ['Bukwo', 'EASTERN', 'Sebei', 1.2900, 34.7500, 30],
  ['Bukedea', 'EASTERN', 'Teso', 1.3500, 34.0500, 35],
  ['Kumi', 'EASTERN', 'Teso', 1.4608, 33.9361, 35],
  ['Ngora', 'EASTERN', 'Teso', 1.4500, 33.7700, 30],
  ['Serere', 'EASTERN', 'Teso', 1.5000, 33.5500, 40],
  ['Soroti', 'EASTERN', 'Teso', 1.7150, 33.6111, 45],
  ['Kaberamaido', 'EASTERN', 'Teso', 1.7700, 33.1600, 40],
  ['Kalaki', 'EASTERN', 'Teso', 1.8170, 33.3370, 35],
  ['Amuria', 'EASTERN', 'Teso', 2.0300, 33.6400, 50],
  ['Kapelebyong', 'EASTERN', 'Teso', 2.1167, 33.9333, 45],
  ['Katakwi', 'EASTERN', 'Teso', 1.8911, 33.9661, 50],

  // ---------------- Northern ----------------
  ['Gulu', 'NORTHERN', 'Acholi', 2.7746, 32.2990, 45],
  ['Omoro', 'NORTHERN', 'Acholi', 2.7200, 32.4900, 50],
  ['Amuru', 'NORTHERN', 'Acholi', 2.8200, 31.9300, 60],
  ['Nwoya', 'NORTHERN', 'Acholi', 2.6300, 31.9800, 65],
  ['Kitgum', 'NORTHERN', 'Acholi', 3.2783, 32.8867, 60],
  ['Lamwo', 'NORTHERN', 'Acholi', 3.5300, 32.8000, 65],
  ['Pader', 'NORTHERN', 'Acholi', 2.9500, 33.1000, 55],
  ['Agago', 'NORTHERN', 'Acholi', 2.9800, 33.3300, 60],
  ['Lira', 'NORTHERN', 'Lango', 2.2499, 32.8999, 40],
  ['Alebtong', 'NORTHERN', 'Lango', 2.2500, 33.2500, 40],
  ['Otuke', 'NORTHERN', 'Lango', 2.4900, 33.3500, 45],
  ['Dokolo', 'NORTHERN', 'Lango', 1.9167, 33.1667, 35],
  ['Amolatar', 'NORTHERN', 'Lango', 1.6333, 32.8333, 40],
  ['Kole', 'NORTHERN', 'Lango', 2.4000, 32.8000, 35],
  ['Oyam', 'NORTHERN', 'Lango', 2.2350, 32.3850, 45],
  ['Apac', 'NORTHERN', 'Lango', 1.9756, 32.5386, 40],
  ['Kwania', 'NORTHERN', 'Lango', 2.0000, 32.7400, 35],
  ['Arua', 'NORTHERN', 'West Nile', 3.0201, 30.9111, 35],
  ['Terego', 'NORTHERN', 'West Nile', 3.1500, 31.0500, 35],
  ['Madi-Okollo', 'NORTHERN', 'West Nile', 2.9800, 31.1800, 40],
  ['Maracha', 'NORTHERN', 'West Nile', 3.2833, 30.9400, 25],
  ['Koboko', 'NORTHERN', 'West Nile', 3.4100, 30.9600, 25],
  ['Yumbe', 'NORTHERN', 'West Nile', 3.4650, 31.2469, 45],
  ['Obongi', 'NORTHERN', 'West Nile', 3.3300, 31.5300, 30],
  ['Moyo', 'NORTHERN', 'West Nile', 3.6600, 31.7200, 35],
  ['Adjumani', 'NORTHERN', 'West Nile', 3.3772, 31.7906, 50],
  ['Nebbi', 'NORTHERN', 'West Nile', 2.4783, 31.0889, 35],
  ['Pakwach', 'NORTHERN', 'West Nile', 2.4600, 31.4980, 40],
  ['Zombo', 'NORTHERN', 'West Nile', 2.5100, 30.9100, 30],
  ['Moroto', 'NORTHERN', 'Karamoja', 2.5345, 34.6666, 60],
  ['Kotido', 'NORTHERN', 'Karamoja', 2.9806, 34.1331, 50],
  ['Kaabong', 'NORTHERN', 'Karamoja', 3.4836, 34.1492, 70],
  ['Karenga', 'NORTHERN', 'Karamoja', 3.5500, 33.7500, 60],
  ['Abim', 'NORTHERN', 'Karamoja', 2.7017, 33.6761, 45],
  ['Napak', 'NORTHERN', 'Karamoja', 2.2500, 34.2500, 65],
  ['Nakapiripirit', 'NORTHERN', 'Karamoja', 1.9167, 34.7833, 50],
  ['Nabilatuk', 'NORTHERN', 'Karamoja', 2.0500, 34.5800, 50],
  ['Amudat', 'NORTHERN', 'Karamoja', 1.9500, 34.9500, 45],

  // ---------------- Western ----------------
  ['Mbarara', 'WESTERN', 'Ankole', -0.6072, 30.6545, 40],
  ['Rwampara', 'WESTERN', 'Ankole', -0.6800, 30.5600, 30],
  ['Kiruhura', 'WESTERN', 'Ankole', -0.2000, 30.8500, 55],
  ['Kazo', 'WESTERN', 'Ankole', -0.0500, 30.7600, 50],
  ['Isingiro', 'WESTERN', 'Ankole', -0.8400, 30.8000, 50],
  ['Ibanda', 'WESTERN', 'Ankole', -0.1300, 30.4950, 35],
  ['Ntungamo', 'WESTERN', 'Ankole', -0.8794, 30.2642, 45],
  ['Sheema', 'WESTERN', 'Ankole', -0.5500, 30.3900, 30],
  ['Bushenyi', 'WESTERN', 'Ankole', -0.5853, 30.2114, 30],
  ['Buhweju', 'WESTERN', 'Ankole', -0.3500, 30.3300, 30],
  ['Mitooma', 'WESTERN', 'Ankole', -0.6150, 30.0200, 30],
  ['Rubirizi', 'WESTERN', 'Ankole', -0.2700, 30.1100, 40],
  ['Kabale', 'WESTERN', 'Kigezi', -1.2486, 29.9894, 30],
  ['Rukiga', 'WESTERN', 'Kigezi', -1.1200, 30.0500, 30],
  ['Rubanda', 'WESTERN', 'Kigezi', -1.1900, 29.8500, 30],
  ['Kisoro', 'WESTERN', 'Kigezi', -1.2850, 29.6850, 35],
  ['Kanungu', 'WESTERN', 'Kigezi', -0.9500, 29.7900, 40],
  ['Rukungiri', 'WESTERN', 'Kigezi', -0.7900, 29.9300, 40],
  ['Kasese', 'WESTERN', 'Rwenzori', 0.1833, 30.0833, 55],
  ['Bunyangabu', 'WESTERN', 'Tooro', 0.4800, 30.2000, 30],
  ['Kabarole', 'WESTERN', 'Tooro', 0.6500, 30.2700, 35],
  ['Kyenjojo', 'WESTERN', 'Tooro', 0.6300, 30.6200, 45],
  ['Kyegegwa', 'WESTERN', 'Tooro', 0.5000, 31.0500, 45],
  ['Kamwenge', 'WESTERN', 'Tooro', 0.1867, 30.4533, 45],
  ['Kitagwenda', 'WESTERN', 'Tooro', -0.0500, 30.3000, 40],
  ['Ntoroko', 'WESTERN', 'Tooro', 1.0400, 30.5300, 45],
  ['Bundibugyo', 'WESTERN', 'Rwenzori', 0.7086, 30.0636, 35],
  ['Kibaale', 'WESTERN', 'Bunyoro', 0.8000, 31.0700, 40],
  ['Kakumiro', 'WESTERN', 'Bunyoro', 0.7800, 31.3200, 40],
  ['Kagadi', 'WESTERN', 'Bunyoro', 0.9400, 30.8100, 45],
  ['Hoima', 'WESTERN', 'Bunyoro', 1.4331, 31.3525, 45],
  ['Kikuube', 'WESTERN', 'Bunyoro', 1.2000, 31.1000, 50],
  ['Masindi', 'WESTERN', 'Bunyoro', 1.6744, 31.7150, 50],
  ['Kiryandongo', 'WESTERN', 'Bunyoro', 1.8763, 32.0622, 45],
  ['Buliisa', 'WESTERN', 'Bunyoro', 2.1178, 31.4114, 45],
];

const DEFAULT_RADIUS_KM = 45;

const DISTRICTS = DISTRICT_ROWS.map(([name, region, subRegion, lat, lng, radiusKm]) => ({
  name,
  region,
  subRegion,
  lat,
  lng,
  radiusKm: radiusKm || DEFAULT_RADIUS_KM,
}));

// [name, district, type, lat, lng]
// type: CITY | MUNICIPALITY | TOWN | DIVISION | AREA
const PLACE_ROWS = [
  // Kampala Capital City: divisions
  ['Kampala Central Division', 'Kampala', 'DIVISION', 0.3163, 32.5822],
  ['Kawempe Division', 'Kampala', 'DIVISION', 0.3790, 32.5570],
  ['Makindye Division', 'Kampala', 'DIVISION', 0.2800, 32.5900],
  ['Nakawa Division', 'Kampala', 'DIVISION', 0.3400, 32.6200],
  ['Rubaga Division', 'Kampala', 'DIVISION', 0.3050, 32.5500],
  // Kampala neighbourhoods
  ['Nakasero', 'Kampala', 'AREA', 0.3240, 32.5800],
  ['Kololo', 'Kampala', 'AREA', 0.3330, 32.5950],
  ['Kamwokya', 'Kampala', 'AREA', 0.3420, 32.5850],
  ['Bukoto', 'Kampala', 'AREA', 0.3500, 32.5950],
  ['Ntinda', 'Kampala', 'AREA', 0.3540, 32.6150],
  ['Naguru', 'Kampala', 'AREA', 0.3450, 32.6050],
  ['Kisaasi', 'Kampala', 'AREA', 0.3700, 32.6000],
  ['Kyanja', 'Kampala', 'AREA', 0.3870, 32.5950],
  ['Kiwatule', 'Kampala', 'AREA', 0.3700, 32.6250],
  ['Kigoowa', 'Kampala', 'AREA', 0.3620, 32.6150],
  ['Bugolobi', 'Kampala', 'AREA', 0.3180, 32.6200],
  ['Mbuya', 'Kampala', 'AREA', 0.3250, 32.6300],
  ['Luzira', 'Kampala', 'AREA', 0.3000, 32.6400],
  ['Mutungo', 'Kampala', 'AREA', 0.3170, 32.6550],
  ['Nakawa', 'Kampala', 'AREA', 0.3290, 32.6150],
  ['Banda', 'Kampala', 'AREA', 0.3500, 32.6400],
  ['Kyambogo', 'Kampala', 'AREA', 0.3500, 32.6300],
  ['Muyenga', 'Kampala', 'AREA', 0.2950, 32.6050],
  ['Kabalagala', 'Kampala', 'AREA', 0.2970, 32.5970],
  ['Kansanga', 'Kampala', 'AREA', 0.2850, 32.6050],
  ['Ggaba', 'Kampala', 'AREA', 0.2580, 32.6300],
  ['Munyonyo', 'Kampala', 'AREA', 0.2500, 32.6180],
  ['Nsambya', 'Kampala', 'AREA', 0.3030, 32.5850],
  ['Kibuli', 'Kampala', 'AREA', 0.3050, 32.5970],
  ['Makindye', 'Kampala', 'AREA', 0.2850, 32.5850],
  ['Kibuye', 'Kampala', 'AREA', 0.2950, 32.5700],
  ['Katwe', 'Kampala', 'AREA', 0.3020, 32.5750],
  ['Najjanankumbi', 'Kampala', 'AREA', 0.2800, 32.5650],
  ['Mengo', 'Kampala', 'AREA', 0.3050, 32.5650],
  ['Rubaga', 'Kampala', 'AREA', 0.3030, 32.5530],
  ['Namirembe', 'Kampala', 'AREA', 0.3130, 32.5600],
  ['Nateete', 'Kampala', 'AREA', 0.3000, 32.5300],
  ['Kasubi', 'Kampala', 'AREA', 0.3290, 32.5520],
  ['Kabowa', 'Kampala', 'AREA', 0.2900, 32.5500],
  ['Lungujja', 'Kampala', 'AREA', 0.3100, 32.5400],
  ['Wandegeya', 'Kampala', 'AREA', 0.3380, 32.5700],
  ['Makerere', 'Kampala', 'AREA', 0.3350, 32.5650],
  ['Mulago', 'Kampala', 'AREA', 0.3430, 32.5760],
  ['Kawempe', 'Kampala', 'AREA', 0.3800, 32.5600],
  ['Bwaise', 'Kampala', 'AREA', 0.3570, 32.5600],
  ['Kalerwe', 'Kampala', 'AREA', 0.3550, 32.5700],
  ['Kanyanya', 'Kampala', 'AREA', 0.3750, 32.5750],
  ['Kisenyi', 'Kampala', 'AREA', 0.3130, 32.5730],
  ['Old Kampala', 'Kampala', 'AREA', 0.3170, 32.5680],
  ['Industrial Area', 'Kampala', 'AREA', 0.3180, 32.6000],
  // Greater Kampala (Wakiso / Mukono)
  ['Entebbe', 'Wakiso', 'MUNICIPALITY', 0.0512, 32.4637],
  ['Nansana', 'Wakiso', 'MUNICIPALITY', 0.3639, 32.5286],
  ['Kira', 'Wakiso', 'MUNICIPALITY', 0.3970, 32.6400],
  ['Makindye-Ssabagabo', 'Wakiso', 'MUNICIPALITY', 0.2400, 32.5500],
  ['Kajjansi', 'Wakiso', 'TOWN', 0.2100, 32.5500],
  ['Kitende', 'Wakiso', 'TOWN', 0.1900, 32.5400],
  ['Lubowa', 'Wakiso', 'AREA', 0.2400, 32.5700],
  ['Najjera', 'Wakiso', 'AREA', 0.3850, 32.6200],
  ['Kyaliwajjala', 'Wakiso', 'AREA', 0.3900, 32.6450],
  ['Namugongo', 'Wakiso', 'AREA', 0.3900, 32.6550],
  ['Bweyogerere', 'Wakiso', 'AREA', 0.3550, 32.6600],
  ['Kireka', 'Wakiso', 'AREA', 0.3450, 32.6500],
  ['Gayaza', 'Wakiso', 'TOWN', 0.4500, 32.6100],
  ['Kasangati', 'Wakiso', 'TOWN', 0.4380, 32.6020],
  ['Matugga', 'Wakiso', 'TOWN', 0.4650, 32.5300],
  ['Wakiso Town', 'Wakiso', 'TOWN', 0.4044, 32.4594],
  ['Kakiri', 'Wakiso', 'TOWN', 0.4200, 32.3900],
  ['Busega', 'Wakiso', 'AREA', 0.3000, 32.5200],
  ['Mutundwe', 'Wakiso', 'AREA', 0.2850, 32.5400],
  ['Abaita Ababiri', 'Wakiso', 'AREA', 0.0900, 32.4900],
  ['Mukono Town', 'Mukono', 'MUNICIPALITY', 0.3533, 32.7553],
  ['Seeta', 'Mukono', 'TOWN', 0.3600, 32.7100],
  ['Namanve', 'Mukono', 'AREA', 0.3500, 32.6900],
  ['Lugazi', 'Buikwe', 'MUNICIPALITY', 0.3690, 32.9420],
  ['Njeru', 'Buikwe', 'MUNICIPALITY', 0.4300, 33.1500],
  // Cities and municipalities across the country
  ['Jinja City', 'Jinja', 'CITY', 0.4244, 33.2042],
  ['Masaka City', 'Masaka', 'CITY', -0.3338, 31.7341],
  ['Mbarara City', 'Mbarara', 'CITY', -0.6072, 30.6545],
  ['Fort Portal City', 'Kabarole', 'CITY', 0.6710, 30.2750],
  ['Hoima City', 'Hoima', 'CITY', 1.4331, 31.3525],
  ['Gulu City', 'Gulu', 'CITY', 2.7746, 32.2990],
  ['Lira City', 'Lira', 'CITY', 2.2499, 32.8999],
  ['Arua City', 'Arua', 'CITY', 3.0201, 30.9111],
  ['Mbale City', 'Mbale', 'CITY', 1.0806, 34.1750],
  ['Soroti City', 'Soroti', 'CITY', 1.7150, 33.6111],
  ['Mityana Town', 'Mityana', 'MUNICIPALITY', 0.4175, 32.0228],
  ['Mubende Town', 'Mubende', 'MUNICIPALITY', 0.5904, 31.3950],
  ['Mpigi Town', 'Mpigi', 'TOWN', 0.2250, 32.3136],
  ['Luweero Town', 'Luweero', 'TOWN', 0.8492, 32.4731],
  ['Wobulenzi', 'Luweero', 'TOWN', 0.7300, 32.5200],
  ['Bombo', 'Luweero', 'TOWN', 0.5800, 32.5400],
  ['Kayunga Town', 'Kayunga', 'TOWN', 0.7025, 32.8886],
  ['Iganga Town', 'Iganga', 'MUNICIPALITY', 0.6092, 33.4686],
  ['Bugiri Town', 'Bugiri', 'MUNICIPALITY', 0.5714, 33.7417],
  ['Busia Town', 'Busia', 'MUNICIPALITY', 0.4669, 34.0900],
  ['Tororo Town', 'Tororo', 'MUNICIPALITY', 0.6928, 34.1808],
  ['Kamuli Town', 'Kamuli', 'MUNICIPALITY', 0.9472, 33.1197],
  ['Kumi Town', 'Kumi', 'MUNICIPALITY', 1.4608, 33.9361],
  ['Kapchorwa Town', 'Kapchorwa', 'MUNICIPALITY', 1.3964, 34.4508],
  ['Kitgum Town', 'Kitgum', 'MUNICIPALITY', 3.2783, 32.8867],
  ['Apac Town', 'Apac', 'MUNICIPALITY', 1.9756, 32.5386],
  ['Nebbi Town', 'Nebbi', 'MUNICIPALITY', 2.4783, 31.0889],
  ['Koboko Town', 'Koboko', 'MUNICIPALITY', 3.4100, 30.9600],
  ['Moroto Town', 'Moroto', 'MUNICIPALITY', 2.5345, 34.6666],
  ['Kotido Town', 'Kotido', 'MUNICIPALITY', 2.9806, 34.1331],
  ['Masindi Town', 'Masindi', 'MUNICIPALITY', 1.6744, 31.7150],
  ['Kasese Town', 'Kasese', 'MUNICIPALITY', 0.1833, 30.0833],
  ['Bushenyi-Ishaka', 'Bushenyi', 'MUNICIPALITY', -0.5450, 30.1400],
  ['Ibanda Town', 'Ibanda', 'MUNICIPALITY', -0.1300, 30.4950],
  ['Ntungamo Town', 'Ntungamo', 'MUNICIPALITY', -0.8794, 30.2642],
  ['Kabale Town', 'Kabale', 'MUNICIPALITY', -1.2486, 29.9894],
  ['Kisoro Town', 'Kisoro', 'MUNICIPALITY', -1.2850, 29.6850],
  ['Rukungiri Town', 'Rukungiri', 'MUNICIPALITY', -0.7900, 29.9300],
  ['Lyantonde Town', 'Lyantonde', 'TOWN', -0.4031, 31.1572],
  ['Kyotera Town', 'Kyotera', 'TOWN', -0.6300, 31.5400],
  ['Mutukula', 'Kyotera', 'TOWN', -0.9970, 31.4200],
  ['Malaba', 'Tororo', 'TOWN', 0.6400, 34.2800],
  ['Katuna', 'Kabale', 'TOWN', -1.4200, 30.0000],
  ['Kigumba', 'Kiryandongo', 'TOWN', 1.8100, 32.0100],
  ['Pakwach Town', 'Pakwach', 'TOWN', 2.4600, 31.4980],
  ['Adjumani Town', 'Adjumani', 'TOWN', 3.3772, 31.7906],
  ['Yumbe Town', 'Yumbe', 'TOWN', 3.4650, 31.2469],
  ['Kagadi Town', 'Kagadi', 'TOWN', 0.9400, 30.8100],
  ['Kyenjojo Town', 'Kyenjojo', 'TOWN', 0.6300, 30.6200],
  ['Kamwenge Town', 'Kamwenge', 'TOWN', 0.1867, 30.4533],
  ['Sembabule Town', 'Sembabule', 'TOWN', -0.0772, 31.4567],
  ['Kalangala Town', 'Kalangala', 'TOWN', -0.3089, 32.2250],
];

const PLACES = PLACE_ROWS.map(([name, district, type, lat, lng]) => ({ name, district, type, lat, lng }));

const DISTRICT_BY_KEY = new Map(DISTRICTS.map((d) => [d.name.toLowerCase(), d]));
const REGION_BY_CODE = new Map(REGIONS.map((r) => [r.code, r]));

/** Case-insensitive district lookup; tolerates "Kampala District" / "City" suffixes. */
function findDistrict(name) {
  if (!name || typeof name !== 'string') return null;
  const key = name
    .trim()
    .toLowerCase()
    .replace(/\s+(district|city|capital city)$/i, '')
    .trim();
  return DISTRICT_BY_KEY.get(key) || null;
}

function findRegion(code) {
  if (!code || typeof code !== 'string') return null;
  const key = code.trim().toUpperCase().replace(/\s+REGION$/, '');
  return REGION_BY_CODE.get(key) || REGIONS.find((r) => r.name.toUpperCase() === key) || null;
}

module.exports = {
  COUNTRY,
  BOUNDS,
  REGIONS,
  DISTRICTS,
  PLACES,
  findDistrict,
  findRegion,
};
