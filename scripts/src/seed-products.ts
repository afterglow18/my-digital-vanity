/**
 * Seed script — creates subscription products in Stripe.
 *
 *   • My Digital Closet Monthly — $1.99/month  (product_key: 'monthly')
 *   • My Digital Closet Annual  — $19.99/year  (product_key: 'annual')
 *
 * Idempotent: checks for existing products before creating.
 *
 * Run with:
 *   pnpm --filter @workspace/scripts run seed-products
 */
import { getUncachableStripeClient } from './stripeClient';

interface ProductSpec {
  key:         string;
  name:        string;
  description: string;
  amount:      number;        // cents
  interval:    "month" | "year";
}

const PRODUCTS: ProductSpec[] = [
  {
    key:         'monthly',
    name:        'My Digital Closet – Monthly',
    description: 'Unlimited wardrobe items and saved outfits. Cancel anytime.',
    amount:      199,
    interval:    'month',
  },
  {
    key:         'annual',
    name:        'My Digital Closet – Annual',
    description: 'Unlimited wardrobe items and saved outfits. Best value — 2 months free vs monthly.',
    amount:      1999,
    interval:    'year',
  },
];

async function seedProduct(stripe: Awaited<ReturnType<typeof getUncachableStripeClient>>, spec: ProductSpec) {
  console.log(`\nChecking for existing '${spec.key}' product...`);

  const existing = await stripe.products.search({
    query: `metadata['product_key']:'${spec.key}' AND active:'true'`,
    limit: 1,
  });

  if (existing.data.length > 0) {
    const product = existing.data[0];
    const prices  = await stripe.prices.list({ product: product.id, active: true, limit: 1 });
    const price   = prices.data[0];
    console.log(`  ✓ Already exists: ${product.name} (${product.id})`);
    if (price) {
      const amt = (price.unit_amount! / 100).toFixed(2);
      const rec = price.recurring ? `/${price.recurring.interval}` : 'one-time';
      console.log(`  ✓ Active price:   $${amt} ${rec} (${price.id})`);
    }
    return;
  }

  console.log(`  Creating '${spec.name}'...`);
  const product = await stripe.products.create({
    name:        spec.name,
    description: spec.description,
    metadata:    { product_key: spec.key },
  });
  console.log(`  ✓ Created product: ${product.name} (${product.id})`);

  const price = await stripe.prices.create({
    product:     product.id,
    unit_amount: spec.amount,
    currency:    'usd',
    recurring:   { interval: spec.interval },
    metadata:    { product_key: spec.key },
  });
  console.log(`  ✓ Created price:   $${(spec.amount / 100).toFixed(2)}/${spec.interval} (${price.id})`);
}

async function seed() {
  const stripe = await getUncachableStripeClient();

  for (const spec of PRODUCTS) {
    await seedProduct(stripe, spec);
  }

  console.log('\n✅ Done! Run this once per environment (test + production).');
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
