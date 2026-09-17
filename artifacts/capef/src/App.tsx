import React, { useEffect, useRef } from 'react';
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useAuth } from '@clerk/react';
import { frFR, enUS } from '@clerk/localizations';
import { useTranslation } from 'react-i18next';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';

import { AuthProvider } from './lib/auth';
import { OfflineQueueProvider } from './lib/offline-sync';
import { ClerkProvisioner } from './components/auth/ClerkProvisioner';
import { ThemeProvider } from './components/theme-provider';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

import Shell from './components/layout/Shell';
import { LanguageToggle } from './components/layout/LanguageToggle';

// Pages
import Dashboard from './pages/Dashboard';
import MembersList from './pages/members/MembersList';
import MemberNew from './pages/members/MemberNew';
import MemberDetail from './pages/members/MemberDetail';
import MemberEdit from './pages/members/MemberEdit';
import UsersList from './pages/users/UsersList';
import AddAgent from './pages/users/AddAgent';
import UserDetail from './pages/users/UserDetail';
import Profile from './pages/Profile';
import NotFound from './pages/not-found';
import BadgeVerify from './pages/members/BadgeVerify';

const queryClient = new QueryClient();

// Safely resolve Clerk publishable key without calling publishableKeyFromHost on undefined
const rawClerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkPubKey =
  (typeof rawClerkKey === "string" && rawClerkKey.trim().length > 0
    ? rawClerkKey.trim()
    : null) ||
  (typeof rawClerkKey === "string" && rawClerkKey.length > 0
    ? publishableKeyFromHost(window.location.hostname, rawClerkKey)
    : null) ||
  "pk_test_bWlnaHR5LXNoYXJrLTU0LmNsZXJrLmFjY291bnRzLmRldiQ";

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL ? import.meta.env.BASE_URL.replace(/\/$/, "") : "";

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.png`,
  },
  variables: {
    colorPrimary: "hsl(158 80% 25%)",
    colorForeground: "hsl(158 40% 12%)",
    colorMutedForeground: "hsl(158 15% 45%)",
    colorDanger: "hsl(353 75% 52%)",
    colorBackground: "hsl(0 0% 100%)",
    colorInput: "hsl(158 15% 98%)",
    colorInputForeground: "hsl(158 40% 12%)",
    colorNeutral: "hsl(158 15% 88%)",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden border border-border shadow-xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-foreground font-bold text-2xl",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButtonText: "text-foreground font-medium",
    formFieldLabel: "text-foreground font-semibold",
    footerActionLink: "text-primary hover:text-primary-foreground hover:bg-primary font-semibold px-2 py-1 rounded-md transition-colors",
    footerActionText: "text-muted-foreground",
    dividerText: "text-muted-foreground bg-white px-2",
    formButtonPrimary: "bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-sm transition-all",
    formFieldInput: "bg-background border-border text-foreground focus:ring-primary focus:border-primary",
  },
};

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught UI Exception:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-card rounded-2xl border border-border p-6 shadow-xl text-center space-y-4">
            <div className="w-12 h-12 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mx-auto text-xl">
              ⚠️
            </div>
            <h2 className="text-xl font-bold text-foreground">
              Une erreur est survenue / An error occurred
            </h2>
            <p className="text-sm text-muted-foreground">
              {this.state.error?.message || "Erreur de chargement de la plateforme."}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-lg shadow hover:bg-primary/90 transition-all"
            >
              Recharger la page / Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function HomeLanding() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center relative overflow-hidden">
      <div className="absolute top-4 right-4 z-50">
        <LanguageToggle />
      </div>

      <div className="absolute inset-0 z-0 pointer-events-none opacity-[0.03]" style={{backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%2300704A\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")'}}></div>

      <div className="z-10 text-center max-w-2xl px-4">
        <img src={`${basePath}/logo.png`} alt="CAPEF Logo" className="w-24 h-24 mx-auto mb-8 drop-shadow-md object-contain" />
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground mb-4">
          {t('auth.hero_title')}
        </h1>
        <p className="text-xl text-muted-foreground mb-10">
          {t('auth.hero_subtitle')}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={() => window.location.href = `${basePath}/sign-in`}
            className="w-full sm:w-auto px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-lg shadow-lg hover:bg-primary/90 transition-all hover:-translate-y-0.5 active:translate-y-0"
          >
            {t('auth.sign_in')}
          </button>
        </div>
      </div>
    </div>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <HomeLanding />
      </Show>
    </>
  );
}

function SignInPage() {
  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center bg-muted/30 px-4">
      <div className="absolute top-4 right-4 z-50">
        <LanguageToggle />
      </div>
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center bg-muted/30 px-4">
      <div className="absolute top-4 right-4 z-50">
        <LanguageToggle />
      </div>
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function ClerkTokenInitializer() {
  const { getToken } = useAuth();

  useEffect(() => {
    setAuthTokenGetter(() => getToken());
  }, [getToken]);

  return null;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function ProtectedRoutes() {
  return (
    <Shell>
      <Switch>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/members" component={MembersList} />
        <Route path="/members/new" component={MemberNew} />
        <Route path="/members/:id/edit" component={MemberEdit} />
        <Route path="/members/:id" component={MemberDetail} />
        <Route path="/users/new" component={AddAgent} />
        <Route path="/users/:id" component={UserDetail} />
        <Route path="/users" component={UsersList} />
        <Route path="/profile" component={Profile} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  const { i18n } = useTranslation();
  const currentLang = i18n.language || 'fr';
  const clerkLocalization = currentLang.startsWith('en') ? enUS : frFR;

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={clerkLocalization}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkTokenInitializer />
        <ClerkQueryClientCacheInvalidator />
        <ClerkProvisioner />
        <AuthProvider>
          <OfflineQueueProvider>
            <TooltipProvider>
              <Switch>
                <Route path="/" component={HomeRedirect} />
                <Route path="/sign-in/*?" component={SignInPage} />
                <Route path="/sign-up/*?" component={SignUpPage} />

                {/* Protected shell wrapper handles other routes */}
                <Route>
                  <Show when="signed-out">
                    <Redirect to="/" />
                  </Show>
                  <Show when="signed-in">
                    <Switch>
                      <Route path="/badge-verify/:token" component={BadgeVerify} />
                      <Route component={ProtectedRoutes} />
                    </Switch>
                  </Show>
                </Route>
              </Switch>
              <Toaster />
            </TooltipProvider>
          </OfflineQueueProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" storageKey="capef-theme">
        <WouterRouter base={basePath}>
          <ClerkProviderWithRoutes />
        </WouterRouter>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
