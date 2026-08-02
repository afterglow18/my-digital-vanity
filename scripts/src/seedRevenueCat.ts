/**
 * Seed script — creates RevenueCat entities for My Digital Closet.
 *
 * Products:
 *   • mdc_monthly  — $1.99/month  (package: $rc_monthly)
 *   • mdc_annual   — $19.99/year  (package: $rc_annual)
 *
 * Entitlement: "unlock" — grants access to unlimited items & outfits.
 * Offering:    "default"
 *
 * Idempotent — safe to run multiple times.
 *
 * Run with:
 *   pnpm --filter @workspace/scripts run seed-revenuecat
 */
import { getUncachableRevenueCatClient } from "./revenueCatClient";
import {
  listProjects,
  createProject,
  listApps,
  createApp,
  listAppPublicApiKeys,
  listProducts,
  createProduct,
  listEntitlements,
  createEntitlement,
  attachProductsToEntitlement,
  listOfferings,
  createOffering,
  updateOffering,
  listPackages,
  createPackages,
  attachProductsToPackage,
  type App,
  type Product,
  type Project,
  type Entitlement,
  type Offering,
  type Package,
  type CreateProductData,
} from "@replit/revenuecat-sdk";

// ── App config ────────────────────────────────────────────────────────────────
const PROJECT_NAME       = "My Digital Closet";
const APP_STORE_APP_NAME = "My Digital Closet";
const APP_STORE_BUNDLE_ID = "com.mydigitalcloset.app";
const PLAY_STORE_APP_NAME    = "My Digital Closet Android";
const PLAY_STORE_PACKAGE_NAME = "com.mydigitalcloset.app";

// ── Entitlement ───────────────────────────────────────────────────────────────
const ENTITLEMENT_IDENTIFIER   = "unlock";
const ENTITLEMENT_DISPLAY_NAME = "Unlock — unlimited items & outfits";

// ── Offering ──────────────────────────────────────────────────────────────────
const OFFERING_IDENTIFIER   = "default";
const OFFERING_DISPLAY_NAME = "Default Offering";

// ── Products ──────────────────────────────────────────────────────────────────
const PRODUCTS = [
  {
    identifier:          "mdc_monthly",
    playStoreIdentifier: "mdc_monthly:monthly",
    displayName:         "My Digital Closet Monthly",
    title:               "My Digital Closet Monthly",
    duration:            "P1M" as const,
    packageKey:          "$rc_monthly",
    packageDisplayName:  "Monthly",
    prices: [
      { amount_micros: 1990000, currency: "USD" }, // $1.99
    ],
  },
  {
    identifier:          "mdc_annual",
    playStoreIdentifier: "mdc_annual:annual",
    displayName:         "My Digital Closet Annual",
    title:               "My Digital Closet Annual",
    duration:            "P1Y" as const,
    packageKey:          "$rc_annual",
    packageDisplayName:  "Annual",
    prices: [
      { amount_micros: 19990000, currency: "USD" }, // $19.99
    ],
  },
] as const;

