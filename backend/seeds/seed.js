const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const env = require('../src/config/env');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting UgaMarket database seed...');

  // 1. Seed Administrators from environment variables (Never hardcoded)
  console.log('👤 Seeding administrators from environment variables...');
  const salt = await bcrypt.genSalt(12);

  const admin1PasswordHash = await bcrypt.hash(env.ADMIN_1_PASSWORD, salt);
  await prisma.admin.upsert({
    where: { email: env.ADMIN_1_EMAIL },
    update: {
      fullName: env.ADMIN_1_NAME,
      passwordHash: admin1PasswordHash,
      role: 'SUPER_ADMIN',
      isActive: true,
    },
    create: {
      fullName: env.ADMIN_1_NAME,
      email: env.ADMIN_1_EMAIL,
      passwordHash: admin1PasswordHash,
      role: 'SUPER_ADMIN',
      isActive: true,
    },
  });

  const admin2PasswordHash = await bcrypt.hash(env.ADMIN_2_PASSWORD, salt);
  await prisma.admin.upsert({
    where: { email: env.ADMIN_2_EMAIL },
    update: {
      fullName: env.ADMIN_2_NAME,
      passwordHash: admin2PasswordHash,
      role: 'ADMIN',
      isActive: true,
    },
    create: {
      fullName: env.ADMIN_2_NAME,
      email: env.ADMIN_2_EMAIL,
      passwordHash: admin2PasswordHash,
      role: 'ADMIN',
      isActive: true,
    },
  });
  console.log(`✅ Admins seeded: ${env.ADMIN_1_EMAIL}, ${env.ADMIN_2_EMAIL}`);

  // 2. Seed Categories
  console.log('📂 Seeding food categories with multilingual translations...');
  const categoriesData = [
    {
      slug: 'matooke-tubers',
      icon: 'carrot',
      nameEn: 'Matooke & Tubers',
      nameLg: "Amatooke n'Ebinnya",
      nameFr: 'Matooke et Tubercules',
      nameSw: 'Ndizi na Mizizi',
      imageUrl: 'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?w=600&auto=format&fit=crop&q=80',
      displayOrder: 1,
    },
    {
      slug: 'fresh-vegetables',
      icon: 'leafy-green',
      nameEn: 'Fresh Vegetables',
      nameLg: "Enva Endiirwa Ez'obutonde",
      nameFr: 'Légumes Frais',
      nameSw: 'Mbogamboga Safi',
      imageUrl: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&auto=format&fit=crop&q=80',
      displayOrder: 2,
    },
    {
      slug: 'fresh-fruits',
      icon: 'apple',
      nameEn: 'Fresh Fruits',
      nameLg: 'Ebibala Ebibisi',
      nameFr: 'Fruits Frais',
      nameSw: 'Matunda Safi',
      imageUrl: 'https://images.unsplash.com/photo-1619566636858-adf3ef46400b?w=600&auto=format&fit=crop&q=80',
      displayOrder: 3,
    },
    {
      slug: 'meat-poultry-fish',
      icon: 'beef',
      nameEn: 'Meat, Poultry & Fish',
      nameLg: "Ennyama, Enkoko n'Ebyennyanja",
      nameFr: 'Viande, Volaille et Poisson',
      nameSw: 'Nyama, Kuku na Samaki',
      imageUrl: 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=600&auto=format&fit=crop&q=80',
      displayOrder: 4,
    },
    {
      slug: 'grains-cereals',
      icon: 'wheat',
      nameEn: 'Grains & Cereals',
      nameLg: "Empeke n'Eŋŋaano",
      nameFr: 'Grains et Céréales',
      nameSw: 'Nafaka na Mbegu',
      imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&auto=format&fit=crop&q=80',
      displayOrder: 5,
    },
    {
      slug: 'dairy-eggs',
      icon: 'milk',
      nameEn: 'Dairy & Farm Eggs',
      nameLg: "Amata n'Amagi g'okufamu",
      nameFr: 'Produits Laitiers et Œufs',
      nameSw: 'Maziwa na Mayai',
      imageUrl: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=600&auto=format&fit=crop&q=80',
      displayOrder: 6,
    },
    {
      slug: 'spices-seasonings',
      icon: 'flame',
      nameEn: 'Spices & Herbs',
      nameLg: "Ebinzaali n'Ebirungo",
      nameFr: 'Épices et Aromates',
      nameSw: 'Viungo na Mimea',
      imageUrl: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=600&auto=format&fit=crop&q=80',
      displayOrder: 7,
    },
    // ---- General merchandise (UgaMarket is not food-only) ----
    { slug: 'phones-tablets', icon: 'smartphone', displayOrder: 10, nameEn: 'Phones & Tablets', nameLg: "Essimu ne Tablet", nameFr: 'Téléphones et tablettes', nameSw: 'Simu na Tableti' },
    { slug: 'electronics', icon: 'tv', displayOrder: 11, nameEn: 'TV, Audio & Electronics', nameLg: "TV, Leediyo n'Ebyuma by'amasannyalaze", nameFr: 'TV, audio et électronique', nameSw: 'TV, Sauti na Elektroniki' },
    { slug: 'computers-accessories', icon: 'laptop', displayOrder: 12, nameEn: 'Computers & Accessories', nameLg: "Kompyuta n'Ebizikozesebwa", nameFr: 'Ordinateurs et accessoires', nameSw: 'Kompyuta na Vifaa' },
    { slug: 'fashion', icon: 'shirt', displayOrder: 13, nameEn: 'Fashion & Clothing', nameLg: "Engoye n'Emisono", nameFr: 'Mode et vêtements', nameSw: 'Mitindo na Mavazi' },
    { slug: 'home-kitchen', icon: 'cooking-pot', displayOrder: 14, nameEn: 'Home & Kitchen', nameLg: "Eby'awaka n'Effumbiro", nameFr: 'Maison et cuisine', nameSw: 'Nyumba na Jikoni' },
    { slug: 'beauty-health', icon: 'sparkles', displayOrder: 15, nameEn: 'Beauty & Personal Care', nameLg: "Okwewunda n'Obuyonjo", nameFr: 'Beauté et soins', nameSw: 'Urembo na Utunzaji' },
    { slug: 'household-supplies', icon: 'spray-can', displayOrder: 16, nameEn: 'Household Supplies', nameLg: "Ebikozesebwa mu Maka", nameFr: 'Produits ménagers', nameSw: 'Mahitaji ya Nyumbani' },
    { slug: 'baby-kids', icon: 'baby', displayOrder: 17, nameEn: 'Baby & Kids', nameLg: "Abaana n'Abawere", nameFr: 'Bébés et enfants', nameSw: 'Watoto na Wachanga' },
    { slug: 'beverages-snacks', icon: 'cup-soda', displayOrder: 18, nameEn: 'Beverages & Snacks', nameLg: "Ebyokunywa n'Obumpwankimpwanki", nameFr: 'Boissons et snacks', nameSw: 'Vinywaji na Vitafunio' },
    { slug: 'stationery-office', icon: 'pencil', displayOrder: 19, nameEn: 'Stationery & Office', nameLg: "Ebyokuwandiisa n'Ebya Ofiisi", nameFr: 'Papeterie et bureau', nameSw: 'Vifaa vya Ofisi na Shule' },
    { slug: 'hardware-tools', icon: 'hammer', displayOrder: 20, nameEn: 'Hardware & Tools', nameLg: "Ebyuma n'Ebikozesebwa mu Kuzimba", nameFr: 'Quincaillerie et outils', nameSw: 'Vifaa vya Ujenzi na Zana' },
    { slug: 'farm-supplies', icon: 'tractor', displayOrder: 21, nameEn: 'Agriculture & Farm Supplies', nameLg: "Eby'Okulima n'Obulunzi", nameFr: 'Agriculture et fournitures agricoles', nameSw: 'Kilimo na Pembejeo' },
    { slug: 'sports-outdoors', icon: 'dumbbell', displayOrder: 22, nameEn: 'Sports & Outdoors', nameLg: "Emizannyo n'Ebweru", nameFr: 'Sports et plein air', nameSw: 'Michezo na Nje' },
  ];

  const categoryMap = {};
  for (const cat of categoriesData) {
    const { nameFr, nameSw, ...baseCat } = cat;
    const record = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: baseCat,
      create: baseCat,
    });
    categoryMap[cat.slug] = record.id;

    // Upsert translations across all 4 official platform languages
    const trans = [
      { language: 'EN', name: cat.nameEn },
      { language: 'LG', name: cat.nameLg },
      { language: 'FR', name: cat.nameFr },
      { language: 'SW', name: cat.nameSw },
    ];

    for (const t of trans) {
      if (t.name) {
        await prisma.categoryTranslation.upsert({
          where: {
            categoryId_language: {
              categoryId: record.id,
              language: t.language,
            },
          },
          update: { name: t.name },
          create: { categoryId: record.id, language: t.language, name: t.name },
        });
      }
    }
  }
  console.log(`✅ ${categoriesData.length} categories and translations seeded.`);

  // 3. Seed Delivery Pricing Configuration
  console.log('🚚 Seeding delivery pricing configuration...');
  await prisma.deliveryPricingConfig.upsert({
    where: { id: 1 },
    update: {
      warehouseName: 'Nakasero, Kampala',
      warehouseLat: env.WAREHOUSE_LATITUDE,
      warehouseLng: env.WAREHOUSE_LONGITUDE,
      baseFeeUgx: env.DELIVERY_BASE_FEE,
      freeRadiusKm: env.DELIVERY_FREE_RADIUS_KM,
      perKmRateUgx: env.DELIVERY_PER_KM_RATE,
      minimumFeeUgx: env.DELIVERY_MINIMUM_FEE,
      isActive: true,
    },
    create: {
      id: 1,
      warehouseName: 'Nakasero, Kampala',
      warehouseLat: env.WAREHOUSE_LATITUDE,
      warehouseLng: env.WAREHOUSE_LONGITUDE,
      baseFeeUgx: env.DELIVERY_BASE_FEE,
      freeRadiusKm: env.DELIVERY_FREE_RADIUS_KM,
      perKmRateUgx: env.DELIVERY_PER_KM_RATE,
      minimumFeeUgx: env.DELIVERY_MINIMUM_FEE,
      isActive: true,
    },
  });
  console.log('✅ Delivery pricing configuration seeded.');

  // 4. Seed Commitment Rule Configuration
  console.log('💳 Seeding commitment rule configuration...');
  await prisma.commitmentRuleConfig.upsert({
    where: { id: 1 },
    update: {
      ruleType: env.COMMITMENT_RULE_TYPE,
      percentageValue: env.COMMITMENT_PERCENTAGE,
      flatValueUgx: 10000,
      minCommitment: env.COMMITMENT_MIN_AMOUNT,
      isActive: true,
    },
    create: {
      id: 1,
      ruleType: env.COMMITMENT_RULE_TYPE,
      percentageValue: env.COMMITMENT_PERCENTAGE,
      flatValueUgx: 10000,
      minCommitment: env.COMMITMENT_MIN_AMOUNT,
      isActive: true,
    },
  });
  console.log('✅ Commitment rule configuration seeded.');

  // 6. Seed Food Products
  console.log('🥬 Seeding sample Ugandan food products with multilingual translations...');
  const foodProducts = [
    {
      categoryId: categoryMap['matooke-tubers'],
      slug: 'fresh-green-matooke-cluster',
      sku: 'UFM-PROD-0001',
      nameEn: 'Fresh Green Matooke (Cluster)',
      nameLg: 'Amatooke Amabisi Amasuffu',
      nameFr: 'Matooke Vert Frais (Grappe)',
      nameSw: 'Ndizi Mbichi Safi (Tawi)',
      descriptionEn: 'Farm-fresh green cooking bananas sourced directly from western Uganda farms. Tender and flavorful.',
      descriptionLg: 'Amatooke amagimu okuva mu byalo byo mu bugwanjuba bwa Uganda. Malungi nnyo mu kufumba.',
      descriptionFr: 'Bananes plantains fraîches de cuisson provenant directement des fermes de l’ouest de l’Ouganda.',
      descriptionSw: 'Ndizi mbichi za kupika kutoka mashamba ya magharibi mwa Uganda. Laini na tamu.',
      priceUgx: 28000,
      unit: 'bunch',
      stockQuantity: 45,
      imageUrl: 'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?w=600&auto=format&fit=crop&q=80',
    },
    {
      categoryId: categoryMap['matooke-tubers'],
      slug: 'sweet-potatoes-lumonde',
      sku: 'UFM-PROD-0002',
      nameEn: 'Sweet Potatoes (Lumonde)',
      nameLg: 'Lumonde Omumyufu',
      nameFr: 'Patates Douces (Lumonde)',
      nameSw: 'Viazi Vitamu (Lumonde)',
      descriptionEn: 'Nutritious organic red sweet potatoes, naturally sweet and energy-packed.',
      descriptionLg: 'Lumonde omumyufu omuwoomu, alimu amanyi era nga mulungi eri obulamu.',
      descriptionFr: 'Patates douces rouges bio et nutritives, naturellement sucrées et riches en énergie.',
      descriptionSw: 'Viazi vitamu vyelezi vyenye virutubisho na nguvu kwa mwili.',
      priceUgx: 4500,
      unit: 'kg',
      stockQuantity: 120,
      imageUrl: 'https://images.unsplash.com/photo-1596097635121-14b63b7a0c19?w=600&auto=format&fit=crop&q=80',
    },
    {
      categoryId: categoryMap['fresh-vegetables'],
      slug: 'nakati-greens',
      sku: 'UFM-PROD-0003',
      nameEn: 'Nakati Greens',
      nameLg: 'Enva z’Ekinakati',
      nameFr: 'Feuilles de Nakati',
      nameSw: 'Mboga za Nakati',
      descriptionEn: 'Traditional nutritious leafy greens picked fresh every morning.',
      descriptionLg: 'Enva endiirwa ez’ekinakati ezinoleddwa ku makya, zimuweese obulamu.',
      descriptionFr: 'Légumes verts traditionnels et nutritifs cueillis frais chaque matin.',
      descriptionSw: 'Mboga za kiasili za majani zenye virutubisho zilizovunwa asubuhi.',
      priceUgx: 2000,
      unit: 'bunch',
      stockQuantity: 80,
      imageUrl: 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=600&auto=format&fit=crop&q=80',
    },
    {
      categoryId: categoryMap['fresh-vegetables'],
      slug: 'sukuma-wiki-collard-greens',
      sku: 'UFM-PROD-0004',
      nameEn: 'Sukuma Wiki (Collard Greens)',
      nameLg: 'Enva za Sukuma Wiki',
      nameFr: 'Sukuma Wiki (Chou Cavalier)',
      nameSw: 'Sukuma Wiki Safi',
      descriptionEn: 'Crisp, nutrient-dense collard greens perfect for frying or stewing.',
      descriptionLg: 'Sukuma wiki omugimu era omuwoomu, asobola okusiikibwa oba okufumbibwa.',
      descriptionFr: 'Choux cavaliers croquants et riches en nutriments, parfaits pour sauter ou mijoter.',
      descriptionSw: 'Sukuma wiki safi yenye majani mabichi kwa mboga na afya.',
      priceUgx: 1800,
      unit: 'bunch',
      stockQuantity: 95,
      imageUrl: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&auto=format&fit=crop&q=80',
    },
    {
      categoryId: categoryMap['fresh-fruits'],
      slug: 'sugar-bananas-sukali-ndizi',
      sku: 'UFM-PROD-0005',
      nameEn: 'Sugar Bananas (Sukali Ndizi)',
      nameLg: 'Amenvu ga Sukali Ndizi',
      nameFr: 'Bananes Sucrées (Ndizi)',
      nameSw: 'Ndizi Tamu (Sukari Ndizi)',
      descriptionEn: 'Naturally sweet small dessert bananas, delicious and rich in potassium.',
      descriptionLg: 'Amenvu ga sukali ndizi omuwoomu nga ssukaali, amalungi eri amanyi.',
      descriptionFr: 'Petites bananes de dessert naturellement sucrées et riches en potassium.',
      descriptionSw: 'Ndizi ndogo tamu za dessert zenye ladha ya asili na potasiamu.',
      priceUgx: 6000,
      unit: 'bunch',
      stockQuantity: 60,
      imageUrl: 'https://images.unsplash.com/photo-1603833665858-e61d17a86224?w=600&auto=format&fit=crop&q=80',
    },
    {
      categoryId: categoryMap['fresh-fruits'],
      slug: 'ugandan-hass-avocado',
      sku: 'UFM-PROD-0006',
      nameEn: 'Ugandan Hass Avocado',
      nameLg: 'Avoka Omuweweevu',
      nameFr: 'Avocat Hass d’Ouganda',
      nameSw: 'Parachichi ya Hass Uganda',
      descriptionEn: 'Creamy, rich Hass avocados packed with healthy plant oils and vitamins.',
      descriptionLg: 'Avoka asukkulumye mu kuwooma n’okuweweeva, ow’omugaso ennyo.',
      descriptionFr: 'Avocats Hass crémeux et savoureux, riches en bonnes graisses végétales.',
      descriptionSw: 'Parachichi laini yenye mafuta mazuri na vitamini kwa mwili.',
      priceUgx: 5000,
      unit: 'kg',
      stockQuantity: 75,
      imageUrl: 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=600&auto=format&fit=crop&q=80',
    },
    {
      categoryId: categoryMap['meat-poultry-fish'],
      slug: 'lake-victoria-fresh-tilapia',
      sku: 'UFM-PROD-0007',
      nameEn: 'Lake Victoria Fresh Tilapia (Engege)',
      nameLg: "Engege Ennamu ey'Ennyanja Nnalubaale",
      nameFr: 'Tilapia Frais du Lac Victoria (Engege)',
      nameSw: 'Ngege Safi wa Ziwa Victoria',
      descriptionEn: 'Fresh whole Tilapia caught from Lake Victoria, cleaned and descaled upon request.',
      descriptionLg: 'Ekyennyanja kye Ngege ekyokya okuva mu Nnalubaale, ekitukula obulungi.',
      descriptionFr: 'Tilapia entier frais du Lac Victoria, écaillé et nettoyé sur demande.',
      descriptionSw: 'Samaki aina ya ngege safi mzima kutoka Ziwa Victoria.',
      priceUgx: 20000,
      unit: 'piece',
      stockQuantity: 30,
      imageUrl: 'https://images.unsplash.com/photo-1534482421-64566f976cfa?w=600&auto=format&fit=crop&q=80',
    },
    {
      categoryId: categoryMap['meat-poultry-fish'],
      slug: 'prime-beef-ennyama',
      sku: 'UFM-PROD-0008',
      nameEn: 'Prime Beef (Ennyama y’Ente)',
      nameLg: 'Ennyama y’Ente Ennungi',
      nameFr: 'Bœuf de Première Qualité',
      nameSw: 'Nyama Bora ya Ng’ombe',
      descriptionEn: 'Tender grass-fed beef cut to order, ideal for stews and roasting.',
      descriptionLg: 'Ennyama y’ente ensale obulungi okuva ku nte eziriisiddwa omuddo.',
      descriptionFr: 'Bœuf tendre nourri à l’herbe, coupé selon vos préférences pour ragoûts.',
      descriptionSw: 'Nyama laini ya ng’ombe iliyolishwa nyasi, inafaa kwa mchuzi na kuchoma.',
      priceUgx: 17000,
      unit: 'kg',
      stockQuantity: 50,
      imageUrl: 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=600&auto=format&fit=crop&q=80',
    },
    {
      categoryId: categoryMap['grains-cereals'],
      slug: 'super-aromatic-rice',
      sku: 'UFM-PROD-0009',
      nameEn: 'Super Aromatic Rice',
      nameLg: 'Omucere gwa Super Ogw’Akawoowo',
      nameFr: 'Riz Super Aromatique Ougandais',
      nameSw: 'Mchele Safi wa Super wenye Harufu Nzuri',
      descriptionEn: 'Aromatic long-grain Ugandan Super rice, thoroughly winnowed and stone-free.',
      descriptionLg: 'Omucere gwa Super ogw’akawoowo akatukuvu, tegulimu mayinja.',
      descriptionFr: 'Riz long grain aromatique d’Ouganda, soigneusement trié et sans cailloux.',
      descriptionSw: 'Mchele mrefu safi wa Super kutoka Uganda usio na mawe.',
      priceUgx: 6000,
      unit: 'kg',
      stockQuantity: 200,
      imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&auto=format&fit=crop&q=80',
    },
    {
      categoryId: categoryMap['dairy-eggs'],
      slug: 'fresh-farm-milk',
      sku: 'UFM-PROD-0010',
      nameEn: 'Fresh Farm Milk (Raw Pasteurized)',
      nameLg: 'Amata Amabisi Ag’omutindo',
      nameFr: 'Lait Frais Entier de Ferme',
      nameSw: 'Maziwa Safi ya Shambani',
      descriptionEn: 'Pure whole cow milk from grass-fed cattle in Ankole, creamy and rich.',
      descriptionLg: 'Amata amabisi ag’ente z’e Nsiike, masava era mawangaazi.',
      descriptionFr: 'Lait entier pur de vaches d’Ankole, riche et crémeux.',
      descriptionSw: 'Maziwa halisi ya ng’ombe kutoka Ankole yenye ubora wa juu.',
      priceUgx: 3000,
      unit: 'litre',
      stockQuantity: 150,
      imageUrl: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=600&auto=format&fit=crop&q=80',
    },
  ];

  for (const prod of foodProducts) {
    const { nameFr, nameSw, descriptionFr, descriptionSw, ...baseProd } = prod;

    const record = await prisma.product.upsert({
      where: { slug: prod.slug },
      update: {
        priceUgx: baseProd.priceUgx,
        stockQuantity: baseProd.stockQuantity,
        unit: baseProd.unit,
        imageUrl: baseProd.imageUrl,
        sku: baseProd.sku,
      },
      create: {
        ...baseProd,
      },
    });

    // Upsert 4 language translations
    const prodTrans = [
      { language: 'EN', name: prod.nameEn, description: prod.descriptionEn },
      { language: 'LG', name: prod.nameLg, description: prod.descriptionLg },
      { language: 'FR', name: prod.nameFr, description: prod.descriptionFr },
      { language: 'SW', name: prod.nameSw, description: prod.descriptionSw },
    ];

    for (const t of prodTrans) {
      if (t.name) {
        await prisma.productTranslation.upsert({
          where: {
            productId_language: {
              productId: record.id,
              language: t.language,
            },
          },
          update: { name: t.name, description: t.description || null },
          create: { productId: record.id, language: t.language, name: t.name, description: t.description || null },
        });
      }
    }

    // Ensure primary product image exists
    if (prod.imageUrl) {
      const existingImg = await prisma.productImage.findFirst({
        where: { productId: record.id, isPrimary: true },
      });
      if (!existingImg) {
        await prisma.productImage.create({
          data: {
            productId: record.id,
            imageUrl: prod.imageUrl,
            altText: prod.nameEn,
            isPrimary: true,
            sortOrder: 0,
          },
        });
      }
    }
  }
  console.log(`✅ ${foodProducts.length} food products and translations verified.`);

  // 7. General merchandise samples (English only: other languages are
  //    machine-translated by the running API on first view).
  console.log('📦 Seeding general merchandise samples...');
  const merchProducts = [
    { cat: 'phones-tablets', slug: 'tecno-spark-20-128gb', name: 'Tecno Spark 20 (128 GB, 8 GB RAM)', brand: 'Tecno', price: 549000, was: 620000, stock: 15, unit: 'piece', featured: true,
      description: 'Dual-SIM smartphone with a 6.6" display, 50 MP camera and 5000 mAh battery. 12-month warranty.',
      specs: [['Storage', '128 GB'], ['RAM', '8 GB'], ['Battery', '5000 mAh'], ['Warranty', '12 months']] },
    { cat: 'phones-tablets', slug: 'samsung-galaxy-a15-128gb', name: 'Samsung Galaxy A15 (128 GB)', brand: 'Samsung', price: 760000, stock: 10, unit: 'piece',
      description: 'Super AMOLED display, 50 MP triple camera and long-lasting 5000 mAh battery.',
      specs: [['Storage', '128 GB'], ['RAM', '4 GB'], ['Display', '6.5" Super AMOLED'], ['Warranty', '12 months']] },
    { cat: 'phones-tablets', slug: 'itel-a70-64gb', name: 'itel A70 (64 GB)', brand: 'itel', price: 289000, was: 320000, stock: 25, unit: 'piece',
      description: 'Affordable dual-SIM smartphone with a big 6.6" screen and fast charging.',
      specs: [['Storage', '64 GB'], ['RAM', '3 GB'], ['Battery', '5000 mAh']] },
    { cat: 'electronics', slug: 'hisense-32-inch-smart-tv', name: 'Hisense 32" HD Smart TV', brand: 'Hisense', price: 690000, was: 799000, stock: 6, unit: 'piece', featured: true,
      description: 'HD smart TV with YouTube and Netflix, two HDMI ports and a built-in digital decoder.',
      specs: [['Screen', '32 inches'], ['Resolution', 'HD 1366×768'], ['Ports', '2× HDMI, 2× USB'], ['Warranty', '24 months']] },
    { cat: 'electronics', slug: 'solar-home-lighting-kit', name: 'Solar Home Lighting Kit (3 bulbs + phone charging)', brand: 'SunKing', price: 185000, stock: 12, unit: 'kit',
      description: 'Solar panel, battery, three LED bulbs and USB phone charging — light without power bills.',
      specs: [['Bulbs', '3 LED'], ['Charging', 'USB phone charging'], ['Warranty', '24 months']] },
    { cat: 'computers-accessories', slug: 'hp-15-laptop-core-i5', name: 'HP 15 Laptop (Core i5, 8 GB, 512 GB SSD)', brand: 'HP', price: 2450000, stock: 4, unit: 'piece',
      description: 'Everyday laptop for work and study with a fast SSD and full HD display.',
      specs: [['Processor', 'Intel Core i5'], ['RAM', '8 GB'], ['Storage', '512 GB SSD'], ['Display', '15.6" FHD']] },
    { cat: 'fashion', slug: 'kitenge-ladies-dress', name: 'Ladies Kitenge Dress', brand: 'Kampala Tailors', price: 85000, stock: 20, unit: 'piece',
      description: 'Locally tailored African print dress, 100% cotton. Sizes S to XXL.',
      specs: [['Material', '100% cotton'], ['Sizes', 'S, M, L, XL, XXL']] },
    { cat: 'fashion', slug: 'mens-leather-office-shoes', name: "Men's Leather Office Shoes", brand: 'Bata', price: 145000, stock: 14, unit: 'pair',
      description: 'Genuine leather lace-up shoes for office and occasions. Sizes 39–46.',
      specs: [['Material', 'Genuine leather'], ['Sizes', '39–46']] },
    { cat: 'home-kitchen', slug: 'energy-saving-charcoal-stove', name: 'Energy-Saving Charcoal Stove (Sigiri)', brand: 'Ugastove', price: 45000, stock: 30, unit: 'piece',
      description: 'Ceramic-lined improved cookstove that uses up to 50% less charcoal.',
      specs: [['Fuel', 'Charcoal'], ['Saving', 'Up to 50% less charcoal']] },
    { cat: 'home-kitchen', slug: 'non-stick-saucepan-set-5', name: 'Non-Stick Saucepan Set (5 pieces)', brand: 'Nunix', price: 135000, was: 160000, stock: 9, unit: 'set',
      description: 'Five non-stick saucepans with glass lids, suitable for gas and electric cookers.',
      specs: [['Pieces', '5 with lids'], ['Coating', 'Non-stick']] },
    { cat: 'beauty-health', slug: 'pure-shea-butter-500g', name: 'Pure Ugandan Shea Butter (500 g)', brand: 'Nilotica', price: 25000, stock: 40, unit: 'jar',
      description: 'Unrefined Nilotica shea butter from northern Uganda for skin and hair.',
      specs: [['Weight', '500 g'], ['Origin', 'Northern Uganda']] },
    { cat: 'household-supplies', slug: 'omo-washing-powder-3kg', name: 'OMO Washing Powder (3 kg)', brand: 'OMO', price: 32000, stock: 50, unit: 'bag',
      description: 'Multi-active washing powder for hand and machine wash.', specs: [['Weight', '3 kg']] },
    { cat: 'household-supplies', slug: 'jerrycan-20-litres', name: 'Jerrycan (20 litres)', brand: 'Nice House of Plastics', price: 12000, stock: 60, unit: 'piece',
      description: 'Strong food-grade plastic jerrycan with screw cap.', specs: [['Capacity', '20 litres']] },
    { cat: 'stationery-office', slug: 'exercise-books-96-pages-12', name: 'Exercise Books 96 Pages (pack of 12)', brand: 'Picfare', price: 18000, stock: 80, unit: 'pack',
      description: 'Ruled school exercise books, 96 pages each.', specs: [['Pages', '96'], ['Quantity', '12 books']] },
    { cat: 'hardware-tools', slug: 'cement-50kg-bag', name: 'Portland Cement (50 kg bag)', brand: 'Hima', price: 36000, stock: 100, unit: 'bag',
      description: 'General purpose cement for building and plastering.', specs: [['Weight', '50 kg'], ['Grade', '32.5N']] },
    { cat: 'farm-supplies', slug: 'knapsack-sprayer-16l', name: 'Knapsack Sprayer (16 litres)', brand: 'Bata Agro', price: 95000, stock: 12, unit: 'piece',
      description: 'Manual knapsack sprayer for crops, with adjustable nozzle.', specs: [['Capacity', '16 litres']] },
    { cat: 'beverages-snacks', slug: 'rwenzori-mineral-water-500ml-24', name: 'Rwenzori Mineral Water 500 ml (24 bottles)', brand: 'Rwenzori', price: 24000, stock: 45, unit: 'crate',
      description: 'Natural mineral water from the Rwenzori mountains.', specs: [['Volume', '24 × 500 ml']] },
  ];
  for (const m of merchProducts) {
    const record = await prisma.product.upsert({
      where: { slug: m.slug },
      update: { priceUgx: m.price, compareAtPriceUgx: m.was || null, brand: m.brand, unit: m.unit },
      create: {
        categoryId: categoryMap[m.cat],
        slug: m.slug,
        nameEn: m.name,
        descriptionEn: m.description,
        brand: m.brand,
        priceUgx: m.price,
        compareAtPriceUgx: m.was || null,
        stockQuantity: m.stock,
        unit: m.unit,
        isFeatured: Boolean(m.featured),
        specifications: m.specs.map(([label, value]) => ({ label, value })),
      },
    });
    await prisma.productTranslation.upsert({
      where: { productId_language: { productId: record.id, language: 'EN' } },
      update: { name: m.name, description: m.description },
      create: { productId: record.id, language: 'EN', name: m.name, description: m.description },
    });
  }
  console.log(`✅ ${merchProducts.length} general merchandise products verified.`);

  // 8. Home services catalogue (technicians are added by staff in the console)
  console.log('🛠️  Seeding home services catalogue...');
  const services = [
    ['plumbing', 'Plumbing', 'wrench', 'INSPECTION', 20000, '1–3 hours', 'Leaking pipes and taps, blocked sinks and toilets, water tank and heater installation.'],
    ['electrical', 'Electrical Repairs', 'zap', 'INSPECTION', 25000, '1–3 hours', 'Faulty sockets and switches, wiring, lighting installation, power faults and UMEME meter issues.'],
    ['house-cleaning', 'House Cleaning', 'sparkles', 'FIXED', 60000, '3–5 hours', 'Full home cleaning: floors, kitchen, bathrooms, windows and dusting by a trained team.'],
    ['laundry-ironing', 'Laundry & Ironing', 'shirt', 'FIXED', 35000, 'Same day', 'Washing, drying and ironing of clothes and bedding at your home.'],
    ['appliance-repair', 'Appliance Repair', 'refrigerator', 'INSPECTION', 30000, '1–2 hours', 'Fridges, cookers, washing machines, TVs and microwaves diagnosed and repaired.'],
    ['phone-computer-repair', 'Phone & Computer Repair', 'smartphone', 'INSPECTION', 15000, '1–2 hours', 'Screen replacement, charging problems, software issues and data recovery.'],
    ['painting', 'Painting & Decoration', 'paintbrush', 'INSPECTION', 40000, '1–3 days', 'Interior and exterior painting, wall preparation and finishing.'],
    ['carpentry', 'Carpentry & Furniture Repair', 'hammer', 'INSPECTION', 25000, '2–6 hours', 'Door and window repairs, furniture assembly and repair, shelves and cabinets.'],
    ['pest-control', 'Pest Control & Fumigation', 'bug', 'FIXED', 120000, '2–4 hours', 'Cockroaches, bedbugs, termites, rats and mosquitoes — safe, licensed treatment.'],
    ['gardening', 'Gardening & Compound Care', 'sprout', 'HOURLY', 15000, 'Per hour', 'Grass cutting, hedge trimming, planting and compound cleaning.'],
    ['gas-installation', 'Gas Cylinder Delivery & Installation', 'flame', 'FIXED', 15000, '1 hour', 'Gas refill delivery, regulator and cooker connection with a safety check.'],
    ['water-tank-cleaning', 'Water Tank Cleaning', 'droplets', 'FIXED', 80000, '2–4 hours', 'Draining, scrubbing and disinfecting of water tanks of any size.'],
    ['moving-help', 'Moving & Lifting Help', 'truck', 'INSPECTION', 50000, 'Half day', 'Packing, loading and moving household items within your town.'],
    ['salon-at-home', 'Salon & Barber at Home', 'scissors', 'FIXED', 30000, '1–2 hours', 'Haircuts, braiding, plaiting, manicure and pedicure at your home.'],
  ];
  for (let i = 0; i < services.length; i++) {
    const [slug, nameEn, icon, priceType, priceFromUgx, durationText, descriptionEn] = services[i];
    await prisma.service.upsert({
      where: { slug },
      update: { nameEn, icon, priceType, priceFromUgx, durationText, descriptionEn, displayOrder: i + 1 },
      create: { slug, nameEn, icon, priceType, priceFromUgx, durationText, descriptionEn, displayOrder: i + 1, isActive: true },
    });
  }
  console.log(`✅ ${services.length} home services verified.`);

  console.log('🎉 UgaMarket database seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Database seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
