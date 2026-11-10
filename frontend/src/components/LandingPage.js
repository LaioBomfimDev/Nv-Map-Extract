import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useExtensionUpdates } from '../providers/ExtensionUpdateProvider';
import {
  canDirectFolderInstall,
  installOrUpdateExtensionInFolder,
} from '../utils/extensionInstaller';
import ChromeGuideMockup from './ChromeGuideMockup';
import {
  ArrowRight,
  Check,
  Download,
  ExternalLink,
  MessageCircle,
  Play,
  Rocket,
  Target,
  X,
  Zap,
} from './Icons';
import './LandingPage.css';

gsap.registerPlugin(ScrollTrigger);

const SUPPORT_PHONE = '5571999575358';
const SUPPORT_TEXT = encodeURIComponent('Oi! Quero ajuda para instalar e rodar o Friendly Miner.');
const SUPPORT_URL = `https://wa.me/${SUPPORT_PHONE}?text=${SUPPORT_TEXT}`;

const HERO_MODES = [
  {
    id: 'fluxo',
    label: 'Fluxo Completo',
    image: '/media/demo-fluxo.webp',
    urlLabel: 'nv-map-extract.vercel.app',
    tag: '● AO VIVO · FLUXO REAL',
    alt: 'Demonstração animada do Friendly Miner extraindo leads do Google Maps e enviando para o Painel, Mapa IBGE e CRM',
  },
  {
    id: 'maps',
    label: 'Extensão no Maps',
    image: '/media/screen-extensao.png',
    urlLabel: 'google.com/maps · Extractor v2.1.2',
    tag: 'PRINT REAL',
    alt: 'Extensão Friendly Miner extraindo leads diretamente no Google Maps',
  },
  {
    id: 'mapa',
    label: 'Mapa IBGE',
    image: '/media/screen-mapa.png',
    urlLabel: 'nv-map-extract.vercel.app/?tab=mapa',
    tag: 'PRINT REAL',
    alt: 'Mapa de inteligência geográfica IBGE com clusters e cidades sugeridas',
  },
  {
    id: 'crm',
    label: 'CRM & Mutirão',
    image: '/media/screen-prospect.png',
    urlLabel: 'nv-map-extract.vercel.app/?tab=prospect',
    tag: 'PRINT REAL',
    alt: 'CRM de prospecção com fila comercial e botões de WhatsApp',
  },
];

const FEATURES = [
  {
    id: 'extensao',
    code: '01',
    tag: 'GOOGLE MAPS -> CSV / NUVEM',
    title: 'Extrator direto no Google Maps',
    desc: 'Puxa nome, telefone, WhatsApp, site, e-mail, nota, avaliações e Instagram sem pagar API do Google. Baixa o CSV direto ou joga tudo na sua conta em 1 clique.',
    image: '/media/screen-extensao.png',
    urlLabel: 'google.com/maps · Extensão Friendly Miner',
  },
  {
    id: 'mapa',
    code: '02',
    tag: 'INTELIGÊNCIA IBGE',
    title: 'Radar geográfico de oportunidades',
    desc: 'Cruza seus leads com os dados populacionais do IBGE e marca exatamente em quais cidades há demanda reprimida onde seus concorrentes ainda nem pisaram.',
    image: '/media/screen-mapa.png',
    urlLabel: 'nv-map-extract.vercel.app/?tab=mapa',
  },
  {
    id: 'crm',
    code: '03',
    tag: 'MODO MUTIRÃO',
    title: 'Do Maps pro WhatsApp sem planilha',
    desc: 'Separa sozinho empresas sem site ou sem redes sociais — os alvos mais fáceis de fechar — com fila comercial, alertas de follow-up e abertura instantânea no WhatsApp.',
    image: '/media/screen-prospect.png',
    urlLabel: 'nv-map-extract.vercel.app/?tab=prospect',
  },
  {
    id: 'dashboard',
    code: '04',
    tag: 'PAINEL EM TEMPO REAL',
    title: 'Controle total do seu ataque comercial',
    desc: 'Acompanhe volume diário de captação, tarefas atrasadas, categorias quentes e cadências de abordagem de qualquer computador ou celular.',
    image: '/media/screen-dashboard.png',
    urlLabel: 'nv-map-extract.vercel.app/?tab=dashboard',
  },
];

