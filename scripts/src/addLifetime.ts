/**
 * Adds the mdc_lifetime non-consumable product to RevenueCat and wires it into
 * the default offering as a $rc_lifetime package.
 *
 * Run with:
 *   pnpm --filter @workspace/scripts exec tsx src/addLifetime.ts
 */
import { getUncachableRevenueCatClient } from "./revenueCatClient";
import {
  listProjects,
  listApps,
  listProducts,
  createProduct,
  listEntitlements,
  attachProductsToEntitlement,
  listOfferings,
  listPackages,
  createPackages,
  attachProductsToPackage,
  type App,
  type Product,
} from "@replit/revenuecat-sdk";

const PROJECT_NAME   = "My Digital Closet";
const STORE_ID       = "mdc_lifetime";
const DISPLAY_NAME   = "My Digital Closet Lifetime";
const TITLE          = "My Digital Closet Lifetime";
const PACKAGE_KEY    = "$rc_lifetime";
const PACKAGE_LABEL  = "Lifetime";
const PRICE_MICROS   = 9990000; // $9.99
const ENTITLEMENT_ID = "unlock";

type TestStorePricesResponse = { object: string; prices: { amount_micros: number; currency: string }[] };

async function ensureNonSubProduct(
  client: Awaited<ReturnType<typeof getUncachableRevenueCatClient>>,
  projectId: string,
  existing: Product[],
  app: App,
  storeIdentifier: string,
  label: string,
  isTestStore: boolean,
): Promise<Product> {
  const found = existing.find((p) => p.store_identifier === storeIdentifier && p.app_id === app.id);
  if (found) {
    console.log(`  ${label}: already exists ${found.id}`);
    return found;
  }

  const productType = "non_consumable";

  const { data, error } = await createProduct({
    client,
    path: { project_id: projectId },
    body: {
      store_identifier: storeIdentifier,
      app_id:           app.id,
      type:             productType,
      display_name:     DISPLAY_NAME,
      ...(isTestStore ? { title: TITLE } : {}),
    },
  });
  if (error) throw new Error(`Failed to create ${label} product: ${JSON.stringify(error)}`);
  console.log(`  ${label}: created ${data.id}`);
  return data;
}

