import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Dashboard from './components/Dashboard.jsx';
import SiteFooter from './components/SiteFooter.jsx';
import AboutPage from './routes/AboutPage.jsx';
import PrivacyPage from './routes/PrivacyPage.jsx';
import RoundDetailPage from './routes/RoundDetailPage.jsx';
import TermsPage from './routes/TermsPage.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/round/:roundNo" element={<RoundDetailPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="*" element={<Dashboard />} />
      </Routes>
      <SiteFooter />
    </BrowserRouter>
  );
}
