import { Capacitor } from '@capacitor/core';
import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { ToastProvider } from './components/Toast';
import { UIProvider } from './components/UIProvider';
import { EmptyState } from './components/ui';
import { AppLayout } from './layouts/AppLayout';
import { DataProvider } from './store/DataProvider';
import Dashboard from './pages/Dashboard';
import Landing from './pages/Landing';
import { ForgotPassword, Login, ResetPassword, Signup } from './pages/auth/AuthPages';
import { AddMemory, EditMemory } from './pages/MemoryEditor';

// Secondary screens load on demand to keep the first paint small.
const Upcoming = lazy(() => import('./pages/Upcoming'));
const ExpiryRadar = lazy(() => import('./pages/ExpiryRadar'));
const Shopping = lazy(() => import('./pages/Shopping'));
const People = lazy(() => import('./pages/People'));
const HomeMaintenance = lazy(() => import('./pages/HomeMaintenance'));
const Search = lazy(() => import('./pages/Search'));
const Calendar = lazy(() => import('./pages/Calendar'));
const Lists = lazy(() => import('./pages/Lists'));
const Settings = lazy(() => import('./pages/Settings'));
const Welcome = lazy(() => import('./pages/Welcome'));
const Share = lazy(() => import('./pages/Share'));
const InAppAct = lazy(() => import('./pages/Act').then((m) => ({ default: m.InAppAct })));
const PublicAct = lazy(() => import('./pages/Act').then((m) => ({ default: m.PublicAct })));

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center" aria-busy="true">
      <span className="size-10 animate-pulse rounded-2xl bg-brand-600" />
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (user) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

function NotFound() {
  return (
    <div className="grid min-h-[60dvh] place-items-center">
      <EmptyState
        emoji="🧭"
        title="This page wandered off"
        body="Let’s get you back to what matters."
        action={
          <Link to="/app" className="btn btn-primary">
            Go home
          </Link>
        }
      />
    </div>
  );
}

const lazyPage = (el: ReactNode) => <Suspense fallback={<div className="h-40" aria-busy="true" />}>{el}</Suspense>;

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            {/* The phone app skips the marketing page. */}
            <Route path="/" element={Capacitor.isNativePlatform() ? <Navigate to="/app" replace /> : <Landing />} />
            <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
            <Route path="/signup" element={<GuestOnly><Signup /></GuestOnly>} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            {/* Done / Snooze links in reminder emails; no sign-in needed. */}
            <Route path="/act" element={lazyPage(<PublicAct />)} />
            <Route
              path="/app"
              element={
                <RequireAuth>
                  <DataProvider>
                    <UIProvider>
                      <AppLayout />
                    </UIProvider>
                  </DataProvider>
                </RequireAuth>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="add" element={<AddMemory />} />
              <Route path="edit/:id" element={<EditMemory />} />
              <Route path="upcoming" element={lazyPage(<Upcoming />)} />
              <Route path="expiry" element={lazyPage(<ExpiryRadar />)} />
              <Route path="shopping" element={lazyPage(<Shopping />)} />
              <Route path="people" element={lazyPage(<People />)} />
              <Route path="home-maintenance" element={lazyPage(<HomeMaintenance />)} />
              <Route path="search" element={lazyPage(<Search />)} />
              <Route path="calendar" element={lazyPage(<Calendar />)} />
              <Route path="lists" element={lazyPage(<Lists />)} />
              <Route path="settings" element={lazyPage(<Settings />)} />
              <Route path="welcome" element={lazyPage(<Welcome />)} />
              <Route path="share" element={lazyPage(<Share />)} />
              <Route path="act" element={lazyPage(<InAppAct />)} />
              <Route path="*" element={<NotFound />} />
            </Route>
            <Route path="*" element={<div className="p-6"><NotFound /></div>} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