async function run() {
  const client = await getUncachableRevenueCatClient();

  // ── Project ────────────────────────────────────────────────────────────────
  const { data: projects, error: projErr } = await listProjects({ client, query: { limit: 20 } });
  if (projErr) throw new Error("Failed to list projects");
  const project = projects.items?.find((p) => p.name === PROJECT_NAME);
  if (!project) throw new Error(`Project "${PROJECT_NAME}" not found`);
  console.log("Project:", project.id);

  // ── Apps ───────────────────────────────────────────────────────────────────
  const { data: appsData, error: appsErr } = await listApps({
    client, path: { project_id: project.id }, query: { limit: 20 },
  });
  if (appsErr || !appsData?.items.length) throw new Error("Failed to list apps");

  const testApp  = appsData.items.find((a) => a.type === "test_store");
  const iosApp   = appsData.items.find((a) => a.type === "app_store");
  const droidApp = appsData.items.find((a) => a.type === "play_store");
  if (!testApp) throw new Error("Test store app not found");
  if (!iosApp)  throw new Error("App Store app not found");
  if (!droidApp) throw new Error("Play Store app not found");
  console.log("Apps:", testApp.id, iosApp.id, droidApp.id);

  // ── Existing products ──────────────────────────────────────────────────────
  const { data: prodData, error: prodErr } = await listProducts({
    client, path: { project_id: project.id }, query: { limit: 100 },
  });
  if (prodErr) throw new Error("Failed to list products");
  const existing: Product[] = prodData.items ?? [];

  // ── Create lifetime product for each store ─────────────────────────────────
  console.log("\n── Creating lifetime products ──");
  const testProd  = await ensureNonSubProduct(client, project.id, existing, testApp,  STORE_ID,                          "Test Store", true);
  const iosProd   = await ensureNonSubProduct(client, project.id, existing, iosApp,   STORE_ID,                          "App Store",  false);
  const droidProd = await ensureNonSubProduct(client, project.id, existing, droidApp, `${STORE_ID}:lifetime`,            "Play Store", false);

  // ── Set test store price ───────────────────────────────────────────────────
  console.log("\n── Setting test store price ($9.99) ──");
  const { error: priceErr } = await client.post<TestStorePricesResponse>({
    url:  "/projects/{project_id}/products/{product_id}/test_store_prices",
    path: { project_id: project.id, product_id: testProd.id },
    body: { prices: [{ amount_micros: PRICE_MICROS, currency: "USD" }] },
  });
  if (priceErr && typeof priceErr === "object" && "type" in priceErr && (priceErr as any).type === "resource_already_exists") {
    console.log("  Price already set");
  } else if (priceErr) {
    console.warn("  Price warning:", JSON.stringify(priceErr));
  } else {
    console.log("  Price set: $9.99 USD");
  }

  // ── Attach to entitlement ──────────────────────────────────────────────────
  console.log("\n── Attaching to entitlement ──");
  const { data: ents, error: entErr } = await listEntitlements({
    client, path: { project_id: project.id }, query: { limit: 20 },
  });
  if (entErr) throw new Error("Failed to list entitlements");
  const entitlement = ents.items?.find((e) => e.lookup_key === ENTITLEMENT_ID);
  if (!entitlement) throw new Error(`Entitlement "${ENTITLEMENT_ID}" not found`);

  const { error: attachEntErr } = await attachProductsToEntitlement({
    client,
    path: { project_id: project.id, entitlement_id: entitlement.id },
    body: { product_ids: [testProd.id, iosProd.id, droidProd.id] },
  });
  if (attachEntErr && (attachEntErr as any).type === "unprocessable_entity_error") {
    console.log("  Already attached to entitlement");
  } else if (attachEntErr) {
    throw new Error(`Failed to attach to entitlement: ${JSON.stringify(attachEntErr)}`);
  } else {
    console.log("  Attached to entitlement:", entitlement.id);
  }

  // ── Package in default offering ────────────────────────────────────────────
  console.log("\n── Adding $rc_lifetime package to default offering ──");
  const { data: offerings, error: offErr } = await listOfferings({
    client, path: { project_id: project.id }, query: { limit: 20 },
  });
  if (offErr) throw new Error("Failed to list offerings");
  const offering = offerings.items?.find((o) => o.lookup_key === "default");
  if (!offering) throw new Error("Default offering not found");
  console.log("Offering:", offering.id);

  const { data: pkgsData, error: pkgsErr } = await listPackages({
    client,
    path: { project_id: project.id, offering_id: offering.id },
    query: { limit: 20 },
  });
  if (pkgsErr) throw new Error("Failed to list packages");

  let pkgId: string;
  const existingPkg = pkgsData.items?.find((p) => p.lookup_key === PACKAGE_KEY);
  if (existingPkg) {
    console.log("  Package already exists:", existingPkg.id);
    pkgId = existingPkg.id;
  } else {
    const { data: newPkg, error: createPkgErr } = await createPackages({
      client,
      path: { project_id: project.id, offering_id: offering.id },
      body: { lookup_key: PACKAGE_KEY, display_name: PACKAGE_LABEL },
    });
    if (createPkgErr) throw new Error(`Failed to create package: ${JSON.stringify(createPkgErr)}`);
    console.log("  Created package:", newPkg.id);
    pkgId = newPkg.id;
  }

  const { error: attachPkgErr } = await attachProductsToPackage({
    client,
    path: { project_id: project.id, package_id: pkgId },
    body: {
      products: [testProd.id, iosProd.id, droidProd.id].map((id) => ({
        product_id: id,
        eligibility_criteria: "all" as const,
      })),
    },
  });
  if (attachPkgErr && (attachPkgErr as any).type === "unprocessable_entity_error") {
    console.log("  Products already attached to package");
  } else if (attachPkgErr) {
    throw new Error(`Failed to attach products to package: ${JSON.stringify(attachPkgErr)}`);
  } else {
    console.log("  Products attached to $rc_lifetime package");
  }

  console.log("\n✅ Done! mdc_lifetime is live in the default offering.");
  console.log("Next: sync to App Store Connect via the Publishing pane in Replit.");
}

run().catch((err) => {
  console.error("Failed:", err.message ?? err);
  process.exit(1);
});
