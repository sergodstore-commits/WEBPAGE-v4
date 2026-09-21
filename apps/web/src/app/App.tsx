import {
  Component,
  lazy,
  Suspense,
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';

import {
  accounts,
  changeAccountState,
  changePassword,
  completeEmailCallback,
  completeRecovery,
  currentSession,
  legalVersions,
  login,
  logout,
  ownAccount,
  promoteAccount,
  register,
  requestEmailChange,
  requestRecovery,
  resendEmailVerification,
  subscribeSession,
  updatePhone,
  type AccountView,
  type LegalVersion,
} from '../identity/api.js';
import {
  clearEmailCallbackSession,
  readEmailCallbackAccessToken,
} from '../identity/supabase-browser.js';
import { PosPanel } from '../pos/PosPanel.js';
import { CheckoutPanel } from '../checkout/CheckoutPanel.js';
import { ServiceCoveragePanel } from '../service-coverage/ServiceCoveragePanel.js';
import { AccountHub } from '../account/AccountHub.js';
import type { AdminArea } from '../admin/AdminHub.js';
import { CartPage } from '../cart/CartPage.js';
import { ComicsPage, CommunityHub, StorePage } from '../public-commerce/PublicPages.js';
import { SiteChrome, SiteFooter } from './SiteChrome.js';
import { TermsPage } from '../legal/TermsPage.js';
import { AppearancePageElements, AppearanceRegion } from '../appearance/SiteAppearance.js';
import { SiteAppearancePreviewProvider } from '../appearance/SiteAppearancePreview.js';
import { routeWithAppearancePreview } from './appearance-preview-route.js';

const AdminHub = lazy(async () => ({
  default: (await import('../admin/AdminHub.js')).AdminHub,
}));
const AdminStandaloneLayout = lazy(async () => ({
  default: (await import('../admin/AdminHub.js')).AdminStandaloneLayout,
}));
const AppearanceEditor = lazy(async () => ({
  default: (await import('../appearance/AppearanceEditor.js')).AppearanceEditor,
}));

export type Route =
  | '/'
  | '/account'
  | '/account/overview'
  | '/admin'
  | '/admin/accounts'
  | '/admin/appearance'
  | '/admin/audit'
  | '/admin/catalog'
  | '/admin/configuration'
  | '/admin/content'
  | '/admin/inventory'
  | '/admin/loyalty'
  | '/admin/orders'
  | '/admin/pos'
  | '/admin/preorders'
  | '/admin/promotions'
  | '/admin/service-coverage'
  | '/checkout'
  | '/cart'
  | '/shop'
  | '/tournaments'
  | '/news'
  | '/community'
  | '/community/visit'
  | '/comics'
  | '/loyalty'
  | '/preorders'
  | '/quests'
  | '/auth/callback/confirm'
  | '/auth/callback/email-change'
  | '/auth/callback/recovery'
  | '/login'
  | '/legal/terms'
  | '/not-found'
  | '/recover'
  | '/register';

export function App() {
  const [route, setRoute] = useState<Route>(routeFromLocation());
  const adminArea = adminAreaFromRoute(route);
  useEffect(() => {
    const listener = () => setRoute(routeFromLocation());
    window.addEventListener('popstate', listener);
    return () => window.removeEventListener('popstate', listener);
  }, []);
  const navigate = (next: Route) => {
    const commitNavigation = () => {
      window.history.pushState({}, '', routeWithAppearancePreview(next, window.location.search));
      flushSync(() => setRoute(next));
    };
    const documentWithTransitions = document as Document & {
      startViewTransition?: (update: () => void) => { finished: Promise<void> };
    };
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reduceMotion || documentWithTransitions.startViewTransition === undefined) {
      commitNavigation();
      return;
    }

    const transitionKind =
      route === '/' ? 'from-launcher' : next === '/' ? 'to-launcher' : 'section';
    document.documentElement.dataset.routeTransition = transitionKind;
    const transition = documentWithTransitions.startViewTransition(commitNavigation);
    void transition.finished.finally(() => {
      if (document.documentElement.dataset.routeTransition === transitionKind) {
        delete document.documentElement.dataset.routeTransition;
      }
    });
  };

  return (
    <SiteAppearancePreviewProvider>
      <div className="app-shell">
        {route !== '/' && <SiteChrome navigate={navigate} route={route} />}
        <RouteErrorBoundary key={route}>
          <Suspense fallback={<RouteLoading />}>
            <div className="route-stage" id="main-content" key={route} tabIndex={-1}>
              {route === '/' && <Home navigate={navigate} />}
              {route === '/register' && <Registration navigate={navigate} />}
              {route === '/login' && <Login navigate={navigate} />}
              {route === '/legal/terms' && <TermsPage />}
              {route === '/recover' && <Recovery navigate={navigate} />}
              {route === '/auth/callback/recovery' && <RecoveryCallback navigate={navigate} />}
              {(route === '/auth/callback/confirm' || route === '/auth/callback/email-change') && (
                <EmailCallback
                  kind={route === '/auth/callback/confirm' ? 'confirmación' : 'cambio'}
                />
              )}
              {route === '/account' && (
                <AccessGate>
                  <Account navigate={navigate} />
                </AccessGate>
              )}
              {route === '/account/overview' && (
                <AccessGate>
                  <AccountHub />
                </AccessGate>
              )}
              {route === '/loyalty' && (
                <AccessGate>
                  <AccountHub view="loyalty" />
                </AccessGate>
              )}
              {route === '/shop' && (
                <AppearanceRegion page="shop">
                  <StorePage />
                </AppearanceRegion>
              )}
              {route === '/preorders' && (
                <AppearanceRegion page="shop">
                  <StorePage view="preorders" />
                </AppearanceRegion>
              )}
              {route === '/cart' && <CartPage />}
              {(route === '/community' ||
                route === '/community/visit' ||
                route === '/news' ||
                route === '/tournaments' ||
                route === '/quests') && (
                <AppearanceRegion page="community">
                  <CommunityHub navigate={navigate} route={route} />
                </AppearanceRegion>
              )}
              {route === '/comics' && (
                <AppearanceRegion page="comics">
                  <ComicsPage />
                </AppearanceRegion>
              )}
              {adminArea && (
                <AccessGate requiredRole="ADMIN">
                  <AdminHub area={adminArea} navigate={navigate} />
                </AccessGate>
              )}
              {route === '/checkout' && <CheckoutPanel />}
              {route === '/admin/accounts' && (
                <AccessGate requiredRole="ADMIN">
                  <AdminStandaloneLayout
                    currentRoute="/admin/accounts"
                    description="Busca una cuenta y administra únicamente las acciones disponibles para ella."
                    navigate={navigate}
                    title="Clientes y usuarios"
                  >
                    <AccountsPanel />
                  </AdminStandaloneLayout>
                </AccessGate>
              )}
              {route === '/admin/appearance' && (
                <AccessGate requiredRole="ADMIN">
                  <AdminStandaloneLayout
                    currentRoute="/admin/appearance"
                    description="Organiza imágenes y textos por capas, revisa su posición y publica una versión persistente."
                    navigate={navigate}
                    title="Apariencia web"
                  >
                    <AppearanceEditor />
                  </AdminStandaloneLayout>
                </AccessGate>
              )}
              {route === '/admin/pos' && (
                <AccessGate requiredRole="ADMIN">
                  <AdminStandaloneLayout
                    currentRoute="/admin/pos"
                    description="Caja presencial, inventario compartido y registro auditable del dinero recibido."
                    navigate={navigate}
                    title="POS"
                  >
                    <PosPanel />
                  </AdminStandaloneLayout>
                </AccessGate>
              )}
              {route === '/admin/service-coverage' && (
                <AccessGate requiredRole="ADMIN">
                  <AdminStandaloneLayout
                    currentRoute="/admin/service-coverage"
                    description="Dirección, horario, contacto, retiro y cobertura pública de despacho."
                    navigate={navigate}
                    title="Datos de la tienda"
                  >
                    <ServiceCoveragePanel />
                  </AdminStandaloneLayout>
                </AccessGate>
              )}
              {route === '/not-found' && <NotFound navigate={navigate} />}
            </div>
          </Suspense>
        </RouteErrorBoundary>
        {route !== '/' && <SiteFooter navigate={navigate} />}
      </div>
    </SiteAppearancePreviewProvider>
  );
}

