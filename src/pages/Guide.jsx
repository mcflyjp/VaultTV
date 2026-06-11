import { useState } from 'react'
import { FiCamera, FiExternalLink, FiChevronDown, FiChevronUp, FiCheckCircle, FiAlertTriangle, FiInfo } from 'react-icons/fi'

// ── Screenshot placeholder ──────────────────────────────────────────────────
function Screenshot({ label, tall, src }) {
  if (src) {
    return (
      <div style={{ margin: '0.75rem 0', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
        <img src={src} alt={label} style={{ width: '100%', display: 'block' }} />
      </div>
    )
  }
  return (
    <div style={{
      width: '100%',
      aspectRatio: tall ? '16/10' : '16/7',
      background: 'rgba(255,255,255,0.03)',
      border: '2px dashed rgba(255,255,255,0.12)',
      borderRadius: 8,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.5rem',
      color: 'rgba(255,255,255,0.3)',
      margin: '0.75rem 0',
    }}>
      <FiCamera size={20} />
      <span style={{ fontSize: '0.78rem', textAlign: 'center', maxWidth: 300 }}>{label}</span>
    </div>
  )
}

// ── Callout boxes ───────────────────────────────────────────────────────────
function Tip({ children }) {
  return (
    <div style={{ display: 'flex', gap: '0.6rem', background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.25)', borderRadius: 8, padding: '0.65rem 0.9rem', margin: '0.75rem 0', fontSize: '0.85rem', color: 'rgba(255,255,255,0.8)' }}>
      <FiInfo size={15} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
      <span>{children}</span>
    </div>
  )
}

function Warning({ children }) {
  return (
    <div style={{ display: 'flex', gap: '0.6rem', background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: 8, padding: '0.65rem 0.9rem', margin: '0.75rem 0', fontSize: '0.85rem', color: 'rgba(255,255,255,0.8)' }}>
      <FiAlertTriangle size={15} style={{ color: '#eab308', flexShrink: 0, marginTop: 2 }} />
      <span>{children}</span>
    </div>
  )
}

// ── Numbered step ────────────────────────────────────────────────────────────
function Step({ n, title, children }) {
  return (
    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem' }}>
      <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, marginTop: 2 }}>
        {n}
      </div>
      <div style={{ flex: 1 }}>
        {title && <p style={{ margin: '0 0 0.3rem', fontWeight: 600, fontSize: '0.92rem' }}>{title}</p>}
        <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.88rem', lineHeight: 1.6 }}>{children}</div>
      </div>
    </div>
  )
}

// ── Collapsible guide section ─────────────────────────────────────────────
function GuideSection({ id, accent, icon, title, subtitle, children, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  return (
    <div id={id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: '1.25rem' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '1rem',
          padding: '1.1rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer',
          borderLeft: `4px solid ${accent}`,
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>{title}</p>
          {subtitle && <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{subtitle}</p>}
        </div>
        {open ? <FiChevronUp size={18} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} /> : <FiChevronDown size={18} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />}
      </button>
      {open && (
        <div style={{ padding: '0.25rem 1.25rem 1.25rem 1.25rem', borderTop: '1px solid var(--border)' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ── Code block ───────────────────────────────────────────────────────────────
function Code({ children }) {
  return (
    <code style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, padding: '0.1rem 0.4rem', fontSize: '0.82rem', fontFamily: 'monospace', color: 'var(--accent)' }}>
      {children}
    </code>
  )
}

// ── Quick-jump nav ────────────────────────────────────────────────────────────
const SECTIONS = [
  { id: 'real-debrid', label: 'Real-Debrid', color: '#16a34a' },
  { id: 'comet',       label: 'Comet',       color: '#7c3aed' },
  { id: 'metafusion',  label: 'Metafusion',  color: '#0284c7' },
  { id: 'torrentio',   label: 'Torrentio',   color: '#ea580c' },
  { id: 'stremio',     label: 'Stremio Import', color: '#64748b' },
  { id: 'vaulttv',     label: 'Add to VaultTV', color: '#e11d48' },
]

// ────────────────────────────────────────────────────────────────────────────
export default function Guide() {
  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>

      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ margin: '0 0 0.4rem', fontSize: '1.6rem', fontWeight: 800 }}>Setup Guide</h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.92rem' }}>
          Step-by-step instructions for getting streams working in VaultTV. Start with Real-Debrid, then install at least one stream add-on.
        </p>
      </div>

      {/* Quick-jump chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '2rem' }}>
        {SECTIONS.map(s => (
          <a key={s.id} href={`#${s.id}`}
            onClick={e => { e.preventDefault(); document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}
            style={{ padding: '0.3rem 0.8rem', borderRadius: 20, background: `${s.color}22`, border: `1px solid ${s.color}55`, color: s.color, fontSize: '0.8rem', fontWeight: 600, textDecoration: 'none', cursor: 'pointer' }}
          >
            {s.label}
          </a>
        ))}
      </div>

      {/* ── 1. Real-Debrid ──────────────────────────────────────────────── */}
      <GuideSection
        id="real-debrid"
        accent="#16a34a"
        icon="💳"
        title="Step 1 — Set Up Real-Debrid"
        subtitle="Premium link resolver. Required for Comet and most high-quality stream add-ons."
        defaultOpen
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '0.75rem' }}>
          Real-Debrid is a paid service (~€4/month) that unlocks fast, reliable streams from file-hosting sites. Most premium stream add-ons require it.
        </p>

        <Step n={1} title="Create your account">
          Go to <strong>real-debrid.com</strong> and register a free account. No payment is required yet.
          <Screenshot src="/guide/rd-signup.png" label="Real-Debrid sign-up form" />
        </Step>

        <Step n={2} title="Choose a subscription">
          Click <strong>Premium offers</strong> in the top navigation. Select a plan (180-day is the best value). Pay via card, PayPal, or crypto.
          <Screenshot src="/guide/rd-plans.png" label="Real-Debrid premium plans page" />
        </Step>

        <Step n={3} title="Copy your API key">
          Once subscribed, click your username in the top navigation and go to <strong>My Devices</strong>. Scroll all the way to the bottom to find the <strong>API Private Token</strong> section. Copy the long token — you will paste this into each stream add-on.
          <Screenshot src="/guide/rd-apikey.png" label="Real-Debrid My Devices — API Private Token at bottom" />
          <Tip>Keep this key private. Anyone with it can use your Real-Debrid quota.</Tip>
        </Step>
      </GuideSection>

      {/* ── 2. Comet ───────────────────────────────────────────────────── */}
      <GuideSection
        id="comet"
        accent="#7c3aed"
        icon="☄️"
        title="Step 2 — Configure Comet"
        subtitle="Real-Debrid powered streams for movies and TV shows. Highly recommended."
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '0.75rem' }}>
          Comet is one of the best stream add-ons. It uses your Real-Debrid account to serve fast, cached links.
        </p>

        <Step n={1} title="Open the Comet configuration page">
          In your browser, go to <strong>comet.elfhosted.com</strong> — the public instance hosted by ElfHosted. Reasonable rate limits apply so it stays fast for everyone.
          <Screenshot src="/guide/comet-config.png" label="Comet configurator page" />
        </Step>

        <Step n={2} title="Add your Real-Debrid API key">
          Scroll down to the <strong>Debrid Services</strong> section and click <strong>Add Debrid Service</strong>. Select <strong>Real-Debrid</strong> from the dropdown and paste your API key into the field on the right.
          <Screenshot src="/guide/comet-debrid.png" label="Comet — Debrid Services with Real-Debrid selected and API key field" />
        </Step>

        <Step n={3} title="Configure resolution and size filters (optional)">
          At the top you can set preferred resolutions, max results per resolution, and max file size. Leave at defaults (0 = unlimited) for the widest selection.
          <Screenshot src="/guide/comet-resolution.png" label="Comet — resolution and size filter options" />
        </Step>

        <Step n={4} title="Install or copy the manifest URL">
          Scroll to the bottom and click <strong>Install</strong> to open it directly, or <strong>Copy Link</strong> to get the manifest URL manually.
          <Screenshot src="/guide/comet-install.png" label="Comet — Install, Copy Link, and Setup Kodi buttons" />
          <Tip>The manifest URL contains your API key — do not share it publicly.</Tip>
        </Step>

        <Step n={5} title="Add to VaultTV">
          Go to <strong>Add-ons</strong> in VaultTV → <strong>Add by Manifest URL</strong> → paste the URL → click <strong>+ Add</strong>.
          <Screenshot src="/guide/vaulttv-addons.png" label="VaultTV Add-ons page — manifest URL field and Add button" />
        </Step>
      </GuideSection>

      {/* ── 3. Metafusion ──────────────────────────────────────────────── */}
      <GuideSection
        id="metafusion"
        accent="#0284c7"
        icon="🔗"
        title="Step 3 — Add Metafusion"
        subtitle="Combines catalogs from multiple sources into one unified browse experience."
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '0.75rem' }}>
          Metafusion merges catalogs from Trakt, IMDb lists, and other sources so you can browse them all in VaultTV as a single library.
        </p>

        <Step n={1} title="Open the Metafusion configurator">
          Search for <strong>Metafusion Stremio addon</strong> to find the current hosted configurator page. Community forums like Reddit r/StremioAddons usually have a pinned link.
          <Screenshot label="Screenshot: Metafusion configurator page in browser" />
        </Step>

        <Step n={2} title="Connect your accounts (optional)">
          Metafusion can pull your Trakt watchlists, IMDb ratings, and other catalogue sources. Click <strong>Connect Trakt</strong> or <strong>Connect IMDb</strong> and authorize if you want those lists.
          <Screenshot label="Screenshot: Metafusion — Connect Trakt / Connect IMDb buttons" />
        </Step>

        <Step n={3} title="Choose your catalogs">
          Select which lists or sources you want visible. Untick anything you don't need to keep the add-on fast.
          <Screenshot label="Screenshot: Metafusion — catalog selection checkboxes" />
        </Step>

        <Step n={4} title="Install and copy the manifest URL">
          Click <strong>Install</strong>. Copy the manifest URL (ends in <Code>/manifest.json</Code>).
          <Screenshot label="Screenshot: Metafusion — manifest URL at bottom of page" />
        </Step>

        <Step n={5} title="Add to VaultTV">
          Add-ons → Add by Manifest URL → paste → + Add.
          <Screenshot src="/guide/vaulttv-addons.png" label="VaultTV Add-ons page — manifest URL field and Add button" />
        </Step>

        <Warning>
          Metafusion only provides catalogue browsing (what to watch). It does not provide actual video streams — you still need Comet or Torrentio for that.
        </Warning>
      </GuideSection>

      {/* ── 4. Torrentio ───────────────────────────────────────────────── */}
      <GuideSection
        id="torrentio"
        accent="#ea580c"
        icon="🌊"
        title="Step 4 — Add Torrentio (optional)"
        subtitle="The most popular stream source. Pairs with Real-Debrid for instant cached streams."
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '0.75rem' }}>
          Torrentio is the most widely used stream add-on. It indexes torrent sites and serves links through Real-Debrid for fast, direct downloads.
        </p>

        <Step n={1} title="Open the Torrentio configurator">
          Go to <strong>torrentio.strem.fun</strong> (the official configurator).
          <Screenshot label="Screenshot: torrentio.strem.fun — configuration page" />
        </Step>

        <Step n={2} title="Select your Debrid service">
          Scroll to <strong>Debrid Provider</strong>. Select <strong>Real-Debrid</strong>. Click <strong>Authorize</strong> — it will open a Real-Debrid login window. Sign in and approve.
          <Screenshot label="Screenshot: Torrentio config — Real-Debrid selected, Authorize button" />
          <Screenshot label="Screenshot: Real-Debrid authorization window" />
        </Step>

        <Step n={3} title="Configure quality and source filters">
          Set your preferred quality ceiling (e.g. max 1080p or allow 4K). You can also restrict which torrent sites are used.
          <Screenshot label="Screenshot: Torrentio config — quality and source filter options" />
        </Step>

        <Step n={4} title="Install and get your manifest URL">
          Click <strong>Install</strong> at the bottom. Copy the manifest URL.
          <Screenshot label="Screenshot: Torrentio — Install button and manifest URL" />
        </Step>

        <Step n={5} title="Add to VaultTV">
          Add-ons → Add by Manifest URL → paste → + Add.
          <Screenshot src="/guide/vaulttv-addons.png" label="VaultTV Add-ons page — manifest URL field and Add button" />
        </Step>

        <Tip>
          Using both Comet and Torrentio gives you better coverage — one may have a cache hit when the other doesn't.
        </Tip>
      </GuideSection>

      {/* ── 5. Stremio Import ─────────────────────────────────────────── */}
      <GuideSection
        id="stremio"
        accent="#64748b"
        icon="📦"
        title="Already using Stremio? Import everything at once"
        subtitle="Skip manual setup — export your Stremio data and import all add-ons in one click."
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '0.75rem' }}>
          If you already have Stremio set up with your add-ons configured, you can export your settings and import them directly into VaultTV. This is the fastest way to get started.
        </p>

        <Step n={1} title="Open Stremio on any device">
          You can use Stremio on Windows, Mac, Android, or the web app at <strong>web.stremio.com</strong>.
          <Screenshot label="Screenshot: Stremio app open on desktop" />
        </Step>

        <Step n={2} title="Export your user data">
          In Stremio: click your profile picture → <strong>Settings</strong> → scroll to <strong>General</strong> → click <strong>Export user data</strong>. A <Code>.json</Code> file will download.
          <Screenshot label="Screenshot: Stremio Settings → General → Export user data button" />
        </Step>

        <Step n={3} title="Import into VaultTV">
          In VaultTV: go to <strong>Add-ons</strong> → <strong>Import from Stremio Settings File</strong> → click <strong>Choose settings file</strong> → select the JSON you just downloaded.
          <Screenshot label="Screenshot: VaultTV Add-ons page — Import from Stremio Settings File section" />
          <Tip>VaultTV skips any localhost add-ons automatically (those only work inside Stremio itself).</Tip>
        </Step>

        <Step n={4} title="Sync catalogs">
          After importing, click <strong>Sync Catalogs</strong> to pull the latest content lists from each add-on.
          <Screenshot label="Screenshot: VaultTV Installed add-ons list — Sync Catalogs button highlighted" />
        </Step>
      </GuideSection>

      {/* ── 6. Final VaultTV check ─────────────────────────────────────── */}
      <GuideSection
        id="vaulttv"
        accent="#e11d48"
        icon="✅"
        title="Final Check — Verify Streams Work"
        subtitle="Make sure everything is connected before you start watching."
      >
        <Step n={1} title="Check installed add-ons">
          Go to <strong>Add-ons</strong>. You should see at least one stream add-on (Comet or Torrentio) and optionally Metafusion.
          <Screenshot label="Screenshot: VaultTV Add-ons → Installed list showing Comet + Torrentio" />
        </Step>

        <Step n={2} title="Search for a popular movie or show">
          Go to <strong>Search</strong> and look for something popular like <em>Inception</em> or <em>Breaking Bad</em>. Open its detail page.
          <Screenshot label="Screenshot: VaultTV detail page for a movie — Sources section visible" />
        </Step>

        <Step n={3} title="Pick a stream source">
          In the <strong>Sources</strong> section, you should see stream links from your add-ons. Look for entries tagged <strong>RD</strong> (Real-Debrid cached) for the best quality and speed.
          <Screenshot label="Screenshot: VaultTV sources list — RD cached streams highlighted" />
        </Step>

        <Step n={4} title="Play and confirm">
          Click a stream. It should start playing immediately in the VaultTV player (or native ExoPlayer on FireTV).
          <Screenshot label="Screenshot: VaultTV video player playing a stream" />
        </Step>

        <div style={{ marginTop: '1.25rem', padding: '1rem', background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.25)', borderRadius: 8, display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
          <FiCheckCircle size={18} style={{ color: '#16a34a', flexShrink: 0, marginTop: 2 }} />
          <div>
            <p style={{ margin: '0 0 0.3rem', fontWeight: 700, color: '#16a34a', fontSize: '0.9rem' }}>You're all set!</p>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(255,255,255,0.65)' }}>
              Once streams are working you can use VaultTV on any device — web browser, Electron desktop app, or the FireTV APK.
            </p>
          </div>
        </div>
      </GuideSection>

      {/* Troubleshooting footer */}
      <div style={{ marginTop: '2rem', padding: '1rem 1.25rem', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12 }}>
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', fontWeight: 700 }}>Troubleshooting</h3>
        <ul style={{ margin: 0, paddingLeft: '1.25rem', color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', lineHeight: 2 }}>
          <li><strong>No streams appear</strong> — Check the add-on is installed (Add-ons page). Click Sync Catalogs. Make sure your Real-Debrid subscription is active.</li>
          <li><strong>Add-on token expired</strong> — Re-run the configurator for that add-on and re-paste the new manifest URL.</li>
          <li><strong>Video won't play on FireTV</strong> — The app will automatically try the VLC player if the audio codec isn't supported by the device.</li>
          <li><strong>Import shows "Nothing new to import"</strong> — Your Stremio add-ons were already up to date in VaultTV.</li>
          <li><strong>Comet/Torrentio shows no results for a title</strong> — Try the other add-on, or search for a different quality. Rare or old titles may not be cached on Real-Debrid yet.</li>
        </ul>
      </div>
    </div>
  )
}
