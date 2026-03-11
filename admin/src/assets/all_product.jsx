// Importing men images
import p1_img from "./men (1).jpg";
import p2_img from "./men (2).jpg";
import p3_img from "./men (3).jpg";
import p4_img from "./men (4).jpg";
import p5_img from "./men (5).jpg";
import p6_img from "./men (6).jpg";
import p7_img from "./men (7).jpg";
import p8_img from "./men (8).jpg";
import p9_img from "./men (9).jpg";
import p10_img from "./men (10).jpg";
import p11_img from "./men (11).jpg";
import p12_img from "./men (12).jpg";

import p13_img from "./product (7).jpg";
import p14_img from "./product (8).jpg";
import p15_img from "./product (1).jpg";
import p16_img from "./product (2).jpg";
import p17_img from "./product (3).jpg";
import p18_img from "./product (4).jpg";
import p19_img from "./product (5).jpg";
import p20_img from "./product (6).jpg";



// Importing children images
import c1_img from "./children (1).jpg";
import c2_img from "./children (2).jpg";
import c3_img from "./children (3).jpg";
import c4_img from "./children (4).jpg";
import c5_img from "./children (5).jpg";
import c6_img from "./children (6).jpg";
import c7_img from "./children (7).jpg";
import c8_img from "./children (8).jpg";
import c9_img from "./children (9).jpg";
import c10_img from "./children (10).jpg";
import c11_img from "./children (11).jpg";
import c12_img from "./children (12).jpg";

// Importing women images
import w1_img from "./women (1).jpg";
import w2_img from "./women (2).jpg";
import w3_img from "./women (3).jpg";
import w4_img from "./women (4).jpg";
import w5_img from "./women (5).jpg";
import w6_img from "./women (6).jpg";
import w7_img from "./women (7).jpg";
import w8_img from "./women (8).jpg";
import w9_img from "./women (9).jpg";
import w10_img from "./women (10).jpg";
import w11_img from "./women (11).jpg";
import w12_img from "./women (12).jpg";