function RouteLoading() {
  return (
    <main aria-busy="true" className="page-frame visual-public">
      <section className="access-gate cut-panel">
        <p className="eyebrow">Cargando herramientas</p>
        <h1>Preparando esta sección</h1>
      </section>
    </main>
  );
}

interface RouteErrorBoundaryState {
  readonly failed: boolean;
}

export class RouteErrorBoundary extends Component<
  { readonly children: ReactNode },
  RouteErrorBoundaryState
> {
  override state: RouteErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): RouteErrorBoundaryState {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="page-frame visual-public">
        <section className="access-gate cut-panel" role="alert">
          <p className="eyebrow">Recuperación de pantalla</p>
          <h1>No pudimos mostrar esta sección</h1>
          <p>Vuelve a intentarlo. Si el problema continúa, regresa al inicio de forma segura.</p>
          <div className="actions">
            <button onClick={() => window.location.reload()} type="button">
              Reintentar
            </button>
            <a className="button-link secondary-link" href="/">
              Volver al inicio
            </a>
          </div>
        </section>
      </main>
    );
  }
}

function NotFound({ navigate }: { readonly navigate: (route: Route) => void }) {
  return (
    <main className="page-frame visual-public">
      <section className="access-gate cut-panel">
        <p className="eyebrow">Error 404</p>
        <h1>Página no encontrada</h1>
        <p>La dirección solicitada no existe o ya no está disponible.</p>
        <button onClick={() => navigate('/')} type="button">
          Volver al inicio
        </button>
      </section>
    </main>
  );
}

