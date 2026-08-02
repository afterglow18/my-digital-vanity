import { useState, useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Redirect, Router as WouterRouter } from 'wouter';
import { AnimatePresence } from 'framer-motion';
import { Toaster } from 'sonner';
import { AppLayout } from './components/layout/AppLayout';
import WardrobePage from './pages/wardrobe';
import GeneratePage from './pages/generate';
import SavedPage from './pages/saved';
import FavoritesPage from './pages/favorites';
import BackupPage from './pages/backup';
import AccountPage from './pages/account';
import WelcomePage from './pages/welcome';
import { queryClient } from '@/lib/queryClient';
import { initRevenueCat } from '@/lib/revenuecat';
import { syncTierFromRevenueCat } from '@/hooks/useEntitlements';
import { App as CapApp } from '@capacitor/app';
import { useVisionIndexer } from '@/hooks/useVisionIndexer';

// Initialise RevenueCat, then sync entitlements AFTER configure() resolves.
initRevenueCat()
  .then(() => syncTierFromRevenueCat())
  .catch((e) => console.error('[RevenueCat] Init/sync failed:', e));

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4">
      <h1 className="text-6xl font-display font-bold text-primary drop-shadow-[4px_4px_0px_rgba(0,0,0,1)]">404</h1>
      <p className="text-xl font-bold uppercase">As if! This page is totally lost.</p>
    </div>
  );
}

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={WardrobePage} />
        <Route path="/generate" component={GeneratePage} />
        <Route path="/saved" component={SavedPage} />
        <Route path="/favorites" component={FavoritesPage} />
        <Route path="/backup" component={BackupPage} />
        <Route path="/account" component={AccountPage} />
        <Route component={NotFound} />
        <Redirect to="/" />
      </Switch>
    </AppLayout>
  );
}

function AppContent() {
  const isPreview = new URLSearchParams(window.location.search).get('preview') === '1';
  const [entered, setEntered] = useState<boolean>(() => isPreview);

  return (
    <WouterRouter base={BASE}>
      <Router />
      <AnimatePresence>
        {!entered && (
          <WelcomePage onEnter={() => setEntered(true)} />
        )}
      </AnimatePresence>
    </WouterRouter>
  );
}

function AppShell() {
  useEffect(() => {
    const listenerPromise = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) syncTierFromRevenueCat().catch(() => {});
    });
    return () => { listenerPromise.then(h => h.remove()); };
  }, []);

  // Background photo analysis — runs once per cold launch, non-blocking
  useVisionIndexer();

  return <AppContent />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
      <Toaster position="bottom-center" richColors={false} />
    </QueryClientProvider>
  );
}
