import styles from './SectionHeader.module.css';

type Section = 'store' | 'preorder' | 'community' | 'news' | 'tournaments';

export function SectionHeader({
  section,
  title,
  eyebrow,
  description,
  images = [],
}: {
  section: Section;
  title: string;
  eyebrow?: string;
  description?: string;
  images?: string[];
}) {
  if (section !== 'tournaments') {
    const banner = section;
    const dimensions = {
      store: { width: 1665, height: 583, mobileHeight: 466 },
      preorder: { width: 1934, height: 754, mobileHeight: 490 },
      news: { width: 1642, height: 405, mobileHeight: 405 },
      community: { width: 2143, height: 511, mobileHeight: 288 },
    }[section];
    return (
      <header
        className={`${styles.header} ${styles.storeBanner} ${section !== 'store' ? styles.preorderBanner : ''}`}
        data-section-header={section}
      >
        <h1 className={styles.storeBannerTitle}>
          {title}
          <span aria-hidden="true">.</span>
        </h1>
        <picture>
          <source
            media="(max-width: 600px)"
            srcSet={`/art/banners/${banner}-mobile.webp`}
            width="880"
            height={dimensions.mobileHeight}
          />
          <img
            src={`/art/banners/${banner}.webp`}
            width={dimensions.width}
            height={dimensions.height}
            alt=""
            fetchPriority="high"
            decoding="async"
          />
        </picture>
      </header>
    );
  }
  return (
    <header className={`${styles.header} ${styles[section]}`} data-section-header={section}>
      <div className={styles.content}>
        {eyebrow && (
          <p className={styles.eyebrow}>
            <span aria-hidden="true" />
            {eyebrow}
          </p>
        )}
        <h1>
          {title}
          <span>.</span>
        </h1>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      <div className={styles.art} aria-hidden="true">
        <div className={styles.orbit} />
        <div className={styles.duel}>
          <img src="/art/hero/yugioh-front-320.webp" alt="" />
          <span>×</span>
          <img src="/art/hero/mitos-front-320.webp" alt="" />
        </div>
        <span className={styles.signature}>SERGOD STORE / COPIAPÓ</span>
      </div>
    </header>
  );
}
