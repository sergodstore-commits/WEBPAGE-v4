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
  const dimensions = {
    store: [1365, 583],
    preorder: [1434, 754],
    news: [1292, 405],
    community: [1593, 511],
    tournaments: [1612, 724],
  }[section];
  return (
    <header className={styles.header} data-section-header={section}>
      <h1 className={styles.title}>{title}</h1>
      <img
        className={styles.illustration}
        src={`/art/banners/${section}-art.webp`}
        width={dimensions[0]}
        height={dimensions[1]}
        alt=""
        fetchPriority="high"
        decoding="async"
      />
    </header>
  );
}
