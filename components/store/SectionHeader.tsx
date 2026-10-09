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
  const imageHeight = { store: 466, preorder: 490, news: 405, community: 288, tournaments: 405 }[
    section
  ];
  return (
    <header className={styles.header} data-section-header={section}>
      <h1 className={styles.title}>{title}</h1>
      <img
        className={styles.illustration}
        src={`/art/banners/${section}-mobile.webp`}
        width="880"
        height={imageHeight}
        alt=""
        fetchPriority="high"
        decoding="async"
      />
    </header>
  );
}