type TestStorePricesResponse = {
  object: string;
  prices: { amount_micros: number; currency: string }[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function ensureProductForApp(
  client: Awaited<ReturnType<typeof getUncachableRevenueCatClient>>,
  projectId: string,
  existingProducts: Product[],
  targetApp: App,
  storeIdentifier: string,
  displayName: string,
  title: string,
  duration: "P1M" | "P1Y",
  isTestStore: boolean,
  label: string,
): Promise<Product> {
  const existing = existingProducts.find(
    (p) => p.store_identifier === storeIdentifier && p.app_id === targetApp.id,
  );
  if (existing) {
    console.log(`  ${label} product already exists: ${existing.id}`);
    return existing;
  }

  const body: CreateProductData["body"] = {
    store_identifier: storeIdentifier,
    app_id:           targetApp.id,
    type:             "subscription",
    display_name:     displayName,
  };

  if (isTestStore) {
    body.subscription = { duration };
    body.title        = title;
  }

  const { data, error } = await createProduct({
    client,
    path: { project_id: projectId },
    body,
  });

  if (error) throw new Error(`Failed to create ${label} product: ${JSON.stringify(error)}`);
  console.log(`  Created ${label} product: ${data.id}`);
  return data;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function seed() {
  const client = await getUncachableRevenueCatClient();

  // ── Project ────────────────────────────────────────────────────────────────
  let project: Project;
  const { data: existingProjects, error: listProjectsError } = await listProjects({
    client,
    query: { limit: 20 },
  });
  if (listProjectsError) throw new Error("Failed to list projects");

  const found = existingProjects.items?.find((p) => p.name === PROJECT_NAME);
  if (found) {
    console.log("Project already exists:", found.id);
    project = found;
  } else {
    const { data: newProject, error } = await createProject({
      client,
      body: { name: PROJECT_NAME },
    });
    if (error) throw new Error("Failed to create project");
    console.log("Created project:", newProject.id);
    project = newProject;
  }

  // ── Apps ───────────────────────────────────────────────────────────────────
  const { data: apps, error: listAppsError } = await listApps({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listAppsError || !apps?.items.length) throw new Error("No apps found");

  const testStoreApp   = apps.items.find((a) => a.type === "test_store");
  let appStoreApp      = apps.items.find((a) => a.type === "app_store");
  let playStoreApp     = apps.items.find((a) => a.type === "play_store");

  if (!testStoreApp) throw new Error("No test store app found");
  console.log("Test Store app:", testStoreApp.id);

  if (!appStoreApp) {
    const { data, error } = await createApp({
      client,
      path: { project_id: project.id },
      body: { name: APP_STORE_APP_NAME, type: "app_store", app_store: { bundle_id: APP_STORE_BUNDLE_ID } },
    });
    if (error) throw new Error("Failed to create App Store app");
    appStoreApp = data;
    console.log("Created App Store app:", appStoreApp.id);
  } else {
    console.log("App Store app:", appStoreApp.id);
  }

  if (!playStoreApp) {
    const { data, error } = await createApp({
      client,
      path: { project_id: project.id },
      body: { name: PLAY_STORE_APP_NAME, type: "play_store", play_store: { package_name: PLAY_STORE_PACKAGE_NAME } },
    });
    if (error) throw new Error("Failed to create Play Store app");
    playStoreApp = data;
    console.log("Created Play Store app:", playStoreApp.id);
  } else {
    console.log("Play Store app:", playStoreApp.id);
  }

  // ── Products ───────────────────────────────────────────────────────────────
  const { data: existingProductsData, error: listProductsError } = await listProducts({
    client,
    path: { project_id: project.id },
    query: { limit: 100 },
  });
  if (listProductsError) throw new Error("Failed to list products");
  const existingProducts: Product[] = existingProductsData.items ?? [];

  const allProductIds: string[] = [];

  for (const spec of PRODUCTS) {
    console.log(`\n── ${spec.displayName} ──`);

    const testProd = await ensureProductForApp(client, project.id, existingProducts, testStoreApp,   spec.identifier,          spec.displayName, spec.title, spec.duration, true,  "Test Store");
    const iosProd  = await ensureProductForApp(client, project.id, existingProducts, appStoreApp,    spec.identifier,          spec.displayName, spec.title, spec.duration, false, "App Store");
    const droidProd= await ensureProductForApp(client, project.id, existingProducts, playStoreApp,   spec.playStoreIdentifier, spec.displayName, spec.title, spec.duration, false, "Play Store");

    // Test store prices
    const { error: priceError } = await client.post<TestStorePricesResponse>({
      url:  "/projects/{project_id}/products/{product_id}/test_store_prices",
      path: { project_id: project.id, product_id: testProd.id },
      body: { prices: [...spec.prices] },
    });
    if (priceError && typeof priceError === "object" && "type" in priceError && priceError["type"] === "resource_already_exists") {
      console.log("  Test store prices already set");
    } else if (priceError) {
      throw new Error(`Failed to set test store prices: ${JSON.stringify(priceError)}`);
    } else {
      console.log(`  Test store price set: ${spec.prices[0].amount_micros / 1_000_000} ${spec.prices[0].currency}`);
    }

    allProductIds.push(testProd.id, iosProd.id, droidProd.id);
  }

  // ── Entitlement ────────────────────────────────────────────────────────────
  console.log("\n── Entitlement ──");
  let entitlement: Entitlement;
  const { data: existingEntitlements, error: listEntitlementsError } = await listEntitlements({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listEntitlementsError) throw new Error("Failed to list entitlements");

  const foundEnt = existingEntitlements.items?.find((e) => e.lookup_key === ENTITLEMENT_IDENTIFIER);
  if (foundEnt) {
    console.log("Entitlement already exists:", foundEnt.id);
    entitlement = foundEnt;
  } else {
    const { data, error } = await createEntitlement({
      client,
      path: { project_id: project.id },
      body: { lookup_key: ENTITLEMENT_IDENTIFIER, display_name: ENTITLEMENT_DISPLAY_NAME },
    });
    if (error) throw new Error("Failed to create entitlement");
    console.log("Created entitlement:", data.id);
    entitlement = data;
  }

  const { error: attachEntErr } = await attachProductsToEntitlement({
    client,
    path: { project_id: project.id, entitlement_id: entitlement.id },
    body: { product_ids: allProductIds },
  });
  if (attachEntErr && (attachEntErr as any).type !== "unprocessable_entity_error") {
    throw new Error(`Failed to attach products to entitlement: ${JSON.stringify(attachEntErr)}`);
  }
  console.log("Products attached to entitlement");

  // ── Offering ───────────────────────────────────────────────────────────────
  console.log("\n── Offering ──");
  let offering: Offering;
  const { data: existingOfferings, error: listOfferingsError } = await listOfferings({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listOfferingsError) throw new Error("Failed to list offerings");

  const foundOff = existingOfferings.items?.find((o) => o.lookup_key === OFFERING_IDENTIFIER);
  if (foundOff) {
    console.log("Offering already exists:", foundOff.id);
    offering = foundOff;
  } else {
    const { data, error } = await createOffering({
      client,
      path: { project_id: project.id },
      body: { lookup_key: OFFERING_IDENTIFIER, display_name: OFFERING_DISPLAY_NAME },
    });
    if (error) throw new Error("Failed to create offering");
    console.log("Created offering:", data.id);
    offering = data;
  }

  if (!offering.is_current) {
    const { error } = await updateOffering({
      client,
      path: { project_id: project.id, offering_id: offering.id },
      body: { is_current: true },
    });
    if (error) throw new Error("Failed to set offering as current");
    console.log("Set as current offering");
  }

  // ── Packages (monthly + annual) ────────────────────────────────────────────
  console.log("\n── Packages ──");
  const { data: existingPkgs, error: listPkgsError } = await listPackages({
    client,
    path: { project_id: project.id, offering_id: offering.id },
    query: { limit: 20 },
  });
  if (listPkgsError) throw new Error("Failed to list packages");

  for (let i = 0; i < PRODUCTS.length; i++) {
    const spec = PRODUCTS[i];
    // Test, iOS, Android product IDs for this spec (3 per spec in allProductIds)
    const base = i * 3;
    const productIdsForPackage = [allProductIds[base], allProductIds[base + 1], allProductIds[base + 2]];

    let pkg: Package;
    const foundPkg = existingPkgs.items?.find((p) => p.lookup_key === spec.packageKey);
    if (foundPkg) {
      console.log(`Package ${spec.packageKey} already exists: ${foundPkg.id}`);
      pkg = foundPkg;
    } else {
      const { data, error } = await createPackages({
        client,
        path: { project_id: project.id, offering_id: offering.id },
        body: { lookup_key: spec.packageKey, display_name: spec.packageDisplayName },
      });
      if (error) throw new Error(`Failed to create package ${spec.packageKey}`);
      console.log(`Created package ${spec.packageKey}: ${data.id}`);
      pkg = data;
    }

    const { error: attachPkgErr } = await attachProductsToPackage({
      client,
      path: { project_id: project.id, package_id: pkg.id },
      body: {
        products: productIdsForPackage.map((id) => ({
          product_id: id,
          eligibility_criteria: "all" as const,
        })),
      },
    });
    if (attachPkgErr && (attachPkgErr as any).type === "unprocessable_entity_error") {
      console.log(`  Products already attached to ${spec.packageKey}`);
    } else if (attachPkgErr) {
      throw new Error(`Failed to attach products to package: ${JSON.stringify(attachPkgErr)}`);
    } else {
      console.log(`  Attached products to ${spec.packageKey}`);
    }
  }

  // ── API Keys ───────────────────────────────────────────────────────────────
  console.log("\n── API Keys ──");
  const [testKeys, iosKeys, droidKeys] = await Promise.all([
    listAppPublicApiKeys({ client, path: { project_id: project.id, app_id: testStoreApp.id } }),
    listAppPublicApiKeys({ client, path: { project_id: project.id, app_id: appStoreApp.id } }),
    listAppPublicApiKeys({ client, path: { project_id: project.id, app_id: playStoreApp.id } }),
  ]);

  if (testKeys.error || iosKeys.error || droidKeys.error) throw new Error("Failed to list API keys");

  console.log("\n====================");
  console.log("✅ RevenueCat setup complete!");
  console.log("Project ID:           ", project.id);
  console.log("Test Store App ID:    ", testStoreApp.id);
  console.log("App Store App ID:     ", appStoreApp.id);
  console.log("Play Store App ID:    ", playStoreApp.id);
  console.log("Entitlement:          ", ENTITLEMENT_IDENTIFIER);
  console.log("EXPO_PUBLIC_REVENUECAT_TEST_API_KEY:    ", testKeys.data?.items.map((k) => k.key).join(", ") ?? "N/A");
  console.log("EXPO_PUBLIC_REVENUECAT_IOS_API_KEY:     ", iosKeys.data?.items.map((k) => k.key).join(", ") ?? "N/A");
  console.log("EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: ", droidKeys.data?.items.map((k) => k.key).join(", ") ?? "N/A");
  console.log("====================\n");
}

seed().catch((err) => {
  console.error("Seed failed:", err.message ?? err);
  process.exit(1);
});