async function copyTextWithFallback(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) {}
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    el.remove();
    return ok;
  } catch (_) {
    return false;
  }
}

export default function LandingPage({ onOpenLogin }) {
  const rootRef = useRef(null);
  const progressRef = useRef(null);
  const { extension, latest, hasUpdate, openExtensionsPage, reloadExtension } = useExtensionUpdates();

  const [heroModeIndex, setHeroModeIndex] = useState(0);
  const [activeFeature, setActiveFeature] = useState(0);
  const [installFeedback, setInstallFeedback] = useState(null); // { ok, text }
  const [installing, setInstalling] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState('');
  const [zoomMedia, setZoomMedia] = useState(null);

  const version = latest?.version || '2.1.2';
  const downloadUrl = latest?.downloadUrl || '/downloads/friendly-miner-2.1.2.zip';
  const directSupported = canDirectFolderInstall();
  const currentHero = HERO_MODES[heroModeIndex];
  const currentFeature = FEATURES[activeFeature];

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return undefined;

    const ctx = gsap.context(() => {
      if (progressRef.current) {
        gsap.to(progressRef.current, {
          scaleX: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: rootRef.current,
            start: 'top top',
            end: 'bottom bottom',
            scrub: 0.15,
          },
        });
      }

      gsap.from('.fm-hero-anim', {
        y: 26,
        opacity: 0,
        duration: 0.78,
        stagger: 0.08,
        ease: 'power3.out',
        clearProps: 'transform,opacity',
      });

      gsap.utils.toArray('.fm-scroll-reveal').forEach((el) => {
        gsap.from(el, {
          y: 28,
          opacity: 0,
          duration: 0.7,
          ease: 'power3.out',
          clearProps: 'transform,opacity',
          scrollTrigger: {
            trigger: el,
            start: 'top 88%',
            once: true,
          },
        });
      });

      gsap.from('.fm-step-anim', {
        y: 24,
        opacity: 0,
        duration: 0.65,
        stagger: 0.12,
        ease: 'power3.out',
        clearProps: 'transform,opacity',
        scrollTrigger: {
          trigger: '.fm-steps-grid',
          start: 'top 86%',
          once: true,
        },
      });
    }, rootRef);

    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (!zoomMedia) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setZoomMedia(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [zoomMedia]);

  function handleZipDownloadClick() {
    setInstallFeedback({
      ok: true,
      text: `ZIP v${version} baixado! Extraia em uma pasta e carregue em chrome://extensions.`,
    });
    const el = document.getElementById('como-instalar');
    if (el) {
      setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
    }
  }

  async function handleDirectAction() {
    if (!directSupported || installing) return;
    setInstalling(true);
    setInstallFeedback({ ok: true, text: 'Escolha ou crie uma subpasta (ex: FriendlyMiner)…' });

    try {
      const result = await installOrUpdateExtensionInFolder({
        downloadUrl,
        expectedSha256: latest?.sha256 || '',
        onStep: (step) => {
          const map = {
            picking: 'Escolha ou crie uma subpasta (ex: FriendlyMiner)…',
            downloading: 'Baixando extensão oficial…',
            unzipping: 'Validando SHA-256 e extraindo…',
            writing: 'Preparando pasta da extensão…',
          };
          setInstallFeedback({ ok: true, text: map[step] || 'Processando…' });
        },
      });

      if (result.cancelled) {
        setInstallFeedback(null);
        return;
      }

      if (extension?.installed) {
        if (extension.supportsReload && reloadExtension) {
          const reloadRes = await reloadExtension();
          if (reloadRes.ok) {
            setInstallFeedback({
              ok: true,
              text: `Extensão atualizada em "${result.folderName}" e recarregada automaticamente!`,
            });
            return;
          }
        }
        setInstallFeedback({
          ok: true,
          text: `Arquivos atualizados em "${result.folderName}"! Clique no ícone ↻ Recarregar no Chrome.`,
        });
        if (openExtensionsPage) await openExtensionsPage().catch(() => {});
      } else {
        setInstallFeedback({
          ok: true,
          text: `Pasta "${result.folderName}" pronta (${result.fileCount} arquivos)! Agora carregue ela no Chrome logo abaixo.`,
        });
        const el = document.getElementById('como-instalar');
        if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
      }
    } catch (err) {
      setInstallFeedback({
        ok: false,
        text: err?.message || 'Erro ao preparar pasta. Use o download .ZIP.',
      });
    } finally {
      setInstalling(false);
    }
  }

  async function handleOpenExtensions() {
    if (extension?.installed && openExtensionsPage) {
      const result = await openExtensionsPage();
      if (result?.ok) return;
    }
    const copied = await copyTextWithFallback('chrome://extensions');
    setCopyFeedback(copied ? 'copied' : 'manual');
    setTimeout(() => setCopyFeedback(''), 3600);
  }

  const primaryLabel = installing
    ? 'Preparando pasta…'
    : extension?.installed && hasUpdate
      ? `Atualizar para v${version} (1 Clique)`
      : directSupported
        ? `Instalar em 1 Clique (v${version})`
        : `Baixar Extensão Grátis (v${version})`;

  return (
    <div className="fm-lp" ref={rootRef}>
      <div className="fm-lp-progress" ref={progressRef} aria-hidden="true" />
      <div className="fm-lp-grid-bg" aria-hidden="true" />
      <div className="fm-lp-spotlight" aria-hidden="true" />

      {/* Navbar minimalista */}
      <header className="fm-lp-nav">
        <div className="fm-lp-nav-inner">
          <a href="#top" className="fm-lp-brand">
            <img src="/logo-miner.jpg" alt="Friendly Miner" />
            <span className="fm-lp-brand-name">Friendly Miner</span>
            <span className="fm-lp-version-tag">v{version}</span>
          </a>

          <nav className="fm-lp-nav-links" aria-label="Navegação principal">
            <a href="#na-pratica" className="fm-lp-nav-link">Na prática</a>
            <a href="#recursos" className="fm-lp-nav-link">Recursos</a>
            <a href="#como-instalar" className="fm-lp-nav-link">Instalar fácil</a>
          </nav>

          <div className="fm-lp-nav-actions">
            <button type="button" onClick={onOpenLogin} className="fm-btn fm-btn-outline">
              Entrar no Painel
            </button>
            {directSupported ? (
              <button type="button" onClick={handleDirectAction} disabled={installing} className="fm-btn fm-btn-primary">
                <Zap size={14} />
                {extension?.installed && hasUpdate ? 'Atualizar (1 Clique)' : 'Instalar (1 Clique)'}
              </button>
            ) : (
              <a href={downloadUrl} download onClick={handleZipDownloadClick} className="fm-btn fm-btn-primary">
                <Download size={14} />
                Baixar Extensão
              </a>
            )}
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero */}
        <section className="fm-lp-hero">
          <div className="fm-lp-container">
            <div className="fm-lp-pill fm-hero-anim">
              <span className="fm-lp-pill-dot" />
              {extension?.installed ? (
                <span>
                  {hasUpdate
                    ? `Extensão v${extension.version} detectada · Atualização v${version} disponível`
                    : `Extensão v${extension.version || version} ativa e pronta no seu Chrome`}
                </span>
              ) : (
                <span>EXTENSÃO CHROME v{version} · PAINEL + MAPA IBGE</span>
              )}
            </div>

            <h1 className="fm-lp-h1 fm-hero-anim">
              Pare de esperar cliente <span>cair do céu.</span>
            </h1>

            <p className="fm-lp-sub fm-hero-anim">
              Enquanto você espera indicação ou queima dinheiro em tráfego pago, quem usa o Friendly Miner abre o Google Maps, puxa centenas de empresas com WhatsApp, Instagram e avaliação em minutos — e vai buscar o contrato antes da concorrência acordar.
            </p>

            <div className="fm-lp-cta-row fm-hero-anim">
              {directSupported && !(extension?.installed && !hasUpdate) ? (
                <button
                  type="button"
                  onClick={handleDirectAction}
                  disabled={installing}
                  className="fm-btn fm-btn-lg fm-btn-emerald"
                >
                  <Zap size={16} />
                  {primaryLabel}
                </button>
              ) : extension?.installed && !hasUpdate ? (
                <button type="button" onClick={onOpenLogin} className="fm-btn fm-btn-lg fm-btn-emerald">
                  <Rocket size={16} />
                  Abrir Painel Agora
                </button>
              ) : (
                <a
                  href={downloadUrl}
                  download
                  onClick={handleZipDownloadClick}
                  className="fm-btn fm-btn-lg fm-btn-emerald"
                >
                  <Download size={16} />
                  Baixar Extensão Grátis (31 KB)
                </a>
              )}

              <button type="button" onClick={onOpenLogin} className="fm-btn fm-btn-lg fm-btn-outline">
                <Rocket size={16} />
                Já tenho conta · Entrar
              </button>
            </div>

            <div className="fm-lp-micro-proof fm-hero-anim">
              <span>✓ Sem WinRAR na instalação</span>
              <span>✓ Atualização com 1 clique</span>
              <span>✓ CRM + Mapa IBGE inclusos</span>
              {directSupported && (
                <a
                  href={downloadUrl}
                  download
                  onClick={handleZipDownloadClick}
                  style={{ color: '#a1a1aa', textDecoration: 'underline', textUnderlineOffset: 3 }}
                >
                  Baixar .ZIP manual
                </a>
              )}
            </div>

            {installFeedback && (
              <div
                className="fm-lp-status-banner"
                role="status"
                style={{
                  background: installFeedback.ok ? 'rgba(16, 185, 129, 0.09)' : 'rgba(239, 68, 68, 0.1)',
                  border: `1px solid ${installFeedback.ok ? 'rgba(16, 185, 129, 0.38)' : 'rgba(239, 68, 68, 0.38)'}`,
                  color: installFeedback.ok ? '#a7f3d0' : '#fecaca',
                }}
              >
                <span>{installFeedback.text}</span>
                {installFeedback.ok && (
                  <a href="#como-instalar" style={{ color: '#34d399', fontWeight: 700, textDecoration: 'none' }}>
                    Ver guia ↓
                  </a>
                )}
              </div>
            )}

            {/* Demo animada real + seletor rápido */}
            <div id="na-pratica" className="fm-lp-showcase-wrap fm-hero-anim">
              <div className="fm-hero-switcher" role="group" aria-label="Alternar visualização do sistema">
                {HERO_MODES.map((mode, idx) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setHeroModeIndex(idx)}
                    className={`fm-switch-pill ${heroModeIndex === idx ? 'is-active' : ''}`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              <div className="fm-browser-frame">
                <div className="fm-browser-bar">
                  <div className="fm-browser-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="fm-browser-url">{currentHero.urlLabel}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="fm-browser-tag">{currentHero.tag}</span>
                    <button
                      type="button"
                      onClick={() => setZoomMedia(currentHero)}
                      className="fm-zoom-btn"
                    >
                      Ampliar
                    </button>
                  </div>
                </div>
                <img
                  key={currentHero.image}
                  src={currentHero.image}
                  alt={currentHero.alt}
                  width="1280"
                  height="760"
                  onLoad={() => ScrollTrigger.refresh()}
                  onClick={() => setZoomMedia(currentHero)}
                  style={{ cursor: 'zoom-in' }}
                  className="fm-browser-img fm-browser-img-fade"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Features principais com prints reais */}
        <section id="recursos" className="fm-lp-section">
          <div className="fm-lp-container">
            <div className="fm-lp-section-head fm-scroll-reveal">
              <div>
                <div className="fm-lp-kicker">DO MAPA AO FECHAMENTO</div>
                <h2 className="fm-lp-h2">Sem planilha bagunçada.<br />Só alvo pronto pra fechar.</h2>
              </div>
              <p className="fm-lp-lead">
                Clique nos módulos abaixo e veja as telas reais do sistema rodando. Tudo o que você precisa para caçar clientes todos os dias.
              </p>
            </div>

            <div className="fm-features-layout fm-scroll-reveal">
              <div className="fm-feature-list" role="tablist" aria-label="Recursos do Friendly Miner">
                {FEATURES.map((item, idx) => {
                  const active = idx === activeFeature;
                  return (
                    <button
                      key={item.id}
                      id={`fm-tab-${item.id}`}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      aria-controls="fm-feature-panel"
                      onClick={() => setActiveFeature(idx)}
                      className={`fm-feature-tab ${active ? 'is-active' : ''}`}
                    >
                      <div className="fm-feature-num">
                        <span>{item.code} · {item.tag}</span>
                        {active && <Play size={12} color="#10b981" />}
                      </div>
                      <h3 className="fm-feature-title">{item.title}</h3>
                      <p className="fm-feature-desc">{item.desc}</p>
                    </button>
                  );
                })}
              </div>

              <div
                id="fm-feature-panel"
                className="fm-browser-frame"
                role="tabpanel"
                aria-labelledby={`fm-tab-${currentFeature.id}`}
              >
                <div className="fm-browser-bar">
                  <div className="fm-browser-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="fm-browser-url">{currentFeature.urlLabel}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="fm-browser-tag">PRINT REAL</span>
                    <button
                      type="button"
                      onClick={() => setZoomMedia({ ...currentFeature, alt: currentFeature.title })}
                      className="fm-zoom-btn"
                    >
                      Ampliar
                    </button>
                  </div>
                </div>
                <img
                  key={currentFeature.image}
                  src={currentFeature.image}
                  alt={currentFeature.title}
                  width="1280"
                  height="760"
                  onLoad={() => ScrollTrigger.refresh()}
                  onClick={() => setZoomMedia({ ...currentFeature, alt: currentFeature.title })}
                  style={{ cursor: 'zoom-in' }}
                  className="fm-browser-img fm-browser-img-fade"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Tutorial visual simplificado (2 passos + simulação fiel do Chrome) */}
        <section id="como-instalar" className="fm-lp-section">
          <div className="fm-lp-container">
            <div className="fm-lp-section-head fm-scroll-reveal">
              <div>
                <div className="fm-lp-kicker">INSTALAÇÃO & ATUALIZAÇÃO SEM SOFRIMENTO</div>
                <h2 className="fm-lp-h2">2 cliques na pasta. Pronto.</h2>
              </div>
              <p className="fm-lp-lead">
                Sem precisar de WinRAR nem ficar procurando arquivos. O próprio navegador prepara a pasta para você carregar no Chrome — e as próximas atualizações recarregam sozinhas.
              </p>
            </div>

            <div className="fm-steps-grid">
              <div className="fm-step-card fm-step-anim">
                <span className="fm-step-badge">01</span>
                <h3>Prepare a pasta em 1 clique</h3>
                <p>
                  Clique em <strong>Instalar em 1 Clique</strong> e crie ou selecione uma subpasta (ex:{' '}
                  <span className="fm-code-pill">FriendlyMiner</span> dentro de Documentos). Os arquivos já caem prontos dentro dela, validados.
                </p>
              </div>

              <div className="fm-step-card fm-step-anim">
                <span className="fm-step-badge">02</span>
                <h3>Carregue no Chrome e entre</h3>
                <p>
                  Cole <span className="fm-code-pill">chrome://extensions</span>, ligue{' '}
                  <strong>Modo do desenvolvedor</strong> e arraste a pasta (ou clique em{' '}
                  <strong>Carregar sem compactação</strong>). Depois é só entrar no painel com o Google.
                </p>
              </div>
            </div>

            <div className="fm-lp-mockup-wrap fm-scroll-reveal">
              <ChromeGuideMockup mode={extension?.installed ? 'update' : 'install'} />
            </div>

            <div className="fm-tutorial-toolbar fm-scroll-reveal">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {directSupported ? (
                  <button
                    type="button"
                    onClick={handleDirectAction}
                    disabled={installing}
                    className="fm-btn fm-btn-primary"
                  >
                    <Zap size={14} />
                    {extension?.installed ? `Atualizar pasta (v${version})` : `Preparar pasta (v${version})`}
                  </button>
                ) : (
                  <a href={downloadUrl} download onClick={handleZipDownloadClick} className="fm-btn fm-btn-primary">
                    <Download size={14} />
                    Baixar ZIP v{version}
                  </a>
                )}

                <button type="button" onClick={handleOpenExtensions} className="fm-btn fm-btn-outline">
                  {copyFeedback === 'copied' ? <Check size={14} color="#10b981" /> : <Zap size={14} />}
                  {copyFeedback === 'copied'
                    ? 'chrome://extensions copiado!'
                    : copyFeedback === 'manual'
                      ? 'Digite chrome://extensions na barra'
                      : (extension?.installed ? 'Abrir chrome://extensions' : 'Copiar chrome://extensions')}
                </button>

                <button type="button" onClick={onOpenLogin} className="fm-btn fm-btn-outline">
                  <Target size={14} />
                  Entrar no Painel
                </button>
              </div>

              <a
                href={SUPPORT_URL}
                target="_blank"
                rel="noreferrer"
                className="fm-btn fm-btn-outline"
                style={{ borderColor: 'rgba(16,185,129,0.35)', color: '#6ee7b7' }}
              >
                <MessageCircle size={14} />
                Precisa de ajuda? WhatsApp
                <ExternalLink size={12} />
              </a>
            </div>
          </div>
        </section>

        {/* CTA Final */}
        <section className="fm-lp-container">
          <div className="fm-final-cta fm-scroll-reveal">
            <div className="fm-lp-kicker" style={{ marginBottom: 12 }}>AÇÃO AGORA</div>
            <h2 className="fm-lp-h2" style={{ maxWidth: 660, margin: '0 auto 14px' }}>
              O telefone não vai tocar sozinho. Vá buscar o seu próximo contrato.
            </h2>
            <p className="fm-lp-sub" style={{ marginBottom: 26 }}>
              Instale a extensão em menos de 1 minuto e tenha hoje sua primeira lista real de empresas prontas para abordagem.
            </p>
            <div className="fm-lp-cta-row">
              {directSupported ? (
                <button type="button" onClick={handleDirectAction} disabled={installing} className="fm-btn fm-btn-lg fm-btn-emerald">
                  <Zap size={16} />
                  {primaryLabel}
                </button>
              ) : (
                <a href={downloadUrl} download onClick={handleZipDownloadClick} className="fm-btn fm-btn-lg fm-btn-emerald">
                  <Download size={16} />
                  Baixar Extensão Agora
                </a>
              )}
              <button type="button" onClick={onOpenLogin} className="fm-btn fm-btn-lg fm-btn-primary">
                Acessar Painel
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="fm-lp-footer">
        <div className="fm-lp-container fm-lp-footer-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img
              src="/logo-miner.jpg"
              alt="Friendly Miner"
              style={{ width: 22, height: 22, borderRadius: 4, objectFit: 'cover' }}
            />
            <span style={{ color: '#e4e4e7', fontWeight: 600 }}>Friendly Miner</span>
            <span className="mono">v{version}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <a href={SUPPORT_URL} target="_blank" rel="noreferrer" style={{ color: '#a1a1aa', textDecoration: 'none' }}>
              Suporte WhatsApp
            </a>
            <button
              type="button"
              onClick={onOpenLogin}
              style={{ background: 'none', border: 0, color: '#a1a1aa', cursor: 'pointer', fontSize: 12 }}
            >
              Entrar no sistema
            </button>
          </div>
        </div>
      </footer>

      {zoomMedia && (
        <div
          className="fm-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Visualização ampliada da tela"
          onClick={(e) => { if (e.target === e.currentTarget) setZoomMedia(null); }}
        >
          <div className="fm-lightbox-inner">
            <div className="fm-browser-frame">
              <div className="fm-browser-bar">
                <div className="fm-browser-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="fm-browser-url">{zoomMedia.urlLabel}</div>
                <button
                  type="button"
                  onClick={() => setZoomMedia(null)}
                  className="fm-zoom-btn"
                  aria-label="Fechar visualização"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                >
                  <X size={12} />
                  Fechar
                </button>
              </div>
              <img
                src={zoomMedia.image}
                alt={zoomMedia.alt}
                width="1280"
                height="760"
                className="fm-browser-img"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