function AccessGate({
  children,
  requiredRole,
}: {
  readonly children: ReactNode;
  readonly requiredRole?: AccountView['role'];
}) {
  const [activeSession, setActiveSession] = useState(() => currentSession());
  const [state, setState] = useState<'allowed' | 'denied' | 'error' | 'loading'>('loading');

  useEffect(
    () =>
      subscribeSession((session) => {
        setActiveSession(session);
        if (session !== null) setState('loading');
      }),
    [],
  );

  useEffect(() => {
    if (activeSession === null) return;
    let active = true;
    void ownAccount()
      .then((account) => {
        if (!active) return;
        setState(
          requiredRole !== undefined && account.role !== requiredRole ? 'denied' : 'allowed',
        );
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, [activeSession, requiredRole]);

  const visibleState = activeSession === null ? 'signed-out' : state;
  if (visibleState === 'allowed') return children;

  const copy = {
    denied: {
      description: 'Tu cuenta no tiene permisos para utilizar las herramientas de operación.',
      eyebrow: 'Permiso insuficiente',
      title: 'Acceso administrativo restringido',
    },
    error: {
      description: 'No fue posible confirmar la sesión y los permisos actuales.',
      eyebrow: 'Verificación pendiente',
      title: 'No pudimos verificar tu acceso',
    },
    loading: {
      description: 'Estamos confirmando tu sesión y permisos con el servidor.',
      eyebrow: 'Acceso protegido',
      title: 'Verificando acceso',
    },
    'signed-out': {
      description: 'Esta sección requiere una cuenta autenticada.',
      eyebrow: 'Acceso protegido',
      title: 'Ingresa para continuar',
    },
  }[visibleState];

  return (
    <main aria-busy={visibleState === 'loading'} className="page-frame visual-public">
      <section className="access-gate cut-panel">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p>{copy.description}</p>
        {visibleState === 'signed-out' ? (
          <a
            className="button-link"
            href={`/login?returnTo=${encodeURIComponent(window.location.pathname)}`}
          >
            Ingresar
          </a>
        ) : visibleState !== 'loading' ? (
          <a className="button-link secondary-link" href="/">
            Volver al inicio
          </a>
        ) : null}
      </section>
    </main>
  );
}

function Home({ navigate }: { readonly navigate: (route: Route) => void }) {
  const authenticated = currentSession() !== null;
  const launcherEntries = [
    { label: 'Tienda', route: '/shop', glyph: 'cart' },
    { label: 'Preventas', route: '/preorders', glyph: 'box' },
    { label: 'Noticias', route: '/news', glyph: 'news' },
    { label: 'Torneos', route: '/tournaments', glyph: 'trophy' },
    { label: 'Comunidad', route: '/community', glyph: 'community' },
  ] as const;
  return (
    <AppearancePageElements page="home">
      <main className="home-page launch-v2 visual-public">
        <section aria-label="Inicio Sergod Store" className="launch-v2__stage">
          <h1 className="visually-hidden">Sergod Store</h1>
          <div aria-hidden="true" className="launch-v2__rays" />
          <div aria-hidden="true" className="launch-v2__halftone" />
          <div className="launch-v2__frame">
            <header className="launch-v2__header">
              <img
                alt=""
                aria-hidden="true"
                className="launch-v2__header-logo"
                src="/assets/sergod/logo_sergod_store_oficial_transparente.webp"
              />
              <nav aria-label="Navegación de portada" className="launch-v2__topnav">
                <button aria-current="page" onClick={() => navigate('/')} type="button">
                  Inicio
                </button>
                <button onClick={() => navigate('/shop')} type="button">
                  Tienda
                </button>
                <button onClick={() => navigate('/community')} type="button">
                  Comunidad
                </button>
                <button onClick={() => navigate('/tournaments')} type="button">
                  Torneos
                </button>
                <button onClick={() => navigate('/news')} type="button">
                  Noticias
                </button>
              </nav>
              <nav aria-label="Cuenta y compra" className="launch-v2__utilities">
                <button
                  onClick={() => navigate(authenticated ? '/account/overview' : '/login')}
                  type="button"
                >
                  Cuenta
                </button>
                <button onClick={() => navigate('/cart')} type="button">
                  Carrito
                </button>
              </nav>
            </header>
            <img
              alt=""
              aria-hidden="true"
              className="launch-v2__hero-logo"
              src="/assets/sergod/logo_sergod_store_oficial_transparente.webp"
            />
            <nav aria-label="Accesos principales" className="launch-v2__destinations">
              {launcherEntries.map((entry, index) => (
                <button
                  className={`launch-v2__destination launch-v2__destination--${index + 1}`}
                  key={entry.route}
                  onClick={() => navigate(entry.route)}
                  type="button"
                >
                  <LauncherGlyph kind={entry.glyph} />
                  <span>{entry.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </section>
      </main>
    </AppearancePageElements>
  );
}

function LauncherGlyph({
  kind,
}: {
  readonly kind: 'box' | 'cart' | 'community' | 'news' | 'trophy';
}) {
  const paths = {
    box: (
      <>
        <path d="M3 7 12 3l9 4v10l-9 4-9-4Z" />
        <path d="m3 7 9 4 9-4M12 11v10" />
      </>
    ),
    cart: (
      <>
        <path d="M2 4h3l2.3 11H19l2-8H6" />
        <circle cx="9" cy="20" r="1" />
        <circle cx="18" cy="20" r="1" />
      </>
    ),
    community: (
      <>
        <circle cx="9" cy="8" r="3" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M2 20v-2a7 7 0 0 1 14 0v2ZM17 14a5 5 0 0 1 5 5v1h-4" />
      </>
    ),
    news: (
      <>
        <path d="M4 4h12v16H4zM16 8h4v11a1 1 0 0 1-1 1h-3" />
        <path d="M7 8h6M7 11h6M7 14h6M7 17h4" />
      </>
    ),
    trophy: (
      <>
        <path d="M7 3h10v6a5 5 0 0 1-10 0ZM7 5H3v2a4 4 0 0 0 4 4M17 5h4v2a4 4 0 0 1-4 4M12 14v5M8 21h8M9 19h6" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      className="launch-v2__glyph"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      {paths[kind]}
    </svg>
  );
}

function Registration({ navigate }: { readonly navigate: (route: Route) => void }) {
  const [documents, setDocuments] = useState<readonly LegalVersion[]>([]);
  const [message, setMessage] = useState('Cargando textos legales vigentes…');
  const [submissionState, setSubmissionState] = useState<'created' | 'idle' | 'submitting'>('idle');
  const idempotencyKey = useRef(crypto.randomUUID());
  useEffect(() => {
    void legalVersions()
      .then((items) => {
        setDocuments(items);
        setMessage(items.length === 0 ? 'El registro aún no está habilitado.' : '');
      })
      .catch((error: unknown) => setMessage(messageOf(error)));
  }, []);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submissionState !== 'idle') return;
    setSubmissionState('submitting');
    setMessage('Creando cuenta…');
    const data = new FormData(event.currentTarget);
    try {
      await register({
        acceptedLegalVersionIds: documents
          .filter(({ versionId }) => data.getAll('legal').includes(versionId))
          .map(({ versionId }) => versionId),
        email: String(data.get('email')),
        idempotencyKey: idempotencyKey.current,
        password: String(data.get('password')),
        passwordConfirmation: String(data.get('passwordConfirmation')),
        phone: String(data.get('phone')).trim() || null,
      });
      setSubmissionState('created');
      setMessage('Cuenta creada. Revisa tu correo para confirmar la dirección antes de ingresar.');
    } catch (error) {
      setSubmissionState('idle');
      setMessage(messageOf(error));
    }
  };
  return (
    <main className="panel auth-panel visual-public">
      <p className="eyebrow">Cuenta Cliente</p>
      <h1>Crear cuenta</h1>
      <form onSubmit={(event) => void submit(event)}>
        <Field label="Correo" name="email" type="email" />
        <Field
          label="Teléfono opcional (E.164)"
          name="phone"
          placeholder="+569…"
          required={false}
        />
        <Field label="Contraseña" name="password" type="password" />
        <Field label="Confirmar contraseña" name="passwordConfirmation" type="password" />
        {documents.map((document) => (
          <label className="legal" key={document.versionId}>
            <input name="legal" required type="checkbox" value={document.versionId} />
            <span>
              Acepto{' '}
              <a href={document.contentLocation} rel="noreferrer" target="_blank">
                {document.publicTitle} · {document.versionLabel}
              </a>
            </span>
          </label>
        ))}
        <button disabled={documents.length === 0 || submissionState !== 'idle'} type="submit">
          {submissionState === 'submitting' ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>
      </form>
      <Status message={message} />
      <button className="link" onClick={() => navigate('/login')} type="button">
        Ya tengo cuenta
      </button>
    </main>
  );
}

function Login({ navigate }: { readonly navigate: (route: Route) => void }) {
  const [message, setMessage] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await login({ email: String(data.get('email')), password: String(data.get('password')) });
      navigate(loginReturnRoute());
    } catch (error) {
      setMessage(messageOf(error));
    }
  };
  const resend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await resendEmailVerification(String(new FormData(event.currentTarget).get('email')));
      setMessage('Si la cuenta está pendiente, recibirás un nuevo correo de confirmación.');
    } catch (error) {
      setMessage(messageOf(error));
    }
  };
  return (
    <main className="panel auth-panel visual-public">
      <p className="eyebrow">Acceso</p>
      <h1>Iniciar sesión</h1>
      <form onSubmit={(event) => void submit(event)}>
        <Field label="Correo verificado" name="email" type="email" />
        <Field label="Contraseña" name="password" type="password" />
        <button type="submit">Ingresar</button>
      </form>
      <h2>Reenviar confirmación</h2>
      <form onSubmit={(event) => void resend(event)}>
        <Field label="Correo" name="email" type="email" />
        <button className="secondary" type="submit">
          Reenviar correo
        </button>
      </form>
      <Status message={message} />
      <button className="link" onClick={() => navigate('/recover')} type="button">
        Recuperar acceso
      </button>
    </main>
  );
}

function EmailCallback({ kind }: { readonly kind: 'cambio' | 'confirmación' }) {
  const [message, setMessage] = useState('Validando el enlace de correo…');
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const accessToken = await readEmailCallbackAccessToken();
        const status = await completeEmailCallback(accessToken);
        setMessage(
          status === 'EMAIL_CHANGE_PENDING'
            ? 'La confirmación doble sigue pendiente. Revisa también el otro correo.'
            : kind === 'confirmación'
              ? 'Correo confirmado. Ya puedes iniciar sesión.'
              : 'Cambio de correo confirmado. Inicia sesión nuevamente.',
        );
      } catch (error) {
        setMessage(messageOf(error));
      } finally {
        try {
          await clearEmailCallbackSession();
        } catch (error) {
          setMessage(messageOf(error));
        }
      }
    })();
  }, [kind]);
  return (
    <main className="panel auth-panel visual-public">
      <p className="eyebrow">Correo verificado</p>
      <h1>{kind === 'confirmación' ? 'Confirmar registro' : 'Confirmar cambio de correo'}</h1>
      <Status message={message} />
    </main>
  );
}

