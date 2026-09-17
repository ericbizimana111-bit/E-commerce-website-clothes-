const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const env = require('../src/config/env');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting Uganda Food Marketplace database seed...');

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
      nameEn: 'Matooke & Tubers',
      nameLg: "Amatooke n'Ebinnya",
      nameFr: 'Matooke et Tubercules',
      nameSw: 'Ndizi na Mizizi',
      imageUrl: 'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?w=600&auto=format&fit=crop&q=80',
      displayOrder: 1,
    },
    {
      slug: 'fresh-vegetables',
      nameEn: 'Fresh Vegetables',
      nameLg: "Enva Endiirwa Ez'obutonde",
      nameFr: 'Légumes Frais',
      nameSw: 'Mbogamboga Safi',
      imageUrl: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&auto=format&fit=crop&q=80',
      displayOrder: 2,
    },
    {
      slug: 'fresh-fruits',
      nameEn: 'Fresh Fruits',
      nameLg: 'Ebibala Ebibisi',
      nameFr: 'Fruits Frais',
      nameSw: 'Matunda Safi',
      imageUrl: 'https://images.unsplash.com/photo-1619566636858-adf3ef46400b?w=600&auto=format&fit=crop&q=80',
      displayOrder: 3,
    },
    {
      slug: 'meat-poultry-fish',
      nameEn: 'Meat, Poultry & Fish',
      nameLg: "Ennyama, Enkoko n'Ebyennyanja",
      nameFr: 'Viande, Volaille et Poisson',
      nameSw: 'Nyama, Kuku na Samaki',
      imageUrl: 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=600&auto=format&fit=crop&q=80',
      displayOrder: 4,
    },
    {
      slug: 'grains-cereals',
      nameEn: 'Grains & Cereals',
      nameLg: "Empeke n'Eŋŋaano",
      nameFr: 'Grains et Céréales',
      nameSw: 'Nafaka na Mbegu',
      imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&auto=format&fit=crop&q=80',
      displayOrder: 5,
    },
    {
      slug: 'dairy-eggs',
      nameEn: 'Dairy & Farm Eggs',
      nameLg: "Amata n'Amagi g'okufamu",
      nameFr: 'Produits Laitiers et Œufs',
      nameSw: 'Maziwa na Mayai',
      imageUrl: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=600&auto=format&fit=crop&q=80',
      displayOrder: 6,
    },
    {
      slug: 'spices-seasonings',
      nameEn: 'Spices & Herbs',
      nameLg: "Ebinzaali n'Ebirungo",
      nameFr: 'Épices et Aromates',
      nameSw: 'Viungo na Mimea',
      imageUrl: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=600&auto=format&fit=crop&q=80',
      displayOrder: 7,
    },
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

  // 5. Seed Pickup Stations
  console.log('📍 Seeding sample Kampala pickup stations...');
  const pickupStationsData = [
    {
      name: 'Nakasero Market Hub',
      district: 'Kampala',
      addressText: 'Market Street, Central Division, Kampala',
      contactPhone: '+256772123456',
      operatingHours: 'Mon - Sat: 7:00 AM - 7:00 PM',
      pickupFeeUgx: 1000,
      latitude: 0.3136,
      longitude: 32.5811,
      isActive: true,
    },
    {
      name: 'Wandegeya Community Station',
      district: 'Kampala',
      addressText: 'Wandegeya Market Complex, Block B Ground Floor',
      contactPhone: '+256701234567',
      operatingHours: 'Mon - Sun: 7:30 AM - 8:00 PM',
      pickupFeeUgx: 1500,
      latitude: 0.3341,
      longitude: 32.5694,
      isActive: true,
    },
    {
      name: 'Ntinda Shopping Hub',
      district: 'Kampala',
      addressText: 'Ntinda Complex, Ministers Village Road',
      contactPhone: '+256782345678',
      operatingHours: 'Mon - Sat: 8:00 AM - 8:30 PM',
      pickupFeeUgx: 2000,
      latitude: 0.3547,
      longitude: 32.6105,
      isActive: true,
    },
    {
      name: 'Mukono Central Depot',
      district: 'Mukono',
      addressText: 'Kampala-Jinja Highway opposite TotalEnergies',
      contactPhone: '+256752456789',
      operatingHours: 'Mon - Sat: 8:00 AM - 6:30 PM',
      pickupFeeUgx: 2500,
      latitude: 0.3533,
      longitude: 32.7553,
      isActive: true,
    },
  ];

  for (const station of pickupStationsData) {
    const existing = await prisma.pickupStation.findFirst({
      where: { name: station.name },
    });
    if (!existing) {
      await prisma.pickupStation.create({ data: station });
    }
  }
  console.log(`✅ ${pickupStationsData.length} pickup stations verified.`);

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

  console.log('🎉 Uganda Food Marketplace database seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Database seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
