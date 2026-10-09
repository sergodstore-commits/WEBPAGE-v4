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
  if (section === 'store' || section === 'preorder') {
    const preorder = section === 'preorder';
    const banner = preorder ? 'preorder' : 'store';
    return (
      <header
        className={`${styles.header} ${styles.storeBanner} ${preorder ? styles.preorderBanner : ''}`}
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
            height={preorder ? 490 : 466}
          />
          <img
            src={`/art/banners/${banner}.webp`}
            width={preorder ? 1934 : 1665}
            height={preorder ? 754 : 583}
            alt=""
            fetchPriority="high"
            decoding="async"
          />
        </picture>
      </header>
    );
  }
  const photos = [...new Set(images.filter(Boolean))].slice(0, 2);
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
        {section === 'news' ? (
          photos.length ? (
            <img className={styles.newsPhoto} src={photos[0]} alt="" />
          ) : (
            <div className={styles.editorial}>
              <img src="/brand/sergod-logo-480.webp" alt="" width="480" height="240" />
              <div />
              <div />
              <div />
            </div>
          )
        ) : section === 'community' ? (
          <div className={styles.arena}>
            <img src="/art/hero/mitos-back-320.webp" alt="" />
            <img src="/art/hero/yugioh-back-320.webp" alt="" />
            <img src="/art/hero/mitos-back-320.webp" alt="" />
          </div>
        ) : section === 'tournaments' ? (
          <div className={styles.duel}>
            <img src="/art/hero/yugioh-front-320.webp" alt="" />
            <span>×</span>
            <img src="/art/hero/mitos-front-320.webp" alt="" />
          </div>
        ) : (
          <div className={`${styles.products} ${photos.length ? styles.withPhotos : ''}`}>
            {(photos.length
              ? photos
              : ['/art/hero/yugioh-back-320.webp', '/art/hero/mitos-back-320.webp']
            ).map((src) => (
              <img
                key={src}
                src={src}
                alt=""
                onError={(event) => {
                  event.currentTarget.style.visibility = 'hidden';
                }}
              />
            ))}
          </div>
        )}
        <span className={styles.signature}>SERGOD STORE / COPIAPÓ</span>
      </div>
    </header>
  );
}