function Recovery({ navigate }: { readonly navigate: (route: Route) => void }) {
  const [message, setMessage] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await requestRecovery(String(new FormData(event.currentTarget).get('email')));
      setMessage('Si la cuenta existe, recibirás un enlace para recuperar el acceso.');
    } catch (error) {
      setMessage(messageOf(error));
    }
  };
  return (
    <main className="panel auth-panel visual-public">
      <p className="eyebrow">Seguridad</p>
      <h1>Recuperar acceso</h1>
      <form onSubmit={(event) => void submit(event)}>
        <Field label="Correo" name="email" type="email" />
        <button type="submit">Enviar enlace</button>
      </form>
      <Status message={message} />
      <button className="link" onClick={() => navigate('/login')} type="button">
        Volver al ingreso
      </button>
    </main>
  );
}

function RecoveryCallback({ navigate }: { readonly navigate: (route: Route) => void }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [message, setMessage] = useState('Validando el enlace de recuperación…');
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void readEmailCallbackAccessToken()
      .then((token) => {
        setAccessToken(token);
        setMessage('Define una contraseña nueva.');
      })
      .catch((error: unknown) => setMessage(messageOf(error)));
  }, []);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (accessToken === null) return;
    const data = new FormData(event.currentTarget);
    try {
      await completeRecovery(accessToken, {
        newPassword: String(data.get('password')),
        newPasswordConfirmation: String(data.get('confirmation')),
      });
      await clearEmailCallbackSession();
      setMessage('Contraseña actualizada. Inicia sesión nuevamente.');
    } catch (error) {
      setMessage(messageOf(error));
    }
  };
  return (
    <main className="panel auth-panel visual-public">
      <p className="eyebrow">Seguridad</p>
      <h1>Definir contraseña nueva</h1>
      <form onSubmit={(event) => void submit(event)}>
        <Field label="Contraseña nueva" name="password" type="password" />
        <Field label="Confirmar contraseña" name="confirmation" type="password" />
        <button disabled={accessToken === null} type="submit">
          Actualizar contraseña
        </button>
      </form>
      <Status message={message} />
      <button className="link" onClick={() => navigate('/login')} type="button">
        Volver al ingreso
      </button>
    </main>
  );
}

