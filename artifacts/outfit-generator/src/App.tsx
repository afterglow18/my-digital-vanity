import { useState } from 'react';
import { Toaster } from 'sonner';
import { QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { AnimatePresence } from 'framer-motion';
import { AppLayout } from './components/layout/AppLayout';
import WardrobePage from './pages/wardrobe';
import GeneratePage from './pages/generate';
import SavedPage from './pages/saved';
import FavoritesPage from './pages/favorites';
import AccountPage from './pages/account';
import SplashScreen from './components/SplashScreen';
import { queryClient } from '@/lib/queryClient';
import { useState, useEffect } from 'react';
import { initRevenueCat } from '@/lib/revenuecat';
import { syncTierFromRevenueCat } from '@/hooks/useEntitlements';
import { App as CapApp } from '@capacitor/app';
import { Toaster } from 'sonner';
import { useVisionIndexer } from '@/hooks/useVisionIndexer';

// Initialise RevenueCat, then sync entitlements AFTER configure() resolves.
// Using .then() ensures syncTierFromRevenueCat never races with configure().
initRevenueCat()
  .then(() => syncTierFromRevenueCat())
  .catch((e) => console.error('[RevenueCat] Init/sync failed:', e));

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function App() {
  const [showSplash, setShowSplash] = useState(
    () => !sessionStorage.getItem('mdc_entered')
  );

  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={BASE}>
        <AnimatePresence>
          {showSplash && (
            <SplashScreen
              onEnter={() => {
                sessionStorage.setItem('mdc_entered', '1');
                setShowSplash(false);
              }}
            />
          )}
        </AnimatePresence>

        <Toaster position="bottom-center" richColors={false} />
        <AppLayout>
          <Switch>
            <Route path="/" component={WardrobePage} />
            <Route path="/generate" component={GeneratePage} />
            <Route path="/saved" component={SavedPage} />
            <Route path="/favorites" component={FavoritesPage} />
            <Route path="/account" component={AccountPage} />
          </Switch>
        </AppLayout>
      </WouterRouter>
    </QueryClientProvider>
  );
}
