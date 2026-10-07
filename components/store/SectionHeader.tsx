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
  eyebrow: string;
  description: string;
  images?: string[];
}) {
  const photos = [...new Set(images.filter(Boolean))].slice(0, 2);
  return (
    <header className={`${styles.header} ${styles[section]}`} data-section-header={section}>
      <div className={styles.content}>
        <p className={styles.eyebrow}>
          <span aria-hidden="true" />
          {eyebrow}
        </p>
        <h1>
          {title}
          <span aria-hidden={section === 'store' || section === 'preorder' ? true : undefined}>
            .
          </span>
        </h1>
        <p className={styles.description}>{description}</p>
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