function Account({ navigate }: { readonly navigate: (route: Route) => void }) {
  const [account, setAccount] = useState<AccountView | null>(null);
  const [message, setMessage] = useState('Cargando cuenta…');
  useEffect(() => {
    void ownAccount()
      .then((value) => {
        setAccount(value);
        setMessage('');
      })
      .catch((error: unknown) => setMessage(messageOf(error)));
  }, []);
  const email = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await requestEmailChange(String(new FormData(event.currentTarget).get('email')));
      setMessage('Cambio solicitado. El correo vigente continúa activo hasta confirmar el nuevo.');
    } catch (error) {
      setMessage(messageOf(error));
    }
  };
  const phone = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const value = String(new FormData(event.currentTarget).get('phone')).trim();
      await updatePhone(value || null);
      setMessage('Teléfono opcional actualizado; no se usa para autenticación ni verificación.');
    } catch (error) {
      setMessage(messageOf(error));
    }
  };
  const password = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await changePassword({
        newPassword: String(data.get('password')),
        newPasswordConfirmation: String(data.get('confirmation')),
      });
      setMessage('Contraseña cambiada. Inicia sesión nuevamente.');
    } catch (error) {
      setMessage(messageOf(error));
    }
  };
  const close = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      setMessage(messageOf(error));
    }
  };
  return (
    <main className="panel">
      <p className="eyebrow">Cuenta</p>
      <h1>Identidad y seguridad</h1>
      {account && (
        <dl className="facts">
          <dt>Correo</dt>
          <dd>
            {account.currentEmail} · {account.emailVerificationStatus}
          </dd>
          <dt>Teléfono</dt>
          <dd>{account.currentPhone ?? 'No registrado'} · sin uso de autenticación</dd>
          <dt>Rol</dt>
          <dd>{account.role}</dd>
          <dt>Estado</dt>
          <dd>{account.status}</dd>
        </dl>
      )}
      <form onSubmit={(event) => void email(event)}>
        <h2>Cambiar correo</h2>
        <Field label="Correo nuevo" name="email" type="email" />
        <button type="submit">Solicitar cambio seguro</button>
      </form>
      <form onSubmit={(event) => void phone(event)}>
        <h2>Teléfono opcional</h2>
        <Field label="Teléfono E.164 (vacío para eliminar)" name="phone" required={false} />
        <button type="submit">Guardar teléfono</button>
      </form>
      <form onSubmit={(event) => void password(event)}>
        <h2>Cambiar contraseña</h2>
        <Field label="Contraseña nueva" name="password" type="password" />
        <Field label="Confirmar contraseña" name="confirmation" type="password" />
        <button type="submit">Cambiar contraseña</button>
      </form>
      <Status message={message} />
      <div className="actions">
        <button className="secondary" onClick={() => void close()} type="button">
          Cerrar sesión
        </button>
        {account?.role === 'ADMIN' && (
          <button className="secondary" onClick={() => navigate('/admin/accounts')} type="button">
            Panel de cuentas
          </button>
        )}
      </div>
    </main>
  );
}

