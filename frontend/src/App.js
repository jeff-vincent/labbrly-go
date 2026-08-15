import React, { useEffect, useState, useRef } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useNavigate,
  useLocation,
} from 'react-router-dom';
import Homepage from './components/Homepage';
import OrgPortalLayout from './components/OrgPortalLayout';
import FlexibleLabLayout from './components/FlexibleLabLayout';
import SignUp from './components/SignUp';
import PlansInfo from './components/PlansInfo';
import EmbeddedLab from './components/EmbeddedLab';
import NotFound from './components/NotFound';
import HttpProxyViewer from './components/HttpProxyViewer';
import { useAuth0 } from '@auth0/auth0-react';
import { jwtDecode } from 'jwt-decode';

// Wrapper to pass raw jwt as a prop to EmbeddedLab
const EmbeddedLabRoute = () => {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search || '');
  const tokenFromQuery = searchParams.get('token');
  const jwt = location.state?.jwt || tokenFromQuery || localStorage.getItem('jwt') || undefined;
  return <EmbeddedLab jwt={jwt} />;
};

const RoutesWithRedirect = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, getAccessTokenSilently, isLoading } = useAuth0();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) return;

    const embedMode = location.pathname === '/embed' || location.pathname.startsWith('/embed/');

    const getTokenFromLocation = () => {
      const searchParams = new URLSearchParams(window.location.search || '');
      const searchToken = searchParams.get('token');
      if (searchToken) return searchToken;

      const hash = window.location.hash?.slice(1) || '';
      if (hash) {
        const hashParams = new URLSearchParams(hash);
        const hashToken = hashParams.get('token');
        if (hashToken) return hashToken;
      }
      return null;
    };

    const stripTokenFromUrl = () => {
      const url = new URL(window.location.href);
      // Remove from query if present
      const sp = new URLSearchParams(url.search || '');
      if (sp.has('token')) {
        sp.delete('token');
        const newSearch = sp.toString();
        window.history.replaceState(
          {},
          document.title,
          `${url.pathname}${newSearch ? `?${newSearch}` : ''}${url.hash || ''}`
        );
        return;
      }
      // Or remove from hash if present
      if (url.hash) {
        const hp = new URLSearchParams(url.hash.slice(1));
        if (hp.has('token')) {
          hp.delete('token');
          const newHash = hp.toString();
          window.history.replaceState(
            {},
            document.title,
            `${url.pathname}${url.search || ''}${newHash ? `#${newHash}` : ''}`
          );
        }
      }
    };

  const url = new URL(window.location.href);
  console.log('URL for redirect:', url.href);
    const tokenFromUrl = getTokenFromLocation();
    console.log('RoutesWithRedirect: tokenFromUrl:', tokenFromUrl);

    const redirectToLab = (token) => {
      try {
        const decoded = jwtDecode(token);
        console.log('Decoded URL JWT:', decoded);

        const labId = decoded.lab_id;
        const orgId = decoded.org_id;
        
        if (labId) {
          localStorage.setItem('jwt', token);
          stripTokenFromUrl();
      const dest = embedMode ? `/embed/${labId}` : `/lab/${labId}`;
      // Pass raw JWT via location.state when embedding so the iframe can include it
      setTimeout(() => navigate(dest, { replace: true, state: embedMode ? { jwt: token } : undefined }), 0);
        } else if (orgId) {
          navigate(`/org/${orgId}`);
        } else {
          navigate('/signup');
        }
      } catch (err) {
        console.error('Invalid token in URL:', err);
        navigate('/signup');
      } finally {
        setCheckingAuth(false);
        processedRef.current = true;
      }
    };

    const redirectToOrg = async () => {
      try {
        const token = await getAccessTokenSilently({
          audience: 'urn:labthingy:api',
        });
        const decoded = jwtDecode(token);
        console.log('Decoded Auth0 JWT:', decoded);
        console.log('Full token claims:', Object.keys(decoded));

        const orgId = decoded['org_id'];
        console.log('Extracted orgId:', orgId);
        
        if (orgId) {
          const pathOrgMatch = location.pathname.match(/^\/org\/([^\/]+)/);
          if (pathOrgMatch) {
            const urlOrgId = pathOrgMatch[1];
            if (urlOrgId !== orgId) {
              console.log('Org ID mismatch - redirecting to correct org');
              navigate(`/org/${orgId}`);
              return;
            }
          }
          
          if (location.pathname === '/' || location.pathname === '/login') {
            navigate(`/org/${orgId}`);
          }
        } else {
          console.warn('No organization_id found in token claims');
          navigate('/signup');
        }
      } catch (err) {
        console.error('Error getting Auth0 token:', err);
        navigate('/signup');
      } finally {
        setCheckingAuth(false);
        processedRef.current = true;
      }
    };

    if (tokenFromUrl) {
      redirectToLab(tokenFromUrl);
    } else if (!isLoading && isAuthenticated) {
      redirectToOrg();
    } else if (!isLoading && !isAuthenticated) {
      if (location.pathname.startsWith('/org/')) {
        navigate('/signup');
      }
      setCheckingAuth(false);
      processedRef.current = true;
    }
  }, [isAuthenticated, isLoading, getAccessTokenSilently, navigate, location]);

  // Add early return to prevent rendering issues during redirect
  if (checkingAuth || isLoading) {
    return <div className="text-center p-4">Checking authentication...</div>;
  }

  // Prevent rendering during navigation to avoid component errors
  if (!isAuthenticated && location.pathname.startsWith('/org/')) {
    return <div className="text-center p-4">Redirecting...</div>;
  }

  return (
    <Routes>
      <Route path="/" element={<Homepage />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/org/:orgId/*" element={<OrgPortalLayout />} />
      <Route path="/lab/:labId/*" element={<FlexibleLabLayout />} />
  <Route path="/port-forward" element={<HttpProxyViewer basePath="" onClose={() => {}} />} />
  {/* Embed routes mirror normal flow but render an iframe with the token */}
  <Route path="/embed" element={<div className="p-4">Loading embed...</div>} />
  <Route path="/embed/:labId" element={<EmbeddedLabRoute />} />
      <Route path="/info" element={<PlansInfo />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => {
  return (
    <div className="dark bg-cp-bg min-h-screen text-neutral-200 font-sans">
      <Router>
        <RoutesWithRedirect />
      </Router>
    </div>
  );
};

export default App;

