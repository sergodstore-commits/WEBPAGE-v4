import type { EditionCard } from '@/lib/edition-gallery';
import styles from './CardText.module.css';

export function CardText({ card, level = 3 }: { card: EditionCard; level?: 3 | 4 }) {
  const translated = card.text_origin === 'translated';
  const Heading = level === 4 ? 'h4' : 'h3';
  return (
    <section
      className={`${styles.text} ${translated ? styles.translation : ''}`}
      aria-label={translated ? 'Traducción del efecto al español' : 'Texto de la carta en español'}
    >
      <Heading>{translated ? 'Traducción al español' : 'Texto de la carta en español'}</Heading>
      {translated && (
        <small>
          {card.translation_method === 'sergod'
            ? 'Traducción de SERGOD STORE · no oficial.'
            : 'Traducción automática no oficial.'}{' '}
          El texto original se conserva para consultar sus condiciones.
        </small>
      )}
      {card.effects.map((effect, index) => (
        <div key={index}>
          {card.effects.length > 1 && (
            <Heading>{index === 0 ? 'Efecto de Péndulo' : 'Efecto de monstruo'}</Heading>
          )}
          <p lang="es">{effect}</p>
        </div>
      ))}
      {translated && Boolean(card.englishEffects?.length) && (
        <details>
          <summary>Texto original en inglés</summary>
          {card.englishEffects!.map((effect, index) => (
            <p key={index} lang="en">
              {effect}
            </p>
          ))}
        </details>
      )}
    </section>
  );
}