function AccountsPanel() {
  const [items, setItems] = useState<readonly AccountView[]>([]);
  const [message, setMessage] = useState('Cargando cuentas…');
  const [query, setQuery] = useState('');
  const reload = () =>
    void accounts()
      .then((value) => {
        setItems(value);
        setMessage('');
      })
      .catch((error: unknown) => setMessage(messageOf(error)));
  useEffect(reload, []);
  const action = async (event: FormEvent<HTMLFormElement>, account: AccountView) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const operation = String(data.get('operation'));
      const reason = String(data.get('reason'));
      if (operation === 'PROMOTE') await promoteAccount(account.accountId, reason);
      else
        await changeAccountState(
          account.accountId,
          operation === 'DEACTIVATE' ? 'deactivate' : 'reactivate',
          reason,
        );
      reload();
    } catch (error) {
      setMessage(messageOf(error));
    }
  };
  const visibleAccounts = items.filter((account) =>
    account.currentEmail
      .toLocaleLowerCase('es-CL')
      .includes(query.trim().toLocaleLowerCase('es-CL')),
  );
  return (
    <section className="admin-standalone-panel">
      <Status message={message} />
      <div className="admin-list-toolbar">
        <label>
          Buscar por correo
          <input
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="cliente@correo.cl"
            type="search"
            value={query}
          />
        </label>
        <span>{visibleAccounts.length} cuentas visibles</span>
      </div>
      {visibleAccounts.map((account) => (
        <article className="account-card" key={account.accountId}>
          <div className="account-card-heading">
            <h2>{account.currentEmail}</h2>
            <div className="account-state-chips" aria-label="Estado de la cuenta">
              <span>{account.role === 'ADMIN' ? 'Administrador' : 'Cliente'}</span>
              <span>{account.status === 'ACTIVE' ? 'Activa' : 'Desactivada'}</span>
              <span>
                {account.emailVerificationStatus === 'VERIFIED'
                  ? 'Correo verificado'
                  : 'Correo pendiente'}
              </span>
            </div>
          </div>
          <details className="account-management">
            <summary>Administrar cuenta</summary>
            <form className="inline-form" onSubmit={(event) => void action(event, account)}>
              <label>
                Acción
                <select name="operation">
                  {account.status === 'DEACTIVATED' ? (
                    <option value="REACTIVATE">Reactivar cuenta</option>
                  ) : (
                    <>
                      {account.role === 'CLIENTE' && (
                        <option value="PROMOTE">Dar acceso de administrador</option>
                      )}
                      <option value="DEACTIVATE">Desactivar cuenta</option>
                    </>
                  )}
                </select>
              </label>
              <Field label="Motivo del cambio" name="reason" />
              <button type="submit">Guardar cambio</button>
            </form>
          </details>
        </article>
      ))}
      {message === '' && visibleAccounts.length === 0 && (
        <p className="status">No encontramos cuentas con ese correo.</p>
      )}
    </section>
  );
}