const all_product = [
  // Men products
  { id: 1, name: "Striped Flutter Sleeve", image: p1_img, old_price: 80.5, new_price: 65.0, category: "men" },
  { id: 2, name: "Striped Flutter Sleeve", image: p2_img, old_price: 120.5, new_price: 85.0, category: "men" },
  { id: 3, name: "Striped Flutter Sleeve", image: p3_img, old_price: 100.0, new_price: 75.0, category: "men" },
  { id: 4, name: "Striped Flutter Sleeve", image: p4_img, old_price: 150.0, new_price: 110.0, category: "men" },
  { id: 5, name: "Striped Flutter Sleeve", image: p5_img, old_price: 80.5, new_price: 65.0, category: "men" },
  { id: 6, name: "Striped Flutter Sleeve", image: p6_img, old_price: 120.5, new_price: 85.0, category: "men" },
  { id: 7, name: "Striped Flutter Sleeve", image: p7_img, old_price: 100.0, new_price: 75.0, category: "men" },
  { id: 8, name: "Striped Flutter Sleeve", image: p8_img, old_price: 150.0, new_price: 110.0, category: "men" },
  { id: 9, name: "Striped Flutter Sleeve", image: p9_img, old_price: 150.0, new_price: 110.0, category: "men" },
  { id: 10, name: "Striped Flutter Sleeve", image: p10_img, old_price: 120.0, new_price: 95.0, category: "men" },
  { id: 11, name: "Striped Flutter Sleeve", image: p11_img, old_price: 110.0, new_price: 90.0, category: "men" },
  { id: 12, name: "Striped Flutter Sleeve", image: p12_img, old_price: 130.0, new_price: 105.0, category: "men" },
  { id: 13, name: "Striped Flutter Sleeve", image: p13_img, old_price: 150.0, new_price: 120.0, category: "men" },
  { id: 14, name: "Striped Flutter Sleeve", image: p14_img, old_price: 140.0, new_price: 115.0, category: "men" },
  { id: 15, name: "Striped Flutter Sleeve", image: p15_img, old_price: 160.0, new_price: 125.0, category: "men" },
  { id: 16, name: "Striped Flutter Sleeve", image: p16_img, old_price: 170.0, new_price: 130.0, category: "men" },
  { id: 17, name: "Striped Flutter Sleeve", image: p17_img, old_price: 180.0, new_price: 140.0, category: "men" },
  { id: 18, name: "Striped Flutter Sleeve", image: p18_img, old_price: 190.0, new_price: 150.0, category: "men" },
  { id: 19, name: "Striped Flutter Sleeve", image: p19_img, old_price: 200.0, new_price: 160.0, category: "men" },
  { id: 20, name: "Striped Flutter Sleeve", image: p20_img, old_price: 210.0, new_price: 170.0, category: "men" },

  // Children products
  { id: 21, name: "Striped Flutter Sleeve", image: c1_img, old_price: 150.0, new_price: 110.0, category: "kid" },
  { id: 22, name: "Striped Flutter Sleeve", image: c2_img, old_price: 150.0, new_price: 110.0, category: "kid" },
  { id: 23, name: "Striped Flutter Sleeve", image: c3_img, old_price: 150.0, new_price: 110.0, category: "kid" },
  { id: 24, name: "Striped Flutter Sleeve", image: c4_img, old_price: 150.0, new_price: 110.0, category: "kid" },
  { id: 25, name: "Striped Flutter Sleeve", image: c5_img, old_price: 150.0, new_price: 110.0, category: "kid" },
  { id: 26, name: "Striped Flutter Sleeve", image: c6_img, old_price: 150.0, new_price: 110.0, category: "kid" },
  { id: 27, name: "Striped Flutter Sleeve", image: c7_img, old_price: 150.0, new_price: 110.0, category: "kid" },
  { id: 28, name: "Striped Flutter Sleeve", image: c8_img, old_price: 150.0, new_price: 110.0, category: "kid" },
  { id: 29, name: "Striped Flutter Sleeve", image: c9_img, old_price: 150.0, new_price: 110.0, category: "kid" },
  { id: 30, name: "Striped Flutter Sleeve", image: c10_img, old_price: 150.0, new_price: 110.0, category: "kid" },
  { id: 31, name: "Striped Flutter Sleeve", image: c11_img, old_price: 150.0, new_price: 110.0, category: "kid" },
  { id: 32, name: "Striped Flutter Sleeve", image: c12_img, old_price: 150.0, new_price: 110.0, category: "kid" },

  // Women products
  { id: 33, name: "Floral Summer Dress", image: w1_img, old_price: 159.0, new_price: 210.0, category: "women" },
  { id: 34, name: "Casual Shirt Blouse", image: w2_img, old_price: 120.0, new_price: 145.0, category: "women" },
  { id: 35, name: "Striped Maxi Dress", image: w3_img, old_price: 200.0, new_price: 180.0, category: "women" },
  { id: 36, name: "Elegant Evening Gown", image: w4_img, old_price: 350.0, new_price: 320.0, category: "women" },
  { id: 37, name: "Casual Summer Top", image: w5_img, old_price: 80.0, new_price: 65.0, category: "women" },
  { id: 38, name: "Denim Jacket", image: w6_img, old_price: 140.0, new_price: 120.0, category: "women" },
  { id: 39, name: "Boho Style Dress", image: w7_img, old_price: 180.0, new_price: 150.0, category: "women" },
  { id: 40, name: "Formal Office Dress", image: w8_img, old_price: 220.0, new_price: 200.0, category: "women" },
  { id: 41, name: "Flutter Short Sleeve", image: w9_img, old_price: 90.0, new_price: 75.0, category: "women" },
  { id: 42, name: "Casual Hoodie", image: w10_img, old_price: 90.0, new_price: 75.0, category: "women" },
  { id: 43, name: "Flutter Short Sleeve", image: w11_img, old_price: 90.3, new_price: 76.0, category: "women" },
  { id: 44, name: "Casual Hoodie", image: w12_img, old_price: 45.0, new_price: 98.0, category: "women" },
];

export default all_product;