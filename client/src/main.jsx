import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import './styles.css';
import { AuthProvider, ToastProvider, useAuth } from './state.jsx';
import { ConfirmProvider, Spinner } from './ui.jsx';
import Shell from './Shell.jsx';
import Login from './pages/Login.jsx';

// every screen is its own chunk → the counter loads only what it needs
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Help = lazy(() => import('./pages/Help.jsx'));
const Invoices = lazy(() => import('./pages/Invoices.jsx'));
const Customers = lazy(() => import('./pages/Customers.jsx'));
const Bookings = lazy(() => import('./pages/Bookings.jsx'));
const Tournaments = lazy(() => import('./pages/Tournaments.jsx'));
const Expenses = lazy(() => import('./pages/Expenses.jsx'));
const LiveView = lazy(() => import('./pages/LiveView.jsx'));
const R = (name) => lazy(() => import('./pages/Reports.jsx').then((m) => ({ default: m[name] })));
const S = (name) => lazy(() => import('./pages/Setup.jsx').then((m) => ({ default: m[name] })));
const Daily = R('Daily'); const Monthly = R('Monthly'); const Usage = R('Usage'); const SnacksReport = R('SnacksReport'); const Activity = R('Activity');
const RateCard = S('RateCard'); const Stations = S('Stations'); const Menu = S('Menu'); const Staff = S('Staff'); const ShopDetails = S('ShopDetails'); const Memberships = S('Memberships'); const Integrations = S('Integrations');

function Guard({ perm, admin, children }) {
  const { can, isAdmin } = useAuth();
  if ((admin && !isAdmin) || (perm && !can(perm))) return <Navigate to="/" replace />;
  return children;
}

function App() {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loc.pathname.startsWith('/live/')) return <Suspense fallback={<Spinner center />}><Routes><Route path="/live/:token" element={<LiveView />} /></Routes></Suspense>;
  if (loading) return <div className="login"><Spinner /></div>;
  if (!user) return <Login />;
  return (
    <Shell>
      <Suspense fallback={<Spinner center />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/help" element={<Help />} />
          <Route path="/invoices" element={<Guard perm="billing"><Invoices /></Guard>} />
          <Route path="/customers" element={<Guard perm="customers"><Customers /></Guard>} />
          <Route path="/bookings" element={<Guard perm="bookings"><Bookings /></Guard>} />
          <Route path="/memberships" element={<Guard perm="memberships"><Memberships /></Guard>} />
          <Route path="/tournaments" element={<Guard perm="tournaments"><Tournaments /></Guard>} />
          <Route path="/expenses" element={<Guard perm="expenses"><Expenses /></Guard>} />
          <Route path="/reports/daily" element={<Guard perm="reports"><Daily /></Guard>} />
          <Route path="/reports/monthly" element={<Guard perm="reports"><Monthly /></Guard>} />
          <Route path="/reports/usage" element={<Guard perm="reports"><Usage /></Guard>} />
          <Route path="/reports/snacks" element={<Guard perm="reports"><SnacksReport /></Guard>} />
          <Route path="/reports/activity" element={<Guard perm="reports"><Activity /></Guard>} />
          <Route path="/setup/rates" element={<Guard perm="setup"><RateCard /></Guard>} />
          <Route path="/setup/stations" element={<Guard perm="setup"><Stations /></Guard>} />
          <Route path="/setup/menu" element={<Guard perm="setup"><Menu /></Guard>} />
          <Route path="/setup/integrations" element={<Guard perm="setup"><Integrations /></Guard>} />
          <Route path="/setup/staff" element={<Guard admin><Staff /></Guard>} />
          <Route path="/setup/shop" element={<Guard admin><ShopDetails /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Shell>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <ConfirmProvider>
            <App />
          </ConfirmProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