function Field({
  label,
  name,
  placeholder,
  required = true,
  type = 'text',
}: {
  readonly label: string;
  readonly name: string;
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly type?: string;
}) {
  return (
    <label>
      {label}
      <input name={name} placeholder={placeholder} required={required} type={type} />
    </label>
  );
}
function Status({ message }: { readonly message: string }) {
  return message ? (
    <p className="status" role="status">
      {message}
    </p>
  ) : null;
}
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'No fue posible completar la solicitud.';
}
function loginReturnRoute(): Route {
  const requested = new URLSearchParams(window.location.search).get('returnTo');
  return requested === '/loyalty' ? '/loyalty' : '/account/overview';
}
function routeFromLocation(): Route {
  const path = window.location.pathname;
  const routes: readonly Route[] = [
    '/',
    '/account',
    '/account/overview',
    '/admin',
    '/admin/accounts',
    '/admin/appearance',
    '/admin/audit',
    '/admin/catalog',
    '/admin/configuration',
    '/admin/content',
    '/admin/inventory',
    '/admin/loyalty',
    '/admin/orders',
    '/admin/pos',
    '/admin/preorders',
    '/admin/promotions',
    '/admin/service-coverage',
    '/cart',
    '/checkout',
    '/shop',
    '/tournaments',
    '/news',
    '/community',
    '/community/visit',
    '/comics',
    '/loyalty',
    '/preorders',
    '/quests',
    '/auth/callback/confirm',
    '/auth/callback/email-change',
    '/auth/callback/recovery',
    '/login',
    '/legal/terms',
    '/recover',
    '/register',
  ];
  return routes.includes(path as Route) ? (path as Route) : '/not-found';
}

function adminAreaFromRoute(route: Route): AdminArea | null {
  const areas: Partial<Record<Route, AdminArea>> = {
    '/admin': 'dashboard',
    '/admin/audit': 'audit',
    '/admin/catalog': 'catalog',
    '/admin/configuration': 'configuration',
    '/admin/content': 'content',
    '/admin/inventory': 'inventory',
    '/admin/loyalty': 'loyalty',
    '/admin/orders': 'orders',
    '/admin/preorders': 'preorders',
    '/admin/promotions': 'promotions',
  };
  return areas[route] ?? null;
}
