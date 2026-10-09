import styles from './SectionHeader.module.css';

type Section = 'store' | 'preorder' | 'community' | 'news' | 'tournaments';

export function SectionHeader({
  section,
  title,
}: {
  section: Section;
  title: string;
  eyebrow?: string;
  description?: string;
  images?: string[];
}) {
  return (
    <header className={styles.header} data-section-header={section}>
      <h1 className={styles.title}>{title}</h1>
      <div className={styles.frame} data-banner-art>
        <img
          className={styles.illustration}
          src={`/art/banners/${section}-wide.webp`}
          width="1800"
          height="600"
          alt=""
          fetchPriority="high"
          decoding="async"
        />
      </div>
    </header>
  );
}
